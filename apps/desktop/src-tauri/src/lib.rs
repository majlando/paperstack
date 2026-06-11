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
    require_dedicated_folder(&app, &path)?;
    allow_scope(&app, &path)?;
    Ok(normalize_path(&path))
}

/// A new report must live in its own folder. The grant below is recursive
/// read/write, so accepting a drive root or the user's whole profile would
/// turn one webview compromise into whole-disk access — and a report
/// scaffolded straight into Documents would be a mess for the user anyway.
fn require_dedicated_folder(
    app: &tauri::AppHandle,
    path: &std::path::Path,
) -> Result<(), String> {
    if path.parent().is_none() {
        return Err(
            "Pick a dedicated folder for the report — not a whole drive. \
             Create a new folder and choose that instead."
                .into(),
        );
    }
    let resolver = app.path();
    let protected = [
        resolver.home_dir(),
        resolver.desktop_dir(),
        resolver.document_dir(),
        resolver.download_dir(),
    ];
    for known in protected.into_iter().flatten() {
        // Both sides canonicalized: `path` already is, the resolver's are not.
        if known.canonicalize().is_ok_and(|known| known == path) {
            return Err(
                "Pick a dedicated folder for the report — not your user folder itself. \
                 Create a new folder inside it and choose that instead."
                    .into(),
            );
        }
    }
    Ok(())
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
    // Exactly the builder's invocation: compile --root <project>
    // --ignore-system-fonts [--font-path <project>/fonts] <input> <output>
    if args.len() < 6
        || args[0] != "compile"
        || args[1] != "--root"
        || args[3] != "--ignore-system-fonts"
    {
        return Err("Unsupported Typst invocation.".into());
    }
    let root = canonical_allowed_dir(&args[2], roots)?;
    let rest = match args.len() {
        6 => &args[4..],
        8 if args[4] == "--font-path" => {
            // a fonts/ folder committed into the project — must exist there
            require_inside(&args[5], &root, true)?;
            &args[6..]
        }
        _ => return Err("Unsupported Typst invocation.".into()),
    };
    require_inside(&rest[0], &root, true)?;
    require_inside(&rest[1], &root, false)?;
    Ok(())
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
    let candidate = parent.join(file_name);
    // Only the parent is canonicalized here — a symlink left at the output
    // name itself (e.g. a committed `report.pdf` link in a shared project)
    // would pass the containment check while the write lands wherever the
    // link points. Refuse rather than resolve.
    if candidate
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        return Err("Sidecar output path is a symbolic link.".into());
    }
    Ok(candidate)
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
