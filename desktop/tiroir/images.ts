/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useReducer } from "@webpack/common";

import { newId } from "./store";

/*
 * Images collées dans les notes. Elles sont stockées à part des notes (qui sont sauvegardées à
 * chaque frappe) et référencées dans le texte par un repère [img:id].
 */

const IMAGES_KEY = "Tiroir_images";
const LEGACY_IMAGES_KEY = "Hub_images";
const MAX_SIZE = 1280;
export const IMAGE_TOKEN_RE = /\[img:([a-z0-9]+)\]/g;

let images: Record<string, string> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function loadImages() {
    images = (await DataStore.get<Record<string, string>>(IMAGES_KEY)) ?? (await DataStore.get<Record<string, string>>(LEGACY_IMAGES_KEY)) ?? {};
    emit();
}

export function useImage(id: string): string | undefined {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, []);
    return images[id];
}

/** Réduit l'image (1280 px max) et la convertit en WebP, pour garder un stockage léger */
async function compress(file: Blob): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/webp", 0.85);
}

/** Enregistre une image et renvoie son repère à insérer dans la note */
export async function addImage(file: Blob): Promise<string> {
    const id = newId();
    images = { ...images, [id]: await compress(file) };
    emit();
    await DataStore.set(IMAGES_KEY, images);
    return `[img:${id}]`;
}

/** Supprime les images qui ne sont plus référencées par aucune note */
export async function pruneImages(notes: string[]) {
    const used = new Set(notes.flatMap(n => [...n.matchAll(IMAGE_TOKEN_RE)].map(m => m[1])));
    const kept = Object.fromEntries(Object.entries(images).filter(([id]) => used.has(id)));
    if (Object.keys(kept).length === Object.keys(images).length) return;
    images = kept;
    emit();
    await DataStore.set(IMAGES_KEY, images);
}
