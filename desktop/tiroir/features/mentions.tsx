/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { Alerts, ChannelStore, FluxDispatcher, GuildMemberStore, GuildRoleStore, GuildStore, IconUtils, moment, NavigationRouter, ReadStateStore, RelationshipStore, RestAPI, showToast, useEffect, useRef, UserGuildSettingsStore, UserStore, useState, useStateFromStores } from "@webpack/common";

import { channelLabel, channelPath, RichText } from "../components/RichText";
import { getHub, MAX_CHANNEL_MESSAGES, MAX_MENTIONS, MentionEntry, MentionKind, updateHub, useHub } from "../store";
import { cl, useHorizontalWheel } from "../utils";
import type { PanelFeature } from ".";

const logger = new Logger("Tiroir");
const RecentMentions = findByPropsLazy("deleteRecentMention");

/** Texte d'un message, ou résumé s'il n'en a pas : pièce jointe, sticker ou intégration (format API ou objet Discord) */
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
    const me = UserStore.getCurrentUser();
    const author = message?.author;
    if (!me || !author || author.id === me.id) return null;
    if (RelationshipStore.isBlocked(author.id)) return null;

    const channel = ChannelStore.getChannel(message.channel_id);
    const guildId: string | undefined = message.guild_id ?? channel?.guild_id ?? undefined;

    let kind: MentionKind | null = null;
    let roleId: string | undefined;

    if (message.mentions?.some((u: any) => (u?.id ?? u) === me.id)) {
        kind = "user";
    } else if (guildId && message.mention_roles?.length) {
        const myRoles = GuildMemberStore.getMember(guildId, me.id)?.roles ?? [];
        roleId = message.mention_roles.find((r: string) => myRoles.includes(r));
        if (roleId) kind = "role";
    }
    if (!kind && message.mention_everyone) {
        kind = /@here\b/.test(message.content ?? "") ? "here" : "everyone";
    }
    if (!kind && assumeMention) kind = "user";
    // Même règle que Discord pour notifier : salon (ou catégorie, ou serveur) en « Tous les messages » et non muet
    if (!kind && guildId && channel && UserGuildSettingsStore.allowAllMessages(channel)) kind = "message";
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
    updateHub(d => {
        const byId = new Map(d.mentions.map(m => [m.id, m]));
        for (const e of entries) byId.set(e.id, e);
        const sorted = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
        const mentions = [
            ...sorted.filter(m => m.kind !== "message").slice(0, MAX_MENTIONS),
            ...sorted.filter(m => m.kind === "message").slice(0, MAX_CHANNEL_MESSAGES)
        ].sort((a, b) => b.timestamp - a.timestamp);
        return { mentions };
    });
}

const compareIds = (a: string, b: string) => {
    const diff = BigInt(a) - BigInt(b);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
};

/**
 * Marque les salons comme lus dans Discord jusqu'aux messages retirés, comme « Marquer comme lu » :
 * la pastille de mention du salon et du serveur disparaît. La position de lecture n'est jamais reculée.
 */
function ackOnDiscord(entries: MentionEntry[], toLatest = false) {
    const newestByChannel = new Map<string, string>();
    for (const e of entries) {
        const newest = newestByChannel.get(e.channelId);
        if (!newest || compareIds(e.id, newest) > 0) newestByChannel.set(e.channelId, e.id);
    }

    const channels: { channelId: string; messageId: string; readStateType: number; }[] = [];
    for (const [channelId, newest] of newestByChannel) {
        if (!ReadStateStore.hasUnreadOrMentions(channelId)) continue;
        // « Tout effacer » marque le salon lu jusqu'à son dernier message, comme « Marquer comme lu »
        const messageId = (toLatest && ReadStateStore.lastMessageId(channelId)) || newest;
        const acked = ReadStateStore.ackMessageId(channelId);
        if (acked && compareIds(acked, messageId) >= 0) continue;
        channels.push({ channelId, messageId, readStateType: 0 });
    }

    if (channels.length) FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
}

const inboxQueue: string[] = [];
let inboxBusy = false;

/**
 * Retire les mentions de la boîte de réception de Discord (la cloche), comme sa croix « Supprimer ».
 * Une requête à la fois, espacées, pour respecter les limites de l'API.
 */
function deleteFromInbox(entries: MentionEntry[]) {
    inboxQueue.push(...entries.filter(e => e.kind !== "message").map(e => e.id));
    if (inboxBusy) return;
    inboxBusy = true;
    (async () => {
        while (inboxQueue.length) {
            const id = inboxQueue.shift()!;
            try {
                // Fonction de la boîte de réception de Discord : supprime côté serveur et met l'affichage à jour
                if (RecentMentions.deleteRecentMention) RecentMentions.deleteRecentMention(id);
                else await RestAPI.del({ url: `/users/@me/mentions/${id}` });
            } catch (e: any) {
                logger.error("suppression de la boîte de réception", e);
                // Limite atteinte : on réessaie après le délai indiqué
                if (e?.status === 429) {
                    inboxQueue.unshift(id);
                    await new Promise(r => setTimeout(r, (e.body?.retry_after ?? 2) * 1000));
                }
            }
            await new Promise(r => setTimeout(r, 300));
        }
        inboxBusy = false;
    })();
}

/** Retire des entrées du panneau, les marque comme lues dans Discord et les supprime de sa boîte de réception */
function dismissMentions(entries: MentionEntry[], toLatest = false) {
    const ids = new Set(entries.map(e => e.id));
    updateHub(d => ({ mentions: d.mentions.filter(m => !ids.has(m.id)) }));
    try {
        ackOnDiscord(entries, toLatest);
        deleteFromInbox(entries);
    } catch (e) {
        logger.error("Impossible de marquer comme lu dans Discord", e);
    }
}

/** Charge les mentions récentes comme le fait la boîte de réception de Discord */
async function importRecentMentions() {
    try {
        const { body } = await RestAPI.get({
            url: "/users/@me/mentions",
            query: { limit: 50, roles: true, everyone: true }
        });
        const entries = (body as any[]).map(m => toMentionEntry(m, true)).filter(Boolean) as MentionEntry[];
        addMentions(entries);
        showToast({ text: `${entries.length} mention(s) chargée(s)` });
    } catch (e) {
        logger.error("Impossible de charger les mentions récentes", e);
        showToast({ text: "Impossible de charger les mentions récentes", variant: "critical" });
    }
}

type Filter = "all" | MentionKind;
const FILTERS: { id: Filter; label: string; title: string; }[] = [
    { id: "all", label: "Tout", title: "Tout afficher" },
    { id: "user", label: "@moi", title: "Mentions directes" },
    { id: "role", label: "Rôles", title: "Mentions d'un de tes rôles" },
    { id: "everyone", label: "@all", title: "@everyone et @here" },
    { id: "message", label: "Salons", title: "Messages sans mention des salons en « Tous les messages »" }
];

function KindChip({ entry }: { entry: MentionEntry; }) {
    const role = useStateFromStores([GuildRoleStore], () =>
        entry.kind === "role" && entry.guildId && entry.roleId ? GuildRoleStore.getRole(entry.guildId, entry.roleId) : undefined);

    if (entry.kind === "role") {
        const color = role?.colorString;
        return (
            <span className={cl("chip")} style={color ? { color, borderColor: color } : undefined}>
                @{role?.name ?? "rôle"}
            </span>
        );
    }
    if (entry.kind === "message") return <span className={cl("chip", "chip-everyone")} title="Salon en « Tous les messages »">msg</span>;
    return <span className={cl("chip", entry.kind !== "user" && "chip-everyone")}>{entry.kind === "user" ? "@moi" : "@" + entry.kind}</span>;
}

function MentionRow({ entry, unseen }: { entry: MentionEntry; unseen: boolean; }) {
    const where = useStateFromStores([ChannelStore, GuildStore], () => {
        const channel = ChannelStore.getChannel(entry.channelId);
        const guild = entry.guildId ? GuildStore.getGuild(entry.guildId) : undefined;
        const prefix = channel && !channel.isDM() && !channel.isGroupDM() ? "#" : "";
        return [prefix + channelLabel(channel), guild?.name].filter(Boolean).join(" · ");
    });

    const avatar = entry.authorAvatar
        ? IconUtils.getUserAvatarURL({ id: entry.authorId, avatar: entry.authorAvatar } as any, false, 64)
        : IconUtils.getDefaultAvatarURL(entry.authorId);

    const jump = () => NavigationRouter.transitionTo(channelPath(ChannelStore.getChannel(entry.channelId), entry.channelId, entry.id));

    return (
        <div className={cl("row", "mention-row", unseen && "mention-unseen")} onClick={e => (e.target as HTMLElement).closest("a, ." + cl("mention")) || jump()}>
            <img className={cl("avatar")} src={avatar} alt="" />
            <div className={cl("row-text")}>
                <div className={cl("mention-head")}>
                    <span className={cl("row-title")}>{entry.authorName}</span>
                    <span className={cl("time")} title={new Date(entry.timestamp).toLocaleString()}>{moment(entry.timestamp).fromNow(true)}</span>
                </div>
                <div className={cl("mention-where")}>
                    <KindChip entry={entry} />
                    <span className={cl("row-subtitle")}>{where}</span>
                </div>
                {entry.content && <RichText text={entry.content} className={cl("mention-content")} />}
            </div>
            <button
                className={cl("icon-button", "row-action")}
                title="Retirer et marquer comme lu"
                onClick={e => {
                    e.stopPropagation();
                    dismissMentions([entry]);
                }}
            >
                ×
            </button>
        </div>
    );
}

function MentionsView() {
    const mentions = useHub(d => d.mentions);
    const [seenAt] = useState(() => getHub().mentionsSeenAt);
    const [filter, setFilter] = useState<Filter>("all");
    const filtersRef = useRef<HTMLDivElement>(null);
    useHorizontalWheel(filtersRef);

    // Ouvrir l'onglet marque les mentions comme vues ; celles d'avant restent surlignées jusqu'au prochain passage
    useEffect(() => {
        updateHub(() => ({ mentionsSeenAt: Date.now() }));
        return () => updateHub(() => ({ mentionsSeenAt: Date.now() }));
    }, [mentions.length]);

    const shown = mentions.filter(m => filter === "all" || m.kind === filter || (filter === "everyone" && m.kind === "here"));

    return (
        <div className={cl("list")}>
            <div className={cl("toolbar")}>
                <div ref={filtersRef} className={cl("filters")}>
                    {FILTERS.map(f => (
                        <button key={f.id} className={cl("filter", filter === f.id && "filter-active")} title={f.title} onClick={() => setFilter(f.id)}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <button className={cl("icon-button", "small-icon-button")} title="Charger les mentions récentes depuis Discord" onClick={importRecentMentions}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                        <path d="M20 4v7h-7" />
                    </svg>
                </button>
                <button
                    className={cl("icon-button", "small-icon-button")}
                    title="Tout effacer et marquer comme lu"
                    onClick={() => mentions.length && Alerts.show({
                        title: "Effacer les notifications",
                        body: "Retirer toutes les notifications ? Leurs salons seront marqués comme lus dans Discord, jusqu'à leur dernier message.",
                        confirmText: "Effacer",
                        cancelText: "Annuler",
                        onConfirm: () => dismissMentions(getHub().mentions, true)
                    })}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                </button>
            </div>
            {shown.length === 0 && (
                <div className={cl("empty")}>
                    Rien pour l'instant. Les mentions et les messages des salons en « Tous les messages » s'ajoutent ici automatiquement ; le bouton ↻ charge les mentions récentes.
                </div>
            )}
            {shown.map(m => <MentionRow key={m.id} entry={m} unseen={m.timestamp > seenAt} />)}
        </div>
    );
}

/** Nombre de mentions arrivées depuis la dernière consultation */
export const useUnseenMentions = () => useHub(d => d.mentions.filter(m => m.timestamp > d.mentionsSeenAt).length);

export const MentionsFeature: PanelFeature = {
    id: "mentions",
    defaultName: "Notifications",
    render: MentionsView,
    useBadge: useUnseenMentions
};
