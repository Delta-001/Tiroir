// Compile src/index.tsx au format de plugin Vendetta (Revenge Classic) :
// dist/hub/index.js (une expression évaluée par le chargeur) + dist/hub/manifest.json (avec l'empreinte du code).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT_DIR = "dist/tiroir";
const GLOBAL = "__tiroirPlugin";
const dev = process.argv.includes("--dev");

const result = await build({
    entryPoints: ["src/index.tsx"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: GLOBAL,
    target: "es2020",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    minify: !dev,
    legalComments: "none",
    logLevel: "warning"
});

// Le chargeur exécute `vendetta => { return <code> }` : on retire la déclaration pour garder une expression
// (esbuild ajoute "use strict" en mode strict : sans ce retrait, le chargeur recevrait la chaîne au lieu du plugin)
let code = result.outputFiles[0].text.trim()
    .replace(/^(["'])use strict\1;?\s*/, "")
    .replace(new RegExp(`^var ${GLOBAL}\\s*=\\s*`), "");
if (code.endsWith(";")) code = code.slice(0, -1);

const pkg = JSON.parse(readFileSync("plugin.json", "utf8"));
const manifest = {
    ...pkg,
    main: "index.js",
    hash: createHash("sha256").update(code).digest("hex")
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/index.js`, code);
writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 4));
console.log(`✓ ${OUT_DIR} (${(code.length / 1024).toFixed(1)} Ko, ${manifest.hash.slice(0, 8)})`);
