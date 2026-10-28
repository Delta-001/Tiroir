/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";

// Tracés au trait (24×24), dans l'esprit des icônes de Discord
const PATHS: Partial<Record<ChannelType, string>> = {
    [ChannelType.GUILD_TEXT]: "M10 3 8 21M16 3l-2 18M4 8h17M3 16h17",
    [ChannelType.GUILD_ANNOUNCEMENT]: "M3 10v4a1 1 0 0 0 1 1h2l6 4V5L6 9H4a1 1 0 0 0-1 1zM16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12",
    [ChannelType.GUILD_VOICE]: "M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
    [ChannelType.GUILD_STAGE_VOICE]: "M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8",
    [ChannelType.GUILD_CATEGORY]: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    [ChannelType.GUILD_FORUM]: "M4 4h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-4 3V5a1 1 0 0 1 1-1zM19 8h1a1 1 0 0 1 1 1v11l-3-2h-7a1 1 0 0 1-1-1v-1",
    [ChannelType.GUILD_MEDIA]: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 10.5a1.5 1.5 0 1 0 0-.01M21 16l-5-5-9 9",
    [ChannelType.PUBLIC_THREAD]: "M5 4v8a4 4 0 0 0 4 4h10M15 12l4 4-4 4",
    [ChannelType.GROUP_DM]: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M18 14a5 5 0 0 1 3 4.5"
};

const LABELS: Partial<Record<ChannelType, string>> = {
    [ChannelType.GUILD_TEXT]: "Salon textuel",
    [ChannelType.GUILD_ANNOUNCEMENT]: "Salon d'annonces",
    [ChannelType.GUILD_VOICE]: "Salon vocal",
    [ChannelType.GUILD_STAGE_VOICE]: "Salon de conférence",
    [ChannelType.GUILD_CATEGORY]: "Catégorie",
    [ChannelType.GUILD_FORUM]: "Forum",
    [ChannelType.GUILD_MEDIA]: "Salon média",
    [ChannelType.PUBLIC_THREAD]: "Fil",
    [ChannelType.GROUP_DM]: "Groupe"
};

/** Les fils d'annonce et privés partagent l'icône des fils publics */
function normalize(type: ChannelType | undefined): ChannelType {
    if (type === ChannelType.ANNOUNCEMENT_THREAD || type === ChannelType.PRIVATE_THREAD) return ChannelType.PUBLIC_THREAD;
    return type ?? ChannelType.GUILD_TEXT;
}

export const channelTypeLabel = (channel: Channel | undefined) => LABELS[normalize(channel?.type)] ?? "Salon";

export function ChannelIcon({ channel, size = 18 }: { channel: Channel | undefined; size?: number; }) {
    const d = PATHS[normalize(channel?.type)] ?? PATHS[ChannelType.GUILD_TEXT];

    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={channelTypeLabel(channel)}>
            <path d={d} />
        </svg>
    );
}
