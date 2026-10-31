import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateSources, dateInBrussels } from '../scripts/publish-blog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const first = 'fiche-google-ou-site-internet-artisan', future = 'article-fictif-programme';
const read = path => readFile(path, 'utf8');
const script = join(root, 'scripts/publish-blog.mjs');
async function fixture(t, date = '2026-10-14') {
  const dir = await mkdtemp(join(tmpdir(), 'efficia-publication-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const folder of ['blog', 'js', 'css', 'assets', 'functions', 'docs', 'tests', 'scripts']) await mkdir(join(dir, folder));
  await writeFile(join(dir, 'scripts/package-commerce.mjs'), await read(join(root, 'scripts/package-commerce.mjs')));
  for (const name of ['blog.html', `blog/${first}.html`, 'sitemap.xml', 'js/ga4.js', '_headers', '_redirects', 'robots.txt']) await writeFile(join(dir, name), await read(join(root, name)));
  for (const [name, text] of Object.entries({'css/blog.css':'body {}', 'assets/test.webp':'image', 'functions/ping.js':'export const onRequest = () => new Response("ok");', 'index.html':'<a href="/blog">Blog</a>', '.env':'SECRET_NOT_PUBLIC', 'docs/draft.html':future, 'tests/draft.html':future})) await writeFile(join(dir, name), text);
  // Keep the two-article fixture independent of the growing editorial catalogue.
  const catalogue = await validateSources(root);
  for (const article of catalogue.filter(a => a.slug !== first)) {
    const slug = article.slug;
    for (const name of ['blog.html', 'sitemap.xml', 'js/ga4.js']) {
      let value = await read(join(dir, name));
      if (name === 'blog.html') {
        value = value.replace(/<article class="blog-card"[\s\S]*?<\/article>/g, card => card.includes(`data-blog-slug="${slug}"`) ? '' : card);
        value = value.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
          const data = JSON.parse(json); data.blogPost = data.blogPost.filter(p => p.url !== article.url);
          return start + JSON.stringify(data) + end;
        });
      } else if (name === 'sitemap.xml') {
        value = value.replace(/<url>[\s\S]*?<\/url>/g, entry => entry.includes(`<loc>${article.url}</loc>`) ? '' : entry);
      } else value = value.split('\n').filter(line => !line.includes(`/blog/${slug}"`)).join('\n');
      await writeFile(join(dir, name), value);
    }
  }
  const label = new Intl.DateTimeFormat('fr-BE', { day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Brussels' }).format(new Date(`${date}T12:00:00Z`));
  const futureHtml = (await read(join(dir, `blog/${first}.html`))).replaceAll(first, future).replaceAll('2026-10-12', date).replaceAll('12 octobre 2026', label);
  await writeFile(join(dir, `blog/${future}.html`), futureHtml);
  let listing = await read(join(dir, 'blog.html'));
  const card = listing.match(/<article class="blog-card"[\s\S]*?<\/article>/)[0];
  listing = listing.replace(card, card.replaceAll(first, future).replaceAll('2026-10-12', date).replaceAll('12 octobre 2026', label)+'\n'+card);
  listing = listing.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
    const data = JSON.parse(json), post = JSON.parse(JSON.stringify(data.blogPost[0]).replaceAll(first, future).replaceAll('2026-10-12', date));
    data.blogPost.unshift(post); return start+JSON.stringify(data)+end;
  });
  await writeFile(join(dir, 'blog.html'), listing);
  await writeFile(join(dir, 'sitemap.xml'), (await read(join(dir, 'sitemap.xml'))).replace('</urlset>', `<url><loc>https://efficiadigital.com/blog/${future}</loc><lastmod>${date}</lastmod></url></urlset>`));
  await writeFile(join(dir, 'js/ga4.js'), (await read(join(dir, 'js/ga4.js'))).replace('const PAGES = new Map([', `const PAGES = new Map([\n    ["/blog/${future}", "Titre futur"],`));
  return dir;
}
async function packageSite(dir) {
 await rm(join(dir,'dist'),{recursive:true,force:true});
 const result=spawnSync(process.execPath,[join(dir,'scripts/package-commerce.mjs'),'dist/site'],{cwd:dir,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}
async function run(dir, ...args) { await packageSite(dir); return spawnSync(process.execPath, [script, ...args], { cwd:dir, encoding:'utf8' }); }
async function snapshot(dir, prefix='') {
  const result={};
  for (const e of await readdir(join(dir,prefix),{withFileTypes:true})) {
    if (e.name==='dist') continue;
    const name=join(prefix,e.name);
    if(e.isDirectory()) Object.assign(result, await snapshot(dir,name));
    else result[name]=createHash('sha256').update(await readFile(join(dir,name))).digest('hex');
  }
  return result;
}
const exists = async p => { try {await access(p); return true;} catch {return false;} };
test('toutes les dates des sources correspondent à la balise unique ; premier article inchangé',async()=>{
 const articles=await validateSources(root);
 assert.equal(articles.find(a=>a.slug===first).date,'2026-10-12');
});
test('Europe/Brussels : minuit local en été et en hiver',()=>{
 assert.equal(dateInBrussels(new Date('2026-10-13T22:30:00Z')),'2026-10-14');
 assert.equal(dateInBrussels(new Date('2026-12-13T23:30:00Z')),'2026-12-14');
 assert.equal(dateInBrussels(new Date('2026-10-13T21:59:59Z')),'2026-10-13');
});
test('13 octobre : aucune fuite, sources intactes, assets et Functions conservés',async t=>{
 const dir=await fixture(t), before=await snapshot(dir), result=await run(dir,'--today=2026-10-13');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Programmés :\n- 2026-10-14 — article-fictif-programme/);
 assert.equal(await exists(join(dir,`dist/site/blog/${future}.html`)),false);
 assert.equal(await exists(join(dir,`dist/site/blog/${first}.html`)),true);
 for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok(!(await read(join(dir,'dist/site',file))).includes(future),file);
 for(const file of ['_headers','_redirects','css/blog.css','assets/test.webp']) assert.deepEqual(await readFile(join(dir,'dist/site',file)),await readFile(join(dir,file)));
 assert.deepEqual(await readFile(join(dir,'dist/site/functions/ping.js')),await readFile(join(dir,'functions/ping.js')));
 for(const path of ['tests','docs','.env']) assert.equal(await exists(join(dir,'dist/site',path)),false);
 assert.deepEqual(await snapshot(dir),before);
});
test('14 octobre : article présent partout, y compris GA4, premier article conservé',async t=>{
 const dir=await fixture(t), before=await snapshot(dir), result=await run(dir,'--today=2026-10-14');
 assert.equal(result.status,0,result.stderr);
 for(const slug of [first,future]) {
  assert.equal(await exists(join(dir,`dist/site/blog/${slug}.html`)),true);
  for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok((await read(join(dir,'dist/site',file))).includes(slug),file);
 }
 assert.deepEqual(await snapshot(dir),before);
});
test('article lointain et reconstruction après recul de date : aucune ancienne sortie ne fuit',async t=>{
 const dir=await fixture(t,'2099-01-01');
 assert.equal((await run(dir,'--today=2099-01-01')).status,0);
 assert.equal((await run(dir,'--today=2026-10-13')).status,0);
 assert.equal(await exists(join(dir,`dist/site/blog/${future}.html`)),false);
 for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok(!(await read(join(dir,'dist/site',file))).includes(future));
});
for(const href of [`/blog/${future}`,`${future}.html#suite`,`https://efficiadigital.com/blog/${future}/?x=1`,`/blog/%61rticle-fictif-programme`]) test(`lien futur interdit : ${href}`,async t=>{
 const dir=await fixture(t), file=join(dir,`blog/${first}.html`);
 await writeFile(file,(await read(file)).replace('</main>',`<a href='${href}'>Suite</a></main>`));
 const before=await snapshot(dir), result=await run(dir,'--today=2026-10-13');
 assert.notEqual(result.status,0); assert.match(result.stderr,/Erreur de calendrier.*lien/);
 assert.equal(await exists(join(dir,'dist')),true); assert.deepEqual(await snapshot(dir),before);
});
test('dates absentes, invalides ou incohérentes bloquent le build sans toucher aux sources',async t=>{
 const dir=await fixture(t), file=join(dir,`blog/${future}.html`), original=await read(file);
 for(const modified of [original.replace('name="efficia:publish-date"','name="other"'),original.replace('content="2026-10-14"','content="2026-02-30"'),original.replace('datetime="2026-10-14"','datetime="2026-10-15"'),original.replace('14 octobre 2026','15 octobre 2026')]) {
  await writeFile(file,modified); const result=await run(dir,'--today=2026-10-13');
  assert.notEqual(result.status,0); assert.equal(await exists(join(dir,'dist')),true);
 }
});
test('include-future ne contourne pas le mode production ; arguments inconnus et date impossible refusés',async t=>{
 const dir=await fixture(t); let result=await run(dir,'--today=2026-10-13','--include-future');
 assert.notEqual(result.status,0); assert.match(result.stderr,/branche de prévisualisation/);
 assert.notEqual((await run(dir,'--today=2026-02-30')).status,0);
 assert.notEqual((await run(dir,'--unexpected')).status,0);
 result=spawnSync(process.execPath,[script,'--include-future'],{cwd:dir,encoding:'utf8',env:{...process.env,CF_PAGES:'1'}});
 assert.notEqual(result.status,0); assert.match(result.stderr,/branche de prévisualisation/);
});

test('filtrage après packaging : aucun fichier commerce recopié, écrasé ou supprimé', async t => {
 const dir=await fixture(t); await packageSite(dir);
 const site=join(dir,'dist/site');
 // These exist only in the package, or differ from source on purpose.
 for(const [file,body] of Object.entries({'achat.html':'checkout prepared by commerce', 'paiement-reussi.html':'payment result prepared by commerce', 'functions/ping.js':'packaged function', 'assets/test.webp':'packaged image', '_headers':'packaged headers', 'commerce-only.json':'{"prepared":true}'})) await writeFile(join(site,file),body);
 await rm(join(site,'css/blog.css')); // A recopy would wrongly restore this file.
 const before=await snapshot(site), sources=await snapshot(dir);
 const result=spawnSync(process.execPath,[script,'--site=dist/site','--today=2026-10-13'],{cwd:dir,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const after=await snapshot(site);
 const allowed=new Set(['blog.html','sitemap.xml','js/ga4.js',`blog/${future}.html`]);
 for(const [file,hash] of Object.entries(before)) if(!allowed.has(file)) assert.equal(after[file],hash,file);
 for(const file of Object.keys(after)) assert.ok(file in before,`Fichier ajouté par erreur : ${file}`);
 assert.equal(await exists(join(site,'css/blog.css')),false);
 assert.equal(await exists(join(site,`blog/${future}.html`)),false);
 assert.deepEqual(await snapshot(dir),sources);
});

test('packaging obligatoire ; erreur de calendrier sans écrasement du dossier préparé',async t=>{
 const dir=await fixture(t);
 let result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 assert.notEqual(result.status,0); assert.match(result.stderr,/Packaging manquant/);
 await packageSite(dir); const site=join(dir,'dist/site');
 await writeFile(join(site,'index.html'),`<a href="/blog/${future}">Futur</a>`);
 const before=await snapshot(site);
 result=spawnSync(process.execPath,[script,'--today=2026-10-13'],{cwd:dir,encoding:'utf8'});
 assert.notEqual(result.status,0); assert.match(result.stderr,/Erreur de calendrier/);
 assert.deepEqual(await snapshot(site),before);
});

test('calendrier novembre : fichiers, cartes, JSON-LD, sitemap et GA4 suivent le calendrier avancé de trois jours', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'efficia-calendrier-novembre-'));
 t.after(() => rm(dir, { recursive:true, force:true }));
 for (const folder of ['blog','js','scripts']) await mkdir(join(dir,folder));
 const catalogue = await validateSources(root);
 for (const name of ['blog.html','sitemap.xml','js/ga4.js','scripts/package-commerce.mjs', ...catalogue.map(a=>`blog/${a.slug}.html`)]) await writeFile(join(dir,name),await read(join(root,name)));
 const dates = ['2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-06','2026-11-07','2026-11-10','2026-11-11'];
 for (const today of dates) {
  const count = catalogue.filter(article => article.date <= today).length;
  const result = await run(dir,`--today=${today}`);
  assert.equal(result.status,0,result.stderr);
  assert.equal((await readdir(join(dir,'dist/site/blog'))).length,count,today);
  for (const article of catalogue) {
   const published = article.date <= today;
   assert.equal(await exists(join(dir,`dist/site/blog/${article.slug}.html`)),published,`${today}: ${article.slug}`);
   for (const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.equal((await read(join(dir,'dist/site',file))).includes(`/blog/${article.slug}`),published,`${today}: ${file}: ${article.slug}`);
  }
 }
});
