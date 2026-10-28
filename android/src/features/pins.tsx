import { hideSheet, navigate, navigateToGuild, React, RN, showConfirmationAlert, showToast, Stores, useStores } from "../discord";
import { hub, Pin, useHub } from "../store";
import { styles } from "../theme";
import { acronym, avatarUrl, Badge, Empty, guildIconUrl, Row, RowAction } from "../ui/common";
import { channelLabel, channelPath } from "../ui/RichText";
import { DragHandle, moveItem, Sortable } from "../ui/Sortable";
import type { PanelFeature } from ".";

export const isPinned = (type: Pin["type"], id: string) => hub.pins.some(p => p.type === type && p.id === id);

export function togglePin(type: "channel" | "guild", id: string) {
    if (isPinned(type, id)) {
        hub.pins = hub.pins.filter(p => !(p.type === type && p.id === id));
        showToast("Retiré du panneau", "ic_close_16px");
    } else {
        hub.pins = [...hub.pins, { type, id }];
        showToast("Épinglé dans le panneau", "ic_pin");
    }
}

/*
 * Salons et serveurs épinglés, rangés par serveur (plus un groupe « Messages privés »).
 * L'ordre est stocké dans la liste plate `pins` ; les messages épinglés, qui ont leur onglet, restent à la fin.
 */

const DM_GROUP = "@me";

interface PinGroup {
    key: string;
    guildPinned: boolean;
    pins: Pin[];
}

function groupKeyOf(pin: Pin) {
    if (pin.type === "guild") return pin.id;
    return Stores.Channel()?.getChannel(pin.id)?.guild_id ?? DM_GROUP;
}

function groupPins(pins: Pin[]): PinGroup[] {
    const groups = new Map<string, PinGroup>();
    for (const pin of pins) {
        if (pin.type === "message") continue;
        const key = groupKeyOf(pin);
        let group = groups.get(key);
        if (!group) groups.set(key, group = { key, guildPinned: false, pins: [] });
        if (pin.type === "guild") group.guildPinned = true;
        else group.pins.push(pin);
    }
    return [...groups.values()];
}

const flatten = (groups: PinGroup[]): Pin[] => [
    ...groups.flatMap(g => [...(g.guildPinned ? [{ type: "guild" as const, id: g.key }] : []), ...g.pins]),
    ...hub.pins.filter(p => p.type === "message")
];

const moveGroup = (from: number, to: number) => { hub.pins = flatten(moveItem(groupPins(hub.pins), from, to)); };
const moveInGroup = (key: string, from: number, to: number) => {
    hub.pins = flatten(groupPins(hub.pins).map(g => g.key === key ? { ...g, pins: moveItem(g.pins, from, to) } : g));
};

function toggleCollapsed(key: string) {
    hub.collapsedPinGroups = hub.collapsedPinGroups.includes(key)
        ? hub.collapsedPinGroups.filter(k => k !== key)
        : [...hub.collapsedPinGroups, key];
}

function removeGroup(group: PinGroup, name: string) {
    const remove = () => { hub.pins = hub.pins.filter(p => p.type === "message" || groupKeyOf(p) !== group.key); };
    const count = group.pins.length + (group.guildPinned ? 1 : 0);
    if (count <= 1) return remove();
    showConfirmationAlert({
        title: `Retirer « ${name} » ?`,
        content: `Les ${count} épinglés de ce groupe seront retirés du panneau.`,
        confirmText: "Retirer",
        cancelText: "Annuler",
        onConfirm: remove
    });
}

/** Types de salons : icône et libellé */
const CHANNEL_TYPES: Record<number, [string, string]> = {
    0: ["#", "Salon textuel"],
    2: ["🔊", "Salon vocal"],
    4: ["📁", "Catégorie"],
    5: ["📣", "Salon d'annonces"],
    10: ["↳", "Fil"], 11: ["↳", "Fil"], 12: ["↳", "Fil"],
    13: ["📡", "Salon de conférence"],
    15: ["💬", "Forum"],
    16: ["🖼", "Salon média"]
};

function firstChannelOfCategory(guildId: string, categoryId: string) {
    const lists = Stores.GuildChannel()?.getChannels(guildId);
    if (!lists) return;
    return [...(lists.SELECTABLE ?? []), ...(lists.VOCAL ?? [])].map((x: any) => x.channel).find((c: any) => c?.parent_id === categoryId);
}

function go(path: string | null) {
    if (!path) return;
    hideSheet("tiroir-panel");
    navigate(path);
}

function PinIcon({ channel }: { channel: any; }) {
    if (channel?.isDM?.()) {
        const user = Stores.User()?.getUser(channel.getRecipientId());
        return (
            <RN.View style={[styles.icon, styles.iconRound]}>
                {user && <RN.Image style={styles.iconImage} source={{ uri: avatarUrl(user.id, user.avatar) }} />}
            </RN.View>
        );
    }
    const glyph = channel?.isGroupDM?.() ? "👥" : CHANNEL_TYPES[channel?.type]?.[0] ?? "#";
    return <RN.View style={styles.icon}><RN.Text style={styles.iconText}>{glyph}</RN.Text></RN.View>;
}

function PinRow({ pin, handle }: { pin: Pin; handle: DragHandle; }) {
    useStores([Stores.Channel, Stores.ReadState, Stores.SelectedChannel, Stores.User]);
    const channel = Stores.Channel()?.getChannel(pin.id);
    const current = Stores.SelectedChannel()?.getChannelId();

    const isCategory = channel?.type === 4;
    const target = isCategory && channel.guild_id ? firstChannelOfCategory(channel.guild_id, pin.id) : channel;
    const path = target ? channelPath(target, target.id) : channel?.guild_id ? `/channels/${channel.guild_id}` : null;
    const parent = !isCategory && channel?.parent_id ? Stores.Channel()?.getChannel(channel.parent_id) : undefined;
    const kind = channel && channel.type !== 0 && !channel.isDM?.() ? CHANNEL_TYPES[channel.type]?.[1] ?? (channel.isGroupDM?.() ? "Groupe" : null) : null;
    const subtitle = [kind, parent?.name].filter(Boolean).join(" · ");

    const unread = !!Stores.ReadState()?.hasUnread(pin.id);
    const mentions = Stores.ReadState()?.getMentionCount(pin.id) ?? 0;
    const selected = current === pin.id || (!!current && Stores.Channel()?.getChannel(current)?.parent_id === pin.id);

    return (
        <Row onPress={() => go(path)} onLongPress={handle.onLongPress} onPressOut={handle.onPressOut} selected={selected || handle.dragging}>
            <PinIcon channel={channel} />
            <RN.View style={styles.rowText}>
                <RN.Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
                    {channel ? channelLabel(channel) : "Salon introuvable"}
                </RN.Text>
                {!!subtitle && <RN.Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</RN.Text>}
            </RN.View>
            <Badge count={mentions} />
            <RowAction accessibilityLabel="Retirer" onPress={() => { hub.pins = hub.pins.filter(p => !(p.type === "channel" && p.id === pin.id)); }} />
        </Row>
    );
}

function GroupHeader({ group, collapsed, handle }: { group: PinGroup; collapsed: boolean; handle: DragHandle; }) {
    useStores([Stores.Guild, Stores.ReadState]);
    const guild = group.key === DM_GROUP ? undefined : Stores.Guild()?.getGuild(group.key);
    const name = group.key === DM_GROUP ? "Messages privés" : guild?.name ?? "Serveur inconnu";
    const icon = guildIconUrl(guild);
    const hasChannels = group.pins.length > 0;
    const unread = collapsed && group.pins.some(p => Stores.ReadState()?.hasUnread(p.id));
    const mentions = collapsed ? group.pins.reduce((n, p) => n + (Stores.ReadState()?.getMentionCount(p.id) ?? 0), 0) : 0;

    const openGuild = () => {
        if (!guild) return;
        hideSheet("tiroir-panel");
        navigateToGuild(guild.id);
    };

    return (
        <RN.Pressable
            onPress={() => hasChannels ? toggleCollapsed(group.key) : openGuild()}
            onLongPress={handle.onLongPress}
            onPressOut={handle.onPressOut}
            delayLongPress={300}
            style={({ pressed }: any) => [styles.groupHeader, (pressed || handle.dragging) && styles.rowPressed, { borderRadius: 8 }]}
        >
            {hasChannels && <RN.Text style={styles.groupChevron}>{collapsed ? "▸" : "▾"}</RN.Text>}
            <RN.View style={styles.groupIcon}>
                {icon
                    ? <RN.Image style={styles.iconImage} source={{ uri: icon }} />
                    : <RN.Text style={[styles.iconText, { fontSize: 8 }]}>{group.key === DM_GROUP ? "@" : acronym(guild?.name)}</RN.Text>}
            </RN.View>
            <RN.Text style={[styles.groupName, unread && styles.groupNameUnread]} numberOfLines={1}>{name}</RN.Text>
            <Badge count={mentions} />
            {guild && hasChannels && <RowAction label="↗" accessibilityLabel="Ouvrir le serveur" onPress={openGuild} />}
            <RowAction accessibilityLabel="Retirer ce groupe" onPress={() => removeGroup(group, name)} />
        </RN.Pressable>
    );
}

function pinCurrent() {
    const channelId = Stores.SelectedChannel()?.getChannelId();
    if (channelId && !isPinned("channel", channelId)) return togglePin("channel", channelId);
    const guildId = Stores.SelectedGuild()?.getGuildId();
    if (guildId && !isPinned("guild", guildId)) togglePin("guild", guildId);
}

function PinsView() {
    const { pins, collapsedPinGroups } = useHub();
    useStores([Stores.Channel, Stores.SelectedChannel]);
    const groups = groupPins(pins);
    const current = Stores.SelectedChannel()?.getChannelId();
    const alreadyPinned = !!current && isPinned("channel", current);

    return (
        <RN.View>
            <RN.Pressable style={styles.ghostButton} disabled={!current || alreadyPinned} onPress={pinCurrent}>
                <RN.Text style={styles.ghostButtonText}>
                    {!current ? "Ouvre un salon pour l'épingler" : alreadyPinned ? "Salon actuel déjà épinglé" : "+ Épingler le salon actuel"}
                </RN.Text>
            </RN.Pressable>
            {groups.length === 0 && (
                <Empty>
                    Aucun épinglé. Maintiens un salon ou un serveur, puis « Épingler dans le panneau ».{"\n\n"}
                    Maintiens un épinglé ou un en-tête de serveur pour le déplacer.
                </Empty>
            )}
            <Sortable
                items={groups}
                getKey={g => g.key}
                onMove={moveGroup}
                renderItem={(group, handle) => {
                    const collapsed = collapsedPinGroups.includes(group.key);
                    return (
                        <RN.View>
                            <GroupHeader group={group} collapsed={collapsed} handle={handle} />
                            {!collapsed && group.pins.length > 0 && (
                                <RN.View style={styles.groupPins}>
                                    <Sortable
                                        items={group.pins}
                                        getKey={p => p.id}
                                        onMove={(from, to) => moveInGroup(group.key, from, to)}
                                        renderItem={(pin, pinHandle) => <PinRow pin={pin} handle={pinHandle} />}
                                    />
                                </RN.View>
                            )}
                        </RN.View>
                    );
                }}
            />
        </RN.View>
    );
}

export const PinsFeature: PanelFeature = {
    id: "pins",
    defaultName: "Épinglés",
    render: PinsView
};
