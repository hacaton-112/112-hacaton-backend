mod call;

use call::Call;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the first plugin: a repeated launch only restores
    // and focuses the existing main window instead of starting another app.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_system_audio::init())
        .channel_interceptor(|webview, callback, _, body| {
            let call = webview.state::<Call>();
            call.intercept_microphone_channel(callback.0, body)
        })
        .manage(Call::default())
        .invoke_handler(tauri::generate_handler![
            call::call_connect,
            call::call_send,
            call::call_attach_microphone_channel,
            call::call_listen_start,
            call::call_listen_stop,
            call::call_disconnect
        ])
        .plugin(tauri_plugin_zustand::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
