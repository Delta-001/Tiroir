import { createThemedStyleSheet, semanticColors } from "./discord";

/** Couleur du thème Discord, avec une valeur de secours si le jeton disparaît dans une mise à jour */
const c = (name: string, fallback: string) => semanticColors[name] ?? fallback;

export const colors = {
    text: c("TEXT_DEFAULT", "#dbdee1"),
    strong: c("TEXT_STRONG", "#f2f3f5"),
    muted: c("TEXT_MUTED", "#949ba4"),
    link: c("TEXT_LINK", "#00a8fc"),
    mentionBg: c("MENTION_BACKGROUND", "rgba(88,101,242,0.3)"),
    mentionFg: c("MENTION_FOREGROUND", "#c9cdfb"),
    surface: c("BACKGROUND_SURFACE_HIGH", "#2b2d31"),
    base: c("BACKGROUND_BASE_LOWER", "#1e1f22"),
    subtle: c("BACKGROUND_MOD_SUBTLE", "rgba(78,80,88,0.3)"),
    selected: c("INTERACTIVE_BACKGROUND_SELECTED", "rgba(78,80,88,0.6)"),
    border: c("BORDER_SUBTLE", "rgba(78,80,88,0.48)"),
    icon: c("INTERACTIVE_ICON_DEFAULT", "#b5bac1"),
    iconActive: c("INTERACTIVE_ICON_ACTIVE", "#ffffff"),
    danger: c("ICON_FEEDBACK_CRITICAL", "#f23f43"),
    brand: c("ICON_BRAND", "#5865f2")
};

export const styles = createThemedStyleSheet({
    header: { flexDirection: "row", alignItems: "center", gap: 6, height: 52, marginBottom: 4 },
    segmented: { flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: colors.surface },
    segment: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flexDirection: "row", alignItems: "center" },
    segmentActive: { backgroundColor: colors.selected },
    segmentText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
    segmentTextActive: { color: colors.strong },
    segmentBadge: { marginLeft: 5, minWidth: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.danger },
    segmentBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center" },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    iconButtonText: { color: colors.icon, fontSize: 20, lineHeight: 22 },

    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
    rowPressed: { backgroundColor: colors.subtle },
    rowSelected: { backgroundColor: colors.selected },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
    rowTitleUnread: { color: colors.strong, fontWeight: "700" },
    rowSubtitle: { color: colors.muted, fontSize: 12, marginTop: 1 },
    rowAction: { paddingHorizontal: 8, paddingVertical: 4 },
    rowActionText: { color: colors.muted, fontSize: 18 },
    badge: { minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.danger },
    badgeText: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center" },

    icon: { width: 34, height: 34, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    iconRound: { borderRadius: 17 },
    iconImage: { width: "100%", height: "100%" },
    iconText: { color: colors.muted, fontSize: 16, fontWeight: "600" },

    groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4, marginTop: 6 },
    groupChevron: { color: colors.muted, fontSize: 11, width: 12 },
    groupIcon: { width: 20, height: 20, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    groupName: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
    groupNameUnread: { color: colors.strong },
    groupPins: { paddingLeft: 10 },

    ghostButton: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 6 },
    ghostButtonText: { color: colors.muted, fontSize: 14 },
    empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: 24, paddingHorizontal: 12, lineHeight: 20 },

    toolbar: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    filter: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    filterActive: { backgroundColor: colors.selected, borderColor: "transparent" },
    filterText: { color: colors.muted, fontSize: 12 },
    filterTextActive: { color: colors.strong },
    chip: { paddingHorizontal: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.brand },
    chipText: { color: colors.brand, fontSize: 10, fontWeight: "700" },
    chipMuted: { borderColor: colors.muted },
    chipMutedText: { color: colors.muted },
    time: { color: colors.muted, fontSize: 11, marginLeft: "auto" },
    content: { color: colors.text, fontSize: 14, marginTop: 3, lineHeight: 19 },
    unseen: { borderLeftWidth: 2, borderLeftColor: colors.brand },

    noteInput: { color: colors.text, fontSize: 15, lineHeight: 21, minHeight: 220, textAlignVertical: "top", padding: 12, borderRadius: 10, backgroundColor: colors.surface },
    noteText: { color: colors.text, fontSize: 15, lineHeight: 21, padding: 12, minHeight: 220 },
    code: { color: colors.text, backgroundColor: colors.surface },
    mention: { color: colors.mentionFg, backgroundColor: colors.mentionBg, fontWeight: "600" },
    link: { color: colors.link },
    highlight: { backgroundColor: "rgba(250, 166, 26, 0.45)", color: colors.strong },
    searchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, borderRadius: 10, backgroundColor: colors.surface },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 4 },
    searchCount: { color: colors.muted, fontSize: 12 },

    hubButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginVertical: 6, backgroundColor: colors.surface },
    hubButtonActive: { backgroundColor: colors.brand },
    hubDot: { position: "absolute", top: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.base }
});
