import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "js/plusReportV2IaPrompt.js");
const src = fs.readFileSync(srcPath, "utf8");
const marker = "var CZ_PLUS_IA_SYSTEM_PROMPT = [";
const start = src.indexOf(marker);
const end = src.indexOf("].join(\"\\n\");", start);
if (start < 0 || end < 0) throw new Error("prompt markers not found in plusReportV2IaPrompt.js");
const arrBody = src.slice(start + "var CZ_PLUS_IA_SYSTEM_PROMPT = ".length, end + 1);
const out = [
  "/** Server-side Mi Plan Plus IA system prompt (mirror of js/plusReportV2IaPrompt.js) */",
  "export const CZ_PLUS_SYSTEM_PROMPT = " + arrBody + '.join("\\n");',
  "",
].join("\n");
fs.writeFileSync(path.join(root, "api/plus/systemPrompt.js"), out);
console.log("wrote api/plus/systemPrompt.js", out.length, "chars");
