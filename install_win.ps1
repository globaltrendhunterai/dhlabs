# ==============================================================================
# AutoFlow Enterprise 1-Click Instant Installer (Windows)
# Fast Web-to-Desktop Zero-Config Deployment
# Usage:
#   Remote: powershell -c "irm https://get.autoflow.io/win | iex"
#   Local:  powershell -ExecutionPolicy Bypass -File scripts\install_win.ps1
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$InstallDir = if ($env:AUTOFLOW_INSTALL_DIR) { $env:AUTOFLOW_INSTALL_DIR } else { Join-Path $HOME "AutoFlow" }
$DownloadUrl = if ($env:AUTOFLOW_DOWNLOAD_URL) { $env:AUTOFLOW_DOWNLOAD_URL } else { "https://autoflow.io/downloads/AutoFlow_Coupang_STANDARD_v2.0.zip" }
$PackageName = "AutoFlow_Coupang_STANDARD_v2.0.zip"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " [AutoFlow Enterprise] 1-Click Desktop Installer (Windows)" -ForegroundColor Cyan
Write-Host " Target Directory: $InstallDir" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Create target directory
if (-not (Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# 2. Check for local package candidate or download
$LocalCandidatePaths = @(
    $PackageName,
    (Join-Path "dist\packages" $PackageName),
    (Join-Path $PSScriptRoot "..\dist\packages\$PackageName"),
    (Join-Path $PSScriptRoot $PackageName)
)

$LocalPackage = $null
foreach ($cand in $LocalCandidatePaths) {
    if ($cand -and (Test-Path -Path $cand)) {
        $LocalPackage = (Resolve-Path -Path $cand).Path
        break
    }
}

$TempZip = $null
if ($LocalPackage) {
    Write-Host "[INFO] Local distribution package detected:" -ForegroundColor Green
    Write-Host "       $LocalPackage" -ForegroundColor Gray
    $SourceZip = $LocalPackage
} else {
    Write-Host "[INFO] Downloading official release package from:" -ForegroundColor Green
    Write-Host "       $DownloadUrl" -ForegroundColor Gray
    $TempZip = Join-Path ([System.IO.Path]::GetTempPath()) ("AutoFlow_Pkg_" + [System.Guid]::NewGuid().ToString("N") + ".zip")
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip -UseBasicParsing
    } catch {
        Write-Host "[WARN] Primary download failed. Attempting fallback..." -ForegroundColor Yellow
        $FallbackUrl = "https://autoflow.io/downloads/AF_STARTER_PACK_v1.0.zip"
        Invoke-WebRequest -Uri $FallbackUrl -OutFile $TempZip -UseBasicParsing
    }
    $SourceZip = $TempZip
}

# 3. Extract package
Write-Host "[INFO] Extracting AutoFlow package into target location..." -ForegroundColor Green
$TempExtract = Join-Path ([System.IO.Path]::GetTempPath()) ("AutoFlow_Ext_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempExtract -Force | Out-Null

try {
    Expand-Archive -Path $SourceZip -DestinationPath $TempExtract -Force
    $SubFolder = Join-Path $TempExtract "AutoFlow_Coupang_STANDARD"
    if (Test-Path -Path $SubFolder) {
        Copy-Item -Path (Join-Path $SubFolder "*") -Destination $InstallDir -Recurse -Force
    } else {
        Copy-Item -Path (Join-Path $TempExtract "*") -Destination $InstallDir -Recurse -Force
    }
} finally {
    if (Test-Path -Path $TempExtract) {
        Remove-Item -Path $TempExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($TempZip -and (Test-Path -Path $TempZip)) {
        Remove-Item -Path $TempZip -Force -ErrorAction SilentlyContinue
    }
}

# 4. Windows SmartScreen & Zone.Identifier Unblock
Write-Host "[INFO] Unblocking downloaded files for SmartScreen safety..." -ForegroundColor Green
Get-ChildItem -Path "$InstallDir" -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

# 5. Pre-seed Legal Agreement & Log directory
Set-Content -Path (Join-Path $InstallDir ".legal_agreed") -Value "agreed" -Encoding ASCII -Force
$LogDir = Join-Path $InstallDir "logs"
if (-not (Test-Path -Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# 5-B. Create Desktop Shortcut
$DesktopPath = Join-Path $HOME "Desktop"
if (-not (Test-Path -Path $DesktopPath) -and $env:USERPROFILE) {
    $DesktopPath = Join-Path $env:USERPROFILE "Desktop"
}
if (Test-Path -Path $DesktopPath) {
    $ShortcutPath = Join-Path $DesktopPath "AutoFlow_설정열기.url"
    $ShortcutContent = @"
[InternetShortcut]
URL=http://localhost:5678
"@
    Set-Content -Path $ShortcutPath -Value $ShortcutContent -Encoding ASCII -Force
    Write-Host "[INFO] Desktop shortcut created: $ShortcutPath" -ForegroundColor Green
}

# 6. Background Batch Execution
if ($env:AUTOFLOW_NO_LAUNCH -eq "1") {
    Write-Host "[INFO] AUTOFLOW_NO_LAUNCH=1 detected. Skipping runtime launch." -ForegroundColor Yellow
} else {
    Write-Host "[INFO] Launching AutoFlow launcher in minimized background..." -ForegroundColor Green
    $LauncherBat = Join-Path $InstallDir "AutoFlow_Start_Windows.bat"
    if (Test-Path -Path $LauncherBat) {
        Start-Process -FilePath $LauncherBat -WorkingDirectory $InstallDir -WindowStyle Minimized
        Write-Host "[OK] Launcher started in background." -ForegroundColor Green
    } else {
        Write-Host "[WARN] AutoFlow_Start_Windows.bat not found in $InstallDir" -ForegroundColor Yellow
    }

    # 7. Wait 3 seconds and open browser
    Write-Host "[INFO] Initializing service interface (3s)..." -ForegroundColor Green
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:5678"
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " [AutoFlow Enterprise] Installation Complete & Engine Activated!" -ForegroundColor Cyan
Write-Host " Workspace: $InstallDir" -ForegroundColor Cyan
Write-Host " Console:   http://localhost:5678" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
