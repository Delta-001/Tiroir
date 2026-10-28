import { hideSheet, moment, navigate, React, RN, showToast, Stores, useStores } from "../discord";
import { hub, Pin, PinnedMessage, useHub } from "../store";
import { styles } from "../theme";
import { avatarUrl, Empty, Row, RowAction } from "../ui/common";
import { channelLabel, RichText } from "../ui/RichText";
import { DragHandle, moveItem, Sortable } from "../ui/Sortable";
import type { PanelFeature } from ".";
import { contentOf } from "./mentions";
import { isPinned } from "./pins";

/** Épingle un message (ou le retire s'il l'est déjà) en gardant une copie de son contenu */
export function toggleMessagePin(message: any) {
    if (isPinned("message", message.id)) {
        hub.pins = hub.pins.filter(p => !(p.type === "message" && p.id === message.id));
        showToast("Message retiré du panneau");
        return;
    }
    const author = message.author ?? {};
    const snapshot: PinnedMessage = {
        channelId: message.channel_id,
        guildId: Stores.Channel()?.getChannel(message.channel_id)?.guild_id ?? undefined,
        authorId: author.id,
        authorName: author.globalName ?? author.global_name ?? author.username ?? "?",
        authorAvatar: author.avatar ?? undefined,
        content: contentOf(message),
        timestamp: new Date(message.timestamp).getTime() || Date.now()
    };
    hub.pins = [...hub.pins, { type: "message", id: message.id, message: snapshot }];
    showToast("Message épinglé dans le panneau", "ic_pin");
}

function moveMessage(from: number, to: number) {
    const messages = hub.pins.filter(p => p.type === "message");
    hub.pins = [...hub.pins.filter(p => p.type !== "message"), ...moveItem(messages, from, to)];
}

function MessageRow({ pin, handle }: { pin: Pin; handle: DragHandle; }) {
    const msg = pin.message!;
    const channel = Stores.Channel()?.getChannel(msg.channelId);
    const guild = msg.guildId ? Stores.Guild()?.getGuild(msg.guildId) : undefined;
    const prefix = channel && !channel.isDM?.() && !channel.isGroupDM?.() ? "#" : "";
    const where = [prefix + channelLabel(channel), guild?.name].filter(Boolean).join(" · ");

    const jump = () => {
        hideSheet("tiroir-panel");
        navigate(`/channels/${msg.guildId ?? "@me"}/${msg.channelId}/${pin.id}`);
    };

    return (
        <Row onPress={jump} onLongPress={handle.onLongPress} onPressOut={handle.onPressOut} selected={handle.dragging} style={{ alignItems: "flex-start" }}>
            <RN.Image style={[styles.icon, styles.iconRound]} source={{ uri: avatarUrl(msg.authorId, msg.authorAvatar) }} />
            <RN.View style={styles.rowText}>
                <RN.View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <RN.Text style={[styles.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{msg.authorName}</RN.Text>
                    <RN.Text style={styles.time}>{moment(msg.timestamp).format("D MMM")}</RN.Text>
                </RN.View>
                <RN.Text style={styles.rowSubtitle} numberOfLines={1}>{where}</RN.Text>
                {!!msg.content && <RichText text={msg.content} style={styles.content} numberOfLines={3} />}
            </RN.View>
            <RowAction accessibilityLabel="Retirer" onPress={() => { hub.pins = hub.pins.filter(p => !(p.type === "message" && p.id === pin.id)); }} />
        </Row>
    );
}

function MessagesView() {
    const { pins } = useHub();
    useStores([Stores.Channel, Stores.Guild]);
    const messages = pins.filter(p => p.type === "message");

    return (
        <RN.View>
            {messages.length === 0 && <Empty>Aucun message épinglé. Maintiens un message, puis « Épingler dans le panneau ».</Empty>}
            <Sortable items={messages} getKey={p => p.id} onMove={moveMessage} renderItem={(pin, handle) => <MessageRow pin={pin} handle={handle} />} />
        </RN.View>
    );
}

export const MessagesFeature: PanelFeature = {
    id: "messages",
    defaultName: "Message Épinglé",
    compact: true,
    glyph: "📌",
    render: MessagesView
};
