import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "js/plusReport.js"), "utf8");
const marker = "var CZ_PLUS_SYSTEM_PROMPT = [";
const start = src.indexOf(marker);
const end = src.indexOf("].join(\"\\n\");", start);
if (start < 0 || end < 0) throw new Error("prompt markers not found");
const arrBody = src.slice(start + "var CZ_PLUS_SYSTEM_PROMPT = ".length, end + 1);
const out = [
  "/** Server-side Mi Plan Plus system prompt (mirror of js/plusReport.js) */",
  "export const CZ_PLUS_SYSTEM_PROMPT = " + arrBody + '.join("\\n");',
  "",
].join("\n");
fs.writeFileSync(path.join(root, "api/plus/systemPrompt.js"), out);
console.log("wrote api/plus/systemPrompt.js", out.length, "chars");
