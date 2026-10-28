# Tiroir

Un tiroir discret dans Discord : tes salons épinglés, tes notifications, tes notes et tes messages épinglés, à portée d'un clic.

Fonctionne sur **Mac**, **Windows** (via [Vencord](https://vencord.dev)) et **Android** (via [Revenge](https://github.com/revenge-mod)).

## Ce que fait Tiroir

- **Un bouton toujours visible** (en haut à gauche) qui ouvre un panneau à droite, à la place de la liste des membres. Il reste ouvert quand tu changes de salon et suit ton thème Discord.
- **Épinglés** : salons, catégories, vocaux, serveurs et conversations privées, rangés par serveur. Clic droit (ou appui long sur Android) → « Épingler dans le panneau ». Maintiens et glisse pour les réordonner.
- **Notifications** : toutes tes mentions (@toi, tes rôles, @everyone, @here) et les messages des salons réglés sur « Tous les messages ». Retirer une notification la marque aussi comme lue dans Discord.
- **Notes** : `<@ID>` affiche le pseudo, `<#ID>` le salon, `<@&ID>` le rôle. Recherche dans la note, et images collées (Cmd/Ctrl+V) sur ordinateur. Clic droit sur un profil → « Épingler dans une note ».
- **Message Épinglé** : un onglet discret pour garder des messages sous la main.
- **Onglets** renommables, réordonnables, et plusieurs notes possibles.

## Installation

### Mac

Il te faut [Node.js](https://nodejs.org) (22 ou plus récent) et Git (`xcode-select --install` si tu ne l'as pas).

```bash
git clone https://github.com/Delta-001/Tiroir
cd Tiroir
./install-mac.sh
```

Choisis ton Discord dans la liste, redémarre Discord, puis active **Tiroir** dans **Paramètres → Vencord → Plugins**.

> Si macOS bloque l'installation (« operation not permitted »), autorise Terminal dans **Réglages Système → Confidentialité et sécurité → Gestion des apps**, puis relance le script.

### Windows

Il te faut [Node.js](https://nodejs.org) (22 ou plus récent) et [Git](https://git-scm.com). Dans PowerShell :

```powershell
git clone https://github.com/Delta-001/Tiroir
cd Tiroir
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Choisis ton Discord dans la liste, redémarre Discord, puis active **Tiroir** dans **Paramètres → Vencord → Plugins**.

### Android

1. Installe [Revenge Manager](https://github.com/revenge-mod/revenge-manager/releases/latest), ouvre-le et appuie sur **Install** : il installe un Discord modifié à côté du tien.
2. Dans ce Discord : **Paramètres → Revenge → Plugins → Install a plugin**, colle cette adresse puis **Install** :

   ```
   https://raw.githubusercontent.com/Delta-001/Tiroir/main/android/dist/tiroir/
   ```

Le bouton Tiroir apparaît en haut de la barre des serveurs. Le plugin se met à jour tout seul au démarrage de Discord.

## Mettre à jour

- **Mac / Windows** : dans le dossier `Tiroir`, `git pull` puis `./install-mac.sh update` (ou `.\install-windows.ps1 update`), et **Cmd/Ctrl+R** dans Discord.
- **Après une mise à jour de Discord** sur ordinateur, si Vencord a disparu : `./install-mac.sh inject` (ou `.\install-windows.ps1 inject`).
- **Android** : automatique. Pour une nouvelle version de Discord, ouvre Revenge Manager et réinstalle quand il le propose.

Tes données (épinglés, notes, notifications) sont gardées lors des mises à jour. Elles restent propres à chaque appareil.

## À savoir

- Modifier le client Discord va à l'encontre des [conditions d'utilisation de Discord](https://discord.com/terms). Tiroir n'automatise rien et n'envoie aucun message, mais utilise-le à tes risques.
- Le dossier `~/Vencord` (ou `%USERPROFILE%\Vencord`) doit rester en place : Discord charge Vencord depuis celui-ci.

## Développement

```
desktop/tiroir/   plugin Vencord (Mac et Windows)
android/          plugin Revenge Classic (format Vendetta)
  src/discord.ts  seul fichier qui touche aux modules internes de Discord
  dist/tiroir/    version compilée, installée par l'adresse ci-dessus
```

- **Ordinateur** : copie `desktop/tiroir` dans `Vencord/src/userplugins/`, puis `pnpm build --watch`.
- **Android** : dans `android/`, `npm install` puis `npm run check` (types, compilation, test de chargement). `node serve.mjs` sert le plugin localement ; avec le téléphone en USB, `adb reverse tcp:8080 tcp:8080` puis installe `http://127.0.0.1:8080/tiroir/`.
- **Ajouter une fonctionnalité** : un fichier dans `features/`, ajouté au tableau `FEATURES` de `features/index.ts`. Elle apparaît dans le menu « + ».

Pense à recompiler `android/dist/tiroir` (`npm run check`) avant de publier une modification Android.

## Licence

[GPL-3.0](LICENSE)
