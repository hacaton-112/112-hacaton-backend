//! Учебный звонок целиком на стороне Rust.
//!
//! WebSocket к backend живёт в нативном процессе, поэтому Authorization можно
//! передать во время handshake. PCM микрофона перехватывается до webview и
//! сразу отправляется в тот же сокет.

use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{
    ipc::{Channel, InvokeResponseBody, Response},
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

enum Outgoing {
    Command(String),
    Pcm(Vec<u8>),
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
        on_audio: Channel<Response>,
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

        let (outgoing, outgoing_rx) = mpsc::channel::<Outgoing>(OUTGOING_CAPACITY);
        tauri::async_runtime::spawn(pump(socket, outgoing_rx, on_event.clone(), on_audio));

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
    on_audio: Channel<Response>,
) -> Result<String, String> {
    call.connect(url, token, on_event, on_audio).await
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
    on_audio: Channel<Response>,
) {
    let (mut writer, mut reader) = socket.split();
    let mut listening = false;
    let mut pending: VecDeque<Vec<u8>> = VecDeque::new();

    loop {
        tokio::select! {
            outgoing = outgoing_rx.recv() => {
                let Some(outgoing) = outgoing else { break };

                let message = match outgoing {
                    Outgoing::Command(text) => Message::text(text),
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
            incoming = reader.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let Ok(event) = serde_json::from_str::<Value>(&text) else {
                            emit_error(&on_event, "unexpected message from the backend".to_owned());
                            continue;
                        };

                        match event.get("type").and_then(Value::as_str) {
                            Some("listen.started") => {
                                listening = true;

                                while let Some(chunk) = pending.pop_front() {
                                    if writer.send(Message::binary(chunk)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Some("listen.stopped") | Some("error") => {
                                listening = false;
                                pending.clear();
                            }
                            _ => {}
                        }

                        if on_event.send(event).is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Binary(audio))) => {
                        if on_audio.send(Response::new(audio.to_vec())).is_err() {
                            break;
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
            Outgoing::Command(_) => panic!("expected PCM"),
        }
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn stale_connection_cannot_close_the_current_call() {
        let (state, _) = active_state(7);

        state.disconnect("stale").expect("disconnect succeeds");

        assert!(state.active.lock().expect("state lock").is_some());
    }
}
