/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useReducer } from "@webpack/common";

const DATA_KEY = "Tiroir_data";
/** Ancienne clé (avant le renommage en Tiroir), reprise au premier démarrage */
const LEGACY_DATA_KEY = "Hub_data";
const SAVE_DELAY = 400;
export const MAX_MENTIONS = 300;
/** Limite séparée pour les messages des salons « Tous les messages », pour qu'un salon actif ne chasse pas les vraies mentions */
export const MAX_CHANNEL_MESSAGES = 150;

export interface Tab {
    id: string;
    featureId: string;
    /** Nom choisi par l'utilisateur ; sinon le nom par défaut de la fonctionnalité */
    name?: string;
}

/** Copie d'un message épinglé : il reste affichable même quand Discord ne l'a plus en mémoire */
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
    /** Présent pour type === "message" */
    message?: PinnedMessage;
}

/** "message" : message sans mention, dans un salon réglé sur « Tous les messages » */
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
    open: boolean;
    activeTab: string;
    tabs: Tab[];
    /** Contenu des notes, indexé par id d'onglet */
    notes: Record<string, string>;
    pins: Pin[];
    /** Groupes d'épinglés repliés (id de serveur, ou "@me" pour les messages privés) */
    collapsedPinGroups: string[];
    mentions: MentionEntry[];
    /** Fonctionnalités déjà proposées : un onglet que l'utilisateur a fermé n'est pas rajouté */
    seenFeatures?: string[];
    /** Horodatage de la dernière consultation de l'onglet Mentions */
    mentionsSeenAt: number;
    /** Largeur choisie en tirant le bord du panneau ; sinon, celle de la barre remplacée */
    panelWidth?: number;
    /** Fond de la barre native remplacée, mémorisé pour suivre le thème même quand elle est fermée */
    panelLook?: { backgroundColor: string; backgroundImage: string; borderLeft: string; };
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaults(): HubData {
    const noteId = newId();
    return {
        open: false,
        activeTab: "pins",
        tabs: [
            { id: "pins", featureId: "pins" },
            { id: "mentions", featureId: "mentions" },
            { id: noteId, featureId: "note" }
        ],
        notes: { [noteId]: "" },
        pins: [],
        collapsedPinGroups: [],
        mentions: [],
        mentionsSeenAt: Date.now()
    };
}

let data: HubData = defaults();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export const getHub = () => data;
export const isHubLoaded = () => loaded;

export function subscribeHub(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function emit() {
    for (const listener of listeners) listener();
}

export function updateHub(updater: (prev: HubData) => Partial<HubData>) {
    data = { ...data, ...updater(data) };
    emit();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushHub, SAVE_DELAY);
}

export function flushHub() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (loaded) return DataStore.set(DATA_KEY, data);
}

export async function loadHub() {
    const saved = await DataStore.get<Partial<HubData>>(DATA_KEY) ?? await DataStore.get<Partial<HubData>>(LEGACY_DATA_KEY);
    // Les données sauvegardées complètent les valeurs par défaut, pour accepter les nouveaux champs
    data = { ...defaults(), ...saved, open: saved?.open ?? false };
    loaded = true;
    emit();
}

/** Abonne le composant au store et renvoie la partie sélectionnée */
export function useHub<T>(selector: (d: HubData) => T): T {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => subscribeHub(forceUpdate), []);
    return selector(data);
}

export const setPanelOpen = (open: boolean) => updateHub(() => ({ open }));
export const togglePanel = () => setPanelOpen(!data.open);
