import { apiGet, bulkAck, hideSheet, logger, moment, navigate, React, RN, showConfirmationAlert, showToast, Stores, useStores } from "../discord";
import { hub, MAX_CHANNEL_MESSAGES, MAX_MENTIONS, MentionEntry, MentionKind, useHub } from "../store";
import { styles } from "../theme";
import { avatarUrl, Empty, Row, RowAction } from "../ui/common";
import { ScrollEndContext } from "../ui/Sortable";
import { channelLabel, channelPath, RichText } from "../ui/RichText";
import type { PanelFeature } from ".";

/** Texte d'un message, ou résumé s'il n'en a pas : pièce jointe, sticker ou intégration */
export function contentOf(message: any) {
    const text = String(message.content ?? "").trim();
    if (text) return text.slice(0, 600);
    if (message.attachments?.length) return `📎 ${message.attachments.length > 1 ? `${message.attachments.length} pièces jointes` : message.attachments[0]?.filename ?? "pièce jointe"}`;
    const stickers = message.sticker_items ?? message.stickerItems;
    if (stickers?.length) return `Sticker : ${stickers[0].name}`;
    const embed = message.embeds?.[0];
    if (embed) return embed.title ?? embed.rawTitle ?? (embed.description ?? embed.rawDescription)?.slice(0, 200) ?? "Intégration";
    return "";
}

/**
 * Détermine si un message (format API Discord) doit apparaître dans la liste :
 * une mention de l'utilisateur courant, ou un message d'un salon réglé sur « Tous les messages ».
 */
export function toMentionEntry(message: any, assumeMention = false): MentionEntry | null {
    const me = Stores.User()?.getCurrentUser();
    const author = message?.author;
    if (!me || !author || author.id === me.id) return null;
    if (Stores.Relationship()?.isBlocked(author.id)) return null;

    const channel = Stores.Channel()?.getChannel(message.channel_id);
    const guildId: string | undefined = message.guild_id ?? channel?.guild_id ?? undefined;

    let kind: MentionKind | null = null;
    let roleId: string | undefined;

    if (message.mentions?.some((u: any) => (u?.id ?? u) === me.id)) {
        kind = "user";
    } else if (guildId && message.mention_roles?.length) {
        const myRoles: string[] = Stores.GuildMember()?.getMember(guildId, me.id)?.roles ?? [];
        roleId = message.mention_roles.find((r: string) => myRoles.includes(r));
        if (roleId) kind = "role";
    }
    if (!kind && message.mention_everyone) kind = /@here\b/.test(message.content ?? "") ? "here" : "everyone";
    if (!kind && assumeMention) kind = "user";
    // Même règle que Discord pour notifier : salon (ou catégorie, ou serveur) en « Tous les messages » et non muet
    if (!kind && guildId && channel) {
        try {
            if (Stores.UserGuildSettings()?.allowAllMessages(channel)) kind = "message";
        } catch { }
    }
    if (!kind) return null;

    return {
        id: message.id,
        channelId: message.channel_id,
        guildId,
        authorId: author.id,
        authorName: author.global_name ?? author.globalName ?? author.username,
        authorAvatar: author.avatar ?? undefined,
        content: contentOf(message),
        timestamp: Date.parse(message.timestamp) || Date.now(),
        kind,
        roleId
    };
}

export function addMentions(entries: MentionEntry[]) {
    if (!entries.length) return;
    const byId = new Map(hub.mentions.map(m => [m.id, m]));
    for (const e of entries) byId.set(e.id, e);
    const sorted = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
    hub.mentions = [
        ...sorted.filter(m => m.kind !== "message").slice(0, MAX_MENTIONS),
        ...sorted.filter(m => m.kind === "message").slice(0, MAX_CHANNEL_MESSAGES)
    ].sort((a, b) => b.timestamp - a.timestamp);
}

const compareIds = (a: string, b: string) => {
    const diff = BigInt(a) - BigInt(b);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
};

/** Marque les salons comme lus dans Discord jusqu'aux messages retirés ; la position de lecture ne recule jamais */
function ackOnDiscord(entries: MentionEntry[], toLatest = false) {
    const newest = new Map<string, string>();
    for (const e of entries) {
        const n = newest.get(e.channelId);
        if (!n || compareIds(e.id, n) > 0) newest.set(e.channelId, e.id);
    }
    const channels: { channelId: string; messageId: string; }[] = [];
    for (const [channelId, newestId] of newest) {
        const rs = Stores.ReadState();
        // « Tout effacer » marque le salon lu jusqu'à son dernier message, comme « Marquer comme lu »
        const messageId = (toLatest && rs?.lastMessageId?.(channelId)) || newestId;
        if (!rs?.hasUnreadOrMentions?.(channelId) && !rs?.hasUnread?.(channelId) && !rs?.getMentionCount?.(channelId)) continue;
        const acked = rs?.ackMessageId?.(channelId);
        if (acked && compareIds(acked, messageId) >= 0) continue;
        channels.push({ channelId, messageId });
    }
    bulkAck(channels);
}

function dismiss(entries: MentionEntry[], toLatest = false) {
    const ids = new Set(entries.map(e => e.id));
    hub.mentions = hub.mentions.filter(m => !ids.has(m.id));
    try {
        ackOnDiscord(entries, toLatest);
    } catch (e) {
        logger.error("acquittement", e);
    }
}

const PAGE_SIZE = 50;
let loadingOlder = false;
let reachedEnd = false;

/** Charge la page de mentions précédant la plus ancienne connue (défilement infini) */
async function loadOlder(onChange: () => void) {
    if (loadingOlder || reachedEnd || hub.mentions.length >= MAX_MENTIONS) return;
    loadingOlder = true;
    onChange();
    try {
        const oldest = hub.mentions.filter(m => m.kind !== "message").slice(-1)[0];
        const { body } = await apiGet("/users/@me/mentions", { limit: PAGE_SIZE, roles: true, everyone: true, ...(oldest && { before: oldest.id }) });
        const page = body as any[];
        addMentions(page.map(m => toMentionEntry(m, true)).filter(Boolean) as MentionEntry[]);
        if (page.length < PAGE_SIZE) reachedEnd = true;
    } catch (e) {
        logger.error("mentions plus anciennes", e);
    } finally {
        loadingOlder = false;
        onChange();
    }
}

async function importRecent() {
    try {
        const { body } = await apiGet("/users/@me/mentions", { limit: 50, roles: true, everyone: true });
        const entries = (body as any[]).map(m => toMentionEntry(m, true)).filter(Boolean) as MentionEntry[];
        addMentions(entries);
        showToast(`${entries.length} mention(s) chargée(s)`, "ic_check");
    } catch (e) {
        logger.error("mentions récentes", e);
        showToast("Impossible de charger les mentions récentes");
    }
}

type Filter = "all" | MentionKind;
const FILTERS: { id: Filter; label: string; }[] = [
    { id: "all", label: "Tout" },
    { id: "user", label: "@moi" },
    { id: "role", label: "Rôles" },
    { id: "everyone", label: "@all" },
    { id: "message", label: "Salons" }
];

function KindChip({ entry }: { entry: MentionEntry; }) {
    if (entry.kind === "role") {
        const role = entry.guildId && entry.roleId ? Stores.GuildRole()?.getRole(entry.guildId, entry.roleId) : undefined;
        const color = role?.colorString;
        return (
            <RN.View style={[styles.chip, color && { borderColor: color }]}>
                <RN.Text style={[styles.chipText, color && { color }]}>@{role?.name ?? "rôle"}</RN.Text>
            </RN.View>
        );
    }
    const label = entry.kind === "user" ? "@moi" : entry.kind === "message" ? "msg" : "@" + entry.kind;
    const muted = entry.kind !== "user";
    return (
        <RN.View style={[styles.chip, muted && styles.chipMuted]}>
            <RN.Text style={[styles.chipText, muted && styles.chipMutedText]}>{label}</RN.Text>
        </RN.View>
    );
}

function MentionRow({ entry, unseen }: { entry: MentionEntry; unseen: boolean; }) {
    const channel = Stores.Channel()?.getChannel(entry.channelId);
    const guild = entry.guildId ? Stores.Guild()?.getGuild(entry.guildId) : undefined;
    const prefix = channel && !channel.isDM?.() && !channel.isGroupDM?.() ? "#" : "";
    const where = [prefix + channelLabel(channel), guild?.name].filter(Boolean).join(" · ");

    const jump = () => {
        hideSheet("tiroir-panel");
        navigate(channelPath(channel, entry.channelId, entry.id));
    };

    return (
        <Row onPress={jump} style={[{ alignItems: "flex-start" }, unseen && styles.unseen]}>
            <RN.Image style={[styles.icon, styles.iconRound]} source={{ uri: avatarUrl(entry.authorId, entry.authorAvatar) }} />
            <RN.View style={styles.rowText}>
                <RN.View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <RN.Text style={[styles.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{entry.authorName}</RN.Text>
                    <RN.Text style={styles.time}>{moment(entry.timestamp).fromNow(true)}</RN.Text>
                </RN.View>
                <RN.View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <KindChip entry={entry} />
                    <RN.Text style={[styles.rowSubtitle, { flex: 1, marginTop: 0 }]} numberOfLines={1}>{where}</RN.Text>
                </RN.View>
                {!!entry.content && <RichText text={entry.content} style={styles.content} numberOfLines={4} />}
            </RN.View>
            <RowAction accessibilityLabel="Retirer et marquer comme lu" onPress={() => dismiss([entry])} />
        </Row>
    );
}

function MentionsView() {
    const { mentions } = useHub();
    useStores([Stores.Channel, Stores.Guild, Stores.GuildRole]);
    const [seenAt] = React.useState(() => hub.mentionsSeenAt);
    const [filter, setFilter] = React.useState("all" as Filter);

    // Ouvrir l'onglet marque les notifications comme vues
    React.useEffect(() => {
        hub.mentionsSeenAt = Date.now();
        return () => { hub.mentionsSeenAt = Date.now(); };
    }, [mentions.length]);

    const shown = mentions.filter(m => filter === "all" || m.kind === filter || (filter === "everyone" && m.kind === "here"));

    // Défilement infini : arrivé en bas de la liste, on charge les mentions plus anciennes
    const [, refresh] = React.useReducer((x: number) => x + 1, 0);
    const { setOnEnd } = React.useContext(ScrollEndContext);
    React.useEffect(() => {
        setOnEnd(() => loadOlder(refresh));
        if (!mentions.some(m => m.kind !== "message")) loadOlder(refresh);
        return () => setOnEnd(undefined);
    }, []);

    return (
        <RN.View>
            <RN.View style={styles.toolbar}>
                <RN.ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 5 }}>
                    {FILTERS.map(f => (
                        <RN.Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.filter, filter === f.id && styles.filterActive]}>
                            <RN.Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</RN.Text>
                        </RN.Pressable>
                    ))}
                </RN.ScrollView>
                <RowAction label="↻" accessibilityLabel="Charger les mentions récentes" onPress={importRecent} />
                <RowAction
                    label="🗑"
                    accessibilityLabel="Tout effacer et marquer comme lu"
                    onPress={() => mentions.length && showConfirmationAlert({
                        title: "Effacer les notifications",
                        content: "Retirer toutes les notifications ? Leurs salons seront marqués comme lus dans Discord, jusqu'à leur dernier message.",
                        confirmText: "Effacer",
                        cancelText: "Annuler",
                        onConfirm: () => dismiss(hub.mentions, true)
                    })}
                />
            </RN.View>
            {shown.length === 0 && (
                <Empty>Rien pour l'instant. Les mentions et les messages des salons en « Tous les messages » s'ajoutent ici automatiquement ; ↻ charge les mentions récentes.</Empty>
            )}
            {shown.map(m => <MentionRow key={m.id} entry={m} unseen={m.timestamp > seenAt} />)}
            {shown.length > 0 && (
                <RN.Text style={[styles.empty, { paddingVertical: 14 }]}>
                    {loadingOlder ? "Chargement des mentions plus anciennes…" : reachedEnd ? "Toutes les mentions sont chargées." : " "}
                </RN.Text>
            )}
        </RN.View>
    );
}

/** Nombre de notifications arrivées depuis la dernière consultation */
export function useUnseenMentions() {
    const { mentions, mentionsSeenAt } = useHub();
    return mentions.filter(m => m.timestamp > mentionsSeenAt).length;
}

export const MentionsFeature: PanelFeature = {
    id: "mentions",
    defaultName: "Notifications",
    render: MentionsView,
    useBadge: useUnseenMentions
};
