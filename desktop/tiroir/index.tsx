/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Delta-001
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Channel, Guild, Message, User } from "@vencord/discord-types";
import { ChannelStore, Menu, showToast } from "@webpack/common";

import { addTab } from "./components/SegmentedControl";
import { TitleBarButton } from "./components/TitleBarButton";
import { addNewFeatureTabs, getTabName } from "./features";
import { addMentions, toMentionEntry } from "./features/mentions";
import { toggleMessagePin } from "./features/messages";
import { appendToNote } from "./features/notes";
import { isPinned, togglePin } from "./features/pins";
import { mountHost, unmountHost } from "./host";
import { loadImages, pruneImages } from "./images";
import { flushHub, getHub, isHubLoaded, loadHub, Pin, Tab } from "./store";

function pinItem(type: Pin["type"], id: string) {
    return (
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-hub-pin"
                label={isPinned(type, id) ? "Retirer du panneau" : "Épingler dans le panneau"}
                action={() => togglePin(type, id)}
            />
        </Menu.MenuGroup>
    );
}

const channelMenu: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (channel) children.push(pinItem("channel", channel.id));
};

const guildMenu: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (guild) children.push(pinItem("guild", guild.id));
};

const messageMenu: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!message) return;
    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-hub-pin-message"
                label={isPinned("message", message.id) ? "Retirer du panneau" : "Épingler dans le panneau"}
                action={() => toggleMessagePin(message)}
            />
        </Menu.MenuGroup>
    );
};

function addUserToNote(user: User, tab: Tab | undefined) {
    if (!tab) return;
    appendToNote(tab.id, `<@${user.id}>`);
    showToast({ text: `${user.globalName ?? user.username} ajouté à « ${getTabName(tab)} »` });
}

const userMenu: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    const dmId = ChannelStore.getDMFromUserId(user.id);
    const notes = getHub().tabs.filter(t => t.featureId === "note");

    children.push(
        <Menu.MenuGroup>
            {dmId && (
                <Menu.MenuItem
                    id="vc-hub-pin"
                    label={isPinned("channel", dmId) ? "Retirer les MP du panneau" : "Épingler les MP dans le panneau"}
                    action={() => togglePin("channel", dmId)}
                />
            )}
            <Menu.MenuItem id="vc-hub-note" label="Épingler dans une note">
                {notes.map(tab => (
                    <Menu.MenuItem key={tab.id} id={"vc-hub-note-" + tab.id} label={getTabName(tab)} action={() => addUserToNote(user, tab)} />
                ))}
                {notes.length > 0 && <Menu.MenuSeparator />}
                <Menu.MenuItem id="vc-hub-note-new" label="Nouvelle note" action={() => addUserToNote(user, addTab("note"))} />
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "Tiroir",
    description: "Bouton en haut à gauche qui ouvre un panneau à droite : salons épinglés, mentions reçues et notes.",
    authors: [{ name: "Delta-001", id: 0n }],

    patches: [
        {
            // Barre de titre de l'application : on ajoute le bouton au début de la zone de gauche
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=leading:\(0,\i\.jsxs\)\(\i\.Fragment,\{children:\[)/,
                replace: "$self.renderTitleBarButton(),"
            }
        }
    ],

    contextMenus: {
        "channel-context": channelMenu,
        "thread-context": channelMenu,
        "gdm-context": channelMenu,
        "guild-context": guildMenu,
        "user-context": userMenu,
        "message": messageMenu
    },

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic || !isHubLoaded()) return;
            const entry = toMentionEntry(message);
            if (entry) addMentions([entry]);
        }
    },

    renderTitleBarButton: ErrorBoundary.wrap(TitleBarButton, { noop: true }),

    async start() {
        await loadHub();
        await loadImages();
        // Libère les images retirées des notes depuis le dernier démarrage
        pruneImages(Object.values(getHub().notes));
        addNewFeatureTabs();
        mountHost();
        // Sauvegarde immédiate si Discord se recharge ou se ferme pendant le délai d'écriture
        window.addEventListener("beforeunload", flushHub);
    },

    stop() {
        window.removeEventListener("beforeunload", flushHub);
        flushHub();
        unmountHost();
    }
});
