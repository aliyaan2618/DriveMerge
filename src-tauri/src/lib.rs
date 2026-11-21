use rand::{distr::Alphanumeric, Rng};
use serde::Serialize;
use std::{io::{BufRead, BufReader, Read}, net::TcpListener, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};
use tauri_plugin_opener::OpenerExt;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
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

/// Windows Task Scheduler entries for sync jobs ("DriveMerge\<job id>"), so schedules run while the app is closed.
fn schtasks(args: &[&std::ffi::OsStr]) -> Result<(), String> {
    let mut cmd = Command::new("schtasks.exe");
    cmd.args(args);
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
}

fn task_name(id: &str) -> Result<String, String> {
    // Job ids are UUIDs; anything else is refused rather than passed to schtasks.
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') { return Err("invalid job id".into()); }
    Ok(format!("DriveMerge\\{id}"))
}

#[tauri::command]
fn register_task(id: String, xml: String) -> Result<(), String> {
    let name = task_name(&id)?;
    // schtasks wants the XML file in UTF-16 with a byte-order mark.
    let path = std::env::temp_dir().join(format!("drivemerge-task-{id}.xml"));
    let mut bytes = vec![0xFF, 0xFE];
    bytes.extend(xml.encode_utf16().flat_map(|u| u.to_le_bytes()));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let r = schtasks(&["/Create".as_ref(), "/F".as_ref(), "/TN".as_ref(), name.as_ref(), "/XML".as_ref(), path.as_os_str()]);
    let _ = std::fs::remove_file(&path);
    r
}

#[tauri::command]
fn delete_task(id: String) -> Result<(), String> {
    let name = task_name(&id)?;
    // A task that doesn't exist is fine: that's the state we want.
    match schtasks(&["/Delete".as_ref(), "/F".as_ref(), "/TN".as_ref(), name.as_ref()]) {
        Err(e) if !e.contains("cannot find") && !e.contains("does not exist") => Err(e),
        _ => Ok(()),
    }
}

/// The tray menu's first line (and the icon's hover text): live transfer status from the UI.
struct TrayStatus(MenuItem<tauri::Wry>);

#[tauri::command]
fn set_tray_status(app: tauri::AppHandle, status: tauri::State<TrayStatus>, text: String) {
    let _ = status.0.set_text(&text);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("DriveMerge · {text}")));
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
    serde_json::from_str::<Vec<serde_json::Value>>(&s).map_err(|_| "That file isn't a DriveMerge sync jobs export.".to_string())?;
    Ok(s)
}

fn start_rclone(app: &tauri::AppHandle) -> Result<Rclone, Box<dyn std::error::Error>> {
    // Free port picked by the OS; rclone only listens on localhost, with a random password per launch.
    let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
    let pass: String = rand::rng().sample_iter(Alphanumeric).take(32).map(char::from).collect();
    let data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data)?;
    // One-time carry-over from the app's previous name (CloudMerge). Copies, so the old folder stays as a backup.
    let old = data.with_file_name("com.cloudmerge.app");
    for f in ["rclone.conf", "sync-jobs.json"] {
        if !data.join(f).exists() && old.join(f).exists() {
            std::fs::copy(old.join(f), data.join(f))?;
        }
    }

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
    cmd.args(["rcd", "--rc-addr", &format!("127.0.0.1:{port}"), "--rc-user", "drivemerge", "--rc-pass", &pass])
        .args(["--rc-allow-origin", origin, "--config"])
        .arg(data.join("rclone.conf"));
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW

    Ok(Rclone {
        child: Mutex::new(Some(cmd.spawn()?)),
        info: RcInfo { url: format!("http://127.0.0.1:{port}"), user: "drivemerge".into(), pass },
    })
}

/// Browser sign-in (OAuth) run through `rclone authorize`, so the browser shows DriveMerge's own
/// success page (auth.html) and the app can come back to the front when it's done.
#[derive(Default)]
struct Auth {
    child: Mutex<Option<Child>>,
    url: Mutex<Option<String>>,
}

#[tauri::command]
async fn authorize(app: tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    // args come from rclone's own setup question: backend name, then optional client id/secret or settings blob.
    match args.first() {
        Some(b) if !b.is_empty() && b.chars().all(|c| c.is_ascii_alphanumeric()) => {}
        _ => return Err("Unknown service".into()),
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.with_file_name(if cfg!(windows) { "rclone.exe" } else { "rclone" });
    let template = app.path().resource_dir().map_err(|e| e.to_string())?.join("auth.html");
    let mut cmd = Command::new(exe);
    cmd.arg("authorize").args(&args).arg("--auth-no-open-browser").arg("--template").arg(template)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let (stdout, stderr) = (child.stdout.take().unwrap(), child.stderr.take().unwrap());
    *app.state::<Auth>().child.lock().unwrap() = Some(child);

    // rclone prints the sign-in link on stderr: open it in the default browser and keep it for "Browser didn't open?".
    let a = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Some(i) = line.find("following link: ") {
                let url = line[i + "following link: ".len()..].trim().to_string();
                let _ = a.opener().open_url(&url, None::<&str>);
                *a.state::<Auth>().url.lock().unwrap() = Some(url);
            }
        }
    });

    // After the user clicks Allow, rclone prints the token between these markers and exits.
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut s = String::new();
        let _ = BufReader::new(stdout).read_to_string(&mut s);
        s
    }).await.map_err(|e| e.to_string())?;
    if let Some(mut c) = app.state::<Auth>().child.lock().unwrap().take() { let _ = c.wait(); }
    *app.state::<Auth>().url.lock().unwrap() = None;
    show_main(&app);
    match (out.find("--->"), out.find("<---End paste")) {
        (Some(s), Some(e)) if s < e => Ok(out[s + 4..e].trim().to_string()),
        _ => Err("Sign-in was cancelled or didn't finish.".into()),
    }
}

#[tauri::command]
fn cancel_authorize(state: tauri::State<Auth>) {
    if let Some(mut c) = state.child.lock().unwrap().take() { let _ = c.kill(); }
}

#[tauri::command]
fn authorize_url(state: tauri::State<Auth>) -> Option<String> {
    state.url.lock().unwrap().clone()
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
        .manage(Auth::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            app.manage(start_rclone(app.handle())?);

            let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open DriveMerge", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DriveMerge")
                .menu(&Menu::with_items(app, &[&status, &sep, &open, &quit])?)
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
            app.manage(TrayStatus(status));

            // Started by "Start with Windows": stay in the tray.
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    w.hide()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps DriveMerge running in the tray; Quit is in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![rc_info, stop_engine, authorize, cancel_authorize, authorize_url, set_tray_status, register_task, delete_task, load_jobs, save_jobs, export_jobs, import_jobs])
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
