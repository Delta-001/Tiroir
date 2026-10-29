/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, useEffect, useRef, useState } from "@webpack/common";
import type { ClipboardEvent, KeyboardEvent } from "react";

import { countMatches, RichText } from "../components/RichText";
import { addImage, getImage, IMAGE_TOKEN_RE } from "../images";
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

/** Texte de note → nœuds de l'éditeur : les repères [img:id] deviennent de vraies images */
function toNodes(text: string): Node[] {
    const nodes: Node[] = [];
    let last = 0;
    for (const m of text.matchAll(IMAGE_TOKEN_RE)) {
        if (m.index! > last) nodes.push(document.createTextNode(text.slice(last, m.index)));
        nodes.push(imageNode(m[1]));
        last = m.index! + m[0].length;
    }
    if (last < text.length || !nodes.length) nodes.push(document.createTextNode(text.slice(last)));
    return nodes;
}

function imageNode(id: string) {
    const img = document.createElement("img");
    img.src = getImage(id) ?? "";
    img.dataset.imageId = id;
    img.className = cl("note-image", "note-image-editing");
    img.contentEditable = "false";
    return img;
}

/** Nœuds de l'éditeur → texte de note : chaque image redevient son repère [img:id] */
function serialize(root: Node): string {
    let out = "";
    root.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
        else if (node instanceof HTMLImageElement && node.dataset.imageId) out += `[img:${node.dataset.imageId}]`;
        else if (node instanceof HTMLBRElement) out += "\n";
        else if (node instanceof HTMLElement) out += (out && !out.endsWith("\n") && node.tagName === "DIV" ? "\n" : "") + serialize(node);
    });
    return out;
}

/** Insère des nœuds à l'emplacement du curseur et place le curseur après eux */
function insertAtCaret(root: HTMLElement, nodes: Node[]) {
    const selection = getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !root.contains(range.startContainer)) {
        range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
    }
    range.deleteContents();
    for (const node of nodes) {
        range.insertNode(node);
        range.setStartAfter(node);
    }
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
}

/** Éditeur de note : texte brut et vraies images (collées avec Cmd/Ctrl+V, supprimées avec Retour arrière) */
function NoteEditor({ text, onChange, onDone, onKeyDown }: { text: string; onChange(v: string): void; onDone(): void; onKeyDown(e: KeyboardEvent): void; }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = ref.current!;
        root.replaceChildren(...toNodes(text));
        root.focus();
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
    }, []);

    const sync = () => onChange(serialize(ref.current!));

    const onPaste = async (e: ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files = [...e.clipboardData.items].filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean) as File[];
        if (!files.length) {
            // Texte seul, sans la mise en forme de la source
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            return;
        }
        try {
            const tokens = await Promise.all(files.map(addImage));
            const ids = tokens.map(t => t.slice(5, -1));
            insertAtCaret(ref.current!, ids.flatMap(id => [imageNode(id), document.createTextNode("\n")]));
            sync();
        } catch {
            showToast({ text: "Impossible d'ajouter cette image", variant: "critical" });
        }
    };

    return (
        <div
            ref={ref}
            className={cl("note-editor", "note-rich-editor")}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            data-placeholder="Écris ta note… (Cmd/Ctrl+V pour coller une image)"
            onInput={sync}
            onPaste={onPaste}
            onBlur={() => { sync(); onDone(); }}
            onKeyDown={e => {
                if (e.key === "Escape") e.currentTarget.blur();
                // Entrée insère un vrai retour à la ligne (et non un bloc <div>)
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    document.execCommand("insertText", false, "\n");
                }
                onKeyDown(e);
            }}
        />
    );
}

function NoteView({ tab }: { tab: Tab; }) {
    const text = useHub(d => d.notes[tab.id] ?? "");
    const [editing, setEditing] = useState(false);
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState("");
    const [current, setCurrent] = useState(0);
    const preview = useRef<HTMLDivElement>(null);
    const count = searching ? countMatches(text, query) : 0;

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
        return <NoteEditor text={text} onChange={setText} onDone={() => setEditing(false)} onKeyDown={onKeyDown} />;
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
