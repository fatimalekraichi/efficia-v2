import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/analyze.js";

// Bug corrigé — "Catégorie principale" affichait parfois le nom de l'entreprise
// au lieu de sa catégorie Google. Cas typique : le formulaire "Nouvel audit"
// (Mode 2, Nom + Ville sans URL) envoie le nom de l'entreprise comme "activite"
// à /api/analyze (voir functions/api/admin/audits.js, buildPipelineInput) —
// avant ce correctif, cette valeur était acceptée telle quelle dès qu'elle
// n'était pas le texte générique "entreprise locale", et primait donc sur la
// catégorie réellement détectée par Outscraper.

const TOKEN = "connector-token";

function makeDb() {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              inserts.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function makeContext(body, { db = makeDb() } = {}) {
  return {
    request: new Request("http://local.test/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    }),
    env: {
      CONNECTOR_TOKEN: TOKEN,
      OUTSCRAPER_API_KEY: "test-key",
      ORDERS_DB: db,
    },
  };
}

// Index de la colonne "activity" dans l'INSERT INTO analyses (voir functions/api/analyze.js) :
// analysis_id, nom, ville, query, place_id, name, rating, reviews, photos_count,
// description_length, activity, ...
const ACTIVITY_BIND_INDEX = 10;

function mockOutscraper({ fiche, competitors = [] }) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    // collectFiche.js demande désormais plusieurs candidats (Objectif 2,
    // mission "corriger les deux problèmes critiques" — score de confiance)
    // via organizationsPerQueryLimit=5, tandis que collectCompetitors.js
    // demande toujours 10 : on distingue les deux appels sur cette base,
    // plutôt que sur l'ancienne valeur fixe "1".
    if (parsed.searchParams.get("organizationsPerQueryLimit") !== "10") {
      return Response.json({ data: [[fiche]] });
    }
    return Response.json({ data: [competitors] });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("analyze : le nom de l'entreprise envoyé comme \"activite\" (Mode 2 du formulaire) n'est jamais utilisé comme catégorie", async () => {
  const db = makeDb();
  const restore = mockOutscraper({
    fiche: {
      name: "AS Pro Elec",
      place_id: "place-target",
      category: "Électricien",
      type: "electrician",
      city: "Metz",
    },
    competitors: [{ name: "Concurrent A", place_id: "place-a" }],
  });

  try {
    const response = await onRequestPost(await makeContext({
      nom: "AS Pro Elec",
      ville: "Metz",
      // Reproduit exactement le bug signalé : admin/audits.js envoie le nom de
      // l'entreprise comme "activite" quand seuls Nom + Ville sont fournis.
      activite: "AS Pro Elec",
    }, { db }));
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, "collected");

    const insert = db.inserts.find((i) => i.sql.includes("INSERT INTO analyses"));
    assert.ok(insert, "l'analyse doit être enregistrée");
    assert.equal(
      insert.args[ACTIVITY_BIND_INDEX],
      "Électricien",
      "la catégorie enregistrée doit être la catégorie Google détectée, jamais le nom de l'entreprise",
    );
  } finally {
    restore();
  }
});

test("analyze : une activité réellement saisie par l'admin (différente du nom) reste prioritaire sur la catégorie détectée", async () => {
  const db = makeDb();
  const restore = mockOutscraper({
    fiche: {
      name: "AS Pro Elec",
      place_id: "place-target",
      category: "Électricien",
      city: "Metz",
    },
    competitors: [],
  });

  try {
    await onRequestPost(await makeContext({
      nom: "AS Pro Elec",
      ville: "Metz",
      activite: "Installation électrique industrielle",
    }, { db }));

    const insert = db.inserts.find((i) => i.sql.includes("INSERT INTO analyses"));
    assert.equal(insert.args[ACTIVITY_BIND_INDEX], "Installation électrique industrielle");
  } finally {
    restore();
  }
});

test("analyze : sans activité saisie, la catégorie Google détectée est utilisée", async () => {
  const db = makeDb();
  const restore = mockOutscraper({
    fiche: {
      name: "AS Pro Elec",
      place_id: "place-target",
      category: "Électricien",
      city: "Metz",
    },
    competitors: [],
  });

  try {
    await onRequestPost(await makeContext({
      nom: "AS Pro Elec",
      ville: "Metz",
    }, { db }));

    const insert = db.inserts.find((i) => i.sql.includes("INSERT INTO analyses"));
    assert.equal(insert.args[ACTIVITY_BIND_INDEX], "Électricien");
  } finally {
    restore();
  }
});

test("analyze : le placeholder générique \"entreprise locale\" (posé par admin/audits.js) reste ignoré, comportement inchangé", async () => {
  const db = makeDb();
  const restore = mockOutscraper({
    fiche: {
      name: "AS Pro Elec",
      place_id: "place-target",
      category: "Électricien",
      city: "Metz",
    },
    competitors: [],
  });

  try {
    await onRequestPost(await makeContext({
      nom: "AS Pro Elec",
      ville: "Metz",
      activite: "entreprise locale",
    }, { db }));

    const insert = db.inserts.find((i) => i.sql.includes("INSERT INTO analyses"));
    assert.equal(insert.args[ACTIVITY_BIND_INDEX], "Électricien");
  } finally {
    restore();
  }
});

test("analyze : la fiche analysée n'apparaît jamais dans ses propres concurrents enregistrés", async () => {
  const db = makeDb();
  const restore = mockOutscraper({
    fiche: {
      name: "AS Pro Elec",
      place_id: "place-target",
      category: "Électricien",
      city: "Metz",
    },
    // Le moteur de recherche concurrentiel renvoie la fiche analysée elle-même en tête de liste
    // (cas réel observé) : elle doit être filtrée avant enregistrement.
    competitors: [
      { name: "AS Pro Elec", place_id: "place-target" },
      { name: "Concurrent A", place_id: "place-a" },
    ],
  });

  try {
    await onRequestPost(await makeContext({
      nom: "AS Pro Elec",
      ville: "Metz",
      activite: "Électricien",
    }, { db }));

    const insert = db.inserts.find((i) => i.sql.includes("INSERT INTO analyses"));
    const competitorsJsonIndex = 13;
    const storedCompetitors = JSON.parse(insert.args[competitorsJsonIndex]);
    assert.equal(storedCompetitors.length, 1);
    assert.equal(storedCompetitors[0].name, "Concurrent A");
    assert.ok(
      !storedCompetitors.some((c) => c.place_id === "place-target"),
      "la fiche analysée ne doit jamais apparaître dans ses propres concurrents",
    );
  } finally {
    restore();
  }
});
