/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, IconUtils, moment, NavigationRouter, showToast, useStateFromStores } from "@webpack/common";

import { channelLabel, RichText } from "../components/RichText";
import { HandleProps, moveItem, Sortable } from "../components/Sortable";
import { Pin, PinnedMessage, updateHub, useHub } from "../store";
import { cl } from "../utils";
import type { PanelFeature } from ".";
import { contentOf } from "./mentions";
import { isPinned, togglePin } from "./pins";

/** Épingle un message (ou le retire s'il l'est déjà) en gardant une copie de son contenu */
export function toggleMessagePin(message: Message) {
    if (isPinned("message", message.id)) {
        togglePin("message", message.id);
        showToast({ text: "Message retiré du panneau" });
        return;
    }

    const { author } = message;
    const snapshot: PinnedMessage = {
        channelId: message.channel_id,
        guildId: ChannelStore.getChannel(message.channel_id)?.guild_id ?? undefined,
        authorId: author.id,
        authorName: author.globalName ?? author.username,
        authorAvatar: author.avatar ?? undefined,
        content: contentOf(message),
        timestamp: new Date(message.timestamp as any).getTime() || Date.now()
    };
    updateHub(d => ({ pins: [...d.pins, { type: "message", id: message.id, message: snapshot }] }));
    showToast({ text: "Message épinglé dans le panneau" });
}

/** Réordonne les messages entre eux ; les autres épinglés gardent leur place */
function moveMessage(from: number, to: number) {
    updateHub(d => {
        const messages = d.pins.filter(p => p.type === "message");
        return { pins: [...d.pins.filter(p => p.type !== "message"), ...moveItem(messages, from, to)] };
    });
}

function MessagePinRow({ pin, handle }: { pin: Pin; handle: HandleProps; }) {
    const msg = pin.message!;
    const where = useStateFromStores([ChannelStore, GuildStore], () => {
        const channel = ChannelStore.getChannel(msg.channelId);
        const guild = msg.guildId ? GuildStore.getGuild(msg.guildId) : undefined;
        const prefix = channel && !channel.isDM() && !channel.isGroupDM() ? "#" : "";
        return [prefix + channelLabel(channel), guild?.name].filter(Boolean).join(" · ");
    });
    const avatar = msg.authorAvatar
        ? IconUtils.getUserAvatarURL({ id: msg.authorId, avatar: msg.authorAvatar } as any, false, 64)
        : IconUtils.getDefaultAvatarURL(msg.authorId);

    const jump = () => NavigationRouter.transitionTo(`/channels/${msg.guildId ?? "@me"}/${msg.channelId}/${pin.id}`);

    return (
        <div
            className={cl("row", "pin", "pin-message")}
            onClick={e => (e.target as HTMLElement).closest("a, ." + cl("mention")) || jump()}
            title={new Date(msg.timestamp).toLocaleString()}
            {...handle}
        >
            <div className={cl("pin-icon", "pin-icon-round")}><img src={avatar} alt="" /></div>
            <div className={cl("row-text")}>
                <div className={cl("mention-head")}>
                    <span className={cl("row-title")}>{msg.authorName}</span>
                    <span className={cl("time")}>{moment(msg.timestamp).format("D MMM")}</span>
                </div>
                <div className={cl("row-subtitle")}>{where}</div>
                {msg.content && <RichText text={msg.content} className={cl("mention-content", "pin-message-content")} />}
            </div>
            <button
                className={cl("icon-button", "row-action")}
                title="Retirer"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); togglePin("message", pin.id); }}
            >
                ×
            </button>
        </div>
    );
}

function MessagesView() {
    const messages = useHub(d => d.pins.filter(p => p.type === "message"));

    return (
        <div className={cl("list")}>
            {messages.length === 0 && (
                <div className={cl("empty")}>
                    Aucun message épinglé. Fais un clic droit sur un message, puis « Épingler dans le panneau ».
                </div>
            )}
            <Sortable
                className={cl("group-pins", "message-pins")}
                items={messages}
                getKey={p => p.id}
                onMove={moveMessage}
                renderItem={(pin, handle) => <MessagePinRow pin={pin} handle={handle} />}
            />
        </div>
    );
}

export const MessagesFeature: PanelFeature = {
    id: "messages",
    defaultName: "Message Épinglé",
    compact: true,
    addToExistingTabs: true,
    render: MessagesView
};
