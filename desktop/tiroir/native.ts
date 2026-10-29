/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Partie « native » de Tiroir : elle tourne dans le processus principal de Discord et peut lancer
 * des commandes. Elle sert à la mise à jour en un clic depuis les réglages du plugin.
 *
 * Le script d'installation écrit <Vencord>/tiroir-install.json : emplacement du dépôt Tiroir,
 * commande pnpm à utiliser et dossiers à ajouter au PATH (Discord, lancé depuis le bureau,
 * n'a pas toujours le PATH du terminal).
 */

import { execFile } from "child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { delimiter, join } from "path";

// Vencord est chargé depuis <Vencord>/dist
const VENCORD_DIR = join(__dirname, "..");
const CONFIG_PATH = join(VENCORD_DIR, "tiroir-install.json");

interface InstallConfig {
    repoDir: string;
    pnpm: string[];
    path: string[];
}

export interface UpdateStatus {
    ok: boolean;
    error?: string;
    current?: string;
    latest?: string;
    behind?: number;
}

const RERUN_SCRIPT = "Relance une fois le script d'installation (install-mac.sh ou install-windows.ps1) avec l'option « update » depuis ton dossier Tiroir.";

/** Lit la configuration d'installation, ou explique pourquoi elle est inutilisable */
function readConfig(): InstallConfig | string {
    if (!existsSync(CONFIG_PATH)) return `${RERUN_SCRIPT} (fichier introuvable : ${CONFIG_PATH})`;
    let config: InstallConfig;
    try {
        // PowerShell 5 écrit un BOM en tête des fichiers UTF-8 : JSON.parse le refuse
        config = JSON.parse(readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
    } catch {
        return `${RERUN_SCRIPT} (fichier illisible : ${CONFIG_PATH})`;
    }
    if (!existsSync(join(config.repoDir, ".git"))) return `Dossier Tiroir introuvable : ${config.repoDir}. ${RERUN_SCRIPT}`;
    return config;
}

function run(config: InstallConfig, command: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(command[0], command.slice(1), {
            cwd,
            env: { ...process.env, PATH: [...config.path, process.env.PATH ?? ""].join(delimiter), COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
            // pnpm, npx et corepack sont des scripts .cmd sous Windows
            shell: process.platform === "win32",
            timeout: 10 * 60 * 1000,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true
        }, (error, stdout, stderr) => {
            if (error) reject(new Error(`${command.join(" ")} : ${(stderr || stdout || error.message).toString().trim().slice(-800)}`));
            else resolve(stdout.toString().trim());
        });
    });
}


const REPO_URL = "https://github.com/Delta-001/Tiroir";
// Copie du dépôt gérée par le plugin, dans le dossier Vencord (où Discord a le droit d'écrire)
const SOURCE_DIR = join(VENCORD_DIR, "tiroir-source");
// Version installée (commit), écrite par le script d'installation puis à chaque mise à jour
const VERSION_PATH = join(VENCORD_DIR, "tiroir-version.txt");

const short = (sha: string) => sha.slice(0, 7);

async function installedVersion(config: InstallConfig): Promise<string> {
    if (existsSync(VERSION_PATH)) return readFileSync(VERSION_PATH, "utf8").replace(/^\uFEFF/, "").trim();
    // Anciennes installations : version du dépôt cloné (lecture seule)
    return run(config, ["git", "rev-parse", "HEAD"], config.repoDir);
}

/** Dernier commit publié sur GitHub (sans rien écrire sur le disque) */
async function latestVersion(config: InstallConfig): Promise<string> {
    const out = await run(config, ["git", "ls-remote", REPO_URL, "refs/heads/main"], VENCORD_DIR);
    return out.split(/\s/)[0];
}

/** Compare la version installée avec celle de GitHub */
export async function checkForUpdates(): Promise<UpdateStatus> {
    const config = readConfig();
    if (typeof config === "string") return { ok: false, error: config };
    try {
        const [current, latest] = await Promise.all([installedVersion(config), latestVersion(config)]);
        return { ok: true, current: short(current), latest: short(latest), behind: current === latest ? 0 : 1 };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/** Récupère la dernière version, la copie dans Vencord et recompile */
export async function update(): Promise<UpdateStatus> {
    const config = readConfig();
    if (typeof config === "string") return { ok: false, error: config };
    try {
        if (existsSync(join(SOURCE_DIR, ".git"))) {
            await run(config, ["git", "fetch", "--depth", "1", "--quiet", "origin", "main"], SOURCE_DIR);
            await run(config, ["git", "reset", "--hard", "--quiet", "FETCH_HEAD"], SOURCE_DIR);
        } else {
            rmSync(SOURCE_DIR, { recursive: true, force: true });
            await run(config, ["git", "clone", "--depth", "1", "--quiet", REPO_URL, SOURCE_DIR], VENCORD_DIR);
        }

        const target = join(VENCORD_DIR, "src", "userplugins", "tiroir");
        rmSync(target, { recursive: true, force: true });
        cpSync(join(SOURCE_DIR, "desktop", "tiroir"), target, { recursive: true });

        await run(config, [...config.pnpm, "build"], VENCORD_DIR);
        const current = await run(config, ["git", "rev-parse", "HEAD"], SOURCE_DIR);
        writeFileSync(VERSION_PATH, current);
        return { ok: true, current: short(current), latest: short(current), behind: 0 };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}
