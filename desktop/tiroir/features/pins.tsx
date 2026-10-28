/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getGuildAcronym } from "@utils/discord";
import { ChannelType } from "@vencord/discord-types/enums";
import { Alerts, ChannelStore, GuildChannelStore, GuildStore, IconUtils, NavigationRouter, ReadStateStore, SelectedChannelStore, SelectedGuildStore, UserStore, useStateFromStores } from "@webpack/common";

import { ChannelIcon, channelTypeLabel } from "../components/ChannelIcon";
import { channelLabel, channelPath } from "../components/RichText";
import { HandleProps, moveItem, Sortable } from "../components/Sortable";
import { getHub, Pin, updateHub, useHub } from "../store";
import { cl } from "../utils";
import type { PanelFeature } from ".";

export const isPinned = (type: Pin["type"], id: string) => getHub().pins.some(p => p.type === type && p.id === id);

export function togglePin(type: Pin["type"], id: string) {
    updateHub(d => ({
        pins: isPinned(type, id)
            ? d.pins.filter(p => !(p.type === type && p.id === id))
            : [...d.pins, { type, id }]
    }));
}

function pinCurrent() {
    const channelId = SelectedChannelStore.getChannelId();
    if (channelId) {
        if (!isPinned("channel", channelId)) togglePin("channel", channelId);
        return;
    }
    const guildId = SelectedGuildStore.getGuildId();
    if (guildId && !isPinned("guild", guildId)) togglePin("guild", guildId);
}

/*
 * Les salons et serveurs épinglés sont rangés par serveur : un groupe par serveur, plus un pour
 * les messages privés. L'ordre reste stocké dans la liste plate `pins` ; les groupes apparaissent
 * dans l'ordre de leur premier épinglé, et les réordonner revient à réécrire cette liste.
 * Les messages épinglés, rangés dans leur propre onglet, sont conservés tels quels à la fin.
 */

const DM_GROUP = "@me";

interface PinGroup {
    key: string;
    /** Le serveur lui-même est épinglé (clic droit sur l'icône du serveur) */
    guildPinned: boolean;
    /** Salons, catégories et vocaux épinglés de ce groupe */
    pins: Pin[];
}

function groupKeyOf(pin: Pin) {
    if (pin.type === "guild") return pin.id;
    return ChannelStore.getChannel(pin.id)?.guild_id ?? DM_GROUP;
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

/** Réécrit la liste plate à partir des groupes, en gardant les messages épinglés à la fin */
const flattenGroups = (groups: PinGroup[], all: Pin[]): Pin[] => [
    ...groups.flatMap(g => [...(g.guildPinned ? [{ type: "guild" as const, id: g.key }] : []), ...g.pins]),
    ...all.filter(p => p.type === "message")
];

function moveGroup(from: number, to: number) {
    updateHub(d => ({ pins: flattenGroups(moveItem(groupPins(d.pins), from, to), d.pins) }));
}

function moveInGroup(key: string, from: number, to: number) {
    updateHub(d => ({
        pins: flattenGroups(groupPins(d.pins).map(g => g.key === key ? { ...g, pins: moveItem(g.pins, from, to) } : g), d.pins)
    }));
}

function removeGroup(group: PinGroup, name: string) {
    const remove = () => updateHub(d => ({ pins: d.pins.filter(p => p.type === "message" || groupKeyOf(p) !== group.key) }));
    const count = group.pins.length + (group.guildPinned ? 1 : 0);
    if (count <= 1) return remove();

    Alerts.show({
        title: `Retirer « ${name} » ?`,
        body: `Les ${count} épinglés de ce groupe seront retirés du panneau.`,
        confirmText: "Retirer",
        cancelText: "Annuler",
        onConfirm: remove
    });
}

const toggleCollapsed = (key: string) => updateHub(d => ({
    collapsedPinGroups: d.collapsedPinGroups.includes(key)
        ? d.collapsedPinGroups.filter(k => k !== key)
        : [...d.collapsedPinGroups, key]
}));

/** Premier salon d'une catégorie, pour y aller quand on clique sur la catégorie épinglée */
function firstChannelOfCategory(guildId: string, categoryId: string) {
    const { SELECTABLE, VOCAL } = GuildChannelStore.getChannels(guildId);
    return [...SELECTABLE, ...VOCAL]
        .map((item: any) => item.channel)
        .find(c => c?.parent_id === categoryId);
}

function PinIcon({ pin }: { pin: Pin; }) {
    const info = useStateFromStores([ChannelStore, UserStore], () => {
        const channel = ChannelStore.getChannel(pin.id);
        if (channel?.isDM()) {
            const user = UserStore.getUser(channel.getRecipientId() as string);
            return user && { src: IconUtils.getUserAvatarURL(user, false, 64) };
        }
        if (channel?.isGroupDM() && channel.icon) {
            return { src: IconUtils.getChannelIconURL({ id: channel.id, icon: channel.icon, size: 64 }) };
        }
        return { channel };
    });

    if (info && "channel" in info) {
        return <div className={cl("pin-icon", "pin-icon-channel")}><ChannelIcon channel={info.channel} /></div>;
    }
    return <div className={cl("pin-icon", "pin-icon-round")}>{info?.src && <img src={info.src} alt="" />}</div>;
}

function PinRow({ pin, handle }: { pin: Pin; handle: HandleProps; }) {
    const { title, subtitle, path } = useStateFromStores([ChannelStore, GuildStore, UserStore], () => {
        const channel = ChannelStore.getChannel(pin.id);
        if (!channel) return { title: "Salon introuvable", subtitle: "", path: null };

        const isCategory = channel.type === ChannelType.GUILD_CATEGORY;
        const target = isCategory && channel.guild_id ? firstChannelOfCategory(channel.guild_id, pin.id) : channel;
        const parent = !isCategory && channel.parent_id ? ChannelStore.getChannel(channel.parent_id) : undefined;
        const kind = channel.type !== ChannelType.GUILD_TEXT && !channel.isDM() ? channelTypeLabel(channel) : null;

        return {
            title: channelLabel(channel),
            // Le serveur est déjà dans l'en-tête du groupe : on précise le type et la catégorie
            subtitle: [kind, parent?.name].filter(Boolean).join(" · "),
            path: target ? channelPath(target, target.id) : channel.guild_id ? `/channels/${channel.guild_id}` : null
        };
    });

    const { unread, mentions, selected } = useStateFromStores([ReadStateStore, SelectedChannelStore, ChannelStore], () => {
        const current = SelectedChannelStore.getChannelId();
        return {
            unread: ReadStateStore.hasUnread(pin.id),
            mentions: ReadStateStore.getMentionCount(pin.id),
            // Une catégorie est surlignée quand on se trouve dans un de ses salons
            selected: current === pin.id || (!!current && ChannelStore.getChannel(current)?.parent_id === pin.id)
        };
    }, [pin.id], (a, b) => a.unread === b.unread && a.mentions === b.mentions && a.selected === b.selected);

    return (
        <div
            className={cl("row", "pin", selected && "row-selected", unread && "pin-unread")}
            onClick={() => path && NavigationRouter.transitionTo(path)}
            {...handle}
        >
            <PinIcon pin={pin} />
            <div className={cl("row-text")}>
                <div className={cl("row-title")}>{title}</div>
                {subtitle && <div className={cl("row-subtitle")}>{subtitle}</div>}
            </div>
            {mentions > 0 && <span className={cl("badge")}>{mentions}</span>}
            <button
                className={cl("icon-button", "row-action")}
                title="Retirer"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); togglePin(pin.type, pin.id); }}
            >
                ×
            </button>
        </div>
    );
}

function GroupHeader({ group, collapsed, handle }: { group: PinGroup; collapsed: boolean; handle: HandleProps; }) {
    const guild = useStateFromStores([GuildStore], () => group.key === DM_GROUP ? undefined : GuildStore.getGuild(group.key));
    const name = group.key === DM_GROUP ? "Messages privés" : guild?.name ?? "Serveur inconnu";
    const icon = guild?.icon ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 32 }) : undefined;

    // Replié, l'en-tête résume les non-lus et mentions de ses salons
    const { unread, mentions } = useStateFromStores([ReadStateStore], () => ({
        unread: group.pins.some(p => ReadStateStore.hasUnread(p.id)),
        mentions: group.pins.reduce((n, p) => n + ReadStateStore.getMentionCount(p.id), 0)
    }), [group.pins], (a, b) => a.unread === b.unread && a.mentions === b.mentions);

    const openGuild = () => guild && NavigationRouter.transitionToGuild(guild.id);
    const hasChannels = group.pins.length > 0;

    return (
        <div
            className={cl("group-header", collapsed && "group-collapsed", collapsed && unread && "group-unread")}
            onClick={() => hasChannels ? toggleCollapsed(group.key) : openGuild()}
            title={hasChannels ? "Clic pour replier, maintenir pour déplacer" : "Ouvrir le serveur"}
            {...handle}
        >
            {hasChannels && (
                <svg className={cl("group-chevron")} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            )}
            <div className={cl("group-icon")}>
                {icon ? <img src={icon} alt="" /> : group.key === DM_GROUP ? "@" : guild ? getGuildAcronym(guild) : "?"}
            </div>
            <span className={cl("group-name")}>{name}</span>
            {collapsed && mentions > 0 && <span className={cl("badge")}>{mentions}</span>}
            {guild && hasChannels && (
                <button
                    className={cl("icon-button", "row-action", "small-icon-button")}
                    title="Ouvrir le serveur"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); openGuild(); }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                    </svg>
                </button>
            )}
            <button
                className={cl("icon-button", "row-action", "small-icon-button")}
                title="Retirer ce groupe"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); removeGroup(group, name); }}
            >
                ×
            </button>
        </div>
    );
}

function PinsView() {
    const pins = useHub(d => d.pins.filter(p => p.type !== "message"));
    const collapsedGroups = useHub(d => d.collapsedPinGroups);
    const groups = groupPins(pins);

    const current = useStateFromStores([SelectedChannelStore, SelectedGuildStore], () => {
        const channelId = SelectedChannelStore.getChannelId();
        if (channelId) return { type: "channel" as const, id: channelId };
        const guildId = SelectedGuildStore.getGuildId();
        return guildId ? { type: "guild" as const, id: guildId } : null;
    }, [], (a, b) => a?.id === b?.id);
    const alreadyPinned = useHub(() => !!current && isPinned(current.type, current.id));

    return (
        <div className={cl("list")}>
            <button className={cl("ghost-button")} onClick={pinCurrent} disabled={!current || alreadyPinned}>
                {!current ? "Ouvre un salon pour l'épingler" : alreadyPinned ? "Endroit actuel déjà épinglé" : "+ Épingler l'endroit actuel"}
            </button>
            {pins.length === 0 && (
                <div className={cl("empty")}>
                    Aucun épinglé. Fais un clic droit sur un salon ou un serveur, puis « Épingler dans le panneau ».
                    <br /><br />
                    Maintiens un épinglé ou un serveur pour le déplacer.
                </div>
            )}
            <Sortable
                className={cl("groups")}
                items={groups}
                getKey={g => g.key}
                onMove={moveGroup}
                renderItem={(group, handle) => {
                    const collapsed = collapsedGroups.includes(group.key);
                    return (
                        <div className={cl("group")}>
                            <GroupHeader group={group} collapsed={collapsed} handle={handle} />
                            {!collapsed && group.pins.length > 0 && (
                                <Sortable
                                    className={cl("group-pins")}
                                    items={group.pins}
                                    getKey={p => p.id}
                                    onMove={(from, to) => moveInGroup(group.key, from, to)}
                                    renderItem={(pin, pinHandle) => <PinRow pin={pin} handle={pinHandle} />}
                                />
                            )}
                        </div>
                    );
                }}
            />
        </div>
    );
}

export const PinsFeature: PanelFeature = {
    id: "pins",
    defaultName: "Épinglés",
    render: PinsView
};
