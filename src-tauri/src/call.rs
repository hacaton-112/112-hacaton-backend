//! Учебный звонок целиком на стороне Rust.
//!
//! WebSocket к backend живёт в нативном процессе, поэтому Authorization можно
//! передать во время handshake. PCM микрофона перехватывается до webview и
//! сразу отправляется в тот же сокет.

use std::{
    collections::VecDeque,
    num::{NonZeroU16, NonZeroU32},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use rodio::{buffer::SamplesBuffer, source::Source, DeviceSinkBuilder, MixerDeviceSink, Player};
use serde_json::{json, Value};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    State,
};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest,
        http::{header::AUTHORIZATION, HeaderValue},
        Message,
    },
};

const OUTGOING_CAPACITY: usize = 64;
const PENDING_CHUNKS: usize = 32;
const PCM_SAMPLE_RATE: u64 = 16_000;
const PCM_CHANNELS: u64 = 1;
const PCM_CHUNK_BYTES: usize = PCM_SAMPLE_RATE as usize / 10 * 2;
const LISTEN_STOP: &str = r#"{"type":"listen.stop"}"#;
const TTS_STARTUP_BUFFER_MS: usize = 160;
const TELEPHONE_HIGH_PASS_HZ: f32 = 320.0;
const TELEPHONE_LOW_PASS_HZ: f32 = 1_800.0;
const COMPRESSOR_THRESHOLD: f32 = 0.10;
const COMPRESSOR_RATIO: f32 = 0.45;
const TELEPHONE_DRIVE: f32 = 1.2;
const OUTPUT_GAIN: f32 = 0.88;
const TELEPHONE_OUTPUT_LIMIT: f32 = 0.92;
const INTERFERENCE_NOISE_LEVEL: f32 = 0.045;
const INTERFERENCE_CRACKLE_LEVEL: f32 = 0.10;

enum Outgoing {
    Command(String),
    Start { scenario_version_id: String },
    Pcm(Vec<u8>),
}

struct TelephoneAudioProcessor {
    sample_rate: u32,
    high_pass_alpha: f32,
    low_pass_alpha: f32,
    previous_input: f32,
    high_pass_state: f32,
    previous_high_pass: f32,
    high_pass_state_2: f32,
    low_pass_state: f32,
    low_pass_state_2: f32,
    noise_state: u32,
    interference_wait: usize,
    interference_remaining: usize,
    interference_previous_input: f32,
    interference_high_pass_state: f32,
    interference_low_pass_state: f32,
}

impl TelephoneAudioProcessor {
    fn new(sample_rate: u32) -> Self {
        let sample_interval = 1.0 / sample_rate as f32;
        let high_pass_rc = 1.0 / (2.0 * std::f32::consts::PI * TELEPHONE_HIGH_PASS_HZ);
        let low_pass_rc = 1.0 / (2.0 * std::f32::consts::PI * TELEPHONE_LOW_PASS_HZ);
        let time_seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.subsec_nanos())
            .unwrap_or(0x6d2b79f5);
        let noise_seed = time_seed ^ sample_rate ^ 0x9e3779b9;

        Self {
            sample_rate,
            high_pass_alpha: high_pass_rc / (high_pass_rc + sample_interval),
            low_pass_alpha: sample_interval / (low_pass_rc + sample_interval),
            previous_input: 0.0,
            high_pass_state: 0.0,
            previous_high_pass: 0.0,
            high_pass_state_2: 0.0,
            low_pass_state: 0.0,
            low_pass_state_2: 0.0,
            noise_state: if noise_seed == 0 {
                0x6d2b79f5
            } else {
                noise_seed
            },
            interference_wait: sample_rate as usize / 2,
            interference_remaining: 0,
            interference_previous_input: 0.0,
            interference_high_pass_state: 0.0,
            interference_low_pass_state: 0.0,
        }
    }

    fn process(&mut self, sample: i16) -> f32 {
        let input = sample as f32 / 32_768.0;
        let high_passed =
            self.high_pass_alpha * (self.high_pass_state + input - self.previous_input);
        self.previous_input = input;
        self.high_pass_state = high_passed;
        let high_passed_2 =
            self.high_pass_alpha * (self.high_pass_state_2 + high_passed - self.previous_high_pass);
        self.previous_high_pass = high_passed;
        self.high_pass_state_2 = high_passed_2;
        self.low_pass_state += self.low_pass_alpha * (high_passed_2 - self.low_pass_state);
        self.low_pass_state_2 +=
            self.low_pass_alpha * (self.low_pass_state - self.low_pass_state_2);

        let magnitude = self.low_pass_state_2.abs();
        let compressed_magnitude = if magnitude <= COMPRESSOR_THRESHOLD {
            magnitude
        } else {
            COMPRESSOR_THRESHOLD + (magnitude - COMPRESSOR_THRESHOLD) * COMPRESSOR_RATIO
        };
        let compressed = self.low_pass_state_2.signum() * compressed_magnitude;
        let saturated = (compressed * TELEPHONE_DRIVE).tanh() / TELEPHONE_DRIVE.tanh();
        (saturated * OUTPUT_GAIN + self.next_interference())
            .clamp(-TELEPHONE_OUTPUT_LIMIT, TELEPHONE_OUTPUT_LIMIT)
    }

    fn next_interference(&mut self) -> f32 {
        if self.interference_remaining > 0 {
            self.interference_remaining -= 1;
            let static_noise = self.random_signed() * INTERFERENCE_NOISE_LEVEL;
            let crackle = if self.next_random() % 41 == 0 {
                self.random_signed().signum() * INTERFERENCE_CRACKLE_LEVEL
            } else {
                0.0
            };
            return self.filter_interference(static_noise + crackle);
        }

        if self.interference_wait > 0 {
            self.interference_wait -= 1;
            return 0.0;
        }

        let duration_roll = self.next_random();
        let duration_ms = if duration_roll % 5 == 0 {
            450 + self.next_random() as usize % 1_051
        } else {
            45 + self.next_random() as usize % 256
        };
        let pause_ms = 800 + self.next_random() as usize % 2_400;
        self.interference_remaining = self.sample_rate as usize * duration_ms / 1_000;
        self.interference_wait = self.sample_rate as usize * pause_ms / 1_000;
        self.next_interference()
    }

    fn filter_interference(&mut self, input: f32) -> f32 {
        let high_passed = self.high_pass_alpha
            * (self.interference_high_pass_state + input - self.interference_previous_input);
        self.interference_previous_input = input;
        self.interference_high_pass_state = high_passed;
        self.interference_low_pass_state +=
            self.low_pass_alpha * (high_passed - self.interference_low_pass_state);
        self.interference_low_pass_state.clamp(-0.12, 0.12)
    }

    fn random_signed(&mut self) -> f32 {
        (self.next_random() as f32 / u32::MAX as f32) * 2.0 - 1.0
    }

    fn next_random(&mut self) -> u32 {
        let mut state = self.noise_state;
        state ^= state.wrapping_shl(13);
        state ^= state.wrapping_shr(17);
        state ^= state.wrapping_shl(5);
        self.noise_state = state;
        state
    }
}

struct TtsAudioStream {
    sample_rate: u32,
    processor: TelephoneAudioProcessor,
    sink: std::sync::Arc<Player>,
    pending_byte: Option<u8>,
    buffered_samples: usize,
    started: bool,
    level_tx: mpsc::UnboundedSender<(u64, f32)>,
    generation: u64,
}

impl TtsAudioStream {
    fn new(
        sample_rate: u32,
        output: &MixerDeviceSink,
        level_tx: mpsc::UnboundedSender<(u64, f32)>,
        generation: u64,
    ) -> Self {
        let sink = std::sync::Arc::new(Player::connect_new(output.mixer()));
        sink.pause();
        Self {
            sample_rate,
            processor: TelephoneAudioProcessor::new(sample_rate),
            sink,
            pending_byte: None,
            buffered_samples: 0,
            started: false,
            level_tx,
            generation,
        }
    }

    fn push_pcm16_le(&mut self, bytes: &[u8]) {
        let mut samples =
            Vec::with_capacity((bytes.len() + usize::from(self.pending_byte.is_some())) / 2);
        let mut offset = 0;
        if let (Some(low), Some(&high)) = (self.pending_byte.take(), bytes.first()) {
            samples.push(self.processor.process(i16::from_le_bytes([low, high])));
            offset = 1;
        }

        for pair in bytes[offset..].chunks_exact(2) {
            samples.push(
                self.processor
                    .process(i16::from_le_bytes([pair[0], pair[1]])),
            );
            offset += 2;
        }

        if offset < bytes.len() {
            self.pending_byte = Some(bytes[offset]);
        }

        if !samples.is_empty() {
            self.buffered_samples += samples.len();
            self.sink.append(PlaybackLevelSource::new(
                SamplesBuffer::new(
                    NonZeroU16::new(1).expect("the mono channel count is non-zero"),
                    NonZeroU32::new(self.sample_rate)
                        .expect("the validated sample rate is non-zero"),
                    samples,
                ),
                self.sample_rate,
                self.generation,
                self.level_tx.clone(),
            ));
        }

        if !self.started
            && self.buffered_samples * 1_000 >= self.sample_rate as usize * TTS_STARTUP_BUFFER_MS
        {
            self.started = true;
            self.sink.play();
        }
    }

    fn finish(mut self) -> std::sync::Arc<Player> {
        if !self.started {
            self.started = true;
            self.sink.play();
        }
        self.sink
    }
}

/// Считает RMS в момент, когда rodio действительно забирает семплы на
/// воспроизведение. Благодаря этому UI-индикатор не обгоняет Rust-буфер TTS.
struct PlaybackLevelSource<S> {
    inner: S,
    level_tx: mpsc::UnboundedSender<(u64, f32)>,
    generation: u64,
    square_sum: f32,
    sample_count: usize,
    samples_per_update: usize,
    finished: bool,
}

impl<S> PlaybackLevelSource<S> {
    fn new(
        inner: S,
        sample_rate: u32,
        generation: u64,
        level_tx: mpsc::UnboundedSender<(u64, f32)>,
    ) -> Self {
        Self {
            inner,
            level_tx,
            generation,
            square_sum: 0.0,
            sample_count: 0,
            samples_per_update: (sample_rate as usize / 30).max(1),
            finished: false,
        }
    }

    fn emit_level(&mut self) {
        if self.sample_count == 0 {
            return;
        }

        let rms = (self.square_sum / self.sample_count as f32).sqrt();
        let level = (rms * 5.5).clamp(0.0, 1.0);
        let _ = self.level_tx.send((self.generation, level));
        self.square_sum = 0.0;
        self.sample_count = 0;
    }
}

impl<S> Iterator for PlaybackLevelSource<S>
where
    S: Iterator<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let Some(sample) = self.inner.next() else {
            if !self.finished {
                self.finished = true;
                self.emit_level();
            }
            return None;
        };
        self.square_sum += sample * sample;
        self.sample_count += 1;

        if self.sample_count >= self.samples_per_update {
            self.emit_level();
        }

        Some(sample)
    }
}

impl<S> Source for PlaybackLevelSource<S>
where
    S: Source<Item = f32>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> NonZeroU16 {
        self.inner.channels()
    }

    fn sample_rate(&self) -> NonZeroU32 {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<std::time::Duration> {
        self.inner.total_duration()
    }
}

struct ActiveCall {
    /// Команды устаревшего webview не должны попасть в новый звонок.
    id: String,
    outgoing: mpsc::Sender<Outgoing>,
    events: Channel<Value>,
    microphone_channel_id: Option<u32>,
    listening: bool,
    pending_pcm: Vec<u8>,
}

#[derive(Default)]
pub struct Call {
    active: Mutex<Option<ActiveCall>>,
    /// Побеждает подключение, начатое последним, даже если handshake старого
    /// завершился позже.
    generation: AtomicU64,
}

impl Call {
    async fn connect(
        &self,
        url: String,
        token: String,
        on_event: Channel<Value>,
    ) -> Result<String, String> {
        if !url.starts_with("ws://") && !url.starts_with("wss://") {
            return Err(format!("unsupported WebSocket URL: {url}"));
        }

        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.close_active()?;

        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|error| format!("invalid call URL: {error}"))?;
        request.headers_mut().insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}"))
                .map_err(|_| "the access token is not a valid header".to_owned())?,
        );

        let (socket, _) = connect_async(request)
            .await
            .map_err(|error| format!("could not connect to the backend: {error}"))?;
        let mut output = DeviceSinkBuilder::open_default_sink()
            .map_err(|error| format!("could not open the audio output: {error}"))?;
        output.log_on_drop(false);

        let (outgoing, outgoing_rx) = mpsc::channel::<Outgoing>(OUTGOING_CAPACITY);
        tauri::async_runtime::spawn(pump(socket, outgoing_rx, on_event.clone(), output));

        let id = generation.to_string();
        let mut active = self.active.lock().map_err(lock_error)?;

        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("this call socket has been superseded".to_owned());
        }

        *active = Some(ActiveCall {
            id: id.clone(),
            outgoing,
            events: on_event,
            microphone_channel_id: None,
            listening: false,
            pending_pcm: Vec::with_capacity(PCM_CHUNK_BYTES),
        });

        Ok(id)
    }

    async fn send(&self, connection: &str, command: Value) -> Result<(), String> {
        let outgoing = self.sender(connection)?;

        outgoing
            .send(Outgoing::Command(command.to_string()))
            .await
            .map_err(|_| "the call socket is closed".to_owned())
    }

    async fn start(
        &self,
        connection: &str,
        scenario_version_id: String,
        _scenario_category: String,
    ) -> Result<(), String> {
        let outgoing = self.sender(connection)?;
        outgoing
            .send(Outgoing::Start {
                scenario_version_id,
            })
            .await
            .map_err(|_| "the call socket is closed".to_owned())
    }

    fn attach_microphone_channel(&self, connection: &str, channel_id: u32) -> Result<(), String> {
        let mut guard = self.active.lock().map_err(lock_error)?;
        let active = active_for(&mut guard, connection)?;
        active.microphone_channel_id = Some(channel_id);
        Ok(())
    }

    async fn listen_start(&self, connection: &str) -> Result<(), String> {
        let outgoing = {
            let mut guard = self.active.lock().map_err(lock_error)?;
            let active = active_for(&mut guard, connection)?;

            if active.listening {
                return Err("the operator already holds the floor".to_owned());
            }
            if active.microphone_channel_id.is_none() {
                return Err("the microphone channel is not attached".to_owned());
            }

            active.listening = true;
            active.pending_pcm.clear();
            active.outgoing.clone()
        };

        if outgoing
            .send(Outgoing::Command(
                json!({ "type": "listen.start" }).to_string(),
            ))
            .await
            .is_err()
        {
            if let Ok(mut guard) = self.active.lock() {
                if let Ok(active) = active_for(&mut guard, connection) {
                    active.listening = false;
                }
            }
            return Err("the call socket is closed".to_owned());
        }

        Ok(())
    }

    /// После остановки плагина отправляет накопленный хвост, затем listen.stop.
    /// Порядок вызовов дополнительно сериализован в CallStream на frontend.
    async fn listen_stop(&self, connection: &str) -> Result<(), String> {
        let payload = {
            let mut guard = self.active.lock().map_err(lock_error)?;
            let Some(active) = guard.as_mut() else {
                return Ok(());
            };

            if active.id != connection || !active.listening {
                return Ok(());
            }

            active.listening = false;
            Some((
                active.outgoing.clone(),
                std::mem::take(&mut active.pending_pcm),
            ))
        };

        let Some((outgoing, tail)) = payload else {
            return Ok(());
        };

        if !tail.is_empty() {
            outgoing
                .send(Outgoing::Pcm(tail))
                .await
                .map_err(|_| "the call socket is closed".to_owned())?;
        }

        outgoing
            .send(Outgoing::Command(LISTEN_STOP.to_owned()))
            .await
            .map_err(|_| "the call socket is closed".to_owned())
    }

    fn disconnect(&self, connection: &str) -> Result<(), String> {
        let mut active = self.active.lock().map_err(lock_error)?;
        if active
            .as_ref()
            .is_some_and(|current| current.id == connection)
        {
            active.take();
        }
        Ok(())
    }

    fn close_active(&self) -> Result<(), String> {
        self.active.lock().map_err(lock_error)?.take();
        Ok(())
    }

    fn sender(&self, connection: &str) -> Result<mpsc::Sender<Outgoing>, String> {
        let guard = self.active.lock().map_err(lock_error)?;
        let active = guard
            .as_ref()
            .ok_or_else(|| "the call socket is not open".to_owned())?;

        if active.id != connection {
            return Err("this call socket has been replaced".to_owned());
        }

        Ok(active.outgoing.clone())
    }

    /// Перехватывает только Channel, переданный system-audio plugin.
    pub fn intercept_microphone_channel(
        &self,
        callback_id: u32,
        body: &InvokeResponseBody,
    ) -> bool {
        let is_microphone_channel = self
            .active
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .as_ref()
                    .map(|active| active.microphone_channel_id == Some(callback_id))
            })
            .unwrap_or(false);

        if !is_microphone_channel {
            return false;
        }

        let InvokeResponseBody::Json(payload) = body else {
            self.report_microphone_error("unexpected binary event from audio plugin".to_owned());
            return true;
        };

        let Ok(event) = serde_json::from_str::<Value>(payload) else {
            self.report_microphone_error("invalid event from audio plugin".to_owned());
            return true;
        };

        match event.get("kind").and_then(Value::as_str) {
            Some("pcm") => self.intercept_pcm_frame(&event),
            Some("failure") => self.report_microphone_error(
                event
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("microphone capture failed")
                    .to_owned(),
            ),
            Some("level") => {}
            _ => self.report_microphone_error("unknown event from audio plugin".to_owned()),
        }

        true
    }

    fn intercept_pcm_frame(&self, event: &Value) {
        if event.get("source").and_then(Value::as_str) != Some("mic") {
            return;
        }

        let sample_rate = event.get("sample_rate").and_then(Value::as_u64);
        let channels = event.get("channels").and_then(Value::as_u64);
        if sample_rate != Some(PCM_SAMPLE_RATE) || channels != Some(PCM_CHANNELS) {
            self.report_microphone_error(format!(
                "audio plugin returned unsupported PCM format: {} Hz, {} channels",
                sample_rate.unwrap_or_default(),
                channels.unwrap_or_default()
            ));
            return;
        }

        let Some(encoded) = event.get("samples_base64").and_then(Value::as_str) else {
            self.report_microphone_error("audio plugin returned no PCM data".to_owned());
            return;
        };
        let Ok(bytes) = BASE64.decode(encoded) else {
            self.report_microphone_error("audio plugin returned invalid PCM data".to_owned());
            return;
        };

        let Ok(mut guard) = self.active.lock() else {
            return;
        };
        let Some(active) = guard.as_mut() else {
            return;
        };
        if !active.listening {
            return;
        }

        active.pending_pcm.extend_from_slice(&bytes);
        while active.pending_pcm.len() >= PCM_CHUNK_BYTES {
            let chunk = active.pending_pcm.drain(..PCM_CHUNK_BYTES).collect();
            if active.outgoing.try_send(Outgoing::Pcm(chunk)).is_err() {
                break;
            }
        }
    }

    fn report_microphone_error(&self, message: String) {
        let active = self.active.lock().ok().and_then(|mut guard| {
            let active = guard.as_mut()?;
            active.listening = false;
            active.pending_pcm.clear();
            Some((active.outgoing.clone(), active.events.clone()))
        });

        if let Some((outgoing, events)) = active {
            let _ = outgoing.try_send(Outgoing::Command(LISTEN_STOP.to_owned()));
            let _ = events.send(json!({
                "type": "error",
                "code": "listen-failed",
                "message": message,
            }));
        }
    }
}

fn active_for<'a>(
    guard: &'a mut Option<ActiveCall>,
    connection: &str,
) -> Result<&'a mut ActiveCall, String> {
    let active = guard
        .as_mut()
        .ok_or_else(|| "the call socket is not open".to_owned())?;

    if active.id != connection {
        return Err("this call socket has been replaced".to_owned());
    }

    Ok(active)
}

#[tauri::command]
pub async fn call_connect(
    call: State<'_, Call>,
    url: String,
    token: String,
    on_event: Channel<Value>,
) -> Result<String, String> {
    call.connect(url, token, on_event).await
}

#[tauri::command]
pub async fn call_start(
    call: State<'_, Call>,
    connection: String,
    scenario_version_id: String,
    scenario_category: String,
) -> Result<(), String> {
    call.start(&connection, scenario_version_id, scenario_category)
        .await
}

#[tauri::command]
pub async fn call_send(
    call: State<'_, Call>,
    connection: String,
    command: Value,
) -> Result<(), String> {
    call.send(&connection, command).await
}

#[tauri::command]
pub fn call_attach_microphone_channel(
    call: State<'_, Call>,
    connection: String,
    channel_id: u32,
) -> Result<(), String> {
    call.attach_microphone_channel(&connection, channel_id)
}

#[tauri::command]
pub async fn call_listen_start(call: State<'_, Call>, connection: String) -> Result<(), String> {
    call.listen_start(&connection).await
}

#[tauri::command]
pub async fn call_listen_stop(call: State<'_, Call>, connection: String) -> Result<(), String> {
    call.listen_stop(&connection).await
}

#[tauri::command]
pub fn call_disconnect(call: State<'_, Call>, connection: String) -> Result<(), String> {
    call.disconnect(&connection)
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn pump(
    socket: Socket,
    mut outgoing_rx: mpsc::Receiver<Outgoing>,
    on_event: Channel<Value>,
    output: MixerDeviceSink,
) {
    let (mut writer, mut reader) = socket.split();
    let mut listening = false;
    let mut pending: VecDeque<Vec<u8>> = VecDeque::new();
    let mut tts_audio: Option<TtsAudioStream> = None;
    let mut playback_sink: Option<std::sync::Arc<Player>> = None;
    let mut deferred_audio_done: Option<Value> = None;
    let mut playback_generation = 0_u64;
    let (playback_done_tx, mut playback_done_rx) = mpsc::unbounded_channel::<u64>();
    let (playback_level_tx, mut playback_level_rx) = mpsc::unbounded_channel::<(u64, f32)>();

    loop {
        tokio::select! {
            outgoing = outgoing_rx.recv() => {
                let Some(outgoing) = outgoing else { break };

                let message = match outgoing {
                    Outgoing::Command(text) => Message::text(text),
                    Outgoing::Start {
                        scenario_version_id: version_id,
                    } => {
                        if let Some(audio) = tts_audio.take() {
                            audio.sink.stop();
                        }
                        if let Some(sink) = playback_sink.take() {
                            sink.stop();
                        }
                        playback_generation = playback_generation.wrapping_add(1);
                        deferred_audio_done = None;
                        Message::text(
                            json!({
                                "type": "start",
                                "scenarioVersionId": version_id,
                            })
                            .to_string(),
                        )
                    }
                    Outgoing::Pcm(chunk) => {
                        if !listening {
                            if pending.len() == PENDING_CHUNKS {
                                pending.pop_front();
                            }
                            pending.push_back(chunk);
                            continue;
                        }

                        Message::binary(chunk)
                    }
                };

                if let Err(error) = writer.send(message).await {
                    emit_error(&on_event, format!("could not reach the backend: {error}"));
                    break;
                }
            }
            Some(generation) = playback_done_rx.recv() => {
                if generation == playback_generation {
                    playback_sink = None;
                    if let Some(event) = deferred_audio_done.take() {
                        if on_event.send(event).is_err() {
                            break;
                        }
                    }
                }
            }
            Some((generation, level)) = playback_level_rx.recv() => {
                if generation == playback_generation
                    && on_event
                        .send(json!({ "type": "audio.level", "level": level }))
                        .is_err()
                {
                    break;
                }
            }
            incoming = reader.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let Ok(event) = serde_json::from_str::<Value>(&text) else {
                            emit_error(&on_event, "unexpected message from the backend".to_owned());
                            continue;
                        };
                        let mut forward_event = true;

                        match event.get("type").and_then(Value::as_str) {
                            Some("listen.started") => {
                                listening = true;

                                while let Some(chunk) = pending.pop_front() {
                                    if writer.send(Message::binary(chunk)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Some("listen.stopped") => {
                                listening = false;
                                pending.clear();
                            }
                            Some("call.ended") => {
                                listening = false;
                                pending.clear();
                                if let Some(audio) = tts_audio.take() {
                                    audio.sink.stop();
                                }
                                if let Some(sink) = playback_sink.take() {
                                    sink.stop();
                                }
                                playback_generation = playback_generation.wrapping_add(1);
                                deferred_audio_done = None;
                            }
                            Some("error") => {
                                listening = false;
                                pending.clear();
                                if let Some(audio) = tts_audio.take() {
                                    audio.sink.stop();
                                }
                                if let Some(sink) = playback_sink.take() {
                                    sink.stop();
                                }
                                playback_generation = playback_generation.wrapping_add(1);
                                deferred_audio_done = None;
                            }
                            Some("audio.start") => {
                                if let Some(audio) = tts_audio.take() {
                                    audio.sink.stop();
                                }
                                if let Some(sink) = playback_sink.take() {
                                    sink.stop();
                                }
                                playback_generation = playback_generation.wrapping_add(1);
                                deferred_audio_done = None;
                                let sample_rate = event
                                    .get("sampleRate")
                                    .and_then(Value::as_u64)
                                    .and_then(|rate| u32::try_from(rate).ok());
                                if event.get("streamId").and_then(Value::as_str).is_some() {
                                    if let Some(sample_rate) = sample_rate {
                                        if (8_000..=192_000).contains(&sample_rate) {
                                            tts_audio = Some(TtsAudioStream::new(
                                                sample_rate,
                                                &output,
                                                playback_level_tx.clone(),
                                                playback_generation,
                                            ));
                                        } else {
                                            emit_error(&on_event, format!(
                                                "unsupported TTS sample rate: {sample_rate} Hz"
                                            ));
                                        }
                                    }
                                }
                            }
                            Some("audio.done") => {
                                if let Some(audio) = tts_audio.take() {
                                    let sink = audio.finish();
                                    playback_sink = Some(sink.clone());
                                    let generation = playback_generation;
                                    let done_tx = playback_done_tx.clone();
                                    deferred_audio_done = Some(event.clone());
                                    forward_event = false;
                                    tauri::async_runtime::spawn_blocking(move || {
                                        sink.sleep_until_end();
                                        let _ = done_tx.send(generation);
                                    });
                                }
                            }
                            Some("request.cancelled") => {
                                if let Some(audio) = tts_audio.take() {
                                    audio.sink.stop();
                                }
                                if let Some(sink) = playback_sink.take() {
                                    sink.stop();
                                }
                                playback_generation = playback_generation.wrapping_add(1);
                                deferred_audio_done = None;
                            }
                            _ => {}
                        }

                        if forward_event && on_event.send(event).is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Binary(audio))) => {
                        if let Some(stream) = tts_audio.as_mut() {
                            stream.push_pcm16_le(&audio);
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if writer.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        emit_error(&on_event, format!("the call connection failed: {error}"));
                        break;
                    }
                }
            }
        }
    }

    if let Some(audio) = tts_audio {
        audio.sink.stop();
    }
    if let Some(sink) = playback_sink {
        sink.stop();
    }
    let _ = writer.close().await;
    let _ = on_event.send(json!({ "type": "socket.closed" }));
}

fn emit_error(channel: &Channel<Value>, message: String) {
    let _ = channel.send(json!({ "type": "socket.error", "message": message }));
}

fn lock_error<T>(_: T) -> String {
    "the call state is poisoned".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active_state(channel_id: u32) -> (Call, mpsc::Receiver<Outgoing>) {
        let (outgoing, receiver) = mpsc::channel(OUTGOING_CAPACITY);
        let events = Channel::new(|_| Ok(()));

        (
            Call {
                active: Mutex::new(Some(ActiveCall {
                    id: "1".to_owned(),
                    outgoing,
                    events,
                    microphone_channel_id: Some(channel_id),
                    listening: true,
                    pending_pcm: Vec::with_capacity(PCM_CHUNK_BYTES),
                })),
                generation: AtomicU64::new(1),
            },
            receiver,
        )
    }

    fn pcm_event(bytes: &[u8]) -> InvokeResponseBody {
        InvokeResponseBody::Json(
            json!({
                "kind": "pcm",
                "seq": 1,
                "source": "mic",
                "sample_rate": PCM_SAMPLE_RATE,
                "channels": PCM_CHANNELS,
                "samples_base64": BASE64.encode(bytes),
            })
            .to_string(),
        )
    }

    #[test]
    fn ignores_unrelated_tauri_channels() {
        let (state, mut receiver) = active_state(7);

        assert!(!state.intercept_microphone_channel(8, &pcm_event(&[0; 16])));
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn batches_plugin_frames_into_100ms_pcm_chunks() {
        let (state, mut receiver) = active_state(7);
        let frame = vec![0x5a; PCM_CHUNK_BYTES / 5];

        for _ in 0..5 {
            assert!(state.intercept_microphone_channel(7, &pcm_event(&frame)));
        }

        match receiver.try_recv().expect("one PCM chunk") {
            Outgoing::Pcm(chunk) => {
                assert_eq!(chunk.len(), PCM_CHUNK_BYTES);
                assert!(chunk.iter().all(|byte| *byte == 0x5a));
            }
            Outgoing::Command(_) | Outgoing::Start { .. } => {
                panic!("expected PCM")
            }
        }
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn stale_connection_cannot_close_the_current_call() {
        let (state, _) = active_state(7);

        state.disconnect("stale").expect("disconnect succeeds");

        assert!(state.active.lock().expect("state lock").is_some());
    }

    #[test]
    fn telephone_processor_band_limits_and_colours_the_voice() {
        let mut processor = TelephoneAudioProcessor::new(24_000);
        let processed: Vec<f32> = (0..2_000).map(|_| processor.process(16_000)).collect();

        assert!(processed
            .iter()
            .all(|sample| sample.abs() <= TELEPHONE_OUTPUT_LIMIT));
        assert!(processed[0].abs() > processed[1_999].abs());
        assert!(processed.iter().any(|sample| *sample != 0.0));
    }

    #[test]
    fn telephone_processor_adds_short_interference_bursts() {
        let mut processor = TelephoneAudioProcessor::new(24_000);
        processor.noise_state = 0x12345678;
        processor.interference_wait = 0;

        let samples: Vec<f32> = (0..2_000).map(|_| processor.process(0)).collect();

        assert!(samples.iter().any(|sample| sample.abs() > 0.01));
        assert!(samples.iter().all(|sample| sample.abs() <= 0.12));
    }

    #[test]
    fn telephone_processor_focuses_energy_on_the_reference_voice_band() {
        fn filtered_rms(frequency: f32) -> f32 {
            let sample_rate = 24_000;
            let mut processor = TelephoneAudioProcessor::new(sample_rate);
            processor.interference_wait = usize::MAX;
            let samples: Vec<f32> = (0..4_800)
                .map(|index| {
                    let phase =
                        2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate as f32;
                    processor.process((phase.sin() * 16_000.0) as i16)
                })
                .skip(1_000)
                .collect();
            (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32)
                .sqrt()
        }

        let voice = filtered_rms(900.0);
        assert!(voice > filtered_rms(100.0) * 4.0);
        assert!(voice > filtered_rms(4_000.0) * 3.0);
    }
}
