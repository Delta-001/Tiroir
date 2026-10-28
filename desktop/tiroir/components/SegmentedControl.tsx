/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Alerts, ContextMenuApi, Menu, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { MouseEvent } from "react";

import { FEATURES, getFeature, getTabName } from "../features";
import { getHub, newId, Tab, updateHub, useHub } from "../store";
import { cl } from "../utils";
import { HandleProps, moveItem, Sortable } from "./Sortable";

/** Ajoute un onglet de la fonctionnalité donnée, l'active et le renvoie */
export function addTab(featureId: string): Tab | undefined {
    const feature = getFeature(featureId);
    if (!feature) return;

    const tab: Tab = { id: feature.multiple ? newId() : featureId, featureId };

    updateHub(d => {
        // Numérote les onglets multiples avec le premier nom libre : Note, Note 2, Note 3…
        if (feature.multiple) {
            const used = new Set(d.tabs.map(getTabName));
            let n = 1;
            while (used.has(n === 1 ? feature.defaultName : `${feature.defaultName} ${n}`)) n++;
            if (n > 1) tab.name = `${feature.defaultName} ${n}`;
        }
        return { tabs: [...d.tabs, tab], activeTab: tab.id };
    });
    feature.onCreate?.(tab);
    return tab;
}

function removeTab(tab: Tab) {
    const doRemove = () => {
        updateHub(d => {
            const tabs = d.tabs.filter(t => t.id !== tab.id);
            const activeTab = d.activeTab === tab.id ? tabs[Math.max(0, d.tabs.indexOf(tab) - 1)]?.id ?? "" : d.activeTab;
            return { tabs, activeTab };
        });
        getFeature(tab.featureId)?.onRemove?.(tab);
    };

    if (tab.featureId === "note") {
        Alerts.show({
            title: `Supprimer « ${getTabName(tab)} » ?`,
            body: "Le contenu de cette note sera perdu.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
            onConfirm: doRemove
        });
    } else {
        doRemove();
    }
}

const renameTab = (tabId: string, name: string | undefined) =>
    updateHub(d => ({ tabs: d.tabs.map(t => t.id === tabId ? { ...t, name } : t) }));

function openAddMenu(e: MouseEvent) {
    const { tabs } = getHub();
    const available = FEATURES.filter(f => f.multiple || !tabs.some(t => t.featureId === f.id));

    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-hub-add" onClose={ContextMenuApi.closeContextMenu} aria-label="Ajouter un onglet">
            {available.map(f => (
                <Menu.MenuItem key={f.id} id={"vc-hub-add-" + f.id} label={f.multiple ? `Nouvelle ${f.defaultName.toLowerCase()}` : f.defaultName} action={() => addTab(f.id)} />
            ))}
        </Menu.Menu>
    ));
}

function Segment({ tab, active, onRename, segmentRef, handle }: { tab: Tab; active: boolean; onRename(): void; segmentRef(el: HTMLElement | null): void; handle: HandleProps; }) {
    const feature = getFeature(tab.featureId);
    const badge = feature?.useBadge?.() ?? 0;
    // Onglet discret : une petite icône, le nom n'apparaît que lorsqu'il est actif
    const compact = feature?.compact && !active;

    const openMenu = (e: MouseEvent) => ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-hub-tab" onClose={ContextMenuApi.closeContextMenu} aria-label="Onglet">
            <Menu.MenuItem id="vc-hub-rename" label="Renommer" action={onRename} />
            {tab.name && <Menu.MenuItem id="vc-hub-reset" label="Nom par défaut" action={() => renameTab(tab.id, undefined)} />}
            <Menu.MenuSeparator />
            <Menu.MenuItem id="vc-hub-remove" label="Fermer l'onglet" color="danger" action={() => removeTab(tab)} />
        </Menu.Menu>
    ));

    return (
        <button
            ref={segmentRef}
            className={cl("segment", active && "segment-active", feature?.compact && "segment-compact")}
            onClick={() => updateHub(() => ({ activeTab: tab.id }))}
            onDoubleClick={onRename}
            onContextMenu={openMenu}
            {...handle}
            title={compact ? getTabName(tab) : "Double-clic pour renommer, maintenir pour déplacer, clic droit pour plus d'options"}
            aria-label={getTabName(tab)}
        >
            {feature?.compact && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 17v5M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6z" />
                </svg>
            )}
            {!compact && getTabName(tab)}
            {badge > 0 && !active && <span className={cl("segment-badge")}>{badge > 99 ? "99+" : badge}</span>}
        </button>
    );
}

function RenameInput({ tab, onDone }: { tab: Tab; onDone(): void; }) {
    const [value, setValue] = useState(getTabName(tab));
    const commit = () => {
        renameTab(tab.id, value.trim() || undefined);
        onDone();
    };

    return (
        <input
            className={cl("segment", "segment-active", "segment-input")}
            autoFocus
            value={value}
            maxLength={32}
            size={Math.max(4, value.length)}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setValue(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") onDone();
            }}
        />
    );
}

export function SegmentedControl() {
    const { tabs, activeTab } = useHub(d => ({ tabs: d.tabs, activeTab: d.activeTab }));

    const [renaming, setRenaming] = useState<string | null>(null);
    const segments = useRef(new Map<string, HTMLElement>());
    const bar = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState<{ left: number; width: number; } | null>(null);

    // Place l'indicateur glissant sous l'onglet actif (mesuré par rapport à la barre, qui peut défiler)
    useLayoutEffect(() => {
        const el = segments.current.get(activeTab);
        const box = bar.current?.getBoundingClientRect();
        setIndicator(el && box
            ? { left: el.getBoundingClientRect().left - box.left + bar.current!.scrollLeft, width: el.offsetWidth }
            : null);
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeTab, tabs, renaming]);

    return (
        <div className={cl("segmented-wrap")}>
            <div ref={bar} className={cl("segmented")} role="tablist">
                {indicator && <div className={cl("segment-indicator")} style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />}
                <Sortable
                    className={cl("segments")}
                    axis="x"
                    scrollerSelector={"." + cl("segmented")}
                    items={tabs}
                    getKey={tab => tab.id}
                    onMove={(from, to) => updateHub(d => ({ tabs: moveItem(d.tabs, from, to) }))}
                    renderItem={(tab, handle) => renaming === tab.id
                        ? <RenameInput tab={tab} onDone={() => setRenaming(null)} />
                        : (
                            <Segment
                                tab={tab}
                                active={tab.id === activeTab}
                                onRename={() => setRenaming(tab.id)}
                                segmentRef={el => el ? segments.current.set(tab.id, el) : segments.current.delete(tab.id)}
                                handle={handle}
                            />
                        )}
                />
            </div>
            <button className={cl("icon-button", "add-button")} title="Ajouter un onglet" onClick={openAddMenu}>+</button>
        </div>
    );
}
