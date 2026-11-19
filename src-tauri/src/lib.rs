use rand::{distr::Alphanumeric, Rng};
use serde::Serialize;
use std::{net::TcpListener, path::PathBuf, process::{Child, Command}, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

struct Rclone {
    child: Mutex<Option<Child>>,
    info: RcInfo,
}

#[derive(Serialize, Clone)]
struct RcInfo {
    url: String,
    user: String,
    pass: String,
}

#[tauri::command]
fn rc_info(state: tauri::State<Rclone>) -> RcInfo {
    state.info.clone()
}

/// Stops rclone before an update installs; the installer can't replace rclone.exe while it runs.
#[tauri::command]
fn stop_engine(state: tauri::State<Rclone>) {
    if let Some(mut c) = state.child.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

fn jobs_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("sync-jobs.json"))
}

/// Sync jobs as a JSON string ("[]" when none are saved yet).
#[tauri::command]
fn load_jobs(app: tauri::AppHandle) -> Result<String, String> {
    match std::fs::read_to_string(jobs_file(&app)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("[]".into()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_jobs(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let path = jobs_file(&app)?;
    // Write then rename, so a crash mid-write can't leave a half-written jobs file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

/// Export/import of sync jobs to a path the user picked in a save/open dialog.
#[tauri::command]
fn export_jobs(path: String, json: String) -> Result<(), String> {
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_jobs(path: String) -> Result<String, String> {
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<serde_json::Value>>(&s).map_err(|_| "That file isn't a CloudMerge sync jobs export.".to_string())?;
    Ok(s)
}

fn start_rclone(app: &tauri::AppHandle) -> Result<Rclone, Box<dyn std::error::Error>> {
    // Free port picked by the OS; rclone only listens on localhost, with a random password per launch.
    let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
    let pass: String = rand::rng().sample_iter(Alphanumeric).take(32).map(char::from).collect();
    let data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data)?;

    // Only the app's own web view may call the engine.
    let origin = if cfg!(debug_assertions) {
        "http://localhost:1420"
    } else if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    // Tauri places the sidecar next to the app executable (without the target triple).
    let exe = std::env::current_exe()?.with_file_name(if cfg!(windows) { "rclone.exe" } else { "rclone" });
    let mut cmd = Command::new(exe);
    cmd.args(["rcd", "--rc-addr", &format!("127.0.0.1:{port}"), "--rc-user", "cloudmerge", "--rc-pass", &pass])
        .args(["--rc-allow-origin", origin, "--config"])
        .arg(data.join("rclone.conf"));
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW

    Ok(Rclone {
        child: Mutex::new(Some(cmd.spawn()?)),
        info: RcInfo { url: format!("http://127.0.0.1:{port}"), user: "cloudmerge".into(), pass },
    })
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            app.manage(start_rclone(app.handle())?);

            let open = MenuItem::with_id(app, "open", "Open CloudMerge", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("CloudMerge")
                .menu(&Menu::with_items(app, &[&open, &quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Started by "Start with Windows": stay in the tray.
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    w.hide()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps CloudMerge running in the tray; Quit is in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![rc_info, stop_engine, load_jobs, save_jobs, export_jobs, import_jobs])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut c) = app.state::<Rclone>().child.lock().unwrap().take() {
                    let _ = c.kill();
                }
            }
        });
}
