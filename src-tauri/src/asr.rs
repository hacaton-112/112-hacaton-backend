//! Сессия распознавания речи целиком на стороне Rust.
//!
//! WebSocket к ASR-сервису держит нативный клиент, а не webview: App Transport
//! Security в WKWebView блокирует `ws://` на внешний хост, и то же соединение
//! из Rust проходит без ограничений. Наверх уходят только события протокола,
//! аудио через IPC не гоняется.

use std::sync::Mutex;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::audio::{start_capture, CaptureHandle};

/// Глубина очереди PCM-чанков по 100 мс: примерно 3 секунды запаса на случай
/// сетевой заминки, дальше захват начинает отбрасывать чанки.
const PCM_QUEUE_CAPACITY: usize = 32;

const STOP_COMMAND: &str = r#"{"type":"stop"}"#;

/// События ASR-сервиса в том же виде, в каком их ждёт фронтенд.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AsrEvent {
    Ready {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "sampleRate")]
        sample_rate: u32,
        model: String,
    },
    Partial {
        transcript: String,
        #[serde(rename = "audioMs")]
        audio_ms: u64,
        #[serde(rename = "processingMs")]
        processing_ms: u64,
    },
    Final {
        transcript: String,
        #[serde(rename = "audioMs")]
        audio_ms: u64,
        #[serde(rename = "processingMs")]
        processing_ms: u64,
    },
    Pong,
    Error {
        message: String,
    },
    /// Соединение закрыто — по команде `stop` или по инициативе сервиса.
    Closed,
}

struct ActiveStream {
    capture: CaptureHandle,
    stop: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct AsrState {
    active: Mutex<Option<ActiveStream>>,
}

/// Открывает WS-сессию по адресу, полученному от backend, и начинает
/// передавать в неё звук с микрофона.
#[tauri::command]
pub async fn asr_start(
    state: State<'_, AsrState>,
    ws_url: String,
    on_event: Channel<AsrEvent>,
) -> Result<(), String> {
    if !ws_url.starts_with("ws://") && !ws_url.starts_with("wss://") {
        return Err(format!("unsupported WebSocket URL: {ws_url}"));
    }

    if state.active.lock().map_err(lock_error)?.is_some() {
        return Err("ASR stream is already active".to_owned());
    }

    // Соединение открывается до захвата: так недоступный сервис виден вызову
    // сразу, а микрофон не включается впустую.
    let (socket, _) = connect_async(ws_url.as_str())
        .await
        .map_err(|error| format!("could not connect to the ASR service: {error}"))?;

    let (pcm_tx, pcm_rx) = mpsc::channel::<Vec<u8>>(PCM_QUEUE_CAPACITY);
    let capture = start_capture(pcm_tx).map_err(|error| {
        format!("could not start microphone capture: {error}")
    })?;

    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(pump(socket, pcm_rx, stop_rx, on_event));

    *state.active.lock().map_err(lock_error)? = Some(ActiveStream {
        capture,
        stop: Some(stop_tx),
    });

    Ok(())
}

/// Останавливает захват и просит сервис выдать финальную расшифровку.
/// Соединение закрывается уже после её получения — событием `final`.
#[tauri::command]
pub async fn asr_stop(state: State<'_, AsrState>) -> Result<(), String> {
    let active = state.active.lock().map_err(lock_error)?.take();

    let Some(mut active) = active else {
        return Ok(());
    };

    active.capture.stop();
    if let Some(stop) = active.stop.take() {
        let _ = stop.send(());
    }

    Ok(())
}

type Socket = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

async fn pump(
    socket: Socket,
    mut pcm_rx: mpsc::Receiver<Vec<u8>>,
    stop_rx: oneshot::Receiver<()>,
    on_event: Channel<AsrEvent>,
) {
    let (mut writer, mut reader) = socket.split();
    let mut stop_rx = stop_rx;
    let mut stop_sent = false;
    // Канал закрывается вместе с потоком захвата; без этого флага `recv()`
    // на закрытом канале возвращал бы `None` без ожидания и крутил цикл.
    let mut capture_done = false;

    loop {
        tokio::select! {
            chunk = pcm_rx.recv(), if !stop_sent && !capture_done => {
                match chunk {
                    Some(chunk) => {
                        if let Err(error) = writer.send(Message::binary(chunk)).await {
                            emit(&on_event, AsrEvent::Error {
                                message: format!("could not send audio: {error}"),
                            });
                            break;
                        }
                    }
                    None => capture_done = true,
                }
            }
            _ = &mut stop_rx, if !stop_sent => {
                stop_sent = true;

                // Захват к этому моменту уже остановлен, но в очереди может
                // лежать хвост реплики — досылаем его до команды stop, иначе
                // последние сотни миллисекунд не попадут в финальную расшифровку.
                while let Ok(chunk) = pcm_rx.try_recv() {
                    if let Err(error) = writer.send(Message::binary(chunk)).await {
                        emit(&on_event, AsrEvent::Error {
                            message: format!("could not send audio: {error}"),
                        });
                        return;
                    }
                }

                if let Err(error) = writer.send(Message::text(STOP_COMMAND)).await {
                    emit(&on_event, AsrEvent::Error {
                        message: format!("could not finish the session: {error}"),
                    });
                    break;
                }
            }
            incoming = reader.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<AsrEvent>(&text) {
                            Ok(event) => {
                                let is_final = matches!(event, AsrEvent::Final { .. });
                                emit(&on_event, event);
                                if is_final {
                                    break;
                                }
                            }
                            Err(error) => emit(&on_event, AsrEvent::Error {
                                message: format!("unexpected message from the ASR service: {error}"),
                            }),
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        emit(&on_event, AsrEvent::Error {
                            message: format!("ASR connection failed: {error}"),
                        });
                        break;
                    }
                }
            }
        }
    }

    let _ = writer.close().await;
    emit(&on_event, AsrEvent::Closed);
}

fn emit(channel: &Channel<AsrEvent>, event: AsrEvent) {
    if let Err(error) = channel.send(event) {
        eprintln!("could not deliver ASR event to the webview: {error}");
    }
}

fn lock_error<T>(_: T) -> String {
    "ASR state is poisoned".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_server_events() {
        let ready = r#"{"type":"ready","sessionId":"abc","sampleRate":16000,"model":"m.bin"}"#;
        assert!(matches!(
            serde_json::from_str::<AsrEvent>(ready).unwrap(),
            AsrEvent::Ready { .. }
        ));

        let partial =
            r#"{"type":"partial","transcript":"привет","audioMs":1000,"processingMs":80}"#;
        assert!(matches!(
            serde_json::from_str::<AsrEvent>(partial).unwrap(),
            AsrEvent::Partial { .. }
        ));
    }

    #[test]
    fn serializes_events_in_protocol_shape() {
        let event = AsrEvent::Final {
            transcript: "готово".to_owned(),
            audio_ms: 1_200,
            processing_ms: 90,
        };

        let json = serde_json::to_string(&event).unwrap();

        assert!(json.contains(r#""type":"final""#));
        assert!(json.contains(r#""audioMs":1200"#));
        assert!(json.contains(r#""processingMs":90"#));
    }

    #[test]
    fn rejects_unknown_message_types() {
        assert!(serde_json::from_str::<AsrEvent>(r#"{"type":"unknown"}"#).is_err());
    }
}
