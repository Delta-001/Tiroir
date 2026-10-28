/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, useEffect, useRef, useState } from "@webpack/common";
import type { ClipboardEvent, KeyboardEvent } from "react";

import { countMatches, RichText } from "../components/RichText";
import { addImage } from "../images";
import { getHub, Tab, updateHub, useHub } from "../store";
import { cl } from "../utils";
import type { PanelFeature } from ".";

/** Ajoute du texte à la fin d'une note, sur une nouvelle ligne si elle n'est pas vide */
export function appendToNote(tabId: string, text: string) {
    const current = getHub().notes[tabId] ?? "";
    const separator = current && !current.endsWith("\n") ? "\n" : "";
    updateHub(d => ({ notes: { ...d.notes, [tabId]: current + separator + text } }));
}

function SearchBar({ query, setQuery, count, current, onStep, onClose }: {
    query: string; setQuery(q: string): void; count: number; current: number; onStep(delta: number): void; onClose(): void;
}) {
    return (
        <div className={cl("note-search")}>
            <input
                autoFocus
                className={cl("note-search-input")}
                placeholder="Rechercher dans la note"
                value={query}
                onChange={e => setQuery(e.currentTarget.value)}
                onKeyDown={e => {
                    if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
                    if (e.key === "Escape") onClose();
                }}
            />
            {query && <span className={cl("note-search-count")}>{count ? `${current + 1}/${count}` : "0"}</span>}
            <button className={cl("icon-button", "small-icon-button")} title="Précédent (Maj+Entrée)" disabled={!count} onClick={() => onStep(-1)}>↑</button>
            <button className={cl("icon-button", "small-icon-button")} title="Suivant (Entrée)" disabled={!count} onClick={() => onStep(1)}>↓</button>
            <button className={cl("icon-button", "small-icon-button")} title="Fermer (Échap)" onClick={onClose}>×</button>
        </div>
    );
}

function NoteView({ tab }: { tab: Tab; }) {
    const text = useHub(d => d.notes[tab.id] ?? "");
    const [editing, setEditing] = useState(false);
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState("");
    const [current, setCurrent] = useState(0);
    const ref = useRef<HTMLTextAreaElement>(null);
    const preview = useRef<HTMLDivElement>(null);
    const count = searching ? countMatches(text, query) : 0;

    useEffect(() => {
        if (!editing || !ref.current) return;
        ref.current.focus();
        ref.current.setSelectionRange(text.length, text.length);
    }, [editing]);

    // Met en évidence le résultat courant et le fait défiler à l'écran
    useEffect(() => {
        const marks = preview.current?.querySelectorAll("." + cl("highlight"));
        marks?.forEach((m, i) => m.classList.toggle(cl("highlight-current"), i === current));
        marks?.[current]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [current, query, text, searching, editing]);

    useEffect(() => setCurrent(0), [query]);

    const setText = (value: string) => updateHub(d => ({ notes: { ...d.notes, [tab.id]: value } }));
    const step = (delta: number) => count && setCurrent(c => (c + delta + count) % count);
    const openSearch = () => { setEditing(false); setSearching(true); };
    const closeSearch = () => { setSearching(false); setQuery(""); };

    // Coller une image : elle est enregistrée, et son repère inséré à l'emplacement du curseur
    const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = [...e.clipboardData.items].filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean) as File[];
        if (!files.length) return;
        e.preventDefault();
        const area = e.currentTarget;
        const { selectionStart, selectionEnd } = area;
        try {
            const tokens = await Promise.all(files.map(addImage));
            const insert = (selectionStart > 0 && text[selectionStart - 1] !== "\n" ? "\n" : "") + tokens.join("\n") + "\n";
            const next = text.slice(0, selectionStart) + insert + text.slice(selectionEnd);
            setText(next);
            requestAnimationFrame(() => area.setSelectionRange(selectionStart + insert.length, selectionStart + insert.length));
        } catch {
            showToast({ text: "Impossible d'ajouter cette image", variant: "critical" });
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            e.stopPropagation();
            openSearch();
        }
    };

    const toolbar = !editing && !searching && text.trim() && (
        <button className={cl("icon-button", "small-icon-button", "note-search-button")} title="Rechercher dans la note (Cmd/Ctrl+F)" onClick={openSearch}>🔍</button>
    );

    if (editing) {
        return (
            <textarea
                ref={ref}
                className={cl("note-editor")}
                value={text}
                spellCheck
                placeholder="Écris ta note… (Cmd/Ctrl+V pour coller une image)"
                onChange={e => setText(e.currentTarget.value)}
                onPaste={onPaste}
                onBlur={() => setEditing(false)}
                onKeyDown={e => {
                    if (e.key === "Escape") e.currentTarget.blur();
                    onKeyDown(e);
                }}
            />
        );
    }

    return (
        <div className={cl("note-wrap")} tabIndex={-1} onKeyDown={onKeyDown}>
            {searching && <SearchBar query={query} setQuery={setQuery} count={count} current={current} onStep={step} onClose={closeSearch} />}
            {toolbar}
            <div ref={preview} className={cl("note")} onClick={e => (e.target as HTMLElement).closest("a, ." + cl("mention")) || setEditing(true)}>
                {text.trim()
                    ? <RichText text={text} className={cl("note-text")} query={searching ? query : undefined} />
                    : (
                        <div className={cl("empty")}>
                            Clique pour écrire.
                            <br /><br />
                            <code>{"<@ID>"}</code> affiche le pseudo, <code>{"<#ID>"}</code> le salon, <code>{"<@&ID>"}</code> le rôle.
                            <br />
                            Colle une image avec Cmd/Ctrl+V pendant l'écriture.
                        </div>
                    )}
            </div>
        </div>
    );
}

export const NoteFeature: PanelFeature = {
    id: "note",
    defaultName: "Note",
    multiple: true,
    render: NoteView,
    onCreate: tab => updateHub(d => ({ notes: { ...d.notes, [tab.id]: "" } })),
    onRemove: tab => updateHub(d => {
        const { [tab.id]: _, ...notes } = d.notes;
        return { notes };
    })
};
