param(
  [string]$InstallDir = "$env:LOCALAPPDATA\FM\ShopeeCompetitorMonitor\chrome-extension",
  [switch]$SkipOpen
)

$sourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..\assets\chrome-extension")).Path
$manifestPath = Join-Path $sourceDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "FM Chrome extension assets are incomplete: manifest.json was not found"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $InstallDir -Recurse -Force

$chromePath = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $SkipOpen) {
  if (-not $chromePath) {
    throw "Google Chrome was not found. Install Chrome or use -SkipOpen to prepare the directory only."
  }
  Start-Process -FilePath $chromePath -ArgumentList "chrome://extensions"
}

Write-Output "Extension prepared: $InstallDir"
Write-Output "In Chrome, open chrome://extensions, enable Developer mode, click Load unpacked, and select this directory."
Write-Output "Confirm FM Competitor Monitor is visible and enabled before collecting with the current Chrome login."
