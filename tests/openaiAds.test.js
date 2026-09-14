import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/openai-ads.js", import.meta.url), "utf8");
const result = { success: true, status: "awaiting_review", analysisId: "11111111-1111-4111-8111-111111111111" };
function setup(storage = new Map(), path = "/diagnostic-gratuit") {
  const scripts = [], calls = [];
  const location = { hostname: "efficiadigital.com", pathname: path };
  const document = {
    cookie: "",
    createElement: () => ({ listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } }),
    head: { appendChild: s => scripts.push(s) },
  };
  const window = {};
  const context = vm.createContext({ window, document, location, sessionStorage: {
    getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v),
  } });
  vm.runInContext(source, context);
  const load = () => {
    const q = window.oaiq.q || [];
    window.oaiq = (...args) => calls.push(JSON.parse(JSON.stringify(args)));
    q.forEach(args => window.oaiq(...args));
    scripts[0].listeners.load();
  };
  return { window, context, scripts, calls, load, api: window.efficiaAds };
}
test("aucun SDK ou événement sans consentement, même après succès ; aucun rejeu tardif", () => {
  const s=setup(); s.api.leadCreated(result); s.api.setConsent(false);
  assert.equal(s.scripts.length,0);
  s.api.setConsent(true); s.load();
  assert.equal(s.calls.filter(c=>c[0]==="measure").length,0);
});
test("SDK officiel et init uniques ; consentement fermé avant init ; event_id en quatrième argument", () => {
  const s=setup(); s.api.setConsent(true); s.api.setConsent(true);
  vm.runInContext(source,s.context);
  assert.equal(s.scripts.length,1);
  assert.equal(s.scripts[0].src,"https://bzrcdn.openai.com/sdk/oaiq.min.js");
  s.api.leadCreated(result); s.api.leadCreated(result); s.load(); s.api.leadCreated(result);
  assert.deepEqual(s.calls,[
    ["consent",false], ["init",{pixelId:"Ug6mafU2YhS9VBJMUtPSim"}], ["consent",true],
    ["measure","lead_created",{type:"customer_action"},{event_id:`free_diagnostic_${result.analysisId}`}],
  ]);
});
test("erreur, réponse incomplète et simple lead_capture ne produisent rien", () => {
  const s=setup(); s.api.setConsent(true); s.load();
  for(const r of [null,{success:true},{...result,success:false},{...result,status:"failed"},{...result,analysisId:"mail@example.com"}])s.api.leadCreated(r);
  assert.equal(s.calls.filter(c=>c[0]==="measure").length,0);
});
test("retrait pendant chargement : demande en attente effacée, jamais rejouée", () => {
  const s=setup(); s.api.setConsent(true); s.api.leadCreated(result); s.api.setConsent(false); s.load();
  s.api.setConsent(true);
  assert.equal(s.calls.filter(c=>c[0]==="measure").length,0);
  assert.equal(s.scripts.length,1);
});
test("retrait après chargement : refus SDK et aucun événement ultérieur", () => {
  const s=setup(); s.api.setConsent(true); s.load(); s.api.setConsent(false); s.api.leadCreated(result);
  assert.deepEqual(s.calls.at(-1),["consent",false]);
  assert.equal(s.calls.filter(c=>c[0]==="measure").length,0);
});
test("déduplication conservée après rechargement pour le même identifiant backend", () => {
  const storage=new Map(); const first=setup(storage);
  first.api.setConsent(true); first.load(); first.api.leadCreated(result);
  const second=setup(storage); second.api.setConsent(true); second.load(); second.api.leadCreated(result);
  assert.equal(second.calls.filter(c=>c[0]==="measure").length,0);
});
test("SDK bloqué, stockage indisponible ou oaiq défaillant : aucune exception pour le formulaire", () => {
  const s=setup({get(){throw Error("blocked");},set(){throw Error("blocked");}});
  assert.doesNotThrow(()=>{s.api.setConsent(true);s.scripts[0].listeners.error();s.api.leadCreated(result);});
  s.load(); s.window.oaiq=()=>{throw Error("blocked");};
  assert.doesNotThrow(()=>{s.api.leadCreated(result);s.api.setConsent(false);});
});
test("pas d’intégration sur les pages admin ou commerciales hors périmètre", () => {
  for(const path of ["/admin", "/achat", "/audit-google-business"])assert.equal(setup(new Map(),path).api,undefined);
});
test("CSP : seuls les deux hôtes officiels ajoutés aux pages diagnostic", () => {
  const headers=readFileSync(new URL("../_headers",import.meta.url),"utf8");
  for(const path of ["/", "/index.html"]) {
    const block=headers.split("\n\n").find(b=>b.startsWith(`${path}\n`));
    assert.match(block,/script-src[^;]*https:\/\/bzrcdn\.openai\.com/);
    assert.match(block,/connect-src[^;]*https:\/\/bzr\.openai\.com https:\/\/bzrcdn\.openai\.com/);
    assert.match(block,/img-src[^;]*https:\/\/bzr\.openai\.com/);
  }
  assert.doesNotMatch(headers,/\*\.openai\.com/);
});
