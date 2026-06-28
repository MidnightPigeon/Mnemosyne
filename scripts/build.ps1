$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$nodeDir = Join-Path $root ".tools\node-v24.14.0-win-x64"
$cargoDir = Join-Path $env:USERPROFILE ".cargo\bin"
$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
  throw "Portable Node.js was not found at $nodeDir. Install Node.js or restore .tools first."
}

if (-not (Test-Path $vsDevCmd)) {
  throw "Visual Studio Build Tools were not found. Install the C++ build tools workload first."
}

$command = "call `"$vsDevCmd`" -arch=x64 && set `"PATH=$nodeDir;$cargoDir;%PATH%`" && npm run tauri:build"
Set-Location $root
cmd.exe /d /s /c $command
