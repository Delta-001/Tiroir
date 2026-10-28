// Serveur local du dossier dist/ pour installer le plugin sur le téléphone.
// Avec le câble USB : `adb reverse tcp:8080 tcp:8080`, puis installer http://127.0.0.1:8080/tiroir/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = 8080;
const ROOT = "dist";
const TYPES = { ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    try {
        const body = await readFile(join(ROOT, path));
        res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
        res.end(body);
        console.log(new Date().toLocaleTimeString(), 200, path);
    } catch {
        res.writeHead(404).end();
        console.log(new Date().toLocaleTimeString(), 404, path);
    }
}).listen(PORT, "127.0.0.1", () => console.log(`Plugin servi sur http://127.0.0.1:${PORT}/tiroir/`));
