import { React, RN, UI } from "../discord";
import { addTab, FEATURES, getFeature, getTabName, removeTab, renameTab } from "../features";
import { hub, Tab, useHub } from "../store";
import { styles } from "../theme";
import { moveItem } from "./Sortable";
import { DragContext, ScrollEndContext } from "./Sortable";

type Toolbar = null | { kind: "tab"; id: string; } | { kind: "add"; };

function Segment({ tab, active, onLongPress }: { tab: Tab; active: boolean; onLongPress(): void; }) {
    const feature = getFeature(tab.featureId);
    const badge = feature?.useBadge?.() ?? 0;
    const compact = feature?.compact && !active;

    return (
        <RN.Pressable
            onPress={() => { hub.activeTab = tab.id; }}
            onLongPress={onLongPress}
            delayLongPress={350}
            accessibilityLabel={getTabName(tab)}
            style={[styles.segment, active && styles.segmentActive, compact && { paddingHorizontal: 9, opacity: 0.8 }]}
        >
            {feature?.compact && <RN.Text style={{ fontSize: 12, marginRight: compact ? 0 : 5 }}>{feature.glyph}</RN.Text>}
            {!compact && <RN.Text style={[styles.segmentText, active && styles.segmentTextActive]}>{getTabName(tab)}</RN.Text>}
            {badge > 0 && !active && (
                <RN.View style={styles.segmentBadge}>
                    <RN.Text style={styles.segmentBadgeText}>{badge > 99 ? "99+" : badge}</RN.Text>
                </RN.View>
            )}
        </RN.Pressable>
    );
}

function Chip({ label, onPress, danger }: { label: string; onPress(): void; danger?: boolean; }) {
    return (
        <RN.Pressable onPress={onPress} style={[styles.filter, danger && { borderColor: "#f23f43" }]}>
            <RN.Text style={[styles.filterText, danger && { color: "#f23f43" }]}>{label}</RN.Text>
        </RN.Pressable>
    );
}

/** Barre d'options sous les onglets : options d'un onglet (appui long) ou ajout d'un onglet (+) */
function ToolbarRow({ toolbar, close }: { toolbar: Exclude<Toolbar, null>; close(): void; }) {
    const [renaming, setRenaming] = React.useState(false);

    if (toolbar.kind === "add") {
        const available = FEATURES.filter(f => f.multiple || !hub.tabs.some(t => t.featureId === f.id));
        return (
            <RN.View style={[styles.toolbar, { flexWrap: "wrap" }]}>
                {available.map(f => (
                    <Chip key={f.id} label={f.multiple ? `+ Nouvelle ${f.defaultName.toLowerCase()}` : `+ ${f.defaultName}`} onPress={() => { addTab(f.id); close(); }} />
                ))}
                <Chip label="Annuler" onPress={close} />
            </RN.View>
        );
    }

    const tab = hub.tabs.find(t => t.id === toolbar.id);
    if (!tab) return null;
    const index = hub.tabs.indexOf(tab);
    const move = (delta: number) => {
        const to = index + delta;
        if (to < 0 || to >= hub.tabs.length) return;
        hub.tabs = moveItem(hub.tabs, index, to);
    };

    if (renaming) {
        return (
            <RN.TextInput
                style={[styles.noteInput, { minHeight: 0, paddingVertical: 8, marginBottom: 6 }]}
                defaultValue={getTabName(tab)}
                autoFocus
                selectTextOnFocus
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={(e: any) => { renameTab(tab.id, e.nativeEvent.text); close(); }}
                onBlur={() => setRenaming(false)}
            />
        );
    }

    return (
        <RN.View style={[styles.toolbar, { flexWrap: "wrap" }]}>
            <Chip label="✎ Renommer" onPress={() => setRenaming(true)} />
            {tab.name && <Chip label="Nom par défaut" onPress={() => { renameTab(tab.id, undefined); close(); }} />}
            <Chip label="◀" onPress={() => move(-1)} />
            <Chip label="▶" onPress={() => move(1)} />
            <Chip label="Fermer l'onglet" danger onPress={() => { removeTab(tab); close(); }} />
            <Chip label="OK" onPress={close} />
        </RN.View>
    );
}

function ActiveTab() {
    const { tabs, activeTab } = useHub();
    const tab = tabs.find(t => t.id === activeTab) ?? tabs[0];
    const feature = tab && getFeature(tab.featureId);
    if (!tab || !feature) return <RN.Text style={styles.empty}>Aucun onglet ouvert. Utilise « + » pour en ajouter un.</RN.Text>;
    const View = feature.render;
    return <View key={tab.id} tab={tab} />;
}

/** Le panneau Hub, ouvert en feuille du bas */
export function HubSheet() {
    const { tabs, activeTab } = useHub();
    const [toolbar, setToolbar] = React.useState(null as Toolbar);
    const [dragging, setDragging] = React.useState(false);
    const onEnd = React.useRef(undefined as (() => void) | undefined);
    const scrollEnd = React.useMemo(() => ({ setOnEnd: (fn: (() => void) | undefined) => { onEnd.current = fn; } }), []);
    const nearEnd = (e: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 800) onEnd.current?.();
    };
    const ActionSheet = UI.ActionSheet() ?? RN.View;
    // Défilement prévu pour les feuilles du bas de Discord (il partage le geste avec la feuille)
    const Scroll = UI.ScrollView();
    // Remplit la feuille jusqu'en bas (feuille ≈ 88 % de l'écran, moins l'en-tête et la barre de gestes)
    const height = RN.Dimensions.get("window").height * 0.88 - 110;

    return (
        <ActionSheet>
            <RN.View style={styles.header}>
                <RN.ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, flexGrow: 1 }} contentContainerStyle={{ alignItems: "center" }}>
                    <RN.View style={styles.segmented}>
                        {tabs.map(tab => (
                            <Segment key={tab.id} tab={tab} active={tab.id === activeTab} onLongPress={() => setToolbar({ kind: "tab", id: tab.id })} />
                        ))}
                    </RN.View>
                </RN.ScrollView>
                <RN.Pressable style={styles.iconButton} onPress={() => setToolbar(toolbar?.kind === "add" ? null : { kind: "add" })} accessibilityLabel="Ajouter un onglet">
                    <RN.Text style={styles.iconButtonText}>+</RN.Text>
                </RN.Pressable>
            </RN.View>
            {toolbar && <ToolbarRow toolbar={toolbar} close={() => setToolbar(null)} />}
            <ScrollEndContext.Provider value={scrollEnd}>
            <DragContext.Provider value={{ setDragging }}>
                <Scroll style={{ height }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}
                    scrollEnabled={!dragging}
                    keyboardShouldPersistTaps="handled"
                    // (onScroll est réservé au défilement de la feuille : on détecte la fin à la fin de chaque geste)
                    onScrollEndDrag={nearEnd}
                    onMomentumScrollEnd={nearEnd}
                >
                    <ActiveTab />
                </Scroll>
            </DragContext.Provider>
            </ScrollEndContext.Provider>
        </ActionSheet>
    );
}
