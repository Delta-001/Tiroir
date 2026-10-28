/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ComponentType } from "react";

import { type Tab, updateHub } from "../store";
import { MentionsFeature } from "./mentions";
import { MessagesFeature } from "./messages";
import { NoteFeature } from "./notes";
import { PinsFeature } from "./pins";

/**
 * Une fonctionnalité affichable dans un onglet du panneau.
 *
 * Pour en ajouter une : crée un fichier dans ce dossier qui exporte un PanelFeature,
 * puis ajoute-le au tableau FEATURES ci-dessous. Elle apparaîtra dans le menu « + ».
 */
export interface PanelFeature {
    /** Identifiant stable, utilisé pour la sauvegarde */
    id: string;
    /** Nom de l'onglet tant que l'utilisateur ne l'a pas renommé */
    defaultName: string;
    /** true si l'utilisateur peut ouvrir plusieurs onglets de ce type (ex. les notes) */
    multiple?: boolean;
    /** Onglet discret : seulement une icône tant qu'il n'est pas actif */
    compact?: boolean;
    /** Ajoute automatiquement l'onglet chez les utilisateurs existants quand la fonctionnalité apparaît */
    addToExistingTabs?: boolean;
    /** Contenu de l'onglet */
    render: ComponentType<{ tab: Tab; }>;
    /** Pastille facultative affichée sur l'onglet (ex. nombre de nouvelles mentions) */
    useBadge?(): number;
    /** Appelée quand l'onglet est supprimé, pour nettoyer ses données */
    onRemove?(tab: Tab): void;
    /** Appelée quand un nouvel onglet de ce type est créé */
    onCreate?(tab: Tab): void;
}

export const FEATURES: PanelFeature[] = [
    PinsFeature,
    MentionsFeature,
    NoteFeature,
    MessagesFeature
];

export const getFeature = (id: string) => FEATURES.find(f => f.id === id);

/** Fonctionnalités présentes avant l'ajout du suivi des nouveautés */
const LEGACY_FEATURES = ["pins", "mentions", "note"];

/** Ajoute, une seule fois, l'onglet des nouvelles fonctionnalités marquées addToExistingTabs */
export function addNewFeatureTabs() {
    updateHub(d => {
        const seen = d.seenFeatures ?? LEGACY_FEATURES;
        const fresh = FEATURES.filter(f => f.addToExistingTabs && !seen.includes(f.id) && !d.tabs.some(t => t.featureId === f.id));
        return {
            tabs: [...d.tabs, ...fresh.map(f => ({ id: f.id, featureId: f.id }))],
            seenFeatures: [...new Set([...seen, ...FEATURES.map(f => f.id)])]
        };
    });
}

export function getTabName(tab: Tab) {
    return tab.name?.trim() || getFeature(tab.featureId)?.defaultName || "Onglet";
}
