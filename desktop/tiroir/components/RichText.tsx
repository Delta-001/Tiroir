/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openUserProfile } from "@utils/discord";
import { Channel, Role } from "@vencord/discord-types";
import { ChannelStore, GuildRoleStore, GuildStore, NavigationRouter, UserStore, UserUtils, useStateFromStores } from "@webpack/common";
import type { ReactNode } from "react";

import { useImage } from "../images";
import { cl } from "../utils";

const TOKEN_RE = /<@!?(\d{15,21})>|<@&(\d{15,21})>|<#(\d{15,21})>|<(a?):(\w{2,32}):(\d{15,21})>|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|\[img:([a-z0-9]+)\]/g;

const requestedUsers = new Set<string>();

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

function UserMention({ id }: { id: string; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(id));
    if (!user) requestUser(id);

    return (
        <span
            className={cl("mention")}
            title={user ? `${user.username} · ${id}` : id}
            onClick={() => openUserProfile(id)}
        >
            @{user ? (user.globalName ?? user.username) : "chargement…"}
        </span>
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

function NoteImage({ id }: { id: string; }) {
    const src = useImage(id);
    if (!src) return <span className={cl("image-missing")}>[image introuvable]</span>;
    return <img className={cl("note-image")} src={src} alt="" />;
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
