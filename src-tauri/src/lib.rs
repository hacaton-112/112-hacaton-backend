mod audio;
mod call;

use call::CallState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CallState::default())
        .invoke_handler(tauri::generate_handler![
            call::call_connect,
            call::call_send,
            call::call_listen_start,
            call::call_listen_stop,
            call::call_disconnect
        ])
        .plugin(tauri_plugin_zustand::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
