import { React, RN } from "../discord";
import { hub, Tab, useHub } from "../store";
import { styles } from "../theme";
import { countMatches, RichText } from "../ui/RichText";
import type { PanelFeature } from ".";

/** Ajoute du texte à la fin d'une note, sur une nouvelle ligne si elle n'est pas vide */
export function appendToNote(tabId: string, text: string) {
    const current = hub.notes[tabId] ?? "";
    const separator = current && !current.endsWith("\n") ? "\n" : "";
    hub.notes = { ...hub.notes, [tabId]: current + separator + text };
}

function NoteView({ tab }: { tab: Tab; }) {
    const { notes } = useHub();
    const text = notes[tab.id] ?? "";
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(text);
    const [query, setQuery] = React.useState("");
    const matches = countMatches(text, query);

    // Écrit dans le stockage avec un léger délai, pour ne pas sauvegarder à chaque frappe
    React.useEffect(() => {
        if (!editing || draft === text) return;
        const t = setTimeout(() => { hub.notes = { ...hub.notes, [tab.id]: draft }; }, 400);
        return () => clearTimeout(t);
    }, [draft, editing]);

    const stopEditing = () => {
        hub.notes = { ...hub.notes, [tab.id]: draft };
        setEditing(false);
    };

    const searchBar = !!text.trim() && (
        <RN.View style={styles.searchBar}>
            <RN.Text style={styles.searchCount}>🔍</RN.Text>
            <RN.TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Rechercher dans la note"
                placeholderTextColor="#949ba4"
                autoCorrect={false}
            />
            {!!query && <RN.Text style={styles.searchCount}>{matches === 0 ? "aucun résultat" : `${matches} résultat${matches > 1 ? "s" : ""}`}</RN.Text>}
            {!!query && <RN.Text style={styles.searchCount} onPress={() => setQuery("")}>✕</RN.Text>}
        </RN.View>
    );

    if (editing) {
        return (
            <RN.TextInput
                style={styles.noteInput}
                value={draft}
                onChangeText={setDraft}
                onBlur={stopEditing}
                multiline
                autoFocus
                placeholder="Écris ta note…"
                placeholderTextColor="#949ba4"
            />
        );
    }

    return (
        <RN.View>
            {searchBar}
            <RN.Pressable onPress={() => { setDraft(text); setEditing(true); }}>
            {text.trim()
                ? <RichText text={text} style={styles.noteText} query={query} />
                : (
                    <RN.Text style={styles.empty}>
                        Touche pour écrire.{"\n\n"}
                        {"<@ID>"} affiche le pseudo, {"<#ID>"} le salon, {"<@&ID>"} le rôle.
                    </RN.Text>
                )}
            </RN.Pressable>
        </RN.View>
    );
}

export const NoteFeature: PanelFeature = {
    id: "note",
    defaultName: "Note",
    multiple: true,
    render: NoteView,
    onCreate: tab => { hub.notes = { ...hub.notes, [tab.id]: "" }; },
    onRemove: tab => {
        const { [tab.id]: _, ...notes } = hub.notes;
        hub.notes = notes;
    }
};
