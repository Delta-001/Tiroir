/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot } from "@webpack/common";
import type { Root } from "react-dom/client";

import { Panel } from "./components/Panel";
import { closeDiscordSidebars, reopenDiscordSidebars } from "./layout";
import { getHub, subscribeHub, updateHub } from "./store";
import { cl } from "./utils";

/*
 * Le panneau vit dans un seul élément DOM, monté une fois avec sa propre racine React.
 * Quand Discord reconstruit la vue d'un salon, on déplace cet élément au lieu de le recréer :
 * l'état (onglet, défilement, saisie en cours) persiste ainsi d'un salon à l'autre.
 *
 * Il se place à côté de la zone de messages (chatContent) et masque les autres enfants
 * de ce conteneur : la liste des membres ou le profil en message privé.
 */

const DEFAULT_WIDTH = 264;
const ANIMATION_MS = 220;
const HIDDEN_ATTR = "data-vc-hub-hidden";

type State = "closed" | "opening" | "open" | "closing";

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let observer: MutationObserver | null = null;
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let state: State = "closed";
let width = DEFAULT_WIDTH;
const hidden = new Set<HTMLElement>();

/** Colonne principale à côté de laquelle se place le panneau : la zone de messages, ou la liste de la page Amis */
const MAIN_COLUMN = ["chatContent_", "peopleColumn_"].map(c => `[class^="${c}"], [class*=" ${c}"]`).join(", ");
const findChatContent = () => document.querySelector<HTMLElement>(MAIN_COLUMN);

function render() {
    root?.render(
        <ErrorBoundary message="Le panneau a planté.">
            <Panel visible={state !== "closed"} />
        </ErrorBoundary>
    );
}

function setState(next: State) {
    state = next;
    host!.dataset.state = next;
    render();
}

/** Reprend le fond et la bordure de la barre native, pour suivre aussi les thèmes personnalisés */
function copyLook(el: HTMLElement) {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage === "none" && cs.backgroundColor === "rgba(0, 0, 0, 0)") return;
    host!.style.backgroundColor = cs.backgroundColor;
    host!.style.backgroundImage = cs.backgroundImage;
    host!.style.borderLeft = cs.borderLeftWidth === "0px" ? "none" : cs.borderLeft;
}

/** Place le panneau dans la vue actuelle et masque la barre latérale native. Renvoie true si une barre a été masquée. */
function place(): boolean {
    if (!host) return false;

    // Dans un salon vocal, la discussion s'ouvre dans une colonne à droite : on ne s'y insère pas,
    // le panneau flotte alors par-dessus toute cette colonne
    const found = findChatContent();
    const chat = found && found.getBoundingClientRect().left < window.innerWidth / 2 ? found : null;
    const parent = chat?.parentElement;
    let replaced = false;

    if (parent) {
        // Discord peut réinsérer la zone de messages après le panneau : on le remet à droite
        const misplaced = host.compareDocumentPosition(chat!) & Node.DOCUMENT_POSITION_FOLLOWING;
        if (host.parentElement !== parent || misplaced) parent.appendChild(host);
        host.classList.remove(cl("floating"));

        for (const el of parent.children) {
            if (el === chat || el === host || !(el instanceof HTMLElement) || hidden.has(el)) continue;
            const w = el.getBoundingClientRect().width;
            if (w >= 120) width = Math.round(w);
            if (w > 0) replaced = true;
            copyLook(el);
            el.setAttribute(HIDDEN_ATTR, "");
            hidden.add(el);
        }
    } else {
        // Pas de zone de messages principale (vocal, accueil d'un forum…) : panneau flottant à droite
        restoreSidebars(false);
        const appMount = document.getElementById("app-mount") ?? document.body;
        if (host.parentElement !== appMount) appMount.appendChild(host);
        host.classList.add(cl("floating"));
        const bar = document.querySelector("." + cl("titlebar-button"))?.closest("[class*='bar_'], [class*='titleBar']");
        host.style.setProperty("--vc-hub-top", `${Math.round(bar?.getBoundingClientRect().bottom ?? 0)}px`);
    }

    // Nettoie les éléments que Discord a retirés entre-temps
    for (const el of hidden) if (!el.isConnected) hidden.delete(el);

    host.style.setProperty("--vc-hub-width", `${getHub().panelWidth ?? width}px`);
    return replaced;
}

function restoreSidebars(animate: boolean) {
    for (const el of hidden) {
        el.removeAttribute(HIDDEN_ATTR);
        if (animate) {
            el.classList.add(cl("reveal"));
            setTimeout(() => el.classList.remove(cl("reveal")), ANIMATION_MS);
        }
    }
    hidden.clear();
}

function open() {
    if (!host || state === "open" || state === "opening") return;
    clearTimeout(timer);

    // Mesure et masque la barre native, puis la ferme pour de vrai (membres, discussion du vocal)
    const replaced = place();
    closeDiscordSidebars();
    // Sans barre native à remplacer, le panneau s'élargit depuis 0 ; sinon il prend sa place en fondu
    host.dataset.grow = String(!replaced && !host.classList.contains(cl("floating")));
    setState("opening");

    // Force le calcul de l'état de départ, pour que la transition vers « open » soit jouée
    void host.offsetWidth;
    setState("open");
}

function close() {
    if (!host || state === "closed" || state === "closing") return;
    clearTimeout(timer);

    host.dataset.grow = String(hidden.size === 0 && !host.classList.contains(cl("floating")));
    setState("closing");

    timer = setTimeout(() => {
        if (state !== "closing") return;
        setState("closed");
        host!.remove();
        restoreSidebars(true);
        reopenDiscordSidebars();
    }, ANIMATION_MS);
}

function sync() {
    if (getHub().open) open();
    else close();
}

/**
 * La liste déroulante de la recherche de Discord (filtres, historique) s'ouvre sous la barre de
 * recherche, par-dessus le panneau. On la décale vers la gauche pour qu'elle s'arrête au bord
 * du panneau. Seules les fenêtres ancrées juste sous la barre de recherche sont concernées.
 */
function avoidSearchPopout() {
    if (!host?.isConnected) return;
    const bar = document.querySelector('[class^="searchBar_"], [class*=" searchBar_"]');
    if (!bar) return;
    const barBottom = bar.getBoundingClientRect().bottom;
    const panelLeft = host.getBoundingClientRect().left;

    for (const layer of document.querySelectorAll<HTMLElement>('[class^="layer_"], [class*=" layer_"]')) {
        const shift = Number(layer.dataset.vcHubShift ?? 0);
        const rect = layer.getBoundingClientRect();
        const left = rect.left - shift;
        const right = rect.right - shift;
        if (Math.abs(rect.top - barBottom) > 32 || right <= panelLeft) continue;

        const next = -Math.min(right - panelLeft + 8, left - 8);
        if (next === shift) continue;
        layer.dataset.vcHubShift = String(next);
        layer.style.transform = `translateX(${next}px)`;
    }
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 720;

/** Redimensionnement en tirant le bord gauche du panneau ; la largeur est mémorisée */
export function startResize(e: PointerEvent) {
    if (!host || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = host.getBoundingClientRect().width;
    let next = startWidth;
    host.classList.add(cl("resizing"));
    document.documentElement.classList.add(cl("resizing-cursor"));

    const onMove = (ev: PointerEvent) => {
        next = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + startX - ev.clientX)));
        host!.style.setProperty("--vc-hub-width", `${next}px`);
    };
    const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        host?.classList.remove(cl("resizing"));
        document.documentElement.classList.remove(cl("resizing-cursor"));
        updateHub(() => ({ panelWidth: next }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
}

/** Double-clic sur le bord : revient à la largeur de la barre remplacée */
export function resetWidth() {
    updateHub(() => ({ panelWidth: undefined }));
    host?.style.setProperty("--vc-hub-width", `${width}px`);
}

export function mountHost() {
    if (host) return;

    host = document.createElement("div");
    host.className = cl("host");
    host.dataset.state = "closed";
    root = createRoot(host);
    render();

    unsubscribe = subscribeHub(sync);

    // Discord reconstruit la vue à chaque changement de salon : on replace le panneau
    // dans la même tâche que la mutation, avant l'affichage, pour éviter tout clignotement
    observer = new MutationObserver(() => {
        if (state === "open" || state === "opening") {
            place();
            avoidSearchPopout();
            // Discord positionne la liste juste après l'avoir insérée : on vérifie à nouveau ensuite
            requestAnimationFrame(avoidSearchPopout);
            setTimeout(avoidSearchPopout, 150);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    sync();
}

export function unmountHost() {
    clearTimeout(timer);
    observer?.disconnect();
    unsubscribe?.();
    restoreSidebars(false);
    root?.unmount();
    host?.remove();
    host = root = observer = unsubscribe = null;
    state = "closed";
}
