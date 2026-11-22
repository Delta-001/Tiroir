#!/usr/bin/env bash
# Double-clic : relance Vencord après une mise à jour de Discord
# (ferme Discord, met à jour Vencord et Tiroir, réinjecte Vencord, rouvre Discord)
cd "$(dirname "$0")" && ./install-mac.sh relaunch
echo
read -n 1 -s -r -p "Appuie sur une touche pour fermer cette fenêtre."
