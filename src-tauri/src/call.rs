//! Учебный звонок целиком на стороне Rust.
//!
//! Сокет к backend держит нативный клиент, а не webview: только отсюда можно
//! поставить заголовок `Authorization` на рукопожатие, которое backend без него
//! закрывает кодом 4401. Заодно речь оператора не пересекает границу IPC —
//! микрофон и сокет оказываются в одном процессе и в одном потоке данных.

use std::{collections::VecDeque, sync::Mutex};

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

/// Очередь исходящего: команды вперемешку с чанками PCM по 100 мс.
const OUTGOING_CAPACITY: usize = 64;

/// Сколько чанков придерживаем, пока backend не подтвердил `listen.started`.
/// Кадры, посланные раньше подтверждения, сервер отбрасывает, а начало фразы
/// терять нельзя: примерно три секунды запаса.
const PENDING_CHUNKS: usize = 32;

/// Backend ждёт PCM16 mono 16 кГц. Плагин отдаёт более мелкие кадры, которые
/// собираем в прежние 100-мс WS-сообщения.
const PCM_SAMPLE_RATE: u64 = 16_000;
const PCM_CHANNELS: u64 = 1;
const PCM_CHUNK_BYTES: usize = PCM_SAMPLE_RATE as usize / 10 * 2;

const LISTEN_STOP: &str = r#"{"type":"listen.stop"}"#;

enum Outgoing {
    Command(String),
    Pcm(Vec<u8>),
}

struct ActiveCall {
    outgoing: mpsc::Sender<Outgoing>,
    events: Channel<Value>,
    microphone_channel_id: Option<u32>,
    listening: bool,
    pending_pcm: Vec<u8>,
}

#[derive(Default)]
pub struct Call {
    active: Mutex<Option<ActiveCall>>,
}

impl Call {
    /// Открывает сокет учебного звонка и начинает слушать события сервера.
    async fn connect(
        &self,
        url: String,
        token: String,
        on_event: Channel<Value>,
        on_audio: Channel<Response>,
    ) -> Result<(), String> {
        if !url.starts_with("ws://") && !url.starts_with("wss://") {
            return Err(format!("unsupported WebSocket URL: {url}"));
        }

        // Повторное подключение закрывает прежнее, а не отказывает: React в режиме
        // разработки монтирует эффект дважды, да и переподключение после обрыва
        // не должно упираться в остаток мёртвого соединения.
        self.disconnect()?;

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

        let (outgoing_tx, outgoing_rx) = mpsc::channel::<Outgoing>(OUTGOING_CAPACITY);
        tauri::async_runtime::spawn(pump(socket, outgoing_rx, on_event.clone(), on_audio));

        *self.active.lock().map_err(lock_error)? = Some(ActiveCall {
            outgoing: outgoing_tx,
            events: on_event,
            microphone_channel_id: None,
            listening: false,
            pending_pcm: Vec::with_capacity(PCM_CHUNK_BYTES),
        });

        Ok(())
    }

    /// Передаёт команду жизненного цикла звонка как есть: протокол живёт в
    /// контрактах backend, дублировать его перечислением здесь незачем.
    async fn send(&self, command: Value) -> Result<(), String> {
        let sender = {
            let guard = self.active.lock().map_err(lock_error)?;
            let Some(active) = guard.as_ref() else {
                return Err("the call socket is not open".to_owned());
            };

            active.outgoing.clone()
        };

        sender
            .send(Outgoing::Command(command.to_string()))
            .await
            .map_err(|_| "the call socket is closed".to_owned())
    }

    /// Связывает Channel плагина с текущим звонком. Сами сообщения перехватывает
    /// `channel_interceptor` до того, как Tauri отправит их в webview.
    fn attach_microphone_channel(&self, channel_id: u32) -> Result<(), String> {
        let mut guard = self.active.lock().map_err(lock_error)?;
        let active = guard
            .as_mut()
            .ok_or_else(|| "the call socket is not open".to_owned())?;

        active.microphone_channel_id = Some(channel_id);
        Ok(())
    }

    /// Оператор взял слово: открываем окно приёма аудио на backend. Микрофон
    /// запускает frontend-команда плагина сразу после этой команды.
    async fn listen_start(&self) -> Result<(), String> {
        let sender = {
            let mut guard = self.active.lock().map_err(lock_error)?;
            let Some(active) = guard.as_mut() else {
                return Err("the call socket is not open".to_owned());
            };

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

        if sender
            .send(Outgoing::Command(
                json!({ "type": "listen.start" }).to_string(),
            ))
            .await
            .is_err()
        {
            if let Some(active) = self.active.lock().map_err(lock_error)?.as_mut() {
                active.listening = false;
            }
            return Err("the call socket is closed".to_owned());
        }

        Ok(())
    }

    /// Оператор договорил. Frontend сначала останавливает плагин, затем здесь
    /// отправляется неполный хвост PCM и только после него `listen.stop`.
    async fn listen_stop(&self) -> Result<(), String> {
        let (sender, tail) = {
            let mut guard = self.active.lock().map_err(lock_error)?;
            let Some(active) = guard.as_mut() else {
                return Ok(());
            };

            if !active.listening {
                return Ok(());
            }

            active.listening = false;
            (
                active.outgoing.clone(),
                std::mem::take(&mut active.pending_pcm),
            )
        };

        if !tail.is_empty() {
            sender
                .send(Outgoing::Pcm(tail))
                .await
                .map_err(|_| "the call socket is closed".to_owned())?;
        }

        sender
            .send(Outgoing::Command(LISTEN_STOP.to_owned()))
            .await
            .map_err(|_| "the call socket is closed".to_owned())?;

        Ok(())
    }

    /// Закрывает текущее соединение: очередь исходящего уходит вместе с ним, и
    /// поток обмена завершается сам.
    fn disconnect(&self) -> Result<(), String> {
        self.active.lock().map_err(lock_error)?.take();
        Ok(())
    }

    /// Перехватывает только Channel, который frontend передал system-audio plugin.
    /// `true` говорит Tauri, что сообщение обработано и его не надо доставлять в JS.
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
            // Channel interceptor синхронный и не должен блокировать аудиопоток.
            // Отправляем под mutex, чтобы `listen.stop` не обогнал уже собранный чанк.
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

// Tauri commands are deliberately thin: the complete call lifecycle belongs to `Call`.
#[tauri::command]
pub async fn call_connect(
    call: State<'_, Call>,
    url: String,
    token: String,
    on_event: Channel<Value>,
    on_audio: Channel<Response>,
) -> Result<(), String> {
    call.connect(url, token, on_event, on_audio).await
}

#[tauri::command]
pub async fn call_send(call: State<'_, Call>, command: Value) -> Result<(), String> {
    call.send(command).await
}

#[tauri::command]
pub fn call_attach_microphone_channel(
    call: State<'_, Call>,
    channel_id: u32,
) -> Result<(), String> {
    call.attach_microphone_channel(channel_id)
}

#[tauri::command]
pub async fn call_listen_start(call: State<'_, Call>) -> Result<(), String> {
    call.listen_start().await
}

#[tauri::command]
pub async fn call_listen_stop(call: State<'_, Call>) -> Result<(), String> {
    call.listen_stop().await
}

#[tauri::command]
pub async fn call_disconnect(call: State<'_, Call>) -> Result<(), String> {
    call.disconnect()
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
    // Кадры до подтверждения окна сервер отбрасывает, поэтому придерживаем их
    // здесь, а не теряем вместе с началом фразы.
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
                        // Сервер проверяет, жив ли клиент; молчание он считает
                        // брошенным звонком и рвёт соединение.
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
                    outgoing,
                    events,
                    microphone_channel_id: Some(channel_id),
                    listening: true,
                    pending_pcm: Vec::with_capacity(PCM_CHUNK_BYTES),
                })),
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
}
