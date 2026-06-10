use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Grants the webview access to one user-chosen project folder. The static
/// fs/asset scopes in the capability are empty, so the only readable paths
/// are project folders the user opened (the OS folder dialog extends the
/// scope for picked paths itself).
#[tauri::command]
fn allow_project_scope(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&dir);
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![allow_project_scope])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
