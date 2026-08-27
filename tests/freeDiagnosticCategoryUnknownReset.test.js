import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function functionSource(name, nextName){
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1, `${name} doit exister`);
  assert.notEqual(end, -1, `${nextName} doit suivre ${name}`);
  return html.slice(start, end);
}

function categoryRuntime({ id, points, source = "auto", touched = false }){
  const radios = [
    { checked:true, value:String(points) },
    { checked:false, value:"2" },
  ];
  const badges = { innerHTML:"ancienne valeur automatique" };
  const note = { innerHTML:"ancienne preuve" };
  const criterion = {
    classList:{ add(){} },
    querySelector(selector){
      if(selector === ".badges") return badges;
      if(selector === ".zone-note") return note;
      return null;
    },
  };
  const sourcesCriteres = new Map([[id, source]]);
  const criteresTouchesManuellement = new Set(touched ? [id] : []);
  const context = vm.createContext({
    sourcesCriteres,
    criteresTouchesManuellement,
    escapeHtml:value => String(value),
    document:{
      querySelectorAll:selector => selector.includes(`c${id}`) ? radios : [],
      getElementById:elementId => elementId === `crit-${id}` ? criterion : null,
    },
  });
  vm.runInContext([
    functionSource("effacerReponseCritereParId", "effacerReponseCritere"),
    functionSource("marquerAutoAConfirmer", "reinitialiserAnalyse"),
  ].join("\n"), context);
  return { context, radios, sourcesCriteres, badges, note };
}

function selectedPoints(radios){
  const selected = radios.find((radio) => radio.checked);
  return selected ? Number(selected.value) : null;
}

test("une ancienne valeur auto Précise (4) est supprimée quand la nouvelle preuve principale devient unknown", () => {
  const runtime = categoryRuntime({ id:11, points:4 });

  const applied = runtime.context.marquerAutoAConfirmer(11, "Donnée insuffisante");

  assert.equal(applied, true);
  assert.equal(runtime.radios.every((radio) => !radio.checked), true);
  assert.equal(selectedPoints(runtime.radios), null);
  assert.equal(runtime.sourcesCriteres.get(11), "unknown");
  assert.match(runtime.badges.innerHTML, /AUTO — à confirmer/);
});

test("une ancienne valeur auto Non / incomplètes (0) est supprimée quand les subtypes deviennent unknown", () => {
  const runtime = categoryRuntime({ id:12, points:0 });

  const applied = runtime.context.marquerAutoAConfirmer(12, "Donnée insuffisante");

  assert.equal(applied, true);
  assert.equal(runtime.radios.every((radio) => !radio.checked), true);
  assert.equal(selectedPoints(runtime.radios), null);
  assert.equal(runtime.sourcesCriteres.get(12), "unknown");
  assert.match(runtime.badges.innerHTML, /AUTO — à confirmer/);
});

test("une réponse manuelle reste sélectionnée et conserve sa source MANUEL", () => {
  const runtime = categoryRuntime({ id:11, points:2, source:"manual", touched:true });

  const applied = runtime.context.marquerAutoAConfirmer(11, "Donnée insuffisante");

  assert.equal(applied, false);
  assert.equal(runtime.radios[0].checked, true);
  assert.equal(selectedPoints(runtime.radios), 2);
  assert.equal(runtime.sourcesCriteres.get(11), "manual");
  assert.equal(runtime.badges.innerHTML, "ancienne valeur automatique");
});

test("une ancienne valeur auto Oui (4) des liens d'action est supprimée lorsque la preuve directe disparaît", () => {
  const runtime = categoryRuntime({ id:24, points:4 });

  const applied = runtime.context.marquerAutoAConfirmer(24, "Donnée insuffisante");

  assert.equal(applied, true);
  assert.equal(runtime.radios.every((radio) => !radio.checked), true);
  assert.equal(selectedPoints(runtime.radios), null);
  assert.equal(runtime.sourcesCriteres.get(24), "unknown");
});

test("une réponse manuelle de lien d'action reste sélectionnée après une relance unknown", () => {
  const runtime = categoryRuntime({ id:24, points:0, source:"manual", touched:true });

  const applied = runtime.context.marquerAutoAConfirmer(24, "Donnée insuffisante");

  assert.equal(applied, false);
  assert.equal(runtime.radios[0].checked, true);
  assert.equal(runtime.sourcesCriteres.get(24), "manual");
});

test("une ancienne réponse AUTO de rang ou concurrence est supprimée si la nouvelle preuve est absente", () => {
  for(const id of [27, 28]){
    const runtime = categoryRuntime({ id, points:id === 27 ? 6 : 2 });
    assert.equal(runtime.context.marquerAutoAConfirmer(id, "Donnée insuffisante"), true);
    assert.equal(runtime.radios.every((radio) => !radio.checked), true);
    assert.equal(selectedPoints(runtime.radios), null);
  }
});

test("une ancienne réponse AUTO du volume d'avis est supprimée si trois volumes valides ne sont plus disponibles", () => {
  const runtime = categoryRuntime({ id:15, points:5 });
  assert.equal(runtime.context.marquerAutoAConfirmer(15, "Donnée insuffisante"), true);
  assert.equal(runtime.radios.every((radio) => !radio.checked), true);
  assert.equal(selectedPoints(runtime.radios), null);
  assert.equal(runtime.sourcesCriteres.get(15), "unknown");
});

test("une réponse MANUELLE du volume d'avis reste sélectionnée", () => {
  const runtime = categoryRuntime({ id:15, points:3, source:"manual", touched:true });
  assert.equal(runtime.context.marquerAutoAConfirmer(15, "Donnée insuffisante"), false);
  assert.equal(selectedPoints(runtime.radios), 3);
  assert.equal(runtime.sourcesCriteres.get(15), "manual");
});

test("la relance unknown utilise le reset atomique et ne rappelle plus l’API par clé avec un id numérique", () => {
  const refresh = html.slice(html.indexOf("function appliquerResultatsRecherche"), html.indexOf("async function relancerAnalyseRecherche"));
  assert.match(refresh, /marquerAutoAConfirmer\(criterion\.id, "Donnée insuffisante/);
  assert.doesNotMatch(refresh, /effacerReponseCritere\(criterion\.id\)/);
});
