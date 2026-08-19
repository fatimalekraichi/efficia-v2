import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wranglerUrl = new URL("../wrangler.toml", import.meta.url);

const PROD = Object.freeze({
  DB: {
    databaseName: "efficia_knowledge_base",
    databaseId: "deabe0a6-d130-418b-8b88-59b9ead17970",
    previewDatabaseId: "579fd946-f939-49d3-a43c-5c4491b2a10c",
  },
  ORDERS_DB: {
    databaseName: "efficia_orders",
    databaseId: "216a7d6a-56d2-4a08-b472-c3462f3280f7",
    previewDatabaseId: "09058f6c-cdb7-4a5d-bf96-8d1a67baf607",
  },
});

const PREVIEW = Object.freeze({
  DB: {
    databaseName: "efficia-knowledge-preview",
    databaseId: "579fd946-f939-49d3-a43c-5c4491b2a10c",
  },
  ORDERS_DB: {
    databaseName: "efficia-orders-preview",
    databaseId: "09058f6c-cdb7-4a5d-bf96-8d1a67baf607",
  },
});

const parseD1Bindings = (source, sectionName) => {
  const lines = source.split(/\r?\n/);
  const header = `[[${sectionName}]]`;
  const bindings = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== header) continue;

    const binding = {};
    for (index += 1; index < lines.length && !/^\s*\[/.test(lines[index]); index += 1) {
      const match = lines[index].match(/^\s*([a-z_]+)\s*=\s*"([^"]*)"\s*$/);
      if (match) binding[match[1]] = match[2];
    }
    index -= 1;
    bindings.push(binding);
  }

  return bindings;
};

const indexByBinding = (bindings) => Object.fromEntries(
  bindings.map((entry) => [entry.binding, entry]),
);

test("les bindings D1 racine restent exclusivement ceux de Production", async () => {
  const source = await readFile(wranglerUrl, "utf8");
  const bindings = parseD1Bindings(source, "d1_databases");
  const byBinding = indexByBinding(bindings);

  assert.deepEqual(Object.keys(byBinding).sort(), ["DB", "ORDERS_DB"]);
  for (const [binding, expected] of Object.entries(PROD)) {
    assert.deepEqual(byBinding[binding], {
      binding,
      database_name: expected.databaseName,
      database_id: expected.databaseId,
      preview_database_id: expected.previewDatabaseId,
    });
    assert.equal(source.match(new RegExp(expected.databaseId, "g"))?.length, 1,
      `${expected.databaseId} doit apparaître une seule fois, dans le binding racine`);
  }
});

test("env.preview redéfinit complètement DB et ORDERS_DB vers les bases Preview", async () => {
  const source = await readFile(wranglerUrl, "utf8");
  const bindings = parseD1Bindings(source, "env.preview.d1_databases");
  const byBinding = indexByBinding(bindings);

  assert.equal(bindings.length, 2, "les deux bindings D1 doivent être explicites en Preview");
  assert.deepEqual(Object.keys(byBinding).sort(), ["DB", "ORDERS_DB"]);

  for (const [binding, expected] of Object.entries(PREVIEW)) {
    assert.deepEqual(byBinding[binding], {
      binding,
      database_name: expected.databaseName,
      database_id: expected.databaseId,
    });
    assert.equal(byBinding[binding].preview_database_id, undefined);
  }

  const previewBlock = bindings.map((binding) => JSON.stringify(binding)).join("\n");
  for (const expected of Object.values(PROD)) {
    assert.doesNotMatch(previewBlock, new RegExp(expected.databaseId),
      "un binding Preview ne doit jamais contenir un UUID Production");
  }
});
