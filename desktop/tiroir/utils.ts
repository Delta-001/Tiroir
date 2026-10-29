/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";

export const cl = classNameFactory("vc-hub-");

/** Molette verticale → défilement horizontal (souris sans défilement latéral, sous Windows notamment) */
export function scrollHorizontally(e: { deltaX: number; deltaY: number; currentTarget: HTMLElement; }) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
}
