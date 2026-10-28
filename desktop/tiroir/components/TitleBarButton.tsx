/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useUnseenMentions } from "../features/mentions";
import { togglePanel, useHub } from "../store";
import { cl } from "../utils";

export function TitleBarButton() {
    const open = useHub(d => d.open);
    const unseen = useUnseenMentions();

    return (
        <button
            className={cl("titlebar-button", open && "titlebar-button-active")}
            onClick={togglePanel}
            aria-label="Tiroir"
            aria-pressed={open}
            title={unseen > 0 ? `Tiroir · ${unseen} nouvelle(s) notification(s)` : "Tiroir"}
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M15 4v16" stroke="currentColor" strokeWidth="2" />
                <path d="M17.5 8.5h1M17.5 11.5h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {unseen > 0 && !open && <span className={cl("titlebar-dot")} />}
        </button>
    );
}
