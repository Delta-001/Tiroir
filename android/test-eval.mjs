// Évalue dist/tiroir/index.js comme le fait Revenge, avec une fausse API « vendetta » :
// détecte les erreurs de syntaxe et les erreurs au chargement avant de toucher le téléphone.
import { readFileSync } from "node:fs";

const fake = () => new Proxy(function () { }, {
    get: (_, key) => key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : fake(),
    apply: () => fake(),
    construct: () => fake()
});

const code = readFileSync("dist/tiroir/index.js", "utf8");
try {
    const raw = (0, eval)(`vendetta=>{return ${code}}`)(fake());
    const plugin = raw?.default ?? raw;
    if (typeof plugin !== "object" || typeof plugin.onLoad !== "function") throw new Error(`le plugin n'exporte pas onLoad (reçu : ${typeof plugin})`);
    console.log("✓ évaluation OK, exports :", Object.keys(plugin));
} catch (e) {
    console.error("✗ erreur à l'évaluation :", e);
    process.exit(1);
}
