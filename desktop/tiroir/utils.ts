/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { useEffect } from "@webpack/common";

export const cl = classNameFactory("vc-hub-");

/**
 * Molette verticale → défilement horizontal (souris sans défilement latéral, sous Windows notamment).
 * Écouteur natif non passif : celui de React ne peut pas empêcher le panneau de défiler aussi vers le bas.
 */
export function useHorizontalWheel(ref: { current: HTMLElement | null; }) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            e.preventDefault();
            e.stopPropagation();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);
}
