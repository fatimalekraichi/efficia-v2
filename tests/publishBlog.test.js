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
  for (const folder of ['blog', 'js', 'css', 'assets', 'functions', 'docs', 'tests']) await mkdir(join(dir, folder));
  for (const name of ['blog.html', `blog/${first}.html`, 'sitemap.xml', 'js/ga4.js', '_headers', '_redirects', 'robots.txt']) await writeFile(join(dir, name), await read(join(root, name)));
  for (const [name, text] of Object.entries({'css/blog.css':'body {}', 'assets/test.webp':'image', 'functions/ping.js':'export const onRequest = () => new Response("ok");', 'index.html':'<a href="/blog">Blog</a>', '.env':'SECRET_NOT_PUBLIC', 'docs/draft.html':future, 'tests/draft.html':future})) await writeFile(join(dir, name), text);
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
function run(dir, ...args) { return spawnSync(process.execPath, [script, ...args], { cwd:dir, encoding:'utf8' }); }
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
 const dir=await fixture(t), before=await snapshot(dir), result=run(dir,'--today=2026-10-13');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Programmés :\n- 2026-10-14 — article-fictif-programme/);
 assert.equal(await exists(join(dir,`dist/site/blog/${future}.html`)),false);
 assert.equal(await exists(join(dir,`dist/site/blog/${first}.html`)),true);
 for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok(!(await read(join(dir,'dist/site',file))).includes(future),file);
 for(const file of ['_headers','_redirects','robots.txt','css/blog.css','assets/test.webp']) assert.deepEqual(await readFile(join(dir,'dist/site',file)),await readFile(join(dir,file)));
 assert.deepEqual(await readFile(join(dir,'dist/functions/ping.js')),await readFile(join(dir,'functions/ping.js')));
 for(const path of ['functions','tests','docs','.env']) assert.equal(await exists(join(dir,'dist/site',path)),false);
 assert.deepEqual(await snapshot(dir),before);
});
test('14 octobre : article présent partout, y compris GA4, premier article conservé',async t=>{
 const dir=await fixture(t), before=await snapshot(dir), result=run(dir,'--today=2026-10-14');
 assert.equal(result.status,0,result.stderr);
 for(const slug of [first,future]) {
  assert.equal(await exists(join(dir,`dist/site/blog/${slug}.html`)),true);
  for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok((await read(join(dir,'dist/site',file))).includes(slug),file);
 }
 assert.deepEqual(await snapshot(dir),before);
});
test('article lointain et reconstruction après recul de date : aucune ancienne sortie ne fuit',async t=>{
 const dir=await fixture(t,'2099-01-01');
 assert.equal(run(dir,'--today=2099-01-01').status,0);
 assert.equal(run(dir,'--today=2026-10-13').status,0);
 assert.equal(await exists(join(dir,`dist/site/blog/${future}.html`)),false);
 for(const file of ['blog.html','sitemap.xml','js/ga4.js']) assert.ok(!(await read(join(dir,'dist/site',file))).includes(future));
});
for(const href of [`/blog/${future}`,`${future}.html#suite`,`https://efficiadigital.com/blog/${future}/?x=1`,`/blog/%61rticle-fictif-programme`]) test(`lien futur interdit : ${href}`,async t=>{
 const dir=await fixture(t), file=join(dir,`blog/${first}.html`);
 await writeFile(file,(await read(file)).replace('</main>',`<a href='${href}'>Suite</a></main>`));
 const before=await snapshot(dir), result=run(dir,'--today=2026-10-13');
 assert.notEqual(result.status,0); assert.match(result.stderr,/Erreur de calendrier.*lien/);
 assert.equal(await exists(join(dir,'dist')),false); assert.deepEqual(await snapshot(dir),before);
});
test('dates absentes, invalides ou incohérentes bloquent le build sans sortie',async t=>{
 const dir=await fixture(t), file=join(dir,`blog/${future}.html`), original=await read(file);
 for(const modified of [original.replace('name="efficia:publish-date"','name="other"'),original.replace('content="2026-10-14"','content="2026-02-30"'),original.replace('datetime="2026-10-14"','datetime="2026-10-15"'),original.replace('14 octobre 2026','15 octobre 2026')]) {
  await writeFile(file,modified); const result=run(dir,'--today=2026-10-13');
  assert.notEqual(result.status,0); assert.equal(await exists(join(dir,'dist')),false);
 }
});
test('include-future local inclut tout ; arguments inconnus et date impossible refusés',async t=>{
 const dir=await fixture(t); let result=run(dir,'--today=2026-10-13','--include-future');
 assert.equal(result.status,0,result.stderr); assert.equal(await exists(join(dir,`dist/site/blog/${future}.html`)),true);
 assert.notEqual(run(dir,'--today=2026-02-30').status,0);
 assert.notEqual(run(dir,'--unexpected').status,0);
 result=spawnSync(process.execPath,[script,'--include-future'],{cwd:dir,encoding:'utf8',env:{...process.env,CF_PAGES:'1'}});
 assert.notEqual(result.status,0); assert.match(result.stderr,/locales/);
});
