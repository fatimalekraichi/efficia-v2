import { readFile, writeFile } from "node:fs/promises";

const [analysisId, outputPath] = process.argv.slice(2);
if (!analysisId || !outputPath) throw new Error("analysisId et outputPath requis");
const vars = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const match = vars.match(/^CONNECTOR_TOKEN=(.*)$/m);
if (!match) throw new Error("CONNECTOR_TOKEN absent");
const token = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
const response = await fetch(`https://efficiadigital.com/api/analysis/${encodeURIComponent(analysisId)}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
if (!response.ok) throw new Error(`Lecture analyse impossible (${response.status})`);
await writeFile(outputPath, await response.text(), "utf8");
