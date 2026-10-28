import { FluxDispatcher, logger, React, RN } from "./discord";
import { addNewFeatureTabs } from "./features";
import { addMentions, toMentionEntry } from "./features/mentions";
import { applyPatches, openHub } from "./patches";
import { isHubLoaded, loadHub } from "./store";
import { styles } from "./theme";

logger.log("code évalué");

let cleanups: (() => void)[] = [];

function onMessageCreate({ message, optimistic }: any) {
    if (optimistic || !isHubLoaded()) return;
    try {
        const entry = toMentionEntry(message);
        if (entry) addMentions([entry]);
    } catch (e) {
        logger.error("notification", e);
    }
}

function Settings() {
    return (
        <RN.View style={{ padding: 16, gap: 12 }}>
            <RN.Pressable style={styles.ghostButton} onPress={openHub}>
                <RN.Text style={styles.ghostButtonText}>Ouvrir Tiroir</RN.Text>
            </RN.Pressable>
            <RN.Text style={styles.empty}>
                Le bouton Tiroir se trouve en haut de la barre des serveurs, à gauche.{"\n"}
                Maintiens un message, un salon, un serveur ou un profil pour l'épingler.
            </RN.Text>
        </RN.View>
    );
}

export default {
    async onLoad() {
        try {
            logger.log("démarrage");
            await loadHub();
            logger.log("données chargées");
            addNewFeatureTabs();

            FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
            cleanups.push(() => FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate));
            cleanups.push(applyPatches());

            logger.log("prêt");

        } catch (e: any) {
            logger.error("échec du démarrage", e?.stack ?? e);
        }
    },
    onUnload() {
        for (const cleanup of cleanups.reverse()) {
            try { cleanup(); } catch (e) { logger.error("arrêt", e); }
        }
        cleanups = [];
    },
    settings: Settings
};
