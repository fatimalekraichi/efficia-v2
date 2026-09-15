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
      for (const asset of ["/js/analytics.js?v=20260914-consent", "/js/app.js?v=20260915-manual-review", "/js/cookies.js?v=20260914-ads-v2", "/css/global.css"]) assert.ok(html.includes(`"${asset}"`), asset);
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
  { path: "/diagnostic-gratuit", unknown: false, consent: "all" },
  { path: "/diagnostic-gratuit?utm_source=chatgpt&utm_medium=paid&utm_campaign=electriciens", unknown: true, consent: "ads" },
  { path: "/", unknown: false, popup: true, consent: "all" },
  { path: "/diagnostic-gratuit", unknown: true, consent: "refuse" },
  { path: "/diagnostic-gratuit", unknown: true, consent: "analytics" },
  { path: "/diagnostic-gratuit", unknown: true, consent: "withdraw" },
  { path: "/diagnostic-gratuit", unknown: true, consent: "blocked" },
  { path: "/diagnostic-gratuit", unknown: true, consent: "reload" },
]) {
  test(`Chrome : étapes, validation, erreurs et clé anti-doublon — ${scenario.path} / ${scenario.consent}`, { skip: browserSkip, timeout: 40_000 }, async () => {
    const mf = localRuntime();
    const directory = mkdtempSync(join(tmpdir(), "efficia-diagnostic-landing-"));
    const html = scenario.popup ? home : await (await mf.dispatchFetch(`https://efficiadigital.com${scenario.path}`)).text();
    const script = `<script>
      window.__errors = []; addEventListener('error', event => __errors.push(event.message));
      window.__calls = []; window.__failNext = false;
      window.__pixel = []; window.__sdkLoads = 0; window.__clarityLoads = 0; window.__clarityCalls = [];
      const originalAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = node => {
        if (node.src?.startsWith('https://bzrcdn.openai.com/')) {
          __sdkLoads++;
          if (${scenario.consent === "blocked"}) { queueMicrotask(()=>node.dispatchEvent(new Event('error'))); return node; }
          const queued = window.oaiq.q || [];
          window.oaiq = (...args) => __pixel.push(args);
          queued.forEach(args=>window.oaiq(...args));
          queueMicrotask(()=>node.dispatchEvent(new Event('load')));
          return node;
        }
        if (node.src?.startsWith('https://www.clarity.ms/')) {
          const queued = window.clarity.q || [];
          window.clarity = (...args) => __clarityCalls.push(args);
          queued.forEach(args=>window.clarity(...args));
          __clarityLoads++; node.removeAttribute('src'); originalAppend(node);
          queueMicrotask(()=>node.dispatchEvent(new Event('load'))); return node;
        }
        return originalAppend(node);
      };
      window.fetch = async (url, options) => {
        if (url !== '/subscribe' || options.method !== 'POST') throw new Error('Unexpected request');
        const payload = JSON.parse(options.body); __calls.push(payload);
        await new Promise(resolve => setTimeout(resolve, 80));
        if (__failNext) { __failNext = false; return Response.json({success:false,error_code:'AMBIGUOUS_CANDIDATES'}, {status:409}); }
        return Response.json({success:true,analysisId:'11111111-1111-4111-8111-111111111111',status:'awaiting_review'});
      };
      if (!sessionStorage.getItem('consent-test-stage')) localStorage.setItem('efficiaCookieConsent',JSON.stringify(${JSON.stringify(scenario.consent === "blocked" ? {version:"2026-09-14-ads-v1",analytics:true,advertising:true} : {version:"2026-08-18-clarity-v1",analytics:true})}));
    <\/script>`;
    const runner = `<output id="landing-test-result"></output><script>
      (async () => {
        const publishResult = result => {
          document.getElementById('landing-test-result').textContent=result;
          if(window.parent!==window) window.parent.postMessage({consentResult:result},location.origin);
        };
        const ensure = (value, message) => {if (!value) throw new Error(message);};
        const waitFor = async predicate => {for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw new Error('state timeout');};
        const fill = (name, value) => {const input=document.querySelector('[name="'+name+'"]'); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true}));};
        try {
          const modal=document.getElementById('diagnostic-modal');
          const stage=sessionStorage.getItem('consent-test-stage');
          if(stage==='granted'){
            ensure(__sdkLoads===1 && __clarityLoads===1,'saved consent not restored');
            document.querySelector('[data-cookie-preferences]').click();
            ensure(document.querySelector('[data-cookie-analytics]').checked && document.querySelector('[data-cookie-advertising]').checked,'saved options not restored');
            document.querySelector('[data-cookie-refuse]').click();
            ensure(!window.efficiaAnalytics.isClarityEnabled(),'Clarity active immediately after withdrawal');
            ensure(__clarityCalls.at(-1)[0]==='stop','Clarity SDK not stopped');
            const before=__clarityCalls.length;
            ensure(window.trackAnalyticsEvent('diagnostic_submitted')===false,'Clarity event accepted after withdrawal');
            ensure(__clarityCalls.length===before,'Clarity event sent after withdrawal');
            window.efficiaAds.leadCreated({success:true,analysisId:'22222222-2222-4222-8222-222222222222',status:'awaiting_review'});
            ensure(__pixel.filter(x=>x[0]==='measure').length===0,'OpenAI event after withdrawal');
            await new Promise(resolve=>setTimeout(resolve,100));
            document.querySelector('[data-cookie-accept]').click();
            ensure(window.efficiaAnalytics.isClarityEnabled(),'explicit acceptance did not resume Clarity');
            ensure(__clarityCalls.filter(x=>x[0]==='start').length===1,'Clarity restarted more than once');
            ensure(__sdkLoads===1 && __clarityLoads===1,'duplicate SDK after reacceptance');
            window.efficiaAds.leadCreated({success:true,analysisId:'11111111-1111-4111-8111-111111111111',status:'awaiting_review'});
            ensure(__pixel.filter(x=>x[0]==='measure').length===0,'previous conversion duplicated after reacceptance');
            document.querySelector('[data-cookie-refuse]').click();
            ensure(!window.efficiaAnalytics.isClarityEnabled(),'second withdrawal failed');
            sessionStorage.setItem('consent-test-stage','withdrawn');
            location.reload(); // Deliberate persistence check only, never required to stop tracking.
            return;
          }
          if(stage==='withdrawn'){
            ensure(__sdkLoads===0 && __clarityLoads===0,'tracking restarted after withdrawal and reload');
            ensure(window.efficiaConsent.read().analytics===false && window.efficiaConsent.read().advertising===false,'withdrawal not saved');
            publishResult(sessionStorage.getItem('consent-test-result'));
            return;
          }
          ensure(__sdkLoads===0 && __clarityLoads===0,'old consent must not grant advanced matching tracking');
          document.querySelector('[data-cookie-customize]').click();
          ensure(!document.querySelector('[data-cookie-analytics]').checked && !document.querySelector('[data-cookie-advertising]').checked,'options prechecked');
          document.querySelector('[data-cookie-close]').click();
          ensure(__sdkLoads===0 && __clarityLoads===0,'closing preferences granted consent');
          const consent=${JSON.stringify(scenario.consent)};
          if (['all','reload'].includes(consent)) document.querySelector('[data-cookie-accept]').click();
          else if (consent==='refuse') document.querySelector('[data-cookie-refuse]').click();
          else {
            document.querySelector('[data-cookie-customize]').click();
            document.querySelector(consent==='analytics'?'[data-cookie-analytics]':'[data-cookie-advertising]').click();
            document.querySelector('[data-cookie-save]').click();
          }
          await Promise.resolve();
          ensure(__pixel.filter(x=>x[0]==='measure').length===0,'event before registration');
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
          ensure(__pixel.filter(x=>x[0]==='measure').length===0,'event on Continue');
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
          ensure(__pixel.filter(x=>x[0]==='measure').length===0,'event on backend error');
          ensure(second.querySelector('[role="alert"]').textContent.includes('Plusieurs fiches correspondent'),'backend error message lost');
          second.querySelector('button').click(); second.querySelector('button').click();
          ensure(second.querySelector('button').disabled,'submission not locked');
          await waitFor(()=>modal.querySelector('[data-step="3"]').classList.contains('is-active'));
          ensure(Array.from(modal.querySelectorAll('[data-step="3"] p')).some(p=>p.textContent===${JSON.stringify(confirmationTimingCopy)}),'confirmation delay differs from approved copy');
          ensure(__calls.length===3,'unexpected duplicate submission');
          window.efficiaAds.leadCreated({success:true,analysisId:'11111111-1111-4111-8111-111111111111',status:'awaiting_review'});
          const measured=__pixel.filter(x=>x[0]==='measure');
          const expected=['all','ads','withdraw','reload'].includes(consent)?1:0;
          ensure(measured.length===expected,'incorrect conversion count');
          ensure(__sdkLoads===(['refuse','analytics'].includes(consent)?0:1),'incorrect SDK load count');
          ensure(__clarityLoads===(['all','analytics','reload'].includes(consent)?1:0),'consent purposes not independent');
          if (expected) ensure(JSON.stringify(measured[0])===JSON.stringify(['measure','lead_created',{type:'customer_action'},{event_id:'free_diagnostic_11111111-1111-4111-8111-111111111111'}]),'PII, purchase value or invalid event_id');
          if(consent==='withdraw'){
            document.querySelector('[data-cookie-refuse]').click();
            window.efficiaAds.leadCreated({success:true,analysisId:'22222222-2222-4222-8222-222222222222',status:'awaiting_review'});
            ensure(__pixel.at(-1)[0]==='consent' && __pixel.at(-1)[1]===false,'withdrawal not propagated');
            ensure(__pixel.filter(x=>x[0]==='measure').length===1,'event after withdrawal');
          }
          ensure(window.efficiaConsent.read().advertising===['all','ads','blocked','reload'].includes(consent),'choice not persisted');
          ensure(__calls[1].idempotency_key===__calls[2].idempotency_key,'retry changed idempotency key');
          ensure(__calls[0].idempotency_key===__calls[1].idempotency_key,'capture and request use different journeys');
          ensure(__errors.length===0,'JavaScript initialization error');
          if (${Boolean(scenario.popup)}) {
            document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            ensure(modal.hasAttribute('inert'),'popup Escape broken');
          }
          const result=JSON.stringify({calls:__calls,errors:__errors,query:location.search,success:true});
          if(consent==='reload'){
            sessionStorage.setItem('consent-test-result',result);
            sessionStorage.setItem('consent-test-stage','granted');
            location.reload(); return;
          }
          publishResult(result);
        } catch(error) {publishResult(JSON.stringify({error:String(error.stack)}));}
      })();
    <\/script>`;
    const served = html.replace(/<script src="\/?js\/analytics\.js(?:\?[^"<>]*)?"><\/script>/, `${script}$&`).replace("</body>", `${runner}</body>`);
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if(pathname === "/consent-reload-test") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        // Observe reloads from a stable parent document instead of losing the CDP evaluation context.
        response.end(`<output id="landing-test-result"></output><script>addEventListener('message',e=>{if(e.origin===location.origin && e.data?.consentResult)document.getElementById('landing-test-result').textContent=e.data.consentResult;});</script><iframe src="/diagnostic-gratuit"></iframe>`);
        return;
      }
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
      const result = JSON.parse(await collectPageResultWithIsolatedChrome({chrome, url:`http://127.0.0.1:${server.address().port}${scenario.consent === "reload" ? "/consent-reload-test" : scenario.path}`, profileDir:directory, phase:"diagnostic-landing", selector:"#landing-test-result", resultWait:12_000}));
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
      assert.equal(result.query, new URL(scenario.path, "http://localhost").search);
      if (scenario.unknown) {
        assert.equal(payload.company_name, "Entreprise de test locale");
        assert.equal(payload.city, "Houffalize");
        assert.equal(payload.google_business_url, undefined);
      } else assert.equal(payload.google_business_url, "https://www.google.com/maps/place/Entreprise+de+test");
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await mf.dispose();
      rmSync(directory, { recursive:true, force:true });
    }
  });
}
