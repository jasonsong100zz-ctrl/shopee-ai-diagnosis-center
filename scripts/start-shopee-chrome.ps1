param(
  [int]$Port = 9222,
  [string]$ProfileDir = "$env:LOCALAPPDATA\ShopeeCompetitorChrome"
)

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
  $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
  throw "未找到 Google Chrome"
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath $chromePath -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--no-default-browser-check",
    "https://shopee.co.id/"
  )
}

Write-Output "Chrome CDP: http://127.0.0.1:$Port"
Write-Output "Profile: $ProfileDir"
