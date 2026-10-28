/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelRTCStore, ChannelSectionStore, ChannelStore, FluxDispatcher, SelectedChannelStore } from "@webpack/common";

/*
 * À l'ouverture du panneau, on ferme la liste des membres et la discussion du salon vocal
 * avec les mêmes actions que les boutons de Discord, et on les rouvre à la fermeture.
 */

let closed: { members?: boolean; voiceChat?: string; } = {};

const toggleMembers = () => FluxDispatcher.dispatch({ type: "CHANNEL_TOGGLE_MEMBERS_SECTION" });
const setVoiceChat = (channelId: string, chatOpen: boolean) => FluxDispatcher.dispatch({ type: "CHANNEL_RTC_UPDATE_CHAT_OPEN", channelId, chatOpen });

const membersShown = (channelId: string) => String(ChannelSectionStore.getSection(channelId)) === "MEMBERS";

export function closeDiscordSidebars() {
    closed = {};
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    try {
        if (ChannelRTCStore.getChatOpen(channelId)) {
            setVoiceChat(channelId, false);
            closed.voiceChat = channelId;
        }
    } catch { }

    try {
        const channel = ChannelStore.getChannel(channelId);
        if (channel && !channel.isPrivate() && membersShown(channelId)) {
            toggleMembers();
            closed.members = true;
        }
    } catch { }
}

export function reopenDiscordSidebars() {
    const { members, voiceChat } = closed;
    closed = {};
    const channelId = SelectedChannelStore.getChannelId();

    try {
        if (members && channelId && !membersShown(channelId)) toggleMembers();
    } catch { }

    try {
        if (voiceChat && channelId === voiceChat) setVoiceChat(voiceChat, true);
    } catch { }
}
