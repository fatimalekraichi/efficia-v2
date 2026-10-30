import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const articles = readdirSync(new URL('blog/', root)).filter(f => f.endsWith('.html')).map(f => `blog/${f}`);
const pages = ['blog.html', ...articles];
const route = file => `/${file.replace(/\.html$/, '')}`;
const schemas = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('blog : H1 unique, métadonnées, canonical, Open Graph et schémas valides', () => {
  for (const file of pages) {
    const html = read(file), url = `https://efficiadigital.com${route(file)}`;
    assert.equal((html.match(/<h1\b/g) || []).length, 1, file);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), file);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`));
    const data = schemas(html), type = file === 'blog.html' ? 'Blog' : 'BlogPosting';
    assert.equal(data.filter(s => s['@type'] === type).length, 1);
    const breadcrumb = data.find(s => s['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement.at(-1).item, url);
    if (type === 'BlogPosting') {
      const post = data.find(s => s['@type'] === type);
      assert.equal(post.author['@type'], 'Person');
      assert.equal(post.author.name, 'Fatima Lekraichi');
      assert.equal(post.publisher.name, 'Efficia Digital');
      assert.equal(post.inLanguage, 'fr');
      assert.equal(post.mainEntityOfPage['@id'], url);
      assert.match(post.datePublished, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(post.dateModified, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(html.includes(`datetime="${post.datePublished}"`));
      assert.match(html, /<meta property="og:type" content="article">/);
      assert.match(html, /href="\/blog" aria-current="page">Blog/);
    }
  }
});

test('liste, fichiers, schéma Blog et sitemap concordent ; dates décroissantes', () => {
  const listing = read('blog.html'), sitemap = read('sitemap.xml');
  const listed = [...new Set([...listing.matchAll(/href="(\/blog\/[^"#?]+)"/g)].map(m => `${m[1].slice(1)}.html`))];
  assert.deepEqual(listed.sort(), [...articles].sort());
  const posts = schemas(listing).find(s => s['@type'] === 'Blog').blogPost;
  assert.deepEqual(posts.map(p => p.url).sort(), articles.map(f => `https://efficiadigital.com${route(f)}`).sort());
  const dates = [...listing.matchAll(/<time datetime="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(dates, [...dates].sort().reverse());
  for (const file of pages) assert.ok(sitemap.includes(`<loc>https://efficiadigital.com${route(file)}</loc>`), file);
});

test('Blog figure entre À propos et Contact dans les menus et dans les pieds de page publics', () => {
  const publicFiles = readdirSync(root).filter(f => f.endsWith('.html') && /<header class="header"/.test(read(f)));
  for (const file of [...publicFiles, ...articles]) {
    const html = read(file);
    const menu = html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1];
    const footer = html.match(/<nav class="footer-group" aria-label="Navigation [^"]+">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(menu, file); assert.ok(footer, file);
    assert.match(menu, /href="\/a-propos"[^>]*>À propos<\/a>\s*<a href="\/blog"[^>]*>Blog<\/a>\s*<a href="\/contact"/);
    assert.match(footer, /href="\/blog">Blog<\/a>/);
    assert.match(html, /js\/site-navigation\.js/);
  }
});

test('liens internes des articles : pages et ancres existantes', () => {
  for (const file of articles) {
    const body = read(file).match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
    for (const [, href] of body.matchAll(/href="(\/[^" ]*)"/g)) {
      const url = new URL(href, 'https://efficiadigital.com');
      const target = url.pathname === '/' ? 'index.html' : `${url.pathname.slice(1)}.html`;
      assert.ok(existsSync(new URL(target, root)), `${file}: ${href}`);
      if (url.hash) assert.ok(read(target).includes(`id="${url.hash.slice(1)}"`), href);
    }
  }
});

function checkPromises(value) {
  assert.doesNotMatch(value, /\bgaranti(?:e|s|es)?\b/iu);
  for (const sentence of value.split(/[.!?]/u)) {
    if (/première place/iu.test(sentence)) assert.match(sentence, /\b(?:pas|aucun|aucune|jamais|sans|méfiez-vous|personne ne)\b/iu);
  }
}
test('aucune promesse de résultat : la négation de première place est conservée', () => {
  for (const file of articles) checkPromises(text(read(file).match(/<div class="blog-prose">([\s\S]*?)<\/div>/)[1]));
  assert.throws(() => checkPromises('La première place sur Google.'));
  assert.throws(() => checkPromises('Résultat garanti.'));
  assert.doesNotThrow(() => checkPromises('Méfiez-vous si on vous propose : une « première place » sur Google. Personne ne peut la promettre.'));
  assert.throws(() => checkPromises('Une garantie de classement.'));
  assert.doesNotThrow(() => checkPromises('Pas de promesse de « première place sur Google ». Aucun outil ne garantit un classement.'));
});

test('scripts de consentement identiques et dans le même ordre que Services', () => {
  const scripts = html => [...html.matchAll(/<script src="([^"]+)"[^>]*>/g)].map(m => m[1]);
  for (const file of pages) {
    assert.deepEqual(scripts(read(file)), scripts(read('services.html')), file);
    assert.doesNotMatch(read(file), /gtag\(|clarity\.ms\/tag/);
    assert.match(read(file), /data-cookie-preferences/);
  }
});

// Empreinte du texte Markdown fourni, sans balisage, espaces normalisés.
// À mettre à jour uniquement si une nouvelle version éditoriale est validée.
test('premier article : texte fourni conservé mot pour mot', () => {
  const body = read('blog/fiche-google-ou-site-internet-artisan.html').match(/<div class="blog-prose">([\s\S]*?)<\/div>/)[1];
  assert.equal(createHash('sha256').update(text(body)).digest('hex'), '2ac393cd62b8515109219c1d2ace2c5d86b85fee4b3c44bc53a1bb757bad3c06');
});

const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const localAsset = url => {
  const parsed = new URL(url, 'https://efficiadigital.com');
  assert.equal(parsed.origin, 'https://efficiadigital.com', url);
  assert.ok(existsSync(new URL(parsed.pathname.slice(1), root)), url);
  return parsed.pathname;
};

test('images des articles : alternatives, dimensions, fichiers et srcset valides', () => {
  for (const file of articles) {
    const images = [...read(file).matchAll(/<img\b[^>]*>/g)].map(m => attributes(m[0]));
    assert.ok(images.length > 0, file);
    assert.equal(images.filter(img => img.loading === 'eager').length, 1, file);
    for (const img of images) {
      assert.ok(img.alt?.trim(), `${file}: alt`);
      assert.match(img.width || '', /^[1-9]\d*$/);
      assert.match(img.height || '', /^[1-9]\d*$/);
      assert.ok(['eager', 'lazy'].includes(img.loading), `${file}: loading`);
      localAsset(img.src);
      if (img.srcset) {
        assert.ok(img.sizes, `${file}: sizes`);
        for (const candidate of img.srcset.split(',')) {
          const [url, width] = candidate.trim().split(/\s+/);
          localAsset(url); assert.match(width, /^\d+w$/);
        }
      }
      if (img.loading === 'eager') {
        assert.equal(img.fetchpriority, 'high');
        assert.ok(img.src.startsWith('/assets/images/blog/'));
      }
    }
    assert.doesNotMatch(read(file), /<figcaption\b/);
  }
});

test('partage : Open Graph propre à chaque article et images JSON-LD cohérentes', () => {
  const listed = schemas(read('blog.html')).find(s => s['@type'] === 'Blog').blogPost;
  for (const file of articles) {
    const html = read(file);
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)[1];
    assert.ok(localAsset(og).startsWith('/assets/images/blog/'));
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    const post = schemas(html).find(s => s['@type'] === 'BlogPosting');
    assert.ok(Array.isArray(post.image));
    assert.ok(post.image.includes(og));
    post.image.forEach(localAsset);
    assert.deepEqual(listed.find(p => p.url === post.url).image, post.image);
  }
  assert.match(read('blog.html'), /property="og:image" content="https:\/\/efficiadigital.com\/assets\/images\/og-efficia-digital.jpg"/);
  const card = read('blog.html').match(/<img class="blog-card-image"[^>]*>/)[0];
  const img = attributes(card);
  assert.equal(img.alt, ''); assert.equal(img.loading, 'lazy');
  assert.equal(img.width, '768'); assert.equal(img.height, '512'); localAsset(img.src);
});

const november = JSON.parse(read('tests/fixtures/blog-novembre.json'));
const decodeEntities = value => value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
test('novembre : textes fournis conservés mot pour mot et calendrier sans lien vers un article ultérieur', () => {
  for (const [slug, expected] of Object.entries(november)) {
    const html = read(`blog/${slug}.html`);
    const body = html.match(/<div class="blog-prose">([\s\S]*?)<\/div>/)[1];
    assert.equal(createHash('sha256').update(decodeEntities(text(body))).digest('hex'), expected.textSha256, slug);
    assert.match(html, new RegExp(`name="efficia:publish-date" content="${expected.date}"`));
    for (const [, target] of body.matchAll(/href="\/blog\/([^"]+)"/g)) {
      if (november[target]) assert.ok(november[target].date <= expected.date, `${slug} → ${target}`);
    }
  }
});
test('novembre : tableaux, sources, modèles et checklist sémantiques', () => {
  for (const slug of ['prix-site-internet-artisan', 'fiche-google-soi-meme-ou-confier']) {
    const html = read(`blog/${slug}.html`);
    assert.match(html, /class="blog-table-scroll" role="region"[^>]+tabindex="0"><table>/);
    assert.match(html, /<th scope="col">/);
  }
  for (const slug of ['prix-site-internet-artisan', 'avis-google-artisan']) {
    assert.match(read(`blog/${slug}.html`), /<section class="blog-sources"[\s\S]*?<\/section>\s*<\/div>\s*<\/article>/);
  }
  assert.equal((read('blog/avis-google-artisan.html').match(/<blockquote>/g) || []).length, 5);
  const winter = read('blog/chauffagiste-plombier-visible-google-hiver.html');
  assert.match(winter, /<ul class="blog-checklist-visual">/);
  assert.doesNotMatch(winter, /\[ \]|type="checkbox"/);
});
