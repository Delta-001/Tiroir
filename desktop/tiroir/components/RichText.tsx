/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openUserProfile } from "@utils/discord";
import { Channel, Role } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, GuildRoleStore, GuildStore, NavigationRouter, ReactDOM, showToast, useEffect, UserStore, UserUtils, useState, useStateFromStores, VoiceStateStore } from "@webpack/common";
import type { ReactNode } from "react";

import { copyImage, useImage } from "../images";
import { cl } from "../utils";

const TOKEN_RE = /<@!?(\d{15,21})>|<@&(\d{15,21})>|<#(\d{15,21})>|<(a?):(\w{2,32}):(\d{15,21})>|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|\[img:([a-z0-9]+)\]/g;

const requestedUsers = new Set<string>();

const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");
const voiceClickTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Récupère un utilisateur absent du cache local, une seule fois par id */
function requestUser(id: string) {
    if (requestedUsers.has(id)) return;
    requestedUsers.add(id);
    UserUtils.getUser(id).catch(() => { });
}

function findRole(roleId: string): { role: Role; guildName: string; } | undefined {
    for (const guild of Object.values(GuildStore.getGuilds())) {
        const role = GuildRoleStore.getRole(guild.id, roleId);
        if (role) return { role, guildName: guild.name };
    }
}

export function channelLabel(channel: Channel | undefined) {
    if (!channel) return "salon-inconnu";
    if (channel.isDM()) {
        const user = UserStore.getUser(channel.getRecipientId() as string);
        return user ? `@${user.globalName ?? user.username}` : "Message privé";
    }
    if (channel.isGroupDM() && !channel.name) {
        return channel.recipients.map(id => UserStore.getUser(id)?.username ?? "?").join(", ");
    }
    return channel.name;
}

export function channelPath(channel: Channel | undefined, channelId: string, messageId?: string) {
    const base = `/channels/${channel?.guild_id ?? "@me"}/${channelId}`;
    return messageId ? `${base}/${messageId}` : base;
}

/** Pastille 🔊 si le membre est en vocal (lit les états vocaux reçus par Discord, même sans message ni profil public) */
function VoiceBadge({ userId }: { userId: string; }) {
    const state = useStateFromStores([VoiceStateStore], () => {
        const vs = VoiceStateStore.getVoiceStateForUser(userId);
        if (!vs?.channelId) return null;
        return {
            channelId: vs.channelId,
            muted: vs.mute || vs.selfMute,
            deaf: vs.deaf || vs.selfDeaf,
            streaming: !!(vs.selfStream || vs.stream),
            video: vs.selfVideo
        };
    }, [userId], (a, b) => JSON.stringify(a) === JSON.stringify(b));
    const channel = useStateFromStores([ChannelStore], () => state ? ChannelStore.getChannel(state.channelId) : undefined, [state?.channelId]);
    if (!state) return null;

    const guildName = channel?.guild_id ? GuildStore.getGuild(channel.guild_id)?.name : undefined;
    const where = channel ? (channel.isDM() || channel.isGroupDM() ? "appel privé" : `🔊 ${channel.name}`) : "salon inconnu";
    const details = [
        state.deaf ? "casque coupé" : state.muted ? "micro coupé" : null,
        state.streaming ? "en stream" : null,
        state.video ? "caméra" : null
    ].filter(Boolean).join(", ");

    return (
        <span
            className={cl("voice-badge", state.deaf || state.muted ? "voice-badge-muted" : null)}
            title={`En vocal : ${where}${guildName ? ` · ${guildName}` : ""}${details ? ` (${details})` : ""}\nClic : ouvrir le salon · Double-clic : rejoindre le vocal`}
            onClick={e => {
                e.stopPropagation();
                if (!channel) return showToast({ text: "Salon vocal inaccessible", variant: "critical" });
                // Double-clic : on rejoint le vocal ; simple clic : on ouvre le salon sans le rejoindre
                const pending = voiceClickTimers.get(userId);
                if (pending) {
                    clearTimeout(pending);
                    voiceClickTimers.delete(userId);
                    selectVoiceChannel(state.channelId);
                    return;
                }
                voiceClickTimers.set(userId, setTimeout(() => {
                    voiceClickTimers.delete(userId);
                    NavigationRouter.transitionTo(channelPath(channel, state.channelId));
                }, 250));
            }}
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
            </svg>
            {channel && !channel.isDM() && !channel.isGroupDM() && <span className={cl("voice-badge-name")}>{channel.name}</span>}
        </span>
    );
}

function UserMention({ id }: { id: string; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(id));
    if (!user) requestUser(id);

    return (
        <>
            <span
                className={cl("mention")}
                title={user ? `${user.username} · ${id}` : id}
                onClick={() => openUserProfile(id)}
            >
                @{user ? (user.globalName ?? user.username) : "chargement…"}
            </span>
            <VoiceBadge userId={id} />
        </>
    );
}

function RoleMention({ id }: { id: string; }) {
    const found = useStateFromStores([GuildRoleStore, GuildStore], () => findRole(id));
    const color = found?.role.colorString;

    return (
        <span
            className={cl("mention", "role-mention")}
            title={found ? `${found.guildName} · ${id}` : id}
            style={color ? { color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` } : undefined}
        >
            @{found?.role.name ?? "rôle-inconnu"}
        </span>
    );
}

function ChannelMention({ id }: { id: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id));
    const guildName = useStateFromStores([GuildStore], () => channel?.guild_id ? GuildStore.getGuild(channel.guild_id)?.name : undefined);
    const prefix = channel && (channel.isDM() || channel.isGroupDM()) ? "" : "#";

    return (
        <span
            className={cl("mention")}
            title={guildName ? `${guildName} · ${id}` : id}
            onClick={() => channel && NavigationRouter.transitionTo(channelPath(channel, id))}
        >
            {prefix}{channelLabel(channel)}
        </span>
    );
}

const copy = (id: string) => copyImage(id)
    .then(() => showToast({ text: "Image copiée" }))
    .catch(() => showToast({ text: "Impossible de copier l'image", variant: "critical" }));

/** Image en grand, par-dessus Discord : clic à côté ou Échap pour fermer */
function Lightbox({ id, src, onClose }: { id: string; src: string; onClose(): void; }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return ReactDOM.createPortal(
        <div className={cl("lightbox")} onClick={onClose}>
            <img className={cl("lightbox-image")} src={src} alt="" onClick={e => e.stopPropagation()} />
            <div className={cl("lightbox-actions")} onClick={e => e.stopPropagation()}>
                <button className={cl("lightbox-button")} onClick={() => copy(id)}>Copier l'image</button>
                <button className={cl("lightbox-button")} onClick={onClose}>Fermer</button>
            </div>
        </div>,
        document.body
    );
}

function NoteImage({ id }: { id: string; }) {
    const src = useImage(id);
    const [zoomed, setZoomed] = useState(false);
    if (!src) return <span className={cl("image-missing")}>[image introuvable]</span>;
    return (
        <span className={cl("note-image-wrap")}>
            <img className={cl("note-image", "note-image-zoomable")} src={src} alt="" title="Cliquer pour agrandir" onClick={() => setZoomed(true)} />
            <button
                className={cl("note-image-copy")}
                title="Copier l'image (à coller dans un message, une preuve de report…)"
                onClick={e => {
                    e.stopPropagation();
                    copy(id);
                }}
            >
                Copier
            </button>
            {zoomed && <Lightbox id={id} src={src} onClose={() => setZoomed(false)} />}
        </span>
    );
}

/** Surligne les occurrences de `query` dans un texte brut (sans tenir compte de la casse) */
function highlight(text: string, query: string | undefined, key: number): ReactNode[] {
    if (!query) return [text];
    const out: ReactNode[] = [];
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let from = 0;
    let i: number;
    while ((i = lower.indexOf(q, from)) !== -1) {
        if (i > from) out.push(text.slice(from, i));
        out.push(<mark key={`${key}-${i}`} className={cl("highlight")}>{text.slice(i, i + q.length)}</mark>);
        from = i + q.length;
    }
    if (from < text.length) out.push(text.slice(from));
    return out;
}

/** Nombre d'occurrences de `query` dans le texte, hors repères d'images (sans tenir compte de la casse) */
export function countMatches(text: string, query: string) {
    if (!query) return 0;
    const lower = text.replace(/\[img:[a-z0-9]+\]/g, "").toLowerCase();
    const q = query.toLowerCase();
    let n = 0;
    let i = 0;
    while ((i = lower.indexOf(q, i)) !== -1) {
        n++;
        i += q.length;
    }
    return n;
}

/** Affiche du texte brut en remplaçant <@id>, <@&id>, <#id>, les émojis, les liens et les images */
export function RichText({ text, className, query }: { text: string; className?: string; query?: string; }) {
    const parts: ReactNode[] = [];
    let last = 0;

    for (const m of text.matchAll(TOKEN_RE)) {
        const index = m.index!;
        if (index > last) parts.push(...highlight(text.slice(last, index), query, last));

        const [raw, userId, roleId, channelId, animated, emojiName, emojiId, url, imageId] = m;
        if (userId) parts.push(<UserMention key={index} id={userId} />);
        else if (roleId) parts.push(<RoleMention key={index} id={roleId} />);
        else if (channelId) parts.push(<ChannelMention key={index} id={channelId} />);
        else if (emojiId) parts.push(
            <img
                key={index}
                className={cl("emoji")}
                alt={`:${emojiName}:`}
                title={`:${emojiName}:`}
                src={`https://cdn.discordapp.com/emojis/${emojiId}.${animated ? "gif" : "webp"}?size=48`}
            />
        );
        else if (url) parts.push(<a key={index} href={url} target="_blank" rel="noreferrer">{url}</a>);
        else if (imageId) parts.push(<NoteImage key={index} id={imageId} />);
        else parts.push(raw);

        last = index + raw.length;
    }
    if (last < text.length) parts.push(...highlight(text.slice(last), query, last));

    return <div className={className}>{parts}</div>;
}
