import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";
import { onRequestGet } from "../functions/diagnostic-gratuit.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const home = readFileSync(join(root, "index.html"), "utf8");
const source = readFileSync(join(root, "functions/diagnostic-gratuit.js"), "utf8");
const removedTimingCopy = "En moins de 2 minutes, découvrez les principaux points qui limitent votre visibilité sur Google.";
const confirmationTimingCopy = "Vous recevrez votre rapport personnalisé dans un délai de 48 à 72 heures ouvrées.";
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Optional local Workers runtime; no remote bindings, provider calls or real D1.
// MINIFLARE_MODULE may point to the Miniflare 4 module shipped with local Wrangler.
const runtime = process.env.MINIFLARE_MODULE ? await import(process.env.MINIFLARE_MODULE) : null;
const runtimeSkip = runtime ? false : "MINIFLARE_MODULE requis pour le contrôle HTMLRewriter réel";
const browserSkip = runtimeSkip || (!existsSync(chrome) && "Chrome absent");

function localRuntime(html = home, status = 200) {
  return new runtime.Miniflare({
    modules: true,
    compatibilityDate: "2025-09-24",
    script: `${source}\nexport default {fetch(request, env) {return request.method === "HEAD" ? onRequestHead({request, env}) : onRequestGet({request, env});}};`,
    serviceBindings: {
      ASSETS: request => {
        assert.equal(new URL(request.url).pathname, "/");
        assert.equal(new URL(request.url).search, "");
        return new Response(html, { status, headers: { "Content-Type": "text/html", "ETag": '"home"', "Referrer-Policy": "strict-origin" } });
      },
    },
  });
}

test("la route publique dédiée réutilise le formulaire et l'envoi existants, sans second formulaire", () => {
  assert.equal(typeof onRequestGet, "function");
  assert.match(source, /env\.ASSETS\.fetch\(new URL\("\/", request\.url\)\)/);
  assert.match(source, /\.on\("#diagnostic-modal"/);
  assert.match(home, /id="diagnostic-modal"/);
  assert.match(home, /name="firstName"/);
  assert.match(home, /name="googleBusiness"/);
  assert.equal(home.includes(removedTimingCopy), false, "la promesse de délai est absente du pop-up partagé");
  assert.equal(source.includes(removedTimingCopy), false, "la promesse de délai est absente des métadonnées");
  assert.equal(home.includes("Vous recevrez votre rapport personnalisé sous 24 heures ouvrées."), false);
  assert.ok(home.includes(confirmationTimingCopy));
  assert.doesNotMatch(source, /<form\b|fetch\("\/subscribe"|ORDERS_DB|\.prepare\(/);
});

test("une indisponibilité de l'asset ne renvoie pas un faux formulaire HTTP 200", async () => {
  const result = await onRequestGet({ request: new Request("https://efficiadigital.com/diagnostic-gratuit"), env: { ASSETS: { fetch: async () => new Response("", { status: 404 }) } } });
  assert.equal(result.status, 503);
});

test("HTTP 200 avec ou sans UTM : champs, étapes et messages identiques au pop-up, sans accueil ni flou", { skip: runtimeSkip }, async () => {
  const mf = localRuntime();
  try {
    for (const path of ["/diagnostic-gratuit", "/diagnostic-gratuit?utm_source=chatgpt&utm_medium=paid&utm_campaign=electriciens", "/diagnostic-gratuit/"]) {
      const response = await mf.dispatchFetch(`https://efficiadigital.com${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("etag"), null);
      assert.equal(response.headers.get("referrer-policy"), "strict-origin");
      const html = await response.text();
      assert.equal(html.includes(removedTimingCopy), false, "la page dédiée ne réintroduit pas la phrase supprimée");
      assert.match(html, /<title>Diagnostic Google gratuit \| Efficia Digital<\/title>/);
      assert.match(html, /rel="canonical" href="https:\/\/efficiadigital.com\/diagnostic-gratuit"/);
      assert.match(html, /name="description" content="Obtenez gratuitement votre Score Efficia™/);
      assert.match(html, /property="og:title" content="Diagnostic Google gratuit \| Efficia Digital"/);
      assert.match(html, /name="twitter:title" content="Diagnostic Google gratuit \| Efficia Digital"/);
      assert.equal((html.match(/id="diagnostic-modal"/g) || []).length, 1);
      assert.match(html, /data-diagnostic-page/);
      assert.match(html, /aria-hidden="false"/);
      assert.doesNotMatch(html, /\binert\b|class="hero"|<header\b|<footer\b|class="conversion-modal__backdrop"|class="conversion-modal__close"|FAQPage/);
      assert.deepEqual(html.match(/<form\b[\s\S]*?<\/form>/g), home.match(/<form\b[\s\S]*?<\/form>/g));
      assert.equal(html.match(/<div class="conversion-step conversion-confirmation"[\s\S]*?<\/ol>/)?.[0], home.match(/<div class="conversion-step conversion-confirmation"[\s\S]*?<\/ol>/)?.[0]);
      for (const asset of ["/js/analytics.js", "/js/app.js?v=20260914-diagnostic-page", "/js/cookies.js?v=20260818-clarity", "/css/global.css"]) assert.ok(html.includes(`"${asset}"`), asset);
    }
    const head = await mf.dispatchFetch("https://efficiadigital.com/diagnostic-gratuit", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  } finally { await mf.dispose(); }
});

test("la route reprend automatiquement les futures modifications du formulaire source", { skip: runtimeSkip }, async () => {
  const changedHome = home.replace('name="firstName"', 'name="firstName" data-shared-probe="same-source"');
  const mf = localRuntime(changedHome);
  try {
    const html = await (await mf.dispatchFetch("https://efficiadigital.com/diagnostic-gratuit")).text();
    assert.match(html, /data-shared-probe="same-source"/);
  } finally { await mf.dispose(); }
});

test("un formulaire source manquant échoue explicitement sans servir l'accueil", { skip: runtimeSkip }, async () => {
  const mf = localRuntime("<!doctype html><html><head></head><body><main>Accueil</main></body></html>");
  try {
    const response = await mf.dispatchFetch("https://efficiadigital.com/diagnostic-gratuit");
    assert.equal(response.status, 503);
  } finally { await mf.dispose(); }
});

for (const scenario of [
  { path: "/diagnostic-gratuit", unknown: false },
  { path: "/diagnostic-gratuit?utm_source=chatgpt&utm_medium=paid&utm_campaign=electriciens", unknown: true },
  { path: "/", unknown: false, popup: true },
]) {
  test(`Chrome : étapes, validation, erreurs et clé anti-doublon — ${scenario.path}`, { skip: browserSkip, timeout: 40_000 }, async () => {
    const mf = localRuntime();
    const directory = mkdtempSync(join(tmpdir(), "efficia-diagnostic-landing-"));
    const html = scenario.popup ? home : await (await mf.dispatchFetch(`https://efficiadigital.com${scenario.path}`)).text();
    const script = `<script>
      window.__errors = []; addEventListener('error', event => __errors.push(event.message));
      window.__calls = []; window.__failNext = false;
      window.fetch = async (url, options) => {
        if (url !== '/subscribe' || options.method !== 'POST') throw new Error('Unexpected request');
        const payload = JSON.parse(options.body); __calls.push(payload);
        await new Promise(resolve => setTimeout(resolve, 80));
        if (__failNext) { __failNext = false; return Response.json({success:false,error_code:'AMBIGUOUS_CANDIDATES'}, {status:409}); }
        return Response.json({success:true,analysisId:'local-mocked-analysis'});
      };
      localStorage.setItem('efficiaCookieConsent',JSON.stringify({version:'2026-08-18-clarity-v1',analytics:false}));
    <\/script>`;
    const runner = `<output id="landing-test-result"></output><script>
      (async () => {
        const ensure = (value, message) => {if (!value) throw new Error(message);};
        const waitFor = async predicate => {for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw new Error('state timeout');};
        const fill = (name, value) => {const input=document.querySelector('[name="'+name+'"]'); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true}));};
        try {
          const modal=document.getElementById('diagnostic-modal');
          if (${Boolean(scenario.popup)}) {
            ensure(modal.hasAttribute('inert'),'popup initial state changed');
            document.querySelector('[data-form-step="diagnostic-start"]').click();
            ensure(modal.classList.contains('is-open'),'popup not opened');
          } else {
            ensure(!modal.hasAttribute('inert') && getComputedStyle(modal).opacity === '1','form not directly visible');
            ensure(!document.querySelector('.hero,.conversion-modal__backdrop'),'home or backdrop present');
            document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            ensure(!modal.hasAttribute('inert'),'Escape closed standalone form');
          }
          const first=modal.querySelector('[data-step="1"]'), second=modal.querySelector('[data-step="2"]');
          ensure(!modal.textContent.includes(${JSON.stringify(removedTimingCopy)}),'removed timing copy still displayed');
          ensure(first.querySelector('h2').nextElementSibling.matches('.conversion-fields'),'unexpected replacement or empty paragraph before fields');
          first.querySelector('button').click();
          ensure(__calls.length===0 && first.querySelectorAll('.has-error').length===2,'required fields not validated');
          fill('firstName','Jean-Michel'); fill('email','incorrect'); first.querySelector('button').click();
          ensure(__calls.length===0,'invalid email submitted');
          fill('email','landing-test@example.com');
          first.querySelector('button').click(); first.querySelector('button').click();
          ensure(first.querySelector('button').disabled,'first button not locked');
          await waitFor(()=>second.classList.contains('is-active'));
          ensure(__calls.length===1 && __calls[0].step==='lead_capture','lead submitted more than once');
          second.querySelector('button').click();
          ensure(__calls.length===1 && second.querySelector('[role="alert"]').textContent,'lookup validation missing');
          if (${scenario.unknown}) {
            const toggle=second.querySelector('[name="unknownGoogleBusiness"]'); toggle.click();
            ensure(second.querySelector('[name="googleBusiness"]').disabled,'URL not disabled');
            fill('company','Entreprise de test locale'); fill('city','Houffalize');
          } else fill('googleBusiness','https://www.google.com/maps/place/Entreprise+de+test');
          __failNext=true; second.querySelector('button').click();
          await waitFor(()=>!second.querySelector('button').disabled);
          ensure(second.classList.contains('is-active'),'error incorrectly confirmed');
          ensure(second.querySelector('[role="alert"]').textContent.includes('Plusieurs fiches correspondent'),'backend error message lost');
          second.querySelector('button').click(); second.querySelector('button').click();
          ensure(second.querySelector('button').disabled,'submission not locked');
          await waitFor(()=>modal.querySelector('[data-step="3"]').classList.contains('is-active'));
          ensure(Array.from(modal.querySelectorAll('[data-step="3"] p')).some(p=>p.textContent===${JSON.stringify(confirmationTimingCopy)}),'confirmation delay differs from approved copy');
          ensure(__calls.length===3,'unexpected duplicate submission');
          ensure(__calls[1].idempotency_key===__calls[2].idempotency_key,'retry changed idempotency key');
          ensure(__errors.length===0,'JavaScript initialization error');
          if (${Boolean(scenario.popup)}) {
            document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            ensure(modal.hasAttribute('inert'),'popup Escape broken');
          }
          document.getElementById('landing-test-result').textContent=JSON.stringify({calls:__calls,errors:__errors,query:location.search,success:true});
        } catch(error) {document.getElementById('landing-test-result').textContent=JSON.stringify({error:String(error.stack)});}
      })();
    <\/script>`;
    const served = html.replace(/<script src="\/?js\/analytics\.js"><\/script>/, `${script}$&`).replace("</body>", `${runner}</body>`);
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/" || pathname.startsWith("/diagnostic-gratuit")) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(served); return;
      }
      if (!/^\/(?:css|js|assets)\//.test(pathname) || pathname.includes("..")) {response.writeHead(404);response.end();return;}
      try {
        const mime = {".js":"text/javascript", ".css":"text/css", ".webp":"image/webp", ".png":"image/png", ".ico":"image/x-icon"}[extname(pathname)] || "application/octet-stream";
        response.writeHead(200, { "Content-Type": mime }); response.end(readFileSync(join(root, pathname)));
      } catch {response.writeHead(404);response.end();}
    });
    try {
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const result = JSON.parse(await collectPageResultWithIsolatedChrome({chrome, url:`http://127.0.0.1:${server.address().port}${scenario.path}`, profileDir:directory, phase:"diagnostic-landing", selector:"#landing-test-result", resultWait:12_000}));
      assert.equal(result.error, undefined, result.error);
      assert.equal(result.success, true);
      assert.deepEqual(result.errors, []);
      const payload = result.calls.at(-1);
      assert.equal(payload.first_name, "Jean-Michel");
      assert.equal(payload.email, "landing-test@example.com");
      assert.equal(payload.source, "Score Efficia gratuit");
      assert.equal(payload.completed_step_2, true);
      assert.equal(payload.step, "diagnostic_request");
      assert.match(payload.idempotency_key, /^[0-9a-f-]{36}$/);
      if (scenario.unknown) {
        assert.equal(payload.company_name, "Entreprise de test locale");
        assert.equal(payload.city, "Houffalize");
        assert.equal(payload.google_business_url, undefined);
        assert.equal(result.query, "?utm_source=chatgpt&utm_medium=paid&utm_campaign=electriciens");
      } else assert.equal(payload.google_business_url, "https://www.google.com/maps/place/Entreprise+de+test");
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await mf.dispose();
      rmSync(directory, { recursive:true, force:true });
    }
  });
}
