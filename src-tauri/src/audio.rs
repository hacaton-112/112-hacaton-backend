//! Захват микрофона нативно, минуя webview.
//!
//! `navigator.mediaDevices` недоступен в WKWebView вне secure context, а на
//! Linux WebKitGTK работает нестабильно, поэтому звук берём через cpal и сразу
//! приводим к формату ASR-сервиса: PCM16 little-endian, моно, 16 кГц.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc as std_mpsc, Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use anyhow::{anyhow, Result};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, SampleFormat,
};
use tokio::sync::mpsc;

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Сколько сэмплов накапливаем перед отправкой (100 мс при 16 кГц).
/// Без буферизации получалось бы больше сотни WS-фреймов в секунду.
const CHUNK_SAMPLES: usize = TARGET_SAMPLE_RATE as usize / 10;

/// Как часто поток проверяет флаг остановки.
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Приведение частоты дискретизации усреднением окна входных сэмплов.
/// Усреднение (а не выборка каждого N-го) заодно подавляет алиасинг, который
/// на речи слышен как металлический призвук и сбивает распознавание.
pub struct Resampler {
    /// Сколько входных сэмплов приходится на один выходной.
    ratio: f64,
    /// Остаток окна: накапливает дробную часть, чтобы частота не «уплывала»
    /// на некратных отношениях вроде 44100 / 16000.
    threshold: f64,
    accumulator: f64,
    count: u32,
}

impl Resampler {
    pub fn new(source_rate: u32, target_rate: u32) -> Result<Self> {
        if source_rate < target_rate {
            return Err(anyhow!(
                "microphone sample rate {source_rate} is below the required {target_rate}"
            ));
        }

        let ratio = f64::from(source_rate) / f64::from(target_rate);

        Ok(Self {
            ratio,
            threshold: ratio,
            accumulator: 0.0,
            count: 0,
        })
    }

    /// Обрабатывает очередной буфер моно-сэмплов, дописывая результат в `output`.
    pub fn process(&mut self, input: &[f32], output: &mut Vec<i16>) {
        for sample in input {
            self.accumulator += f64::from(*sample);
            self.count += 1;
            self.threshold -= 1.0;

            if self.threshold > 0.0 {
                continue;
            }

            let averaged = self.accumulator / f64::from(self.count.max(1));
            output.push(to_pcm16(averaged));
            self.accumulator = 0.0;
            self.count = 0;
            self.threshold += self.ratio;
        }
    }
}

fn to_pcm16(sample: f64) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    let scaled = if clamped < 0.0 {
        clamped * f64::from(-(i16::MIN as i32))
    } else {
        clamped * f64::from(i16::MAX)
    };

    scaled.round() as i16
}

/// Живой захват: владеет потоком cpal и останавливается по флагу.
pub struct CaptureHandle {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl CaptureHandle {
    /// Останавливает захват и дожидается завершения потока.
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for CaptureHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Открывает микрофон по умолчанию и шлёт PCM16-чанки в `pcm_tx`.
///
/// `cpal::Stream` не является `Send` на macOS, поэтому он создаётся и живёт
/// внутри выделенного потока, а наружу отдаётся только флаг остановки.
/// Ошибки инициализации возвращаются вызывающему синхронно — так JS узнает о
/// недоступном микрофоне сразу, а не через событие.
pub fn start_capture(pcm_tx: mpsc::Sender<Vec<u8>>) -> Result<CaptureHandle> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let (init_tx, init_rx) = std_mpsc::channel::<Result<(), String>>();

    let thread = thread::Builder::new()
        .name("asr-capture".to_owned())
        .spawn(move || match build_stream(pcm_tx, thread_stop.clone()) {
            Ok(stream) => {
                let _ = init_tx.send(Ok(()));
                while !thread_stop.load(Ordering::Relaxed) {
                    thread::sleep(STOP_POLL_INTERVAL);
                }
                drop(stream);
            }
            Err(error) => {
                let _ = init_tx.send(Err(error.to_string()));
            }
        })?;

    match init_rx.recv() {
        Ok(Ok(())) => Ok(CaptureHandle {
            stop,
            thread: Some(thread),
        }),
        Ok(Err(error)) => {
            let _ = thread.join();
            Err(anyhow!(error))
        }
        Err(_) => {
            let _ = thread.join();
            Err(anyhow!("audio capture thread stopped before initialization"))
        }
    }
}

fn build_stream(pcm_tx: mpsc::Sender<Vec<u8>>, stop: Arc<AtomicBool>) -> Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("no default input device is available"))?;
    let supported = device.default_input_config()?;
    let sample_format = supported.sample_format();
    let channels = supported.channels() as usize;
    let resampler = Resampler::new(supported.sample_rate(), TARGET_SAMPLE_RATE)?;
    let config: cpal::StreamConfig = supported.into();

    let error_stop = stop.clone();
    let on_error = move |error: cpal::Error| {
        eprintln!("audio capture error: {error}");
        error_stop.store(true, Ordering::Relaxed);
    };

    let stream = match sample_format {
        SampleFormat::F32 => {
            build_typed_stream::<f32>(&device, config, channels, resampler, pcm_tx, on_error)?
        }
        SampleFormat::I16 => {
            build_typed_stream::<i16>(&device, config, channels, resampler, pcm_tx, on_error)?
        }
        SampleFormat::U16 => {
            build_typed_stream::<u16>(&device, config, channels, resampler, pcm_tx, on_error)?
        }
        other => return Err(anyhow!("unsupported sample format: {other:?}")),
    };

    stream.play()?;
    Ok(stream)
}

fn build_typed_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    channels: usize,
    mut resampler: Resampler,
    pcm_tx: mpsc::Sender<Vec<u8>>,
    on_error: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<cpal::Stream>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
    f32: cpal::FromSample<T>,
{
    let mut mono = Vec::<f32>::new();
    let mut pending = Vec::<i16>::new();

    let stream = device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            mono.clear();
            downmix_to_mono(data, channels, &mut mono);
            resampler.process(&mono, &mut pending);

            while pending.len() >= CHUNK_SAMPLES {
                let chunk = pending.drain(..CHUNK_SAMPLES).collect::<Vec<_>>();
                // try_send, а не send: аудио-колбэк реального времени не имеет
                // права блокироваться. Переполнение канала означает, что сеть
                // не успевает, и тогда честнее потерять чанк, чем задержать
                // весь поток захвата.
                if pcm_tx.try_send(to_le_bytes(&chunk)).is_err() {
                    break;
                }
            }
        },
        on_error,
        None,
    )?;

    Ok(stream)
}

fn downmix_to_mono<T>(data: &[T], channels: usize, output: &mut Vec<f32>)
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    if channels <= 1 {
        output.extend(data.iter().map(|sample| f32::from_sample_(*sample)));
        return;
    }

    for frame in data.chunks_exact(channels) {
        let sum: f32 = frame
            .iter()
            .map(|sample| f32::from_sample_(*sample))
            .sum();
        output.push(sum / channels as f32);
    }
}

fn to_le_bytes(samples: &[i16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_sample_rate_below_target() {
        assert!(Resampler::new(8_000, TARGET_SAMPLE_RATE).is_err());
    }

    #[test]
    fn decimates_48k_to_16k() {
        let mut resampler = Resampler::new(48_000, TARGET_SAMPLE_RATE).unwrap();
        let input = vec![0.0f32; 4_800];
        let mut output = Vec::new();

        resampler.process(&input, &mut output);

        assert_eq!(output.len(), 1_600);
    }

    #[test]
    fn keeps_average_rate_on_non_integer_ratio() {
        let mut resampler = Resampler::new(44_100, TARGET_SAMPLE_RATE).unwrap();
        let mut output = Vec::new();

        // Секунда аудио, поданная типичными для cpal порциями.
        for _ in 0..100 {
            resampler.process(&vec![0.0f32; 441], &mut output);
        }

        let drift = (output.len() as i64 - i64::from(TARGET_SAMPLE_RATE)).abs();
        assert!(drift <= 1, "sample rate drifted by {drift} samples");
    }

    #[test]
    fn preserves_constant_amplitude() {
        let mut resampler = Resampler::new(48_000, TARGET_SAMPLE_RATE).unwrap();
        let mut output = Vec::new();

        resampler.process(&vec![0.5f32; 300], &mut output);

        assert!(!output.is_empty());
        for sample in output {
            assert!((sample - 16_383).abs() <= 2, "unexpected sample {sample}");
        }
    }

    #[test]
    fn clamps_out_of_range_samples() {
        assert_eq!(to_pcm16(2.0), i16::MAX);
        assert_eq!(to_pcm16(-2.0), i16::MIN);
    }

    #[test]
    fn encodes_little_endian_pcm() {
        assert_eq!(to_le_bytes(&[1, -2]), vec![0x01, 0x00, 0xfe, 0xff]);
    }

    #[test]
    fn averages_channels_when_downmixing() {
        let mut output = Vec::new();
        downmix_to_mono(&[1.0f32, 0.0, 0.5, 0.5], 2, &mut output);
        assert_eq!(output, vec![0.5, 0.5]);
    }
}
