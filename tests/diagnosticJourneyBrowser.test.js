import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import test from "node:test";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";

const root = new URL("../", import.meta.url);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// UI contract: real app.js/admin.js and form markup, local simulated services.
// Persistence/API/atomicity are exercised with SQLite in publicDiagnosticRequest.
for (const reviewReason of [null, "not_found", "unavailable", "ambiguous", "declared_absent"]) {
test(`Chrome : capture, rechargement, même parcours et examen ${reviewReason || "fiche trouvée"}`, { skip: !existsSync(chrome), timeout: 40_000 }, async () => {
  const rows = new Map();
  const submissions = [];
  const requests = [];
  let rejectNextRequest = true;
  const safePage = filename => readFileSync(new URL(filename, root), "utf8")
    .replace(/<link\b[^>]*href="https:[^>]*>/g, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
    .replace("</body>", `<script>window.__errors=[];addEventListener('error',e=>__errors.push(e.message));</script><script src="/js/${filename === "admin.html" ? "admin" : "app"}.js"></script></body>`);
  const runner = `<!doctype html><output id="result"></output><iframe id="public"></iframe><iframe id="admin"></iframe><script>
  (async()=>{
    const check=(v,m)=>{if(!v)throw Error(m);};
    const wait=async f=>{for(let i=0;i<160;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('state timeout');};
    const page=async(frame,path)=>{await new Promise(r=>{frame.onload=r;frame.src=path;});return frame.contentDocument;};
    const pub=document.querySelector('#public'), adm=document.querySelector('#admin');
    const fill=(doc,n,v)=>{const el=doc.querySelector('[name="'+n+'"]');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));};
    const start=async doc=>{
      doc.querySelector('[data-form-step="diagnostic-start"]').click();
      fill(doc,'firstName','Camille');fill(doc,'email','journey@example.com');
      const button=doc.querySelector('[data-step="1"] button');button.click();button.click();
      await wait(()=>doc.querySelector('[data-step="2"]').classList.contains('is-active'));
    };
    try {
      let doc=await page(pub,'/');await start(doc);
      let admin=await page(adm,'/admin');
      await wait(()=>admin.querySelector('[data-admin-diagnostics]').textContent.includes('Demande à compléter'));
      check(admin.querySelector('[data-admin-diagnostic-count]').textContent==='1','capture counter');
      check(admin.querySelector('[data-admin-diagnostics]').querySelectorAll('tr').length===1,'duplicate capture');
      check(!admin.querySelector('[data-admin-diagnostics] a'),'nonexistent analysis link');
      check((admin.querySelector('[data-admin-diagnostics]').textContent.match(/À compléter/g)||[]).length===2,'missing company/city placeholders');
      await wait(()=>admin.querySelector('[data-admin-completed-toggle]').textContent.endsWith('(1)'));
      const toggle=admin.querySelector('[data-admin-completed-toggle]'), list=admin.querySelector('#completed-audits-list');
      check(toggle.tagName==='BUTTON' && toggle.type==='button','native keyboard button');toggle.focus();
      check(admin.activeElement===toggle,'toggle not focusable');
      check(list.hidden && getComputedStyle(list).display==='none' && toggle.getAttribute('aria-expanded')==='false','not collapsed by default');
      const actions=list.innerHTML; toggle.click();
      check(!list.hidden && toggle.textContent==='Masquer les audits terminés (1)' && toggle.getAttribute('aria-expanded')==='true','expand failed');
      check(list.querySelector('a').textContent==='Consulter' && list.querySelector('[data-duplicate-audit]') && list.querySelector('[data-transfer-premium]'),'lost completed actions');
      toggle.click();check(list.hidden && list.innerHTML===actions,'collapse altered records');
      doc=await page(pub,'/?resume=1');await start(doc);
      if (${Boolean(reviewReason)}) {
        doc.querySelector('[name="unknownGoogleBusiness"]').click();
        fill(doc,'company','Entreprise fictive');fill(doc,'city','Ville fictive');
        doc.querySelector('[name="countryCode"]').value='BE';
        if (${reviewReason === "declared_absent"}) doc.querySelector('[name="declaredNoListing"]').click();
      } else fill(doc,'googleBusiness','https://www.google.com/maps/place/Test');
      let button=doc.querySelector('[data-step="2"] button');button.click();
      await wait(()=>!button.disabled);check(doc.querySelector('[data-step-two-error]').textContent,'step2 error missing');
      admin=await page(adm,'/admin?retry=1');
      await wait(()=>admin.querySelector('[data-admin-diagnostics]').textContent.includes('Demande à compléter'));
      button.click();button.click();
      await wait(()=>doc.querySelector('[data-step="3"]').classList.contains('is-active'));
      if (${Boolean(reviewReason)}) {
        const confirmation=doc.querySelector('[data-step="3"]');
        check(confirmation.querySelector('h2').textContent==='Votre demande est enregistrée','incorrect confirmation');
        check(confirmation.textContent.includes('Aucun score n’a été calculé.'),'invented score');
        check(confirmation.querySelector('.conversion-next').hidden,'automatic score promised');
        if (${reviewReason === "not_found"}) check(confirmation.textContent.includes('Aucune fiche Google trouvée lors de notre recherche.'),'absence not qualified');
        if (${reviewReason === "unavailable"}) check(confirmation.textContent.includes('La recherche est temporairement indisponible.') && !confirmation.textContent.includes('Aucune fiche Google trouvée'),'outage presented as absence');
        if (${reviewReason === "ambiguous"}) check(confirmation.textContent.includes('Plusieurs résultats nécessitent une vérification.'),'ambiguity missing');
        if (${reviewReason === "declared_absent"}) check(confirmation.textContent.includes('Vous avez indiqué ne pas avoir de fiche Google.'),'declaration presented as a finding');
      }
      admin=await page(adm,'/admin?complete=1');
      await wait(()=>admin.querySelector('[data-admin-diagnostics] a'));
      check(admin.querySelector('[data-admin-diagnostics]').querySelectorAll('tr').length===1,'completion created a second line');
      check(admin.querySelector('[data-admin-diagnostic-count]').textContent==='1','completion counter');
      check(admin.querySelector('[data-admin-diagnostics]').textContent.includes('Entreprise fictive'),'completion not enriched');
      check(!admin.querySelector('[data-admin-diagnostics]').textContent.includes('Demande à compléter'),'incomplete status retained');
      if (${Boolean(reviewReason)}) {
        check(!admin.querySelector('[data-admin-diagnostics] a[href*="analysisId"]'),'fake analysis link');
        const details=admin.querySelector('[data-admin-diagnostics] details');
        check(details,'manual review missing');details.querySelector('summary').click();
        check(details.open && details.textContent.includes('Aucune fiche ni aucun score n’a été créé.'),'cannot examine request');
        check(details.textContent.includes('BE'),'country lost');
      }
      check(pub.contentWindow.__errors.length===0 && adm.contentWindow.__errors.length===0,'JavaScript error');
      doc=await page(pub,'/?new=1');await start(doc);
      admin=await page(adm,'/admin?new=1');await wait(()=>admin.querySelector('[data-admin-diagnostic-count]').textContent==='2');
      check(admin.querySelector('[data-admin-diagnostics]').querySelectorAll('tr').length===2,'new journey merged by email');
      document.querySelector('#result').textContent=JSON.stringify({success:true});
    }catch(e){document.querySelector('#result').textContent=JSON.stringify({error:String(e.stack)});}
  })();</script>`;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    requests.push(`${req.method} ${path}`);
    const json = (body, status = 200) => {res.writeHead(status, { "Content-Type": "application/json" });res.end(JSON.stringify(body));};
    if (path === "/subscribe") {
      let body = ""; for await (const chunk of req) body += chunk;
      const p = JSON.parse(body); submissions.push(p);
      if (p.step === "lead_capture") {
        if (!rows.has(p.idempotency_key)) rows.set(p.idempotency_key, { firstName: p.first_name, email: p.email, status: "incomplete", mailerLiteStatus: "synced", submittedAt: new Date().toISOString() });
        return json({ success: true, status: "incomplete" });
      }
      if (rejectNextRequest) {rejectNextRequest = false;return json({ success: false }, 503);}
      Object.assign(rows.get(p.idempotency_key), reviewReason
        ? {company:p.company_name,city:p.city,countryCode:p.country_code,status:"manual_review",reviewReason}
        : { analysisId: "local-analysis", company: "Entreprise fictive", city: "Ville fictive", status: "awaiting_review", reportType: "free" });
      return json(reviewReason ? {success:true,requestId:p.idempotency_key,status:"manual_review",reviewReason}
        : { success: true, analysisId: "local-analysis", status: "awaiting_review" });
    }
    if (path === "/api/admin/diagnostic-requests") return json({ success: true, diagnostics: [...rows.values()], pendingCount: rows.size });
    if (path === "/api/admin/audit-snapshots") return json({ success: true, audits: [{ analysisId: "finalized", company: "Rapport conservé", reportType: "free", answersVersion: "score-efficia-questionnaire-v4" }] });
    if (path === "/api/admin/audit-drafts" || path === "/admin/orders") return json({ success: true, drafts: [], orders: [], stats: {} });
    if (["/", "/admin", "/runner"].includes(path)) {res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });res.end(path === "/runner" ? runner : safePage(path === "/admin" ? "admin.html" : "index.html"));return;}
    if (/^\/(js|css|assets)\//.test(path) && !path.includes("..")) {
      try {res.writeHead(200, { "Content-Type": ({ ".js": "text/javascript", ".css": "text/css" })[extname(path)] || "application/octet-stream" });res.end(readFileSync(new URL(`.${path}`, root)));return;} catch { /* Missing test asset is harmless. */ }
    }
    res.writeHead(404);res.end();
  });
  const dir = mkdtempSync(join(tmpdir(), "efficia-journey-chrome-"));
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const result = JSON.parse(await collectPageResultWithIsolatedChrome({ chrome, url: `http://127.0.0.1:${server.address().port}/runner`, profileDir: dir, phase: "diagnostic-journey", selector: "#result", resultWait: 18_000 }));
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.success, true);
    assert.equal(submissions.length, 5);
    assert.equal(new Set(submissions.slice(0, 4).map(p => p.idempotency_key)).size, 1);
    assert.notEqual(submissions[4].idempotency_key, submissions[0].idempotency_key);
    assert.equal(rows.size, 2);
    if (reviewReason) {
      assert.equal(submissions[2].country_code,"BE");
      assert.equal(Boolean(submissions[2].declared_no_listing),reviewReason === "declared_absent");
      assert.equal(submissions[2].google_business_url,undefined);
    }
    assert.equal(requests.filter(r => r.startsWith("POST ") && r !== "POST /subscribe").length, 0);
  } finally {
    server.closeAllConnections();await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
}
