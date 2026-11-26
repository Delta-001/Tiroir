/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelRTCStore, ChannelSectionStore, ChannelStore, ComponentDispatch, FluxDispatcher, SelectedChannelStore } from "@webpack/common";

/*
 * À l'ouverture du panneau, on ferme la liste des membres et la discussion du salon vocal
 * avec les mêmes actions que les boutons de Discord, et on les rouvre à la fermeture.
 */

let closed: { members?: boolean; voiceChat?: string; } = {};

const toggleMembers = () => FluxDispatcher.dispatch({ type: "CHANNEL_TOGGLE_MEMBERS_SECTION" });
const setVoiceChat = (channelId: string, chatOpen: boolean) => FluxDispatcher.dispatch({ type: "CHANNEL_RTC_UPDATE_CHAT_OPEN", channelId, chatOpen });

const membersShown = (channelId: string) => String(ChannelSectionStore.getSection(channelId)) === "MEMBERS";

/** La colonne des résultats de recherche de Discord est affichée (elle prend la place du panneau) */
export const searchResultsShown = () => String(ChannelSectionStore.getSection(SelectedChannelStore.getChannelId())) === "SEARCH";

/** Ferme les résultats de recherche, comme la touche Échap */
export const closeSearchResults = () => ComponentDispatch.dispatch("SEARCH_RESULTS_CLOSE");

// (pas de remise à zéro : le panneau peut s'ouvrir plusieurs fois avant de vraiment se fermer,
// par exemple quand il laisse la place aux résultats de recherche puis revient)
export function closeDiscordSidebars() {
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
