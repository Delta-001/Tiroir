/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { relaunch } from "@utils/native";
import { PluginNative } from "@utils/types";
import { Button, Forms, useEffect, useState } from "@webpack/common";

import type { UpdateStatus } from "../native";

const Native = VencordNative.pluginHelpers.Tiroir as PluginNative<typeof import("../native")> | undefined;

const RESTART_NEEDED = "Quitte complètement Discord (pas seulement Ctrl+R), puis rouvre-le pour activer la mise à jour en un clic.";

/** Appelle la partie native, avec un délai maximal : elle n'existe qu'après un vrai redémarrage de Discord */
async function callNative(fn: "checkForUpdates" | "update", timeoutMs: number): Promise<UpdateStatus> {
    if (!Native?.[fn]) return { ok: false, error: RESTART_NEEDED };
    try {
        return await Promise.race([
            Native[fn](),
            new Promise<UpdateStatus>(resolve => setTimeout(() => resolve({ ok: false, error: "Pas de réponse : vérifie ta connexion, puis réessaie." }), timeoutMs))
        ]);
    } catch {
        return { ok: false, error: RESTART_NEEDED };
    }
}

type Phase = "checking" | "idle" | "updating" | "updated";

/** Section « Mises à jour » des réglages du plugin : vérifie GitHub et met à jour en un clic */
export function UpdateSection() {
    const [phase, setPhase] = useState<Phase>("checking");
    const [status, setStatus] = useState<UpdateStatus | null>(null);

    const check = async () => {
        setPhase("checking");
        setStatus(await callNative("checkForUpdates", 30_000));
        setPhase("idle");
    };

    const update = async () => {
        setPhase("updating");
        const result = await callNative("update", 10 * 60_000);
        setStatus(result);
        setPhase(result.ok ? "updated" : "idle");
    };

    useEffect(() => { check(); }, []);

    let text: string;
    if (phase === "checking") text = "Recherche de mises à jour…";
    else if (phase === "updating") text = "Mise à jour en cours (téléchargement et compilation, environ une minute)…";
    else if (phase === "updated") text = `Mise à jour installée (${status?.current}). Redémarre Discord pour l'appliquer.`;
    else if (!status?.ok) text = status?.error ?? "Impossible de vérifier les mises à jour.";
    else if (status.behind) text = `${status.behind} nouveauté(s) disponible(s) : ${status.current} → ${status.latest}.`;
    else text = `Tiroir est à jour (${status.current}).`;

    return (
        <section>
            <Forms.FormTitle tag="h3">Mises à jour</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 10 }}>{text}</Forms.FormText>
            <div style={{ display: "flex", gap: 8 }}>
                {phase === "updated"
                    ? <Button onClick={relaunch}>Redémarrer Discord</Button>
                    : status?.ok && !!status.behind && <Button disabled={phase !== "idle"} onClick={update}>Mettre à jour</Button>}
                {phase !== "updated" && (
                    <Button color={Button.Colors.PRIMARY} disabled={phase !== "idle"} onClick={check}>
                        Vérifier
                    </Button>
                )}
            </div>
        </section>
    );
}
