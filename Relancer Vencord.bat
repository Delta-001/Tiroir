@echo off
rem Double-clic : relance Vencord apres une mise a jour de Discord
rem (ferme Discord, met a jour Vencord et Tiroir, reinjecte Vencord, rouvre Discord)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" relaunch
pause
