//! Учебный звонок целиком на стороне Rust.
//!
//! Сокет к backend держит нативный клиент, а не webview: только отсюда можно
//! поставить заголовок `Authorization` на рукопожатие, которое backend без него
//! закрывает кодом 4401. Заодно речь оператора не пересекает границу IPC —
//! микрофон и сокет оказываются в одном процессе и в одном потоке данных.

use std::{collections::VecDeque, sync::Mutex};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{
    ipc::{Channel, Response},
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

use crate::audio::{start_capture, CaptureHandle};

/// Очередь исходящего: команды вперемешку с чанками PCM по 100 мс.
const OUTGOING_CAPACITY: usize = 64;

/// Сколько чанков придерживаем, пока backend не подтвердил `listen.started`.
/// Кадры, посланные раньше подтверждения, сервер отбрасывает, а начало фразы
/// терять нельзя: примерно три секунды запаса.
const PENDING_CHUNKS: usize = 32;

const LISTEN_STOP: &str = r#"{"type":"listen.stop"}"#;

enum Outgoing {
    Command(String),
    Pcm(Vec<u8>),
}

struct ActiveCall {
    outgoing: mpsc::Sender<Outgoing>,
    capture: Option<CaptureHandle>,
}

#[derive(Default)]
pub struct CallState {
    active: Mutex<Option<ActiveCall>>,
}

/// Открывает сокет учебного звонка и начинает слушать события сервера.
#[tauri::command]
pub async fn call_connect(
    state: State<'_, CallState>,
    url: String,
    token: String,
    on_event: Channel<Value>,
    on_audio: Channel<Response>,
) -> Result<(), String> {
    if !url.starts_with("ws://") && !url.starts_with("wss://") {
        return Err(format!("unsupported WebSocket URL: {url}"));
    }

    if state.active.lock().map_err(lock_error)?.is_some() {
        return Err("the call socket is already open".to_owned());
    }

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
    tauri::async_runtime::spawn(pump(socket, outgoing_rx, on_event, on_audio));

    *state.active.lock().map_err(lock_error)? = Some(ActiveCall {
        outgoing: outgoing_tx,
        capture: None,
    });

    Ok(())
}

/// Передаёт команду жизненного цикла звонка как есть: протокол живёт в
/// контрактах backend, дублировать его перечислением здесь незачем.
#[tauri::command]
pub async fn call_send(state: State<'_, CallState>, command: Value) -> Result<(), String> {
    let sender = {
        let guard = state.active.lock().map_err(lock_error)?;
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

/// Оператор взял слово: открываем окно записи и включаем микрофон.
#[tauri::command]
pub async fn call_listen_start(state: State<'_, CallState>) -> Result<(), String> {
    let (sender, already_listening) = {
        let guard = state.active.lock().map_err(lock_error)?;
        let Some(active) = guard.as_ref() else {
            return Err("the call socket is not open".to_owned());
        };

        (active.outgoing.clone(), active.capture.is_some())
    };

    if already_listening {
        return Err("the operator already holds the floor".to_owned());
    }

    sender
        .send(Outgoing::Command(json!({ "type": "listen.start" }).to_string()))
        .await
        .map_err(|_| "the call socket is closed".to_owned())?;

    let (pcm_tx, pcm_rx) = mpsc::channel::<Vec<u8>>(PENDING_CHUNKS);
    let capture = start_capture(pcm_tx)
        .map_err(|error| format!("could not start microphone capture: {error}"))?;

    tauri::async_runtime::spawn(forward_pcm(pcm_rx, sender));

    state
        .active
        .lock()
        .map_err(lock_error)?
        .as_mut()
        .ok_or_else(|| "the call socket is not open".to_owned())?
        .capture = Some(capture);

    Ok(())
}

/// Оператор договорил. Команду `listen.stop` шлёт не эта функция, а поток
/// пересылки — после того как отдаст хвост реплики, иначе последние сотни
/// миллисекунд обогнала бы команда и не попали в расшифровку.
#[tauri::command]
pub async fn call_listen_stop(state: State<'_, CallState>) -> Result<(), String> {
    let capture = state
        .active
        .lock()
        .map_err(lock_error)?
        .as_mut()
        .and_then(|active| active.capture.take());

    if let Some(mut capture) = capture {
        capture.stop();
    }

    Ok(())
}

#[tauri::command]
pub async fn call_disconnect(state: State<'_, CallState>) -> Result<(), String> {
    let active = state.active.lock().map_err(lock_error)?.take();

    if let Some(mut active) = active {
        if let Some(mut capture) = active.capture.take() {
            capture.stop();
        }
    }

    Ok(())
}

async fn forward_pcm(mut pcm_rx: mpsc::Receiver<Vec<u8>>, outgoing: mpsc::Sender<Outgoing>) {
    while let Some(chunk) = pcm_rx.recv().await {
        if outgoing.send(Outgoing::Pcm(chunk)).await.is_err() {
            return;
        }
    }

    let _ = outgoing
        .send(Outgoing::Command(LISTEN_STOP.to_owned()))
        .await;
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
