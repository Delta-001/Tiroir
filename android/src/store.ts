/*
 * Données de Tiroir, sauvegardées par Revenge (MMKV) sous une clé fixe : elles survivent aux mises à jour
 * du plugin et de Discord, et même à un changement d'adresse d'installation du plugin.
 */

declare const vendetta: any;

const { createStorage, createMMKVBackend, wrapSync, awaitSyncWrapper, useProxy } = vendetta.storage;

export const MAX_MENTIONS = 2000;
export const MAX_CHANNEL_MESSAGES = 150;

export interface Tab {
    id: string;
    featureId: string;
    name?: string;
}

export interface PinnedMessage {
    channelId: string;
    guildId?: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    timestamp: number;
}

export interface Pin {
    type: "channel" | "guild" | "message";
    id: string;
    message?: PinnedMessage;
}

export type MentionKind = "user" | "role" | "everyone" | "here" | "message";

export interface MentionEntry {
    id: string;
    channelId: string;
    guildId?: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    timestamp: number;
    kind: MentionKind;
    roleId?: string;
}

export interface HubData {
    activeTab: string;
    tabs: Tab[];
    notes: Record<string, string>;
    pins: Pin[];
    collapsedPinGroups: string[];
    mentions: MentionEntry[];
    mentionsSeenAt: number;
    seenFeatures: string[];
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaults(): HubData {
    const noteId = newId();
    return {
        activeTab: "pins",
        tabs: [
            { id: "pins", featureId: "pins" },
            { id: "mentions", featureId: "mentions" },
            { id: noteId, featureId: "note" },
            { id: "messages", featureId: "messages" }
        ],
        notes: { [noteId]: "" },
        pins: [],
        collapsedPinGroups: [],
        mentions: [],
        mentionsSeenAt: Date.now(),
        seenFeatures: ["pins", "mentions", "note", "messages"]
    };
}

export const hub: HubData = wrapSync(createStorage(createMMKVBackend("tiroir")));
/** Ancienne clé (avant le renommage en Tiroir), reprise au premier démarrage */
const LEGACY_KEY = "seydina-hub";

let loaded = false;
export const isHubLoaded = () => loaded;

export async function loadHub() {
    await awaitSyncWrapper(hub);
    if (hub.tabs === undefined) {
        const legacy = wrapSync(createStorage(createMMKVBackend(LEGACY_KEY)));
        await awaitSyncWrapper(legacy);
        for (const key of Object.keys(legacy)) (hub as any)[key] = legacy[key];
    }
    const d = defaults();
    for (const key of Object.keys(d) as (keyof HubData)[]) {
        if ((hub as any)[key] === undefined) (hub as any)[key] = d[key];
    }
    loaded = true;
}

/** Relance le rendu du composant à chaque changement des données de Tiroir */
export function useHub(): HubData {
    useProxy(hub);
    return hub;
}
