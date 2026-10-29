/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";

import { getFeature } from "../features";
import { resetWidth, startResize } from "../host";
import { isHubLoaded, setPanelOpen, useHub } from "../store";
import { cl } from "../utils";
import { SegmentedControl } from "./SegmentedControl";

function ActiveTab() {
    const tab = useHub(d => d.tabs.find(t => t.id === d.activeTab) ?? d.tabs[0]);
    const feature = tab && getFeature(tab.featureId);

    if (!tab || !feature) {
        return <div className={cl("empty")}>Aucun onglet ouvert. Utilise « + » pour en ajouter un.</div>;
    }

    const View = feature.render;
    return (
        <div key={tab.id} className={cl("tab-content")}>
            <ErrorBoundary message={`L'onglet « ${feature.defaultName} » a planté.`}>
                <View tab={tab} />
            </ErrorBoundary>
        </div>
    );
}

export function Panel({ visible }: { visible: boolean; }) {
    const loaded = useHub(isHubLoaded);

    return (
        <div className={cl("panel")}>
            <div
                className={cl("resize-handle")}
                title="Tirer pour redimensionner, double-clic pour la largeur automatique"
                onPointerDown={e => startResize(e.nativeEvent)}
                onDoubleClick={resetWidth}
            />
            {visible && loaded && (
                <>
                    <header className={cl("header")}>
                        <SegmentedControl />
                        <button className={cl("icon-button")} title="Fermer le panneau" onClick={() => setPanelOpen(false)}>×</button>
                    </header>
                    <div className={cl("body")}>
                        <ActiveTab />
                    </div>
                </>
            )}
        </div>
    );
}
