use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tauri_plugin_shell::ShellExt;

struct ProjectRoots(std::sync::Mutex<Vec<std::path::PathBuf>>);

#[derive(serde::Serialize)]
struct SidecarOutput {
    exit_code: i32,
    stdout: String,
    stderr: String,
}

/// Grants the webview access to an existing Paperstack project folder.
/// The path is canonicalized in Rust before being added to the scopes.
#[tauri::command]
fn allow_existing_project_scope(app: tauri::AppHandle, dir: String) -> Result<String, String> {
    let path = canonical_dir(&dir)?;
    if !path.join("document.yaml").is_file() {
        return Err("No document.yaml was found in the selected folder.".into());
    }
    allow_scope(&app, &path)?;
    Ok(normalize_path(&path))
}

/// Grants access to a directory selected as the destination for a new report.
/// Existing Paperstack projects must be opened instead.
#[tauri::command]
fn allow_new_project_scope(app: tauri::AppHandle, dir: String) -> Result<String, String> {
    let path = canonical_dir(&dir)?;
    if path.join("document.yaml").exists() {
        return Err("This folder already contains a Paperstack report. Open it instead.".into());
    }
    allow_scope(&app, &path)?;
    Ok(normalize_path(&path))
}

#[tauri::command]
async fn run_sidecar(
    app: tauri::AppHandle,
    roots: tauri::State<'_, ProjectRoots>,
    binary: String,
    args: Vec<String>,
) -> Result<SidecarOutput, String> {
    validate_sidecar_invocation(&binary, &args, &roots)?;
    // The webview names sidecars by their tauri.conf.json externalBin path
    // ("binaries/typst"), but the Rust shell API resolves the program file
    // next to the app executable — it needs the bare name ("typst").
    let program = binary.rsplit('/').next().unwrap_or(&binary);
    let output = app
        .shell()
        .sidecar(program)
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(SidecarOutput {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn canonical_dir(dir: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(dir)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    Ok(path)
}

fn allow_scope(app: &tauri::AppHandle, path: &std::path::Path) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())?;
    let roots = app.state::<ProjectRoots>();
    let mut roots = roots.0.lock().map_err(|e| e.to_string())?;
    if !roots.iter().any(|root| root == path) {
        roots.push(path.to_path_buf());
    }
    Ok(())
}

fn normalize_path(path: &std::path::Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    // std canonicalize returns extended-length paths (\\?\C:\...) on Windows.
    // This string becomes the app's projectDir and ends up in sidecar args —
    // and pandoc (Haskell, not Rust) rejects the //?/ form outright. Return a
    // plain drive path; UNC shares keep their //server/share form.
    if let Some(rest) = s.strip_prefix("//?/UNC/") {
        return format!("//{rest}");
    }
    if let Some(rest) = s.strip_prefix("//?/") {
        return rest.to_string();
    }
    s
}

fn validate_sidecar_invocation(
    binary: &str,
    args: &[String],
    roots: &tauri::State<'_, ProjectRoots>,
) -> Result<(), String> {
    match binary {
        "binaries/typst" => validate_typst_args(args, roots),
        "binaries/pandoc" => validate_pandoc_args(args, roots),
        _ => Err("That sidecar is not allowed.".into()),
    }
}

fn validate_typst_args(
    args: &[String],
    roots: &tauri::State<'_, ProjectRoots>,
) -> Result<(), String> {
    if args == ["--version"] {
        return Ok(());
    }
    if args.len() == 5 && args[0] == "compile" && args[1] == "--root" {
        let root = canonical_allowed_dir(&args[2], roots)?;
        require_inside(&args[3], &root, true)?;
        require_inside(&args[4], &root, false)?;
        return Ok(());
    }
    Err("Unsupported Typst invocation.".into())
}

fn validate_pandoc_args(
    args: &[String],
    roots: &tauri::State<'_, ProjectRoots>,
) -> Result<(), String> {
    if args == ["--version"] {
        return Ok(());
    }
    let expected_prefix = [
        "-f",
        "gfm+implicit_figures+attributes",
        "-t",
        "typst",
        "--wrap=none",
    ];
    if args.len() == 6
        && expected_prefix
            .iter()
            .zip(args.iter())
            .all(|(expected, actual)| expected == actual)
    {
        require_inside_any_root(&args[5], roots, true)?;
        return Ok(());
    }
    Err("Unsupported Pandoc invocation.".into())
}

fn canonical_allowed_dir(
    path: &str,
    roots: &tauri::State<'_, ProjectRoots>,
) -> Result<std::path::PathBuf, String> {
    let candidate = canonical_dir(path)?;
    let roots = roots.0.lock().map_err(|e| e.to_string())?;
    if roots.iter().any(|root| root == &candidate) {
        Ok(candidate)
    } else {
        Err("Sidecar root is not an opened Paperstack project.".into())
    }
}

fn require_inside_any_root(
    path: &str,
    roots: &tauri::State<'_, ProjectRoots>,
    must_exist: bool,
) -> Result<(), String> {
    let candidate = canonical_for_check(path, must_exist)?;
    let roots = roots.0.lock().map_err(|e| e.to_string())?;
    if roots.iter().any(|root| candidate.starts_with(root)) {
        Ok(())
    } else {
        Err("Sidecar path is outside the opened project.".into())
    }
}

fn require_inside(
    path: &str,
    root: &std::path::Path,
    must_exist: bool,
) -> Result<(), String> {
    let candidate = canonical_for_check(path, must_exist)?;
    if candidate.starts_with(root) {
        Ok(())
    } else {
        Err("Sidecar path is outside the opened project.".into())
    }
}

fn canonical_for_check(path: &str, must_exist: bool) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(path);
    if must_exist {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Sidecar output path has no parent directory.".to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Sidecar output path has no file name.".to_string())?;
    Ok(parent.join(file_name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectRoots(std::sync::Mutex::new(Vec::new())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            allow_existing_project_scope,
            allow_new_project_scope,
            run_sidecar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
