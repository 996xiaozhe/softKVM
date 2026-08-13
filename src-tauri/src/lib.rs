mod monitor;

use monitor::{MonitorInfo, SwitchRequest};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit_cleanly(app: &tauri::AppHandle) {
    let app = app.clone();
    // Menu callbacks run on the UI thread. Unregister from a worker so the plugin can
    // marshal the Win32 call back to that thread without deadlocking the menu handler.
    std::thread::spawn(move || {
        let _ = app.global_shortcut().unregister_all();
        app.exit(0);
    });
}

#[tauri::command]
async fn scan_monitors() -> Result<Vec<MonitorInfo>, String> {
    tauri::async_runtime::spawn_blocking(monitor::scan)
        .await
        .map_err(|error| format!("扫描任务异常终止：{error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn switch_input(request: SwitchRequest) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || monitor::switch_input(&request))
        .await
        .map_err(|error| format!("切换任务异常终止：{error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn platform_support() -> bool {
    cfg!(target_os = "windows")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示 SoftKVM", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let mut tray = TrayIconBuilder::with_id("softkvm-tray")
                .tooltip("SoftKVM")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quit" => quit_cleanly(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_monitors,
            switch_input,
            platform_support
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SoftKVM");
}
