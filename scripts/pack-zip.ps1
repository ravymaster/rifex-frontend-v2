$ErrorActionPreference = "Stop"
$NAME = "rifex-frontend-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip"
$ROOT = (Resolve-Path "$PSScriptRoot\..").Path
Write-Host "Packing $NAME ..."
Add-Type -AssemblyName 'System.IO.Compression.FileSystem'
$zipPath = "/mnt/data/$NAME"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($ROOT, $zipPath)
Write-Host "ZIP listo: $zipPath"
