/*
 * Ajouts dans l'interface de Discord. Chaque patch est indépendant : s'il ne trouve pas son point
 * d'ancrage après une mise à jour de Discord, il se contente de journaliser la structure rencontrée
 * et le reste de Tiroir continue de fonctionner.
 */

import { findInReactTree, getAssetIDByName, hideSheet, logger, openSheet, React, RN, showToast, Stores, UI, wrapComponent } from "./discord";
import { addTab, getTabName } from "./features";
import { useUnseenMentions } from "./features/mentions";
import { toggleMessagePin } from "./features/messages";
import { appendToNote } from "./features/notes";
import { isPinned, togglePin } from "./features/pins";
import { hub } from "./store";
import { styles } from "./theme";
import { HubSheet } from "./ui/HubSheet";

export const openHub = () => openSheet("tiroir-panel", HubSheet);

const logged = new Set<string>();
/** Décrit une arborescence React pour comprendre où s'insérer (une seule fois par patch) */
function describe(label: string, tree: any, depth = 0, out: string[] = []): string[] {
    if (depth > 4 || !tree || typeof tree !== "object") return out;
    if (Array.isArray(tree)) { tree.slice(0, 8).forEach(t => describe(label, t, depth, out)); return out; }
    const t = tree.type;
    const name = typeof t === "string" ? t : t?.displayName ?? t?.name ?? t?.type?.name ?? t?.render?.name ?? typeof t;
    out.push(`${"  ".repeat(depth)}${name} [${Object.keys(tree.props ?? {}).slice(0, 12).join(",")}]`);
    describe(label, tree.props?.children, depth + 1, out);
    return out;
}
function logOnce(label: string, tree: any) {
    if (logged.has(label)) return;
    logged.add(label);
    logger.log(`structure ${label} :\n` + describe(label, tree).join("\n"));
}

// ---------- Bouton Tiroir en haut de la barre des serveurs ----------

function HubButton() {
    const unseen = useUnseenMentions();
    const icon = getAssetIDByName("PinIcon") ?? getAssetIDByName("ic_pin");
    return (
        <RN.Pressable onPress={openHub} style={({ pressed }: any) => [styles.hubButton, pressed && styles.hubButtonActive]} accessibilityLabel="Ouvrir Tiroir">
            {icon
                ? <RN.Image source={icon} style={{ width: 22, height: 22, tintColor: "#b5bac1" }} />
                : <RN.Text style={{ fontSize: 20 }}>📌</RN.Text>}
            {unseen > 0 && <RN.View style={styles.hubDot} />}
        </RN.Pressable>
    );
}

/**
 * La barre des serveurs est un conteneur avec une liste (FastList) décalée sous la barre d'état
 * (insetStart). On place le bouton au-dessus de la liste, avec ce décalage : il reste fixe en haut.
 */
/** Largeur de la colonne des serveurs (le conteneur est plus large que la colonne visible) */
const GUILD_COLUMN_WIDTH = 77;

function patchGuildsBar() {
    return wrapComponent("GuildsBar", tree => {
        const isList = (c: any) => c?.props?.renderItem && ("sections" in c.props || "data" in c.props);
        const container = findInReactTree(tree, (n: any) => Array.isArray(n?.props?.children) && n.props.children.some(isList));
        if (!container) {
            logOnce("GuildsBar", tree);
            return tree;
        }
        const children = [...container.props.children];
        const index = children.findIndex(isList);
        const list = children[index];
        const inset = list.props.insetStart ?? 0;
        // La liste déborde de ses bords (overflow visible) : sans découpe, les icônes défilent par-dessus le bouton
        children[index] = { ...list, props: { ...list.props, insetStart: 0, style: [list.props.style, { overflow: "hidden" }] } };
        children.splice(index, 0, (
            <RN.View key="tiroir-panel" style={{ paddingTop: inset, width: GUILD_COLUMN_WIDTH, alignSelf: "flex-start" }}>
                <HubButton />
            </RN.View>
        ));
        container.props = { ...container.props, children };
        return tree;
    });
}

// ---------- Menus d'appui long ----------

function addRowsToSheet(label: string, tree: any, rows: any[]) {
    const ActionSheet = UI.ActionSheet();
    const sheet = findInReactTree(tree, (n: any) => n?.type === ActionSheet)
        ?? findInReactTree(tree, (n: any) => Array.isArray(n?.props?.children) && n.props.children.some((c: any) => c?.type?.name === "ActionSheetRowGroup" || c?.type === UI.ActionSheetRow()?.Group));
    if (!sheet) return logOnce(label, tree);

    const Row = UI.ActionSheetRow();
    const group = (
        <Row.Group key="tiroir-panel">
            {rows.map((r, i) => (
                <Row key={i} label={r.label} icon={<Row.Icon source={getAssetIDByName(r.icon) ?? getAssetIDByName("ic_pin")} />} onPress={r.onPress} />
            ))}
        </Row.Group>
    );
    // En deuxième position : visible sans faire défiler, sans prendre la place des actions principales
    const children = [sheet.props.children].flat().filter(Boolean);
    children.splice(Math.min(1, children.length), 0, group);
    sheet.props.children = children;
}

const closeAll = () => hideSheet();

const pinRow = (pinned: boolean, onPress: () => void) => ({
    label: pinned ? "Retirer du panneau" : "Épingler dans le panneau",
    icon: "PinIcon",
    onPress: () => { closeAll(); onPress(); }
});

/*
 * Les menus d'appui long sont enveloppés à leur création (wrapComponent) : Discord garde une
 * référence directe à ses composants, un patch du module ne suffirait pas.
 */
const patchMessageSheet = () => wrapComponent("LongPressMessageActionSheet", (tree, { message }) => {
    if (message) addRowsToSheet("message", tree, [pinRow(isPinned("message", message.id), () => toggleMessagePin(message))]);
    return tree;
});

const patchChannelSheet = () => wrapComponent("ChannelLongPressActionSheetConnected", (tree, { channel }) => {
    if (channel) addRowsToSheet("salon", tree, [pinRow(isPinned("channel", channel.id), () => togglePin("channel", channel.id))]);
    return tree;
});

const patchGuildSheet = () => wrapComponent("GuildActionSheet", (tree, props) => {
    const guildId = props?.guildId ?? props?.guild?.id;
    if (guildId) addRowsToSheet("serveur", tree, [pinRow(isPinned("guild", guildId), () => togglePin("guild", guildId))]);
    else logOnce("serveur-props", { type: "props", props: props ?? {} });
    return tree;
});

function addUserToNote(userId: string, tabId: string | undefined, name: string) {
    if (!tabId) return;
    appendToNote(tabId, `<@${userId}>`);
    const tab = hub.tabs.find(t => t.id === tabId);
    showToast(`${name} ajouté à « ${tab ? getTabName(tab) : "Note"} »`, "ic_check");
}

const patchUserSheet = () => wrapComponent("UserProfileActionSheet", (tree, props) => {
    const userId = props?.userId ?? props?.user?.id;
    if (!userId) return tree;
    const user = Stores.User()?.getUser(userId);
    const name = user?.globalName ?? user?.username ?? "Utilisateur";
    const notes = hub.tabs.filter(t => t.featureId === "note");
    addRowsToSheet("profil", tree, [
        ...notes.slice(0, 4).map(tab => ({
            label: `Épingler dans « ${getTabName(tab)} »`,
            icon: "PinIcon",
            onPress: () => { closeAll(); addUserToNote(userId, tab.id, name); }
        })),
        { label: "Épingler dans une nouvelle note", icon: "PinIcon", onPress: () => { closeAll(); addUserToNote(userId, addTab("note")?.id, name); } }
    ]);
    return tree;
});

export function applyPatches(): () => void {
    const unpatches: (() => void)[] = [];
    let pending: [string, () => any][] = [
        ["barre des serveurs", patchGuildsBar],
        ["menu message", patchMessageSheet],
        ["menu salon", patchChannelSheet],
        ["menu serveur", patchGuildSheet],
        ["menu profil", patchUserSheet]
    ];
    let tries = 0;

    const attempt = () => {
        pending = pending.filter(([name, apply]) => {
            try {
                const un = apply();
                if (un === false) return true;
                if (typeof un === "function") unpatches.push(un);
                logger.log(`patch appliqué : ${name}`);
            } catch (e) {
                logger.error(`patch ${name}`, e);
            }
            return false;
        });
        if (!pending.length) clearInterval(timer);
        else if (++tries >= 200) {
            clearInterval(timer);
            logger.error("modules introuvables : " + pending.map(([n]) => n).join(", "));
        }
    };
    // Certains menus ne se chargent qu'à leur première ouverture : on réessaie pendant dix minutes
    const timer = setInterval(attempt, 3000);
    attempt();

    return () => {
        clearInterval(timer);
        for (const un of unpatches) un();
    };
}
