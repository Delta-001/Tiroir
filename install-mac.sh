#!/usr/bin/env bash
# Installe Tiroir dans Discord sur macOS (via Vencord).
#   ./install-mac.sh          première installation : télécharge Vencord, compile, injecte dans Discord
#   ./install-mac.sh update   met à jour Tiroir et Vencord (sans réinjecter)
#   ./install-mac.sh inject   réinjecte seulement (après une mise à jour de Discord)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/Vencord}"
MODE="${1:-install}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

need() {
    command -v "$1" >/dev/null 2>&1 || { echo "❌ $1 est introuvable. $2"; exit 1; }
}
need git "Installe les outils de développement Apple : xcode-select --install"
need node "Installe Node.js 22 ou plus récent : https://nodejs.org"

# pnpm (exigé par Vencord) : via corepack s'il est là (Node 22/24), sinon pnpm installé, sinon npx
# avec la version exacte demandée par Vencord (Node 25 et plus ne fournissent plus corepack)
pnpm_run() {
    if command -v corepack >/dev/null 2>&1; then
        corepack pnpm "$@"
    elif command -v pnpm >/dev/null 2>&1; then
        pnpm "$@"
    else
        npx --yes "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" "$@"
    fi
}

if [ "$MODE" != "inject" ]; then
    if [ -d "$VENCORD_DIR/.git" ]; then
        echo "→ Mise à jour de Vencord dans $VENCORD_DIR"
        git -C "$VENCORD_DIR" pull --ff-only
    else
        echo "→ Téléchargement de Vencord dans $VENCORD_DIR"
        git clone --depth 1 https://github.com/Vendicated/Vencord "$VENCORD_DIR"
    fi

    echo "→ Copie de Tiroir"
    mkdir -p "$VENCORD_DIR/src/userplugins"
    rm -rf "$VENCORD_DIR/src/userplugins/tiroir"
    cp -R "$REPO_DIR/desktop/tiroir" "$VENCORD_DIR/src/userplugins/tiroir"

    echo "→ Compilation"
    cd "$VENCORD_DIR"
    pnpm_run install --frozen-lockfile
    pnpm_run build
fi

if [ "$MODE" != "update" ]; then
    echo "→ Injection dans Discord : choisis ton Discord dans la liste."
    echo "  Si macOS bloque l'opération, autorise Terminal dans"
    echo "  Réglages Système → Confidentialité et sécurité → Gestion des apps, puis relance ce script."
    cd "$VENCORD_DIR"
    pnpm_run inject
fi

echo
echo "✅ Terminé. Redémarre Discord (Cmd+Q puis rouvre-le)."
[ "$MODE" = "install" ] && echo "   Active ensuite « Tiroir » dans Paramètres → Vencord → Plugins."
echo "   Important : garde le dossier $VENCORD_DIR, Discord charge Vencord depuis celui-ci."
