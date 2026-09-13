use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rodio::cpal::{
    self,
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, State};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const FRAME_SAMPLES: usize = 320;

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
}

#[derive(Default)]
pub struct AudioCapture {
    stream: Mutex<Option<Stream>>,
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

impl AudioCapture {
    fn start(&self, channel: Channel<Value>, options: AudioCaptureOptions) -> Result<(), String> {
        let mut active = self
            .stream
            .lock()
            .map_err(|_| "audio capture lock is poisoned".to_owned())?;
        if active.is_some() {
            return Err("audio capture is already running".to_owned());
        }

        let host = cpal::default_host();
        let device = match options.input_device {
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
        let processor = std::sync::Arc::new(Mutex::new(CaptureProcessor::new(
            config.sample_rate,
            config.channels,
            channel.clone(),
        )));
        let on_error = move |error: cpal::StreamError| {
            let _ = channel.send(json!({
                "kind": "failure",
                "category": "device",
                "message": error.to_string(),
            }));
        };

        let stream = match supported.sample_format() {
            SampleFormat::F32 => {
                let processor = processor.clone();
                device.build_input_stream(
                    &config,
                    move |samples: &[f32], _| {
                        if let Ok(mut processor) = processor.lock() {
                            processor.push(samples.iter().copied());
                        }
                    },
                    on_error,
                    None,
                )
            }
            SampleFormat::I16 => {
                let processor = processor.clone();
                device.build_input_stream(
                    &config,
                    move |samples: &[i16], _| {
                        if let Ok(mut processor) = processor.lock() {
                            processor.push(samples.iter().map(|sample| *sample as f32 / 32_768.0));
                        }
                    },
                    on_error,
                    None,
                )
            }
            SampleFormat::U16 => {
                let processor = processor.clone();
                device.build_input_stream(
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
                )
            }
            format => return Err(format!("Формат микрофона {format:?} не поддерживается")),
        }
        .map_err(|error| format!("Не удалось запустить микрофон: {error}"))?;

        stream
            .play()
            .map_err(|error| format!("Не удалось запустить микрофон: {error}"))?;
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
}

struct CaptureProcessor {
    channels: usize,
    step: f64,
    position: f64,
    input: Vec<f32>,
    output: Vec<i16>,
    sequence: u64,
    channel: Channel<Value>,
}

impl CaptureProcessor {
    fn new(sample_rate: u32, channels: u16, channel: Channel<Value>) -> Self {
        Self {
            channels: channels as usize,
            step: sample_rate as f64 / TARGET_SAMPLE_RATE as f64,
            position: 0.0,
            input: Vec::with_capacity(sample_rate as usize),
            output: Vec::with_capacity(FRAME_SAMPLES * 2),
            sequence: 0,
            channel,
        }
    }

    fn push(&mut self, samples: impl Iterator<Item = f32>) {
        let samples: Vec<f32> = samples.collect();
        for frame in samples.chunks(self.channels) {
            if let Some(sample) = frame.first() {
                self.input.push(*sample);
            }
        }

        while self.position + 1.0 < self.input.len() as f64 {
            let left = self.position.floor() as usize;
            let fraction = (self.position - left as f64) as f32;
            let sample = self.input[left] * (1.0 - fraction) + self.input[left + 1] * fraction;
            self.output
                .push((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16);
            self.position += self.step;
        }

        let consumed = self.position.floor() as usize;
        if consumed > 0 {
            self.input.drain(..consumed.min(self.input.len()));
            self.position -= consumed as f64;
        }

        while self.output.len() >= FRAME_SAMPLES {
            let frame: Vec<i16> = self.output.drain(..FRAME_SAMPLES).collect();
            let mut bytes = Vec::with_capacity(FRAME_SAMPLES * 2);
            for sample in frame {
                bytes.extend_from_slice(&sample.to_le_bytes());
            }
            let _ = self.channel.send(json!({
                "kind": "pcm",
                "seq": self.sequence,
                "source": "mic",
                "sample_rate": TARGET_SAMPLE_RATE,
                "channels": 1,
                "samples_base64": BASE64.encode(bytes),
            }));
            self.sequence = self.sequence.wrapping_add(1);
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
