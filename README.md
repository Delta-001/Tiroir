# Tiroir

A discreet drawer inside Discord: your pinned channels, your notifications, your notes and your saved messages, one click away.

Works on **macOS**, **Windows** (through [Vencord](https://vencord.dev)) and **Android** (through [Revenge](https://github.com/revenge-mod)).

> The plugin's interface is in French.

## Features

- **An always-visible button** (top left) that opens a panel on the right, in place of the member list. It stays open when you switch channels, follows your Discord theme, and can be resized by dragging its left edge (double-click the edge to reset).
- **Pins**: channels, categories, voice channels, servers and DMs, grouped by server. Right-click (long-press on Android) → « Épingler dans le panneau ». Hold and drag to reorder.
- **Notifications**: every mention (@you, your roles, @everyone, @here) plus messages from channels set to « All messages ». Removing a notification marks it as read in Discord and deletes it from Discord's inbox. The trash button clears everything: all mentioned channels are marked as read and the inbox is emptied. On Android, older mentions load as you scroll.
- **Notes**: `<@ID>` shows the username, `<#ID>` the channel, `<@&ID>` the role. Search inside a note. On desktop, paste images (Cmd/Ctrl+V), click an image to enlarge it, and copy it back to the clipboard (handy for report evidence). Right-click a profile → « Épingler dans une note ».
- **Saved messages**: a discreet tab to keep messages at hand.
- **Tabs** you can rename, reorder and duplicate (several notes).

## Installation

### macOS

You need [Node.js](https://nodejs.org) (22 or newer) and Git (`xcode-select --install` if you don't have it).

```bash
git clone https://github.com/Delta-001/Tiroir
cd Tiroir
./install-mac.sh
```

Pick your Discord in the list, restart Discord, then enable **Tiroir** in **Settings → Vencord → Plugins**.

> If macOS blocks the installation (“operation not permitted”), allow Terminal in **System Settings → Privacy & Security → App Management**, then run the script again.

### Windows

You need [Node.js](https://nodejs.org) (22 or newer) and [Git](https://git-scm.com). In a regular (non-administrator) PowerShell, from your user folder:

```powershell
git clone https://github.com/Delta-001/Tiroir
cd Tiroir
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Pick your Discord in the list, fully quit Discord (right-click its tray icon → Quit) and reopen it, then enable **Tiroir** in **Settings → Vencord → Plugins**.

> Don't clone Tiroir into `C:\Windows\System32` (the default folder of an administrator PowerShell): Discord must be able to read and write next to Vencord.

### Android

1. Install [Revenge Manager](https://github.com/revenge-mod/revenge-manager/releases/latest), open it and tap **Install**: it installs a modded Discord next to your regular one.
2. In that Discord: **Settings → Revenge → Plugins → Install a plugin**, paste this URL, then **Install**:

   ```
   https://raw.githubusercontent.com/Delta-001/Tiroir/main/android/dist/tiroir/
   ```

The Tiroir button appears at the top of the server bar. The plugin updates itself every time Discord starts.

## Updating

### From the plugin (macOS and Windows)

1. Open **Settings → Vencord → Plugins → Tiroir** (the gear icon).
2. The **Mises à jour** section tells you whether a new version is available on GitHub.
3. Click **Mettre à jour**: Tiroir downloads the new version and rebuilds Vencord (about a minute).
4. Click **Redémarrer Discord**.

If the section asks you to fully restart Discord, quit it completely (Ctrl+R is not enough) and reopen it. If it asks you to run the install script again, do it once with the `update` option (see below).

### From the command line (fallback)

- **macOS**: in the `Tiroir` folder, `git pull` then `./install-mac.sh update`, and restart Discord.
- **Windows**: in the `Tiroir` folder, `git pull` then `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 update`, and restart Discord.
- **After a Discord update**, if Vencord is gone: `./install-mac.sh inject` (or `.\install-windows.ps1 inject`).

### Android

Automatic. When a new Discord version comes out, open Revenge Manager and reinstall when it offers to.

Your data (pins, notes, notifications, images) is kept across updates. It stays local to each device.

## Good to know

- Modifying the Discord client goes against [Discord's Terms of Service](https://discord.com/terms). Tiroir doesn't automate anything and never sends messages, but use it at your own risk.
- Keep the Vencord folder (`~/Vencord` or `%USERPROFILE%\Vencord` by default): Discord loads Vencord from it.

## Development

```
desktop/tiroir/   Vencord plugin (macOS and Windows)
  native.ts       main-process code used by the one-click updater
android/          Revenge Classic plugin (Vendetta format)
  src/discord.ts  the only file that touches Discord's internal modules
  dist/tiroir/    built plugin, installed through the URL above
```

- **Desktop**: copy `desktop/tiroir` into `Vencord/src/userplugins/`, then run `pnpm build --watch`.
- **Android**: in `android/`, run `npm install` then `npm run check` (types, build and a load test). `node serve.mjs` serves the plugin locally; with the phone on USB, run `adb reverse tcp:8080 tcp:8080` and install `http://127.0.0.1:8080/tiroir/`.
- **Adding a feature**: add a file in `features/` and register it in the `FEATURES` array of `features/index.ts`. It then shows up in the « + » menu.

Rebuild `android/dist/tiroir` (`npm run check`) before publishing an Android change.

## License

[GPL-3.0](LICENSE)
