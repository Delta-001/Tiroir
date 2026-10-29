# Installe Tiroir dans Discord sur Windows (via Vencord).
#   .\install-windows.ps1          première installation : télécharge Vencord, compile, injecte dans Discord
#   .\install-windows.ps1 update   met à jour Tiroir et Vencord (sans réinjecter)
#   .\install-windows.ps1 inject   réinjecte seulement (après une mise à jour de Discord)
param([string]$Mode = "install")
$ErrorActionPreference = "Stop"

$RepoDir = $PSScriptRoot
$VencordDir = if ($env:VENCORD_DIR) { $env:VENCORD_DIR } else { Join-Path $env:USERPROFILE "Vencord" }
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"

function Need($cmd, $hint) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "❌ $cmd est introuvable. $hint"
        exit 1
    }
}
Need git "Installe Git : https://git-scm.com"
Need node "Installe Node.js 22 ou plus récent : https://nodejs.org"

function Run($exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "La commande « $exe $arguments » a échoué." }
}

# pnpm (exigé par Vencord) : via corepack s'il est là (Node 22/24), sinon pnpm installé, sinon npx
# avec la version exacte demandée par Vencord (Node 25 et plus ne fournissent plus corepack)
# (nom distinct de « pnpm » : PowerShell ignore la casse, la fonction s'appellerait elle-même)
function Invoke-Pnpm([string[]]$arguments) {
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        Run corepack (@("pnpm") + $arguments)
    } elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Run pnpm $arguments
    } else {
        $version = (Get-Content package.json -Raw | ConvertFrom-Json).packageManager.Split("@")[1]
        Run npx (@("--yes", "pnpm@$version") + $arguments)
    }
}

if ($Mode -ne "inject") {
    if (Test-Path (Join-Path $VencordDir ".git")) {
        Write-Host "→ Mise à jour de Vencord dans $VencordDir"
        Run git @("-C", $VencordDir, "pull", "--ff-only")
    } else {
        Write-Host "→ Téléchargement de Vencord dans $VencordDir"
        Run git @("clone", "--depth", "1", "https://github.com/Vendicated/Vencord", $VencordDir)
    }

    Write-Host "→ Copie de Tiroir"
    $Target = Join-Path $VencordDir "src\userplugins\tiroir"
    New-Item -ItemType Directory -Force -Path (Join-Path $VencordDir "src\userplugins") | Out-Null
    if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
    Copy-Item -Recurse (Join-Path $RepoDir "desktop\tiroir") $Target

    Write-Host "→ Compilation"
    Push-Location $VencordDir
    try {
        Invoke-Pnpm @("install", "--frozen-lockfile")
        Invoke-Pnpm @("build")
    } finally { Pop-Location }
}

# Configuration pour la mise à jour en un clic depuis les réglages du plugin
if (Get-Command corepack -ErrorAction SilentlyContinue) { $PnpmCmd = @("corepack", "pnpm") }
elseif (Get-Command pnpm -ErrorAction SilentlyContinue) { $PnpmCmd = @("pnpm") }
else {
    $version = (Get-Content (Join-Path $VencordDir "package.json") -Raw | ConvertFrom-Json).packageManager.Split("@")[1]
    $PnpmCmd = @("npx", "--yes", "pnpm@$version")
}
$PathDirs = @("node", "git", "pnpm") | ForEach-Object { (Get-Command $_ -ErrorAction SilentlyContinue).Source } | Where-Object { $_ } | ForEach-Object { Split-Path $_ }
@{ repoDir = $RepoDir; pnpm = $PnpmCmd; path = @($PathDirs) } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $VencordDir "tiroir-install.json")

if ($Mode -ne "update") {
    Write-Host "→ Injection dans Discord : choisis ton Discord dans la liste."
    Push-Location $VencordDir
    try { Invoke-Pnpm @("inject") } finally { Pop-Location }
}

Write-Host ""
Write-Host "✅ Terminé. Redémarre Discord (clic droit sur l'icône de la barre des tâches → Quitter, puis rouvre-le)."
if ($Mode -eq "install") { Write-Host "   Active ensuite « Tiroir » dans Paramètres → Vencord → Plugins." }
Write-Host "   Important : garde le dossier $VencordDir, Discord charge Vencord depuis celui-ci."
