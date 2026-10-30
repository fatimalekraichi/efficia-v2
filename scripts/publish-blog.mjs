import { readdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://efficiadigital.com';
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1].toLowerCase(), m[3]]));
const fail = message => { throw new Error(message); };
export function dateInBrussels(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) fail(`Date invalide : ${date}`);
  return date;
}
const schemaPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const schemas = html => [...html.matchAll(schemaPattern)].map(m => JSON.parse(m[1]));
const cardsIn = html => [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].filter(m => (attrs(m[0].split('>')[0]).class || '').split(/\s+/).includes('blog-card'));
const dateLabel = date => new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
function checkTimes(html, date, label) {
  const times = [...html.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/gi)];
  if (!times.length || times.some(m => attrs(m[1]).datetime !== date || m[2].replace(/<[^>]+>/g, '').trim() !== dateLabel(date))) fail(`${label} : date visible différente de ${date}`);
}
function checkPost(post, date, label) {
  if (!post || post.datePublished !== date || post.dateModified !== date) fail(`${label} : dates JSON-LD différentes de ${date}`);
}
export async function validateSources(root) {
  const read = name => readFile(join(root, name), 'utf8');
  const listing = await read('blog.html'), sitemap = await read('sitemap.xml');
  const cards = cardsIn(listing);
  const blogs = schemas(listing).filter(s => s['@type'] === 'Blog');
  if (blogs.length !== 1 || !Array.isArray(blogs[0].blogPost)) fail('blog.html : schéma Blog unique requis');
  const posts = blogs[0].blogPost;
  const entries = [...sitemap.matchAll(/<url>\s*[\s\S]*?<\/url>/g)].map(m => m[0]);
  const articles = [];
  for (const entry of await readdir(join(root, 'blog'), { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(entry.name)) fail(`blog/ : fichier inattendu ${entry.name}`);
    const slug = basename(entry.name, '.html'), html = await read(`blog/${entry.name}`);
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const dates = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0])).filter(a => a.name === 'efficia:publish-date');
    if (dates.length !== 1) fail(`${slug} : une seule balise efficia:publish-date est obligatoire`);
    const date = validDate(dates[0].content), url = `${origin}/blog/${slug}`;
    checkTimes(html, date, slug);
    const ownPosts = schemas(html).filter(s => s['@type'] === 'BlogPosting');
    if (ownPosts.length !== 1 || ownPosts[0].url !== url) fail(`${slug} : BlogPosting unique avec URL canonique requis`);
    checkPost(ownPosts[0], date, slug);
    const foundCards = cards.filter(m => attrs(m[0].split('>')[0])['data-blog-slug'] === slug);
    if (foundCards.length !== 1 || attrs(foundCards[0][0].split('>')[0])['data-publish-date'] !== date) fail(`${slug} : carte unique et date identique requises`);
    checkTimes(foundCards[0][0], date, `Carte ${slug}`);
    const foundPosts = posts.filter(p => p.url === url);
    if (foundPosts.length !== 1) fail(`${slug} : entrée BlogPosting unique requise dans blog.html`);
    checkPost(foundPosts[0], date, `Liste ${slug}`);
    const urls = entries.filter(e => e.includes(`<loc>${url}</loc>`));
    if (urls.length !== 1 || !urls[0].includes(`<lastmod>${date}</lastmod>`)) fail(`${slug} : date du sitemap incohérente`);
    articles.push({ slug, date, url });
  }
  if (cards.length !== articles.length || posts.length !== articles.length) fail('blog.html : cartes ou JSON-LD sans article correspondant');
  const cardDates = cards.map(m => attrs(m[0].split('>')[0])['data-publish-date']);
  if (JSON.stringify(cardDates) !== JSON.stringify([...cardDates].sort().reverse())) fail('blog.html : classer les cartes de la plus récente à la plus ancienne');
  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
async function filesUnder(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isSymbolicLink()) fail(`Lien symbolique interdit dans la sortie : ${path}`);
    if (e.isDirectory()) result.push(...await filesUnder(path)); else result.push(path);
  }
  return result;
}
const decodeEntities = value => value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/&amp;/g, '&').replace(/&sol;/g, '/').replace(/&colon;/g, ':');
function targetSlug(href, page) {
  try {
    const url = new URL(decodeEntities(href), `${origin}/${page}`);
    if (![origin, 'https://www.efficiadigital.com', 'http://efficiadigital.com', 'http://www.efficiadigital.com'].includes(url.origin)) return null;
    return decodeURIComponent(url.pathname).replace(/\/+$/, '').replace(/\.html$/, '').match(/^\/blog\/([^/]+)$/)?.[1];
  } catch { return null; }
}
export async function build({ root = process.cwd(), site: siteOption = 'dist/site', today = dateInBrussels(), includeFuture = false } = {}) {
  root = resolve(root); validDate(today);
  if (includeFuture && process.env.CF_PAGES) fail('--include-future est réservé aux prévisualisations locales');
  const site = resolve(root, siteOption);
  if (site !== join(root, 'dist', 'site')) fail('Le filtrage est limité au dossier préparé dist/site');
  for (const dir of [join(root, 'dist'), site]) {
    try { if (!(await lstat(dir)).isDirectory()) fail(`${dir} doit être un dossier, sans lien symbolique`); }
    catch (e) { if (e.code === 'ENOENT') fail('Packaging manquant : lancer d’abord node scripts/package-commerce.mjs dist/site'); throw e; }
  }
  const files = await filesUnder(site); // Reject symlinks before reading or writing anything.
  const articles = await validateSources(site);
  const future = new Set(articles.filter(a => a.date > today && !includeFuture).map(a => a.slug));
  const deleted = new Set([...future].map(slug => join(site, 'blog', `${slug}.html`)));
  const edits = new Map();
  // Work only on the package; validate the complete result before applying edits.
  if (future.size) {
    const listingPath = join(site, 'blog.html');
    let listing = await readFile(listingPath, 'utf8');
    for (const card of cardsIn(listing)) if (future.has(attrs(card[0].split('>')[0])['data-blog-slug'])) listing = listing.replace(card[0], '');
    listing = listing.replace(schemaPattern, (whole, json) => {
      const data = JSON.parse(json);
      if (data['@type'] !== 'Blog') return whole;
      data.blogPost = data.blogPost.filter(post => !future.has(targetSlug(post.url, 'blog.html')));
      return whole.replace(json, JSON.stringify(data, null, 2));
    });
    edits.set(listingPath, listing);
    const sitemapPath = join(site, 'sitemap.xml');
    edits.set(sitemapPath, (await readFile(sitemapPath, 'utf8')).replace(/<url>[\s\S]*?<\/url>/g, entry => future.has(targetSlug(entry.match(/<loc>([^<]+)<\/loc>/)?.[1], 'sitemap.xml')) ? '' : entry));
    const ga4Path = join(site, 'js/ga4.js');
    const ga4 = await readFile(ga4Path, 'utf8');
    edits.set(ga4Path, ga4.replace(/const PAGES = new Map\(\[([\s\S]*?)\]\);/, (whole, entries) => whole.replace(entries, entries.replace(/\[\s*(["'])(.*?)\1\s*,\s*(["'])(?:\\.|(?!\3).)*\3\s*\]\s*,?/g, (entry, quote, url) => future.has(targetSlug(url, 'js/ga4.js')) ? '' : entry))));
  }
    for (const file of files) {
      if (deleted.has(file)) continue;
      if (!/\.(?:html|js|json|xml|css|txt)$/.test(file)) continue;
      const content = edits.get(file) ?? await readFile(file, 'utf8'), page = file.slice(site.length + 1);
      for (const match of content.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        const slug = targetSlug(match[1] ?? match[2] ?? match[3], page);
        if (future.has(slug)) fail(`Erreur de calendrier : ${page} contient un lien vers l'article programmé ${slug}`);
      }
      // Fail closed for unhandled JSON, encoded URLs, redirects or script references.
      let decoded = decodeEntities(content); try { decoded = decodeURIComponent(decoded); } catch { /* retain text */ }
      for (const slug of future) if (decoded.includes(slug)) fail(`Erreur de calendrier : référence à l'article programmé ${slug} dans ${page}`);
    }
    for (const [file, content] of edits) await writeFile(file, content);
    for (const file of deleted) await rm(file);
    console.log('Filtrage du dossier préparé : dist/site (sans recopie)');
    const published = articles.filter(a => !future.has(a.slug)), scheduled = articles.filter(a => future.has(a.slug));
    console.log(`Date Bruxelles : ${today}${includeFuture ? ' (prévisualisation locale, futurs inclus)' : ''}`);
    for (const [label, list] of [['Publiés', published], ['Programmés', scheduled]]) console.log(`${label} :\n${list.map(a => `- ${a.date} — ${a.slug}`).join('\n') || '- aucun'}`);
    return { published, scheduled, site };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--include-future' && !a.startsWith('--today=') && a !== '--site=dist/site') || args.filter(a => a.startsWith('--today=')).length > 1) fail('Usage : node scripts/publish-blog.mjs [--site=dist/site] [--today=AAAA-MM-JJ] [--include-future]');
    await build({ today: args.find(a => a.startsWith('--today='))?.slice(8) ?? dateInBrussels(), includeFuture: args.includes('--include-future') });
  } catch (error) { console.error(`Publication interrompue : ${error.message}`); process.exitCode = 1; }
}
