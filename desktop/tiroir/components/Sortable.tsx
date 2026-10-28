/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useLayoutEffect, useRef } from "@webpack/common";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { cl } from "../utils";

/** Durée d'appui avant que l'élément se détache pour être déplacé */
const HOLD_MS = 280;
/** Au-delà de ce déplacement pendant l'appui, on considère que l'utilisateur fait autre chose (défilement…) */
const MOVE_TOLERANCE = 6;
const EDGE_SCROLL_ZONE = 36;
const EDGE_SCROLL_SPEED = 10;

export interface HandleProps {
    onPointerDown(e: ReactPointerEvent): void;
}

interface SortableProps<T> {
    items: T[];
    getKey(item: T): string;
    onMove(from: number, to: number): void;
    /** handle : à étaler sur l'élément qu'on maintient pour déplacer (la ligne entière, ou un en-tête) */
    renderItem(item: T, handle: HandleProps): ReactNode;
    className?: string;
    /** "y" : liste verticale (par défaut) ; "x" : rangée horizontale, comme les onglets */
    axis?: "x" | "y";
    /** Sélecteur du conteneur qui défile, pour le défilement automatique près des bords */
    scrollerSelector?: string;
}

interface DragState {
    from: number;
    to: number;
    start: number;
    startScroll: number;
    els: HTMLElement[];
    rects: DOMRect[];
    step: number;
    scroller: HTMLElement | null;
}

/** Empêche le clic qui suit un glisser-déposer d'ouvrir l'élément déposé */
function swallowNextClick() {
    const stop = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

/**
 * Liste réordonnable : maintenir un élément le détache, le glisser montre sa future place,
 * le relâcher l'y dépose. Un appui court reste un simple clic.
 */
export function Sortable<T>({ items, getKey, onMove, renderItem, className, axis = "y", scrollerSelector = "." + cl("body") }: SortableProps<T>) {
    const horizontal = axis === "x";
    const posOf = (r: DOMRect) => horizontal ? r.left : r.top;
    const sizeOf = (r: DOMRect) => horizontal ? r.width : r.height;
    const pointerOf = (e: { clientX: number; clientY: number; }) => horizontal ? e.clientX : e.clientY;
    const scrollOf = (el: HTMLElement | null) => el ? horizontal ? el.scrollLeft : el.scrollTop : 0;
    const translate = (px: number) => px ? `translate${horizontal ? "X" : "Y"}(${px}px)` : "";

    const container = useRef<HTMLDivElement>(null);
    const pendingReset = useRef<HTMLElement[] | null>(null);

    // Une fois React a réordonné les éléments, on retire les décalages avant l'affichage
    useLayoutEffect(() => {
        if (!pendingReset.current) return;
        for (const el of pendingReset.current) el.style.transform = "";
        pendingReset.current = null;
    });

    function startPress(index: number, e: ReactPointerEvent) {
        if (e.button !== 0 || !container.current) return;
        // Une liste imbriquée (salons d'un serveur) ne doit pas déclencher la liste parente
        e.stopPropagation();

        const pressed = container.current.children[index] as HTMLElement | undefined;
        if (!pressed) return;

        const { pointerId, clientX: startX, clientY: startY } = e;
        const start = pointerOf(e);
        let drag: DragState | null = null;
        pressed.classList.add(cl("sortable-pressing"));

        const timer = setTimeout(() => {
            const els = [...container.current!.children] as HTMLElement[];
            const rects = els.map(el => el.getBoundingClientRect());
            const gap = rects.length > 1 ? Math.max(0, posOf(rects[1]) - posOf(rects[0]) - sizeOf(rects[0])) : 0;
            const scroller = container.current!.closest<HTMLElement>(scrollerSelector);

            drag = { from: index, to: index, start, startScroll: scrollOf(scroller), els, rects, step: sizeOf(rects[index]) + gap, scroller };
            pressed.classList.remove(cl("sortable-pressing"));
            pressed.classList.add(cl("sortable-dragging"));
            container.current!.classList.add(cl("sortable-active"));
            document.documentElement.classList.add(cl("sorting"));
            try { pressed.setPointerCapture(pointerId); } catch { }
        }, HOLD_MS);

        const onPointerMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            if (!drag) {
                if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOLERANCE) finish(false);
                return;
            }

            // Défilement automatique près des bords
            if (drag.scroller) {
                const box = drag.scroller.getBoundingClientRect();
                const p = pointerOf(ev);
                const delta = p < posOf(box) + EDGE_SCROLL_ZONE ? -EDGE_SCROLL_SPEED
                    : p > posOf(box) + sizeOf(box) - EDGE_SCROLL_ZONE ? EDGE_SCROLL_SPEED
                        : 0;
                if (delta) drag.scroller[horizontal ? "scrollLeft" : "scrollTop"] += delta;
            }

            const scrolled = scrollOf(drag.scroller) - drag.startScroll;
            const offset = pointerOf(ev) - drag.start + scrolled;
            const { from, rects, els, step } = drag;
            const center = posOf(rects[from]) + sizeOf(rects[from]) / 2 + offset;

            let to = from;
            rects.forEach((r, i) => {
                const mid = posOf(r) + sizeOf(r) / 2;
                if (i < from && center < mid) to = Math.min(to, i);
                if (i > from && center > mid) to = Math.max(to, i);
            });
            drag.to = to;

            els.forEach((el, i) => {
                if (i === from) {
                    el.style.transform = translate(offset);
                    return;
                }
                const shift = from < to && i > from && i <= to ? -step
                    : to < from && i >= to && i < from ? step
                        : 0;
                el.style.transform = translate(shift);
            });
        };

        const onPointerUp = (ev: PointerEvent) => ev.pointerId === pointerId && finish(true);
        const onPointerCancel = (ev: PointerEvent) => ev.pointerId === pointerId && finish(false);
        const onKeyDown = (ev: KeyboardEvent) => ev.key === "Escape" && finish(false);

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        window.addEventListener("keydown", onKeyDown);

        function finish(commit: boolean) {
            clearTimeout(timer);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            window.removeEventListener("keydown", onKeyDown);
            pressed!.classList.remove(cl("sortable-pressing"));
            if (!drag) return;

            swallowNextClick();
            pressed!.classList.remove(cl("sortable-dragging"));
            container.current?.classList.remove(cl("sortable-active"));
            document.documentElement.classList.remove(cl("sorting"));

            if (commit && drag.to !== drag.from) {
                // Les décalages restent jusqu'au rendu dans le nouvel ordre, pour éviter un saut
                pendingReset.current = drag.els;
                onMove(drag.from, drag.to);
            } else {
                for (const el of drag.els) el.style.transform = "";
            }
            drag = null;
        }
    }

    return (
        <div ref={container} className={className}>
            {items.map((item, i) => (
                <div key={getKey(item)} className={cl("sortable-item")}>
                    {renderItem(item, { onPointerDown: e => startPress(i, e) })}
                </div>
            ))}
        </div>
    );
}

/** Déplace un élément d'un tableau, sans modifier l'original */
export function moveItem<T>(array: T[], from: number, to: number): T[] {
    const copy = [...array];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
}
