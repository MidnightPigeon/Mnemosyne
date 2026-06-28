$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$nodeDir = Join-Path $root ".tools\node-v24.14.0-win-x64"
$cargoDir = Join-Path $env:USERPROFILE ".cargo\bin"

if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
  throw "Portable Node.js was not found at $nodeDir. Install Node.js or restore .tools first."
}

$env:PATH = "$nodeDir;$cargoDir;$env:PATH"
Set-Location $root
npm run tauri:dev
