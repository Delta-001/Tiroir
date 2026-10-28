import { hideSheet, navigate, openUserProfile, React, requestUser, RN, Stores, useStores } from "../discord";
import { styles } from "../theme";

const TOKEN_RE = /<@!?(\d{15,21})>|<@&(\d{15,21})>|<#(\d{15,21})>|<a?:(\w{2,32}):\d{15,21}>|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

export function channelLabel(channel: any) {
    if (!channel) return "salon-inconnu";
    if (channel.isDM?.()) {
        const user = Stores.User()?.getUser(channel.getRecipientId());
        return user ? `@${user.globalName ?? user.username}` : "Message privé";
    }
    if (channel.isGroupDM?.() && !channel.name) {
        return (channel.recipients ?? []).map((id: string) => Stores.User()?.getUser(id)?.username ?? "?").join(", ");
    }
    return channel.name;
}

export function channelPath(channel: any, channelId: string, messageId?: string) {
    const base = `/channels/${channel?.guild_id ?? "@me"}/${channelId}`;
    return messageId ? `${base}/${messageId}` : base;
}

function findRole(roleId: string) {
    const guilds = Stores.Guild()?.getGuilds() ?? {};
    for (const guild of Object.values<any>(guilds)) {
        const role = Stores.GuildRole()?.getRole(guild.id, roleId);
        if (role) return { role, guildName: guild.name };
    }
}

function go(path: string) {
    hideSheet("tiroir-panel");
    navigate(path);
}

/** Découpe un texte brut pour surligner les occurrences de `query` (sans tenir compte de la casse) */
function highlight(text: string, query: string | undefined, key: string): any[] {
    if (!query) return [text];
    const out: any[] = [];
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let from = 0;
    let i: number;
    while ((i = lower.indexOf(q, from)) !== -1) {
        if (i > from) out.push(text.slice(from, i));
        out.push(<RN.Text key={`${key}-${i}`} style={styles.highlight}>{text.slice(i, i + q.length)}</RN.Text>);
        from = i + q.length;
    }
    if (from < text.length) out.push(text.slice(from));
    return out;
}

/** Nombre d'occurrences de `query` dans le texte (sans tenir compte de la casse) */
export function countMatches(text: string, query: string) {
    if (!query) return 0;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let n = 0, i = 0;
    while ((i = lower.indexOf(q, i)) !== -1) { n++; i += q.length; }
    return n;
}

/** Texte brut dont les <@id>, <@&id>, <#id>, émojis et liens sont rendus comme dans Discord */
export function RichText({ text, style, numberOfLines, query }: { text: string; style?: any; numberOfLines?: number; query?: string; }) {
    useStores([Stores.User, Stores.Channel, Stores.GuildRole]);
    const parts: any[] = [];
    let last = 0;

    for (const m of text.matchAll(TOKEN_RE)) {
        const index = m.index!;
        if (index > last) parts.push(...highlight(text.slice(last, index), query, String(last)));
        const [raw, userId, roleId, channelId, emojiName, url] = m;

        if (userId) {
            const user = Stores.User()?.getUser(userId);
            if (!user) requestUser(userId);
            parts.push(
                <RN.Text key={index} style={styles.mention} onPress={() => openUserProfile(userId)}>
                    {" "}@{user ? (user.globalName ?? user.username) : "chargement…"}{" "}
                </RN.Text>
            );
        } else if (roleId) {
            const found = findRole(roleId);
            const color = found?.role.colorString;
            parts.push(
                <RN.Text key={index} style={[styles.mention, color && { color, backgroundColor: color + "26" }]}>
                    {" "}@{found?.role.name ?? "rôle-inconnu"}{" "}
                </RN.Text>
            );
        } else if (channelId) {
            const channel = Stores.Channel()?.getChannel(channelId);
            const prefix = channel && !channel.isDM?.() && !channel.isGroupDM?.() ? "#" : "";
            parts.push(
                <RN.Text key={index} style={styles.mention} onPress={() => channel && go(channelPath(channel, channelId))}>
                    {" "}{prefix}{channelLabel(channel)}{" "}
                </RN.Text>
            );
        } else if (emojiName) {
            parts.push(`:${emojiName}:`);
        } else if (url) {
            parts.push(<RN.Text key={index} style={styles.link} onPress={() => RN.Linking.openURL(url)}>{url}</RN.Text>);
        } else {
            parts.push(raw);
        }
        last = index + raw.length;
    }
    if (last < text.length) parts.push(...highlight(text.slice(last), query, String(last)));

    return <RN.Text style={style} numberOfLines={numberOfLines}>{parts}</RN.Text>;
}
