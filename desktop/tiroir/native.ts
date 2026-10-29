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
import { cpSync, existsSync, readFileSync, rmSync } from "fs";
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


/** Compare la version installée avec celle de GitHub */
export async function checkForUpdates(): Promise<UpdateStatus> {
    const config = readConfig();
    if (typeof config === "string") return { ok: false, error: config };
    try {
        await run(config, ["git", "fetch", "--quiet"], config.repoDir);
        const current = await run(config, ["git", "rev-parse", "--short", "HEAD"], config.repoDir);
        const latest = await run(config, ["git", "rev-parse", "--short", "@{u}"], config.repoDir);
        const behind = Number(await run(config, ["git", "rev-list", "--count", "HEAD..@{u}"], config.repoDir));
        return { ok: true, current, latest, behind };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/** Récupère la dernière version, la copie dans Vencord et recompile */
export async function update(): Promise<UpdateStatus> {
    const config = readConfig();
    if (typeof config === "string") return { ok: false, error: config };
    try {
        await run(config, ["git", "pull", "--ff-only", "--quiet"], config.repoDir);

        const target = join(VENCORD_DIR, "src", "userplugins", "tiroir");
        rmSync(target, { recursive: true, force: true });
        cpSync(join(config.repoDir, "desktop", "tiroir"), target, { recursive: true });

        await run(config, [...config.pnpm, "build"], VENCORD_DIR);
        const current = await run(config, ["git", "rev-parse", "--short", "HEAD"], config.repoDir);
        return { ok: true, current, latest: current, behind: 0 };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}
