# Downloads pinned typst + pandoc binaries into bin/ (git-ignored) for
# development. These same versions ship as Tauri sidecars in releases, so the
# downloaded archives are verified against pinned SHA-256 hashes before use.
# Usage: pwsh ./scripts/fetch-binaries.ps1

$ErrorActionPreference = 'Stop'

$TypstVersion = '0.13.1'
$TypstSha256 = '44170D0632298BA68CBABC43DBFB6908B17CA9236859E0767B0E5D54B2D19F48'
$PandocVersion = '3.6.3'
$PandocSha256 = 'A31DC5B14A235EFA1F2CF103F71F656EEB76CE1B458D22D24F390C66DB7224F1'

$root = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $root 'bin'
$tmp = Join-Path $bin 'tmp'
New-Item -ItemType Directory -Force $bin | Out-Null

function Fetch-Zip([string]$Name, [string]$Version, [string]$Url, [string]$Sha256, [string]$ExeRelPath, [string]$Target) {
    if (Test-Path $Target) {
        # Ask the binary itself which version it is: a plain existence check
        # would silently keep an old binary after a pinned-version bump.
        $current = ''
        try { $current = (& $Target --version 2>$null | Select-Object -First 1) -join ' ' } catch {}
        if ($current -match [regex]::Escape($Version)) {
            Write-Output "$Name $Version already present: $Target"
            return
        }
        Write-Output "$Name is '$current' but the pin is $Version - refreshing"
    }
    Write-Output "Downloading $Name from $Url ..."
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $zip = Join-Path $tmp "$Name.zip"
    Invoke-WebRequest -Uri $Url -OutFile $zip
    # These binaries ship to end users inside the installer: never trust an
    # archive that does not match the pinned hash.
    $hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
    if ($hash -ne $Sha256) {
        throw "$Name download failed SHA-256 verification - refusing to install.`n  expected: $Sha256`n  got:      $hash"
    }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Copy-Item (Join-Path $tmp $ExeRelPath) $Target -Force
    Write-Output "Installed $Target"
}

Fetch-Zip 'typst' $TypstVersion `
    "https://github.com/typst/typst/releases/download/v$TypstVersion/typst-x86_64-pc-windows-msvc.zip" `
    $TypstSha256 `
    'typst-x86_64-pc-windows-msvc/typst.exe' `
    (Join-Path $bin 'typst.exe')

Fetch-Zip 'pandoc' $PandocVersion `
    "https://github.com/jgm/pandoc/releases/download/$PandocVersion/pandoc-$PandocVersion-windows-x86_64.zip" `
    $PandocSha256 `
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
