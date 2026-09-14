use std::{
    collections::VecDeque,
    num::{NonZeroU16, NonZeroU32},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rodio::{
    cpal::{
        self,
        traits::{DeviceTrait, HostTrait, StreamTrait},
        SampleFormat, Stream,
    },
    source::Source,
    MixerDeviceSink, Player,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, State};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const FRAME_SAMPLES: usize = 320;
/// Ползунки громкости, как в Discord, идут от 0 до 200 %.
const MAX_LEVEL_SETTING: f32 = 2.0;
/// Базовое усиление микрофона при 100 %: без него речь в звонке слишком тихая.
const BASE_INPUT_GAIN: f32 = 3.0;
/// Выше этого уровня сигнал мягко сжимается вместо жёсткого обрезания.
const SOFT_CLIP_THRESHOLD: f32 = 0.7;
/// Самопрослушивание держит не больше 250 мс, чтобы голос не отставал.
const LOOPBACK_MAX_SAMPLES: usize = TARGET_SAMPLE_RATE as usize / 4;
/// Индикатор уровня показывает диапазон от −60 dBFS до 0.
const LEVEL_FLOOR_DB: f32 = 60.0;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(Debug, Serialize)]
pub struct AudioDeviceCatalog {
    inputs: Vec<AudioDeviceInfo>,
    outputs: Vec<AudioDeviceInfo>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    input_device: Option<String>,
    input_gain: Option<f32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneTestOptions {
    input_device: Option<String>,
    input_gain: Option<f32>,
    output_device: Option<String>,
    output_volume: Option<f32>,
}

/// Проверка микрофона: оператор видит уровень и слышит себя в выбранном выходе.
struct MicrophoneTest {
    _stream: Stream,
    _player: Player,
    _output: MixerDeviceSink,
}

#[derive(Default)]
pub struct AudioCapture {
    stream: Mutex<Option<Stream>>,
    test: Mutex<Option<MicrophoneTest>>,
}

/// Громкости общие для звонка и проверки, поэтому ползунки действуют сразу.
static INPUT_GAIN: AtomicU32 = AtomicU32::new(0x3F80_0000);
static OUTPUT_VOLUME: AtomicU32 = AtomicU32::new(0x3F80_0000);

fn input_gain() -> f32 {
    f32::from_bits(INPUT_GAIN.load(Ordering::Relaxed)) * BASE_INPUT_GAIN
}

/// Множитель громкости воспроизведения из настроек, от 0 до 2.
pub fn output_volume() -> f32 {
    f32::from_bits(OUTPUT_VOLUME.load(Ordering::Relaxed))
}

fn store_level(target: &AtomicU32, value: f32) {
    let value = if value.is_finite() {
        value.clamp(0.0, MAX_LEVEL_SETTING)
    } else {
        1.0
    };
    target.store(value.to_bits(), Ordering::Relaxed);
}

fn soft_clip(sample: f32) -> f32 {
    let magnitude = sample.abs();
    if magnitude <= SOFT_CLIP_THRESHOLD {
        return sample;
    }
    let headroom = 1.0 - SOFT_CLIP_THRESHOLD;
    sample.signum()
        * (SOFT_CLIP_THRESHOLD + headroom * ((magnitude - SOFT_CLIP_THRESHOLD) / headroom).tanh())
}

fn device_name(device: &cpal::Device) -> String {
    device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or_else(|_| "Неизвестное аудиоустройство".to_owned())
}

fn collect_devices(
    devices: impl Iterator<Item = cpal::Device>,
    default: Option<cpal::DeviceId>,
) -> Vec<AudioDeviceInfo> {
    devices
        .map(|device| {
            let name = device_name(&device);
            AudioDeviceInfo {
                id: name.clone(),
                name,
                is_default: device
                    .id()
                    .ok()
                    .is_some_and(|id| default.as_ref() == Some(&id)),
            }
        })
        .collect()
}

#[tauri::command]
pub fn audio_devices() -> Result<AudioDeviceCatalog, String> {
    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.id().ok());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.id().ok());
    let inputs = host
        .input_devices()
        .map_err(|error| format!("Не удалось получить список микрофонов: {error}"))?;
    let outputs = host
        .output_devices()
        .map_err(|error| format!("Не удалось получить список устройств вывода: {error}"))?;

    Ok(AudioDeviceCatalog {
        inputs: collect_devices(inputs, default_input),
        outputs: collect_devices(outputs, default_output),
    })
}

pub fn open_output(device_id: Option<&str>) -> Result<rodio::MixerDeviceSink, String> {
    let Some(device_id) = device_id else {
        return rodio::DeviceSinkBuilder::open_default_sink()
            .map_err(|error| format!("could not open the audio output: {error}"));
    };

    let device = cpal::default_host()
        .output_devices()
        .map_err(|error| format!("could not list audio outputs: {error}"))?
        .find(|device| device_name(device) == device_id)
        .ok_or_else(|| format!("selected audio output is unavailable: {device_id}"))?;

    rodio::DeviceSinkBuilder::from_device(device)
        .and_then(|builder| builder.open_sink_or_fallback())
        .map_err(|error| format!("could not open the selected audio output: {error}"))
}

/// Открывает микрофон и отдаёт моно-кадры 16 кГц по 20 мс с уже применённым усилением.
fn open_input(
    device_id: Option<&str>,
    on_frame: impl FnMut(&[i16]) + Send + 'static,
    on_error: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = match device_id {
        Some(device_id) => host
            .input_devices()
            .map_err(|error| format!("Не удалось получить список микрофонов: {error}"))?
            .find(|device| device_name(device) == device_id)
            .ok_or_else(|| format!("Выбранный микрофон недоступен: {device_id}"))?,
        None => host
            .default_input_device()
            .ok_or_else(|| "Системный микрофон не найден".to_owned())?,
    };
    let supported = device
        .default_input_config()
        .map_err(|error| format!("Не удалось открыть микрофон: {error}"))?;
    let config = supported.config();
    let processor = Arc::new(Mutex::new(CaptureProcessor::new(
        config.sample_rate,
        config.channels,
        Box::new(on_frame),
    )));

    let stream = match supported.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |samples: &[f32], _| {
                if let Ok(mut processor) = processor.lock() {
                    processor.push(samples.iter().copied());
                }
            },
            on_error,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |samples: &[i16], _| {
                if let Ok(mut processor) = processor.lock() {
                    processor.push(samples.iter().map(|sample| *sample as f32 / 32_768.0));
                }
            },
            on_error,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |samples: &[u16], _| {
                if let Ok(mut processor) = processor.lock() {
                    processor.push(
                        samples
                            .iter()
                            .map(|sample| (*sample as f32 - 32_768.0) / 32_768.0),
                    );
                }
            },
            on_error,
            None,
        ),
        format => return Err(format!("Формат микрофона {format:?} не поддерживается")),
    }
    .map_err(|error| format!("Не удалось запустить микрофон: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("Не удалось запустить микрофон: {error}"))?;
    Ok(stream)
}

fn failure_reporter(channel: Channel<Value>) -> impl FnMut(cpal::StreamError) + Send + 'static {
    move |error: cpal::StreamError| {
        let _ = channel.send(json!({
            "kind": "failure",
            "category": "device",
            "message": error.to_string(),
        }));
    }
}

fn frame_level(frame: &[i16]) -> f32 {
    let square_sum: f32 = frame
        .iter()
        .map(|sample| {
            let sample = *sample as f32 / 32_768.0;
            sample * sample
        })
        .sum();
    let rms = (square_sum / frame.len().max(1) as f32).sqrt();
    let decibels = 20.0 * rms.max(1e-6).log10();
    ((decibels + LEVEL_FLOOR_DB) / LEVEL_FLOOR_DB).clamp(0.0, 1.0)
}

impl AudioCapture {
    fn start(&self, channel: Channel<Value>, options: AudioCaptureOptions) -> Result<(), String> {
        let mut active = self
            .stream
            .lock()
            .map_err(|_| "audio capture lock is poisoned".to_owned())?;
        if active.is_some() {
            return Err("audio capture is already running".to_owned());
        }
        if let Some(gain) = options.input_gain {
            store_level(&INPUT_GAIN, gain);
        }

        let frames = channel.clone();
        let mut sequence: u64 = 0;
        let stream = open_input(
            options.input_device.as_deref(),
            move |frame| {
                let mut bytes = Vec::with_capacity(frame.len() * 2);
                for sample in frame {
                    bytes.extend_from_slice(&sample.to_le_bytes());
                }
                let _ = frames.send(json!({
                    "kind": "pcm",
                    "seq": sequence,
                    "source": "mic",
                    "sample_rate": TARGET_SAMPLE_RATE,
                    "channels": 1,
                    "samples_base64": BASE64.encode(bytes),
                }));
                sequence = sequence.wrapping_add(1);
            },
            failure_reporter(channel),
        )?;
        *active = Some(stream);
        Ok(())
    }

    fn stop(&self) -> Result<(), String> {
        self.stream
            .lock()
            .map_err(|_| "audio capture lock is poisoned".to_owned())?
            .take();
        Ok(())
    }

    fn start_test(
        &self,
        channel: Channel<Value>,
        options: MicrophoneTestOptions,
    ) -> Result<(), String> {
        let mut active = self
            .test
            .lock()
            .map_err(|_| "microphone test lock is poisoned".to_owned())?;
        // Повторный запуск с другими устройствами заменяет прежнюю проверку.
        active.take();
        if let Some(gain) = options.input_gain {
            store_level(&INPUT_GAIN, gain);
        }

        if let Some(volume) = options.output_volume {
            store_level(&OUTPUT_VOLUME, volume);
        }
        let mut output = open_output(options.output_device.as_deref())?;
        output.log_on_drop(false);
        let queue = Arc::new(Mutex::new(VecDeque::with_capacity(LOOPBACK_MAX_SAMPLES)));
        let player = Player::connect_new(output.mixer());
        player.append(LoopbackSource {
            queue: queue.clone(),
        });

        let levels = channel.clone();
        let stream = open_input(
            options.input_device.as_deref(),
            move |frame| {
                let _ = levels.send(json!({ "kind": "level", "level": frame_level(frame) }));

                if let Ok(mut queue) = queue.lock() {
                    queue.extend(frame.iter().map(|sample| *sample as f32 / 32_768.0));
                    // Отстающий выход не должен копить задержку: старое выбрасываем.
                    let overflow = queue.len().saturating_sub(LOOPBACK_MAX_SAMPLES);
                    queue.drain(..overflow);
                }
            },
            failure_reporter(channel),
        )?;

        *active = Some(MicrophoneTest {
            _stream: stream,
            _player: player,
            _output: output,
        });
        Ok(())
    }

    fn stop_test(&self) -> Result<(), String> {
        self.test
            .lock()
            .map_err(|_| "microphone test lock is poisoned".to_owned())?
            .take();
        Ok(())
    }
}

/// Бесконечный источник для rodio: отдаёт голос с микрофона, а в паузах — тишину.
struct LoopbackSource {
    queue: Arc<Mutex<VecDeque<f32>>>,
}

impl Iterator for LoopbackSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        Some(
            self.queue
                .lock()
                .ok()
                .and_then(|mut queue| queue.pop_front())
                .map_or(0.0, |sample| sample * output_volume()),
        )
    }
}

impl Source for LoopbackSource {
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> NonZeroU16 {
        NonZeroU16::new(1).expect("the mono channel count is non-zero")
    }

    fn sample_rate(&self) -> NonZeroU32 {
        NonZeroU32::new(TARGET_SAMPLE_RATE).expect("the target sample rate is non-zero")
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

type FrameSink = Box<dyn FnMut(&[i16]) + Send>;

struct CaptureProcessor {
    channels: usize,
    step: f64,
    position: f64,
    input: Vec<f32>,
    output: Vec<i16>,
    on_frame: FrameSink,
}

impl CaptureProcessor {
    fn new(sample_rate: u32, channels: u16, on_frame: FrameSink) -> Self {
        Self {
            channels: channels as usize,
            step: sample_rate as f64 / TARGET_SAMPLE_RATE as f64,
            position: 0.0,
            input: Vec::with_capacity(sample_rate as usize),
            output: Vec::with_capacity(FRAME_SAMPLES * 2),
            on_frame,
        }
    }

    fn push(&mut self, samples: impl Iterator<Item = f32>) {
        let gain = input_gain();
        let samples: Vec<f32> = samples.collect();
        for frame in samples.chunks(self.channels) {
            if let Some(sample) = frame.first() {
                self.input.push(*sample * gain);
            }
        }

        while self.position + 1.0 < self.input.len() as f64 {
            let left = self.position.floor() as usize;
            let fraction = (self.position - left as f64) as f32;
            let sample = self.input[left] * (1.0 - fraction) + self.input[left + 1] * fraction;
            self.output
                .push((soft_clip(sample).clamp(-1.0, 1.0) * i16::MAX as f32) as i16);
            self.position += self.step;
        }

        let consumed = self.position.floor() as usize;
        if consumed > 0 {
            self.input.drain(..consumed.min(self.input.len()));
            self.position -= consumed as f64;
        }

        while self.output.len() >= FRAME_SAMPLES {
            let frame: Vec<i16> = self.output.drain(..FRAME_SAMPLES).collect();
            (self.on_frame)(&frame);
        }
    }
}

#[tauri::command]
pub fn audio_capture_start(
    audio: State<'_, AudioCapture>,
    channel: Channel<Value>,
    options: Option<AudioCaptureOptions>,
) -> Result<(), String> {
    audio.start(channel, options.unwrap_or_default())
}

#[tauri::command]
pub fn audio_capture_stop(audio: State<'_, AudioCapture>) -> Result<(), String> {
    audio.stop()
}

#[tauri::command]
pub fn audio_set_input_gain(gain: f32) {
    store_level(&INPUT_GAIN, gain);
}

#[tauri::command]
pub fn audio_set_output_volume(volume: f32) {
    store_level(&OUTPUT_VOLUME, volume);
}

#[tauri::command]
pub fn audio_test_start(
    audio: State<'_, AudioCapture>,
    channel: Channel<Value>,
    options: Option<MicrophoneTestOptions>,
) -> Result<(), String> {
    audio.start_test(channel, options.unwrap_or_default())
}

#[tauri::command]
pub fn audio_test_stop(audio: State<'_, AudioCapture>) -> Result<(), String> {
    audio.stop_test()
}
