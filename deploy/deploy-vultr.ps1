param(
    [string]$Server = "45.63.67.147",
    [string]$User = "root",
    [string]$RemotePath = "/var/www/cosmiczip/current"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageDir = Join-Path $repoRoot ".deploy"
$packagePath = Join-Path $packageDir "cosmiczip-site.zip"
$remote = "${User}@${Server}"
$sshOptions = @("-o", "StrictHostKeyChecking=accept-new")

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null
if (Test-Path $packagePath) {
    Remove-Item -LiteralPath $packagePath -Force
}

$items = @(
    "Audio",
    "Fonts",
    "Sprites",
    "audio.js",
    "constants.js",
    "entities.js",
    "favicon.png",
    "firebaseConfig.js",
    "game.js",
    "graphics.js",
    "index.html",
    "input.js",
    "manifest.webmanifest",
    "state.js",
    "style.css",
    "ui.js"
)

$paths = $items | ForEach-Object { Join-Path $repoRoot $_ }
Compress-Archive -Path $paths -DestinationPath $packagePath -Force

scp @sshOptions (Join-Path $PSScriptRoot "nginx-cosmiczip.net.conf") "${remote}:/tmp/nginx-cosmiczip.net.conf"
scp @sshOptions (Join-Path $PSScriptRoot "setup-vultr-nginx.sh") "${remote}:/tmp/setup-vultr-nginx.sh"
scp @sshOptions $packagePath "${remote}:/tmp/cosmiczip-site.zip"

ssh @sshOptions $remote "command -v unzip >/dev/null 2>&1 || (apt-get update && apt-get install -y unzip rsync); command -v rsync >/dev/null 2>&1 || apt-get install -y rsync; mkdir -p /tmp/cosmiczip-site $RemotePath && rm -rf /tmp/cosmiczip-site/* && unzip -q -o /tmp/cosmiczip-site.zip -d /tmp/cosmiczip-site && rsync -a --delete /tmp/cosmiczip-site/ $RemotePath/ && chown -R www-data:www-data /var/www/cosmiczip"

Write-Host "Uploaded Cosmic Zip to ${remote}:$RemotePath"
Write-Host "If this is first setup, run on the server:"
Write-Host "  bash /tmp/setup-vultr-nginx.sh cosmiczip.net www.cosmiczip.net you@example.com"
