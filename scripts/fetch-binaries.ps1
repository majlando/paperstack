# Downloads pinned typst + pandoc binaries into bin/ (git-ignored) for
# development. These same versions ship as Tauri sidecars in releases.
# Usage: pwsh ./scripts/fetch-binaries.ps1

$ErrorActionPreference = 'Stop'

$TypstVersion = '0.13.1'
$PandocVersion = '3.6.3'

$root = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $root 'bin'
$tmp = Join-Path $bin 'tmp'
New-Item -ItemType Directory -Force $bin | Out-Null

function Fetch-Zip([string]$Name, [string]$Url, [string]$ExeRelPath, [string]$Target) {
    if (Test-Path $Target) {
        Write-Output "$Name already present: $Target"
        return
    }
    Write-Output "Downloading $Name from $Url ..."
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $zip = Join-Path $tmp "$Name.zip"
    Invoke-WebRequest -Uri $Url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Copy-Item (Join-Path $tmp $ExeRelPath) $Target
    Write-Output "Installed $Target"
}

Fetch-Zip 'typst' `
    "https://github.com/typst/typst/releases/download/v$TypstVersion/typst-x86_64-pc-windows-msvc.zip" `
    'typst-x86_64-pc-windows-msvc/typst.exe' `
    (Join-Path $bin 'typst.exe')

Fetch-Zip 'pandoc' `
    "https://github.com/jgm/pandoc/releases/download/$PandocVersion/pandoc-$PandocVersion-windows-x86_64.zip" `
    "pandoc-$PandocVersion/pandoc.exe" `
    (Join-Path $bin 'pandoc.exe')

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }

# Tauri sidecars: the app expects target-triple-named copies under
# apps/desktop/src-tauri/binaries/ (git-ignored). Same binaries, new names.
$triple = 'x86_64-pc-windows-msvc'
$sidecars = Join-Path $root 'apps/desktop/src-tauri/binaries'
New-Item -ItemType Directory -Force $sidecars | Out-Null
Copy-Item (Join-Path $bin 'typst.exe') (Join-Path $sidecars "typst-$triple.exe") -Force
Copy-Item (Join-Path $bin 'pandoc.exe') (Join-Path $sidecars "pandoc-$triple.exe") -Force
Write-Output "Sidecar copies placed in $sidecars"

Write-Output ''
& (Join-Path $bin 'typst.exe') --version
& (Join-Path $bin 'pandoc.exe') --version | Select-Object -First 1
