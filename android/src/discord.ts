/*
 * Adaptateur Discord : le SEUL fichier qui va chercher des modules internes de Discord.
 *
 * Si une mise à jour de Discord casse quelque chose, c'est ici qu'on corrige. Chaque accès est
 * paresseux et protégé : un module introuvable renvoie undefined au lieu de faire planter Tiroir,
 * et la fonctionnalité qui en dépend se désactive seule.
 */

declare const vendetta: any;

export const { React, ReactNative: RN, FluxDispatcher, moment } = vendetta.metro.common;
const { findByProps, findByStoreName, findByName } = vendetta.metro;

export const logger = {
    log: (...a: any[]) => console.log("[Tiroir]", ...a),
    error: (...a: any[]) => console.error("[Tiroir]", ...a)
};

/** Mémorise le résultat d'une recherche ; un échec renvoie undefined et sera retenté plus tard */
function lazy<T>(find: () => T): () => T | undefined {
    let cached: T | undefined;
    return () => {
        if (cached) return cached;
        try {
            cached = find() ?? undefined;
        } catch (e) {
            logger.error("module introuvable", e);
        }
        return cached;
    };
}

// ---------- Stores ----------

const store = (name: string) => lazy(() => findByStoreName(name));
export const Stores = {
    User: store("UserStore"),
    Channel: store("ChannelStore"),
    Guild: store("GuildStore"),
    GuildRole: store("GuildRoleStore"),
    GuildMember: store("GuildMemberStore"),
    ReadState: store("ReadStateStore"),
    UserGuildSettings: store("UserGuildSettingsStore"),
    SelectedChannel: store("SelectedChannelStore"),
    SelectedGuild: store("SelectedGuildStore"),
    Relationship: store("RelationshipStore"),
    GuildChannel: store("GuildChannelStore")
};

/** Relance le rendu quand un des stores Discord change */
export function useStores(stores: (() => any)[]) {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
        const list = stores.map(s => s()).filter(Boolean);
        list.forEach((s: any) => s.addChangeListener?.(force));
        return () => list.forEach((s: any) => s.removeChangeListener?.(force));
    }, []);
}

// ---------- Actions ----------

const router = lazy(() => findByProps("transitionToGuild", "transitionTo"));
const sheets = lazy(() => findByProps("openLazy", "hideActionSheet"));
const http = lazy(() => findByProps("getAPIBaseURL", "get"));
const users = lazy(() => findByProps("getUser", "fetchProfile"));
const profiles = lazy(() => findByProps("showUserProfileActionSheet") ?? findByName("showUserProfileActionSheet", false));

export function navigate(path: string) {
    router()?.transitionTo(path);
}

export function navigateToGuild(guildId: string) {
    router()?.transitionToGuild(guildId);
}

export function openSheet(key: string, Component: any, props: any = {}) {
    sheets()?.openLazy(Promise.resolve({ default: Component }), key, props);
}

export function hideSheet(key?: string) {
    if (key) sheets()?.hideActionSheet(key);
    else sheets()?.hideActionSheet();
}

export async function apiGet(url: string, query?: Record<string, unknown>) {
    const api = http();
    if (!api) throw new Error("API REST indisponible");
    return api.get({ url, query });
}

const requestedUsers = new Set<string>();
/** Récupère un utilisateur absent du cache local, une seule fois par id */
export function requestUser(id: string) {
    if (requestedUsers.has(id)) return;
    requestedUsers.add(id);
    users()?.getUser(id)?.catch?.(() => { });
}

export function openUserProfile(userId: string) {
    try {
        const p = profiles();
        (p?.showUserProfileActionSheet ?? p?.default)?.({ userId });
    } catch (e) {
        logger.error("profil", e);
    }
}

/** Marque des salons comme lus jusqu'à un message, comme « Marquer comme lu » */
export function bulkAck(channels: { channelId: string; messageId: string; }[]) {
    if (!channels.length) return;
    FluxDispatcher.dispatch({
        type: "BULK_ACK",
        context: "APP",
        channels: channels.map(c => ({ ...c, readStateType: 0 }))
    });
}

// ---------- Interface ----------

const design = lazy(() => findByProps("ActionSheetRow"));
const sheetModule = lazy(() => findByProps("ActionSheet"));
const scrollModule = lazy(() => findByProps("BottomSheetScrollView"));
const textModule = lazy(() => findByProps("Text", "TextStyleSheet"));

export const UI = {
    ActionSheet: () => sheetModule()?.ActionSheet,
    ActionSheetRow: () => design()?.ActionSheetRow,
    ScrollView: () => scrollModule()?.BottomSheetScrollView ?? RN.ScrollView,
    Text: () => textModule()?.Text
};

export const semanticColors = vendetta.ui.semanticColors;
export const createThemedStyleSheet = vendetta.metro.common.stylesheet.createThemedStyleSheet;
export const getAssetIDByName = (name: string) => vendetta.ui.assets.getAssetIDByName(name);
/** Toast natif d'Android : celui de Revenge plante avec les versions récentes de Discord (ToastContainer) */
export const showToast = (text: string, _icon?: string) => {
    try { RN.ToastAndroid?.show(text, RN.ToastAndroid.SHORT); } catch { }
};
export const { showConfirmationAlert, showInputAlert } = vendetta.ui.alerts;

// ---------- Modules à patcher (menus d'appui long, barre des serveurs) ----------

/** Fonction de composant à patcher : obj[key] */
export interface PatchTarget { obj: any; key: string; }

const nameOf = (v: any) => v?.displayName ?? v?.name ?? v?.type?.name ?? v?.render?.name;

/** Rend la fonction réellement appelée par React, que le composant soit nu, memo() ou forwardRef() */
function targetOf(exp: any): PatchTarget | undefined {
    const d = exp?.default;
    if (typeof d === "function") return { obj: exp, key: "default" };
    if (typeof d?.type === "function") return { obj: d, key: "type" };
    if (typeof d?.render === "function") return { obj: d, key: "render" };
    if (typeof d?.type?.render === "function") return { obj: d.type, key: "render" };
}

/**
 * Composant déjà chargé dont l'export par défaut porte ce nom. On parcourt nous-mêmes les modules
 * initialisés : le chercheur de Revenge peut garder en cache un échec obtenu avant le chargement.
 */
function findLoadedComponent(name: string): PatchTarget | undefined {
    const modules = vendetta.metro.modules as Record<string, any>;
    for (const id in modules) {
        const m = modules[id];
        if (!m?.isInitialized) continue;
        try {
            const exp = m.publicModule?.exports;
            if (exp?.default && nameOf(exp.default) === name) return targetOf(exp);
        } catch { }
    }
}

/** Cherche parmi les modules chargés, puis avec le chercheur de Revenge (qui peut charger le module) */
const component = (name: string) => lazy(() => findLoadedComponent(name) ?? targetOf(findByName(name, false)));

export const Patchable = {
    GuildsBar: component("GuildsBar"),
    MessageSheet: component("LongPressMessageActionSheet"),
    ChannelSheet: component("ChannelLongPressActionSheet"),
    GuildSheet: component("GuildActionSheet"),
    UserSheet: component("UserProfileActionSheet")
};

export const patcher = vendetta.patcher;

const jsxRuntime = lazy(() => findByProps("jsx", "jsxs"));

/**
 * Enveloppe un composant de Discord désigné par son nom : chaque élément créé avec ce composant
 * est rendu par une version qui passe son résultat à `transform`. Fonctionne quel que soit le
 * moment où le module est chargé, et aussi pour les composants memo() / forwardRef().
 */
export function wrapComponent(name: string, transform: (tree: any, props: any) => any): () => void {
    const runtime = jsxRuntime();
    if (!runtime) return () => { };
    const wrappers = new WeakMap<object, any>();

    const wrapperFor = (type: any) => {
        let Wrapper = wrappers.get(type);
        if (!Wrapper) {
            const render = typeof type === "function" ? type : type.type ?? type.render;
            Wrapper = function HubWrapped(props: any, ref: any) {
                const tree = render(props, ref);
                try {
                    return transform(tree, props) ?? tree;
                } catch (e) {
                    logger.error(`rendu ${name}`, e);
                    return tree;
                }
            };
            wrappers.set(type, Wrapper);
        }
        return Wrapper;
    };

    const hook = ([type]: any[], ret: any) => {
        if (!type || (typeof type !== "function" && typeof type !== "object") || nameOf(type) !== name) return ret;
        return { ...ret, type: wrapperFor(type) };
    };
    const unpatches = [patcher.after("jsx", runtime, hook), patcher.after("jsxs", runtime, hook)];
    return () => unpatches.forEach(u => u());
}
export const findInReactTree = vendetta.utils.findInReactTree;
