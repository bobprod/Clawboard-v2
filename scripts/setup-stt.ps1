<#
.SYNOPSIS
    Installe l'environnement Python du STT local (faster-whisper) dans .venv-stt.

.EXAMPLE
    scripts\setup-stt.ps1
    scripts\setup-stt.ps1 -Model small
#>
param(
    [string]$Model = "base"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root ".venv-stt"
$python = Join-Path $venv "Scripts\python.exe"
$req = Join-Path $root "scripts\stt-requirements.txt"

if (-not (Test-Path $python)) {
    Write-Host "Creation du venv : $venv"
    python -m venv $venv
}

Write-Host "Installation des dependances (faster-whisper)..."
& $python -m pip install --upgrade pip | Out-Null
& $python -m pip install -r $req
if ($LASTEXITCODE -ne 0) { Write-Host "ECHEC installation" ; exit 1 }

Write-Host "Verification de l'import..."
& $python -c "import faster_whisper, sys; print('faster-whisper OK', faster_whisper.__version__)"

Write-Host ""
Write-Host "STT local pret. Modele par defaut : $Model (telecharge au premier usage)."
Write-Host "Pour changer : definir STT_LOCAL_MODEL dans .env (base | small | medium)."
