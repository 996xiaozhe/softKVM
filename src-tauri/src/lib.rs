mod monitor;

use monitor::{MonitorInfo, SwitchRequest};
use serde::Deserialize;
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
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

#[derive(Debug, Deserialize)]
struct TrayDevice {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayMenuLabels {
    devices: String,
    no_devices: String,
    show: String,
    quit: String,
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    devices: &[TrayDevice],
    labels: &TrayMenuLabels,
) -> tauri::Result<Menu<tauri::Wry>> {
    let device_items = if devices.is_empty() {
        vec![MenuItem::with_id(
            app,
            "no-devices",
            &labels.no_devices,
            false,
            None::<&str>,
        )?]
    } else {
        devices
            .iter()
            .map(|device| {
                MenuItem::with_id(
                    app,
                    format!("device:{}", device.id),
                    &device.name,
                    true,
                    None::<&str>,
                )
            })
            .collect::<tauri::Result<Vec<_>>>()?
    };
    let device_item_refs: Vec<&dyn IsMenuItem<_>> = device_items
        .iter()
        .map(|item| item as &dyn IsMenuItem<_>)
        .collect();
    let devices_submenu = Submenu::with_items(app, &labels.devices, true, &device_item_refs)?;
    let show = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    Menu::with_items(app, &[&show, &devices_submenu, &separator, &quit])
}

#[tauri::command]
fn sync_tray_menu(
    app: tauri::AppHandle,
    devices: Vec<TrayDevice>,
    labels: TrayMenuLabels,
) -> Result<(), String> {
    let menu = build_tray_menu(&app, &devices, &labels).map_err(|error| error.to_string())?;
    let tray = app
        .tray_by_id("softkvm-tray")
        .ok_or_else(|| "SoftKVM tray icon is unavailable".to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

#[tauri::command]
async fn scan_monitors() -> Result<Vec<MonitorInfo>, String> {
    tauri::async_runtime::spawn_blocking(monitor::scan)
        .await
        .map_err(|error| format!("扫描任务异常终止：{error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn probe_monitors() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(monitor::probe)
        .await
        .map_err(|error| format!("显示器检测任务异常终止：{error}"))?
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
            let menu = build_tray_menu(
                app.handle(),
                &[],
                &TrayMenuLabels {
                    devices: "切换设备".into(),
                    no_devices: "暂无设备".into(),
                    show: "显示 SoftKVM".into(),
                    quit: "退出".into(),
                },
            )?;

            let mut tray = TrayIconBuilder::with_id("softkvm-tray")
                .tooltip("SoftKVM")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quit" => quit_cleanly(app),
                    id if id.starts_with("device:") => {
                        let _ = app.emit("tray-switch-device", &id[7..]);
                    }
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
            probe_monitors,
            scan_monitors,
            switch_input,
            sync_tray_menu,
            platform_support
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SoftKVM");
}
