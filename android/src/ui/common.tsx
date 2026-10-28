import { React, RN } from "../discord";
import { styles } from "../theme";

export const avatarUrl = (userId: string, avatar?: string) => avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;

export const guildIconUrl = (guild: any) => guild?.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : undefined;

export const acronym = (name = "") => name.replace(/'s /g, " ").replace(/\w+/g, w => w[0]).replace(/\s/g, "").slice(0, 3);

/** Ligne de liste pressable, au style des listes Discord */
export function Row({ onPress, onLongPress, onPressOut, selected, style, children }: any) {
    return (
        <RN.Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            onPressOut={onPressOut}
            delayLongPress={300}
            style={({ pressed }: any) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed, style]}
        >
            {children}
        </RN.Pressable>
    );
}

/** Petit bouton d'action en bout de ligne (×) */
export function RowAction({ label = "×", onPress, accessibilityLabel }: { label?: string; onPress(): void; accessibilityLabel?: string; }) {
    return (
        <RN.Pressable hitSlop={8} onPress={onPress} style={styles.rowAction} accessibilityLabel={accessibilityLabel}>
            <RN.Text style={styles.rowActionText}>{label}</RN.Text>
        </RN.Pressable>
    );
}

export function Badge({ count }: { count: number; }) {
    if (count <= 0) return null;
    return (
        <RN.View style={styles.badge}>
            <RN.Text style={styles.badgeText}>{count > 99 ? "99+" : count}</RN.Text>
        </RN.View>
    );
}

export function Empty({ children }: any) {
    return <RN.Text style={styles.empty}>{children}</RN.Text>;
}
