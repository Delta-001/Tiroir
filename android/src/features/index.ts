import { hub, newId, Tab } from "../store";
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
    id: string;
    defaultName: string;
    /** Plusieurs onglets possibles (ex. les notes) */
    multiple?: boolean;
    /** Onglet discret : seulement une icône tant qu'il n'est pas actif */
    compact?: boolean;
    /** Caractère affiché pour un onglet discret */
    glyph?: string;
    render: (props: { tab: Tab; }) => any;
    useBadge?(): number;
    onCreate?(tab: Tab): void;
    onRemove?(tab: Tab): void;
}

export const FEATURES: PanelFeature[] = [PinsFeature, MentionsFeature, NoteFeature, MessagesFeature];

export const getFeature = (id: string) => FEATURES.find(f => f.id === id);

export const getTabName = (tab: Tab) => tab.name?.trim() || getFeature(tab.featureId)?.defaultName || "Onglet";

/** Ajoute un onglet et l'active ; numérote les onglets multiples avec le premier nom libre */
export function addTab(featureId: string): Tab | undefined {
    const feature = getFeature(featureId);
    if (!feature) return;

    const tab: Tab = { id: feature.multiple ? newId() : featureId, featureId };
    if (feature.multiple) {
        const used = new Set(hub.tabs.map(getTabName));
        let n = 1;
        while (used.has(n === 1 ? feature.defaultName : `${feature.defaultName} ${n}`)) n++;
        if (n > 1) tab.name = `${feature.defaultName} ${n}`;
    }
    hub.tabs = [...hub.tabs, tab];
    hub.activeTab = tab.id;
    feature.onCreate?.(tab);
    return tab;
}

export function removeTab(tab: Tab) {
    const index = hub.tabs.findIndex(t => t.id === tab.id);
    const tabs = hub.tabs.filter(t => t.id !== tab.id);
    hub.tabs = tabs;
    if (hub.activeTab === tab.id) hub.activeTab = tabs[Math.max(0, index - 1)]?.id ?? "";
    getFeature(tab.featureId)?.onRemove?.(tab);
}

export function renameTab(tabId: string, name: string | undefined) {
    hub.tabs = hub.tabs.map(t => t.id === tabId ? { ...t, name: name?.trim() || undefined } : t);
}

/** Ajoute, une seule fois, l'onglet des fonctionnalités apparues depuis la dernière version */
export function addNewFeatureTabs() {
    const seen = hub.seenFeatures ?? [];
    const fresh = FEATURES.filter(f => !f.multiple && !seen.includes(f.id) && !hub.tabs.some(t => t.featureId === f.id));
    if (fresh.length) hub.tabs = [...hub.tabs, ...fresh.map(f => ({ id: f.id, featureId: f.id }))];
    hub.seenFeatures = [...new Set([...seen, ...FEATURES.map(f => f.id)])];
}
