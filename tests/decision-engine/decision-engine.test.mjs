import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE_DIR = path.resolve(__dirname, "fixtures");
const LEGACY_TOOL = path.resolve(REPO_ROOT, "outil-score-efficia-auto-v5.html");
const CRITERIA_CATALOG = path.resolve(REPO_ROOT, "src/decision-engine/criteria.catalog.js");

const fixtureFiles = fs.readdirSync(FIXTURE_DIR)
  .filter(file => file.endsWith(".json"))
  .sort();

test("fixtures de non-regression conservees comme archive du moteur historique", () => {
  assert.equal(fixtureFiles.length, 8);
  assert.deepEqual(fixtureFiles, [
    "average-business.json",
    "health-profile.json",
    "incomplete-data.json",
    "pack-projection.json",
    "photos-recency.json",
    "restaurant-profile.json",
    "strong-business.json",
    "weak-business.json"
  ]);
});

test("l'ancien outil v5 ne contient plus de moteur local ni de secrets navigateur", () => {
  const html = fs.readFileSync(LEGACY_TOOL, "utf8");

  assert.equal(html.includes("calculScoreDetail"), false);
  assert.equal(html.includes("scoreCriteres"), false);
  assert.equal(html.includes("indicesProspect"), false);
  assert.equal(html.includes("selectionnerPrioritesDynamiques"), false);
  assert.equal(html.includes("scoreProjetePack"), false);
  assert.equal(html.includes("localStorage"), false);
  assert.equal(html.includes("token-connecteur"), false);
  assert.equal(html.includes("api-key"), false);
  assert.equal(html.includes("html2pdf"), false);
});

test("le catalogue des criteres reste externalise", () => {
  const catalog = fs.readFileSync(CRITERIA_CATALOG, "utf8");

  assert.match(catalog, /\bconst\s+GRILLE\s*=/);
  assert.equal(catalog.includes("calculScoreDetail"), false);
});
