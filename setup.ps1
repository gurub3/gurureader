# Run after `npm install` if Electron's bundled extract-zip fails (the dist/
# folder ends up with only a `locales` subdir). Works around a known issue
# with extract-zip on recent Node versions.

$ErrorActionPreference = 'Stop'

$pkgRoot = Join-Path $PSScriptRoot 'node_modules\electron'
$dist = Join-Path $pkgRoot 'dist'
$exe = Join-Path $dist 'electron.exe'

if (Test-Path $exe) {
    Write-Host "Electron already installed at $exe"
}
else {
    $version = (Get-Content (Join-Path $pkgRoot 'package.json') | ConvertFrom-Json).version
    Write-Host "Setting up Electron v$version..."

    $cacheRoot = Join-Path $env:LOCALAPPDATA 'electron\Cache'
    $zip = Get-ChildItem -Path $cacheRoot -Recurse -Filter "electron-v$version-win32-x64.zip" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName

    if (-not $zip) {
        Write-Error "Cached zip not found. Run ``npm install`` first."
        exit 1
    }

    Write-Host "Extracting $zip"
    Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $dist | Out-Null
    Expand-Archive -Path $zip -DestinationPath $dist -Force

    $srcDts = Join-Path $dist 'electron.d.ts'
    if (Test-Path $srcDts) {
        Move-Item -Force $srcDts (Join-Path $pkgRoot 'electron.d.ts')
    }

    "electron.exe" | Out-File -Encoding ASCII -NoNewline (Join-Path $pkgRoot 'path.txt')
    "v$version" | Out-File -Encoding ASCII -NoNewline (Join-Path $dist 'version')
}

# Create / refresh desktop shortcut (uses start.vbs for a silent launch)
$desktop = [Environment]::GetFolderPath('Desktop')
$launcher = Join-Path $PSScriptRoot 'start.vbs'
$shortcut = Join-Path $desktop 'gurureader.lnk'
$legacyShortcut = Join-Path $desktop 'Reader.lnk'

if (Test-Path $legacyShortcut) {
    Remove-Item -Force $legacyShortcut
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcut)
$sc.TargetPath = $launcher
$sc.Arguments = ''
$sc.WorkingDirectory = $PSScriptRoot
$sc.IconLocation = "$exe,0"
$sc.WindowStyle = 1
$sc.Description = 'gurureader — manga reader'
$sc.Save()

Write-Host "`nDone."
Write-Host "  Electron : $exe"
Write-Host "  Shortcut : $shortcut"
Write-Host "`nDouble-click 'gurureader' on the desktop to start the app."
