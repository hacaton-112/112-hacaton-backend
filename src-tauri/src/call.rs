//! Учебный звонок целиком на стороне Rust.
//!
//! Сокет к backend держит нативный клиент, а не webview: только отсюда можно
//! поставить заголовок `Authorization` на рукопожатие, которое backend без него
//! закрывает кодом 4401. Заодно речь оператора не пересекает границу IPC —
//! микрофон и сокет оказываются в одном процессе и в одном потоке данных.

use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{
    ipc::{Channel, Response},
    State,
};
use tokio::sync::{mpsc, oneshot};
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

/// Сколько ждём конца реплики, прежде чем начать следующую. Хвост — это доли
/// секунды; больше значит, что микрофон завис, и держать интерфейс нельзя.
const FLOOR_CLOSE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

enum Outgoing {
    Command(String),
    Pcm(Vec<u8>),
}

struct ActiveCall {
    /// Кто владеет соединением сейчас. Webview успевает открыть второе, пока
    /// первое закрывается, и без этой метки команды одного звонка уходили бы
    /// в сокет другого.
    id: String,
    outgoing: mpsc::Sender<Outgoing>,
    floor: Option<Floor>,
}

/// Реплика оператора, пока он держит слово.
struct Floor {
    capture: CaptureHandle,
    /// Срабатывает, когда хвост реплики отдан и `listen.stop` поставлен в
    /// очередь. Без ожидания быстрый повторный зажим открывал бы окно раньше,
    /// чем закроется предыдущее, и звук уходил бы мимо распознавания.
    finished: oneshot::Receiver<()>,
}

#[derive(Default)]
pub struct CallState {
    active: Mutex<Option<ActiveCall>>,
    /// Номер попытки подключения. Побеждает та, что началась последней:
    /// рукопожатие занимает время, и без счётчика более раннее подключение
    /// могло бы установиться поверх более позднего.
    generation: AtomicU64,
}

/// Открывает сокет учебного звонка и начинает слушать события сервера.
#[tauri::command]
pub async fn call_connect(
    state: State<'_, CallState>,
    url: String,
    token: String,
    on_event: Channel<Value>,
    on_audio: Channel<Response>,
) -> Result<String, String> {
    if !url.starts_with("ws://") && !url.starts_with("wss://") {
        return Err(format!("unsupported WebSocket URL: {url}"));
    }

    // Повторное подключение закрывает прежнее, а не отказывает: React в режиме
    // разработки монтирует эффект дважды, да и переподключение после обрыва
    // не должно упираться в остаток мёртвого соединения.
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    close_active(&state)?;

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

    let id = generation.to_string();
    let mut guard = state.active.lock().map_err(lock_error)?;

    if state.generation.load(Ordering::SeqCst) != generation {
        // Пока шло рукопожатие, webview начал подключаться заново. Это
        // соединение уже никому не нужно: сокет закроется вместе с каналом.
        return Err("this call socket has been superseded".to_owned());
    }

    *guard = Some(ActiveCall {
        id: id.clone(),
        outgoing: outgoing_tx,
        floor: None,
    });

    Ok(id)
}

/// Передаёт команду жизненного цикла звонка как есть: протокол живёт в
/// контрактах backend, дублировать его перечислением здесь незачем.
#[tauri::command]
pub async fn call_send(
    state: State<'_, CallState>,
    connection: String,
    command: Value,
) -> Result<(), String> {
    let sender = {
        let guard = state.active.lock().map_err(lock_error)?;
        let Some(active) = guard.as_ref() else {
            return Err("the call socket is not open".to_owned());
        };

        if active.id != connection {
            return Err("this call socket has been replaced".to_owned());
        }

        active.outgoing.clone()
    };

    sender
        .send(Outgoing::Command(command.to_string()))
        .await
        .map_err(|_| "the call socket is closed".to_owned())
}

/// Оператор взял слово: открываем окно записи и включаем микрофон.
#[tauri::command]
pub async fn call_listen_start(
    state: State<'_, CallState>,
    connection: String,
) -> Result<(), String> {
    let (sender, previous) = {
        let mut guard = state.active.lock().map_err(lock_error)?;
        let Some(active) = guard.as_mut() else {
            return Err("the call socket is not open".to_owned());
        };

        if active.id != connection {
            return Err("this call socket has been replaced".to_owned());
        }

        (active.outgoing.clone(), active.floor.take())
    };

    // Оператор мог зажать кнопку снова, не дав закрыться прошлой реплике:
    // дожидаемся её конца, иначе окна записи наложатся друг на друга.
    finish_floor(previous).await;

    sender
        .send(Outgoing::Command(json!({ "type": "listen.start" }).to_string()))
        .await
        .map_err(|_| "the call socket is closed".to_owned())?;

    let (pcm_tx, pcm_rx) = mpsc::channel::<Vec<u8>>(PENDING_CHUNKS);
    let capture = start_capture(pcm_tx)
        .map_err(|error| format!("could not start microphone capture: {error}"))?;

    let (finished_tx, finished_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(forward_pcm(pcm_rx, sender, finished_tx));

    state
        .active
        .lock()
        .map_err(lock_error)?
        .as_mut()
        .ok_or_else(|| "the call socket is not open".to_owned())?
        .floor = Some(Floor {
        capture,
        finished: finished_rx,
    });

    Ok(())
}

/// Оператор договорил. Команду `listen.stop` шлёт не эта функция, а поток
/// пересылки — после того как отдаст хвост реплики, иначе последние сотни
/// миллисекунд обогнала бы команда и не попали в расшифровку.
#[tauri::command]
pub async fn call_listen_stop(
    state: State<'_, CallState>,
    connection: String,
) -> Result<(), String> {
    let floor = state
        .active
        .lock()
        .map_err(lock_error)?
        .as_mut()
        .filter(|active| active.id == connection)
        .and_then(|active| active.floor.take());

    // Команда возвращается, только когда реплика действительно отправлена:
    // следующий зажим кнопки не должен обгонять её конец.
    finish_floor(floor).await;

    Ok(())
}

/// Останавливает захват и ждёт, пока поток пересылки отдаст хвост и закроет
/// окно. Ожидание ограничено: микрофон не должен подвесить интерфейс.
async fn finish_floor(floor: Option<Floor>) {
    let Some(mut floor) = floor else {
        return;
    };

    floor.capture.stop();

    let _ = tokio::time::timeout(FLOOR_CLOSE_TIMEOUT, floor.finished).await;
}

#[tauri::command]
pub async fn call_disconnect(state: State<'_, CallState>) -> Result<(), String> {
    close_active(&state)
}

/// Закрывает текущее соединение: очередь исходящего уходит вместе с ним, и
/// поток обмена завершается сам.
fn close_active(state: &State<'_, CallState>) -> Result<(), String> {
    let active = state.active.lock().map_err(lock_error)?.take();

    if let Some(mut active) = active {
        if let Some(mut floor) = active.floor.take() {
            floor.capture.stop();
        }
    }

    Ok(())
}

async fn forward_pcm(
    mut pcm_rx: mpsc::Receiver<Vec<u8>>,
    outgoing: mpsc::Sender<Outgoing>,
    finished: oneshot::Sender<()>,
) {
    while let Some(chunk) = pcm_rx.recv().await {
        if outgoing.send(Outgoing::Pcm(chunk)).await.is_err() {
            let _ = finished.send(());

            return;
        }
    }

    let _ = outgoing
        .send(Outgoing::Command(LISTEN_STOP.to_owned()))
        .await;
    let _ = finished.send(());
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
