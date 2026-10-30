import { realpathSync } from 'node:fs';
import { readFile, writeFile, readdir, mkdir, lstat, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticle, renderMarkdown, escape, plain } from './blog/markdown.mjs';
import { requireSize } from './blog/images.mjs';
const sourceRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const origin='https://efficiadigital.com';
const fields=['slug','title_seo','meta_description','h1','extrait','categorie','auteur','date_publication','temps_lecture','mot_cle_principal','mots_cles_secondaires','alt_une','alt_illustration','illustration_apres','statut'];
const json=value=>JSON.stringify(value,null,2).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function noSymlinks(dir) {for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isSymbolicLink())throw Error(`Lien symbolique interdit : ${p}`);if(e.isDirectory())await noSymlinks(p);}}
function validDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
function editorialErrors(meta,body){
 const errors=[];if([...meta.title_seo].length>65)errors.push('title_seo : maximum 65 caractères');
 if([...meta.meta_description].length<120||[...meta.meta_description].length>160)errors.push('meta_description : 120 à 160 caractères');
 const text=[meta.title_seo,meta.meta_description,meta.h1,meta.extrait,meta.alt_une,meta.alt_illustration,plain(renderMarkdown(body).map(b=>b.html).join(''))].join('\n');
 if(/!/.test(text))errors.push("Charte : point d'exclamation interdit");
 if(/\bgaranti(?:e)?\b|explosez|n[°º]\s*1|SEO local|taux de conversion/iu.test(text))errors.push('Charte : mot interdit');
 for(const price of text.matchAll(/([0-9][0-9 \u00a0\u202f]*(?:[,.][0-9]+)?)\s*€(?![\s\u00a0]+TTC\b)/gu)) {
  if(Number(price[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.'))!==0) {errors.push('Charte : prix non nul en euros suivi de TTC obligatoire');break;}
 }
 return errors;
}
function figure(base,alt,hero=false){const p='/assets/images/blog/'+base;return `<figure class="blog-figure${hero?' blog-figure--hero':''}">\n<img src="${p}-1536.webp" srcset="${p}-768.webp 768w, ${p}-1536.webp 1536w" sizes="${hero?'(max-width: 860px) calc(100vw - 32px), (max-width: 1008px) calc(100vw - 48px), 960px':'(max-width: 860px) calc(100vw - 32px), 745px'}" width="1536" height="1024" alt="${escape(alt)}" loading="${hero?'eager':'lazy'}"${hero?' fetchpriority="high"':''} decoding="async">\n</figure>\n`;}
function postFor(m,images){const url=origin+'/blog/'+m.slug;return {'@context':'https://schema.org','@type':'BlogPosting',headline:m.h1,description:m.meta_description,url,datePublished:m.date_publication,dateModified:m.date_publication,author:{'@type':'Person',name:m.auteur},publisher:{'@type':'Organization',name:'Efficia Digital',logo:{'@type':'ImageObject',url:origin+'/assets/logo/logo-efficia-web.png'}},mainEntityOfPage:{'@type':'WebPage','@id':url},inLanguage:'fr',image:images};}
function dateLabel(d){return new Intl.DateTimeFormat('fr-BE',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Brussels'}).format(new Date(d+'T12:00:00Z'));}
function makeArticle(template,article){
 const {meta:m,blocks,legacy,images}=article;const post=postFor(m,images.schema),url=post.url;
 const insertions=new Map();
 if(legacy){
  for(let i=0;i<legacy.placement.length;i++){
   const marker=legacy.placement[i];let index;
   if(marker.startsWith('TABLE:'))index=blocks.map((b,n)=>b.kind==='table'?n:-1).filter(n=>n>=0)[Number(marker.slice(6))-1];
   else if(marker.startsWith('LIST:'))index=blocks.findIndex(b=>b.kind==='list'&&b.text.includes(marker.slice(5)));
   else index=blocks.findIndex(b=>b.text.startsWith(marker));
   // The first article's third figure precedes its summary paragraph.
   if(m.slug==='fiche-google-ou-site-internet-artisan'&&i===1)index--;
   if(index===undefined||index<0)throw Error(`Placement historique introuvable : ${m.slug}`);
   insertions.set(index,legacy.images[i+1].figure);
  }
 } else {
  const matches=blocks.map((b,n)=>['heading','paragraph'].includes(b.kind)&&b.text.startsWith(m.illustration_apres)?n:-1).filter(n=>n>=0);
  if(matches.length!==1)throw Error(`${m.slug} : illustration_apres doit désigner un seul titre ou début de paragraphe`);
  insertions.set(matches[0],figure(images.inline,m.alt_illustration));
 }
 let prose='',sources=false;
 blocks.forEach((b,i)=>{if(b.kind==='heading'&&/^Sources(?:\s|$)/.test(b.text)){if(sources)throw Error('Une seule section Sources permise');prose+='<section class="blog-sources" aria-label="Sources">\n';sources=true;}prose+=b.html+(insertions.get(i)||'');});if(sources)prose+='</section>\n';
 const articleHtml=`<article class="blog-article container">\n<header class="blog-article-header">\n<span class="section-kicker">${escape(m.categorie)}</span>\n<h1>${escape(m.h1)}</h1>\n<p class="blog-meta">Par ${escape(m.auteur)} · <time datetime="${m.date_publication}">${dateLabel(m.date_publication)}</time> · ${escape(m.temps_lecture)} de lecture</p>\n</header>\n${legacy?legacy.images[0].figure:figure(images.hero,m.alt_une,true)}<div class="blog-prose">\n${prose}</div>\n</article>`;
 const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Accueil',item:origin+'/'},{'@type':'ListItem',position:2,name:'Blog',item:origin+'/blog'},{'@type':'ListItem',position:3,name:m.h1,item:url}]};
 const values={cssversion:legacy?.cssVersion||'20261030-novembre',date:m.date_publication,title:escape(m.title_seo),description:escape(m.meta_description),h1:escape(m.h1),url,og:origin+'/assets/images/blog/'+images.og,alt:escape(m.alt_une),post:json(post),breadcrumb:json(breadcrumb),article:articleHtml};
 return {html:template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_,key)=>{if(!(key in values))throw Error('Gabarit inconnu : '+key);return values[key];}),post,card:`<article class="blog-card" data-blog-slug="${m.slug}" data-publish-date="${m.date_publication}">\n<img class="blog-card-image" src="/assets/images/blog/${images.hero}-768.webp" width="768" height="512" loading="lazy" decoding="async" alt="">\n<div class="blog-card-content">\n<span class="section-kicker">${escape(m.categorie)}</span>\n<h2><a href="/blog/${m.slug}">${escape(m.h1)}</a></h2>\n<p>${escape(m.extrait)}</p>\n<time datetime="${m.date_publication}">${dateLabel(m.date_publication)}</time>\n<a class="site-text-link" href="/blog/${m.slug}">Lire l'article →</a>\n</div>\n</article>`};
}
export async function buildArticles({root=sourceRoot,site='dist/site',writeSources=false}={}){
 root=resolve(root);if(writeSources&&process.env.CF_PAGES)throw Error('--write-sources réservé au local');
 if(site!=='dist/site')throw Error('Seul --site=dist/site est autorisé');
 const out=writeSources?root:join(root,'dist/site');
 if(!writeSources){for(const p of [join(root,'dist'),out]){if(!(await exists(p))||!(await lstat(p)).isDirectory())throw Error('Packaging manquant ou lien symbolique : préparer dist/site');}}
 const content=join(root,'contenus/blog');await noSymlinks(content);await noSymlinks(join(out,'assets/images/blog'));if(!writeSources)await noSymlinks(out);
 const migration=JSON.parse(await readFile(join(root,'scripts/blog/migration.json'),'utf8'));
 const template=await readFile(join(root,'scripts/templates/article.html'),'utf8');const articles=[],drafts=new Set(),known=new Set();
 for(const entry of (await readdir(content,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!entry.isDirectory()||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))throw Error(`Dossier slug invalide : ${entry.name}`);
  const file=join(content,entry.name,'article.md'),{meta:m,body}=parseArticle(await readFile(file,'utf8'));
  if(m.slug!==entry.name||known.has(m.slug))throw Error(`Slug unique identique au dossier requis : ${entry.name}`);known.add(m.slug);
  if(!['valide','brouillon'].includes(m.statut))throw Error(`Statut invalide : ${m.slug}`);
  if(m.statut==='brouillon'){drafts.add(m.slug);continue;}
  for(const field of fields)if(!m[field]?.trim())throw Error(`${m.slug} : champ obligatoire ${field}`);
  for(const key of Object.keys(m))if(!fields.includes(key))throw Error(`Champ inconnu : ${key}`);
  if(!validDate(m.date_publication))throw Error(`Date invalide : ${m.date_publication}`);
  const legacy=migration[m.slug];
  // Migration policy is explicit and versioned, never controlled by article YAML.
  const errors=editorialErrors(m,body);
  if(errors.length)throw Error(`${m.slug} : ${errors.join('; ')}`);

  const images=legacy?{hero:legacy.images[0].base,inline:legacy.images[1].base,og:legacy.og,schema:legacy.schemaImages}:{hero:m.slug+'-une',inline:m.slug+'-illustration',og:m.slug+'-og.jpg',schema:[origin+'/assets/images/blog/'+m.slug+'-une-1536.webp',origin+'/assets/images/blog/'+m.slug+'-og.jpg']};
  const bases=legacy?legacy.images.map(i=>i.base):[images.hero,images.inline];
  for(const base of bases)for(const [w,h] of [[1536,1024],[768,512]])await requireSize(join(out,'assets/images/blog',base+`-${w}.webp`),[w,h]);
  await requireSize(join(out,'assets/images/blog',images.og),[1200,630]);
  if(!legacy){for(const name of ['une','illustration'])await requireSize(join(content,m.slug,name+'.png'),[1536,1024]);for(const [suffix,size] of [['instagram',[1080,1350]],['google',[1200,900]]])await requireSize(join(out,'assets/images/blog',m.slug+'-'+suffix+'.jpg'),size);}
  const blocks=renderMarkdown(body);articles.push({meta:m,body,blocks,legacy,images});
 }
 articles.sort((a,b)=>b.meta.date_publication.localeCompare(a.meta.date_publication)||a.meta.slug.localeCompare(b.meta.slug));
 const generated=new Map(articles.map(a=>[a.meta.slug,{...makeArticle(template,a),meta:a.meta}]));
 // Check links against the final catalogue, including dates and anchors, before any write.
 for(const [slug,a] of generated)for(const [,encoded] of a.html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1].matchAll(/href="([^"]+)"/g)){
  const href=plain(encoded);let u;try{u=new URL(href,origin+'/blog/'+slug);}catch{throw Error('Lien invalide : '+href);}
  if(![origin,'https://www.efficiadigital.com','http://efficiadigital.com','http://www.efficiadigital.com'].includes(u.origin))continue;
  let path;try{path=decodeURIComponent(u.pathname);}catch{throw Error('URL mal encodée : '+href);}
  if(path.includes('..')||path.includes('\\'))throw Error('Chemin interdit : '+href);
  const target=path.replace(/\/$/,'').replace(/\.html$/,'').match(/^\/blog\/([^/]+)$/)?.[1];let html;
  if(target){const post=generated.get(target);if(!post)throw Error(`${slug} : lien vers article inexistant ou brouillon ${target}`);if(post.meta.date_publication>a.meta.date_publication)throw Error(`${slug} : lien vers article publié après lui ${target}`);html=post.html;}
  else{const file=path==='/'?'index.html':path.slice(1)+(path.endsWith('.html')||/\.[a-z0-9]+$/i.test(path)?'':'.html');const absolute=resolve(out,file);if(relative(out,absolute).startsWith('..')||!(await exists(absolute)))throw Error(`${slug} : lien interne inexistant ${href}`);html=await readFile(absolute,'utf8');}
  if(u.hash&&!html.includes(`id="${decodeURIComponent(u.hash.slice(1))}"`))throw Error(`${slug} : ancre inexistante ${href}`);
 }
 const edits=new Map();for(const [slug,a] of generated)edits.set(join(out,'blog',slug+'.html'),a.html);
 let listing=await readFile(join(out,'blog.html'),'utf8');const grid=/(<section class="container blog-grid"[^>]*>)[\s\S]*?(<\/section>)/;if(!grid.test(listing))throw Error('Gabarit liste blog introuvable');listing=listing.replace(grid,(_,a,b)=>a+'\n'+[...generated.values()].map(a=>a.card).join('\n')+'\n'+b);
 let blogSchemaFound=false;listing=listing.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,(whole,start,data,end)=>{const schema=JSON.parse(data);if(schema['@type']!=='Blog')return whole;blogSchemaFound=true;schema.blogPost=[...generated.values()].map(a=>a.post);return start+json(schema)+end;});if(!blogSchemaFound)throw Error('Schéma Blog manquant');edits.set(join(out,'blog.html'),listing);
 let sitemap=await readFile(join(out,'sitemap.xml'),'utf8');sitemap=sitemap.replace(/\s*<url>\s*<loc>https:\/\/efficiadigital\.com\/blog\/[^<]+<\/loc>[\s\S]*?<\/url>/g,'').replace(/\s*<\/urlset>\s*$/,'\n'+articles.slice().reverse().map(a=>`  <url>\n    <loc>${origin}/blog/${a.meta.slug}</loc>\n    <lastmod>${a.meta.date_publication}</lastmod>\n  </url>`).join('\n')+'\n</urlset>\n');edits.set(join(out,'sitemap.xml'),sitemap);
 let ga=await readFile(join(out,'js/ga4.js'),'utf8');ga=ga.replace(/^\s*\["\/blog\/[^\n]+\n/gm,'');const anchor='    ["/blog", "Blog"],';if(!ga.includes(anchor))throw Error('Liste GA4 introuvable');ga=ga.replace(anchor,anchor+'\n'+articles.slice().reverse().map(a=>`    [${JSON.stringify('/blog/'+a.meta.slug)}, ${JSON.stringify(a.legacy?.gaTitle||a.meta.h1)}],`).join('\n'));edits.set(join(out,'js/ga4.js'),ga);
 // Remove any stale generated page (including a former valid article now marked draft).
 const stale=(await readdir(join(out,'blog'))).filter(n=>n.endsWith('.html')&&!generated.has(n.slice(0,-5)));
 for(const [file,value] of edits){await mkdir(resolve(file,'..'),{recursive:true});if(!(await exists(file))||(await readFile(file,'utf8'))!==value)await writeFile(file,value);}
 for(const file of stale)await rm(join(out,'blog',file));
 console.log(`Articles Markdown : ${articles.length} validés, ${drafts.size} brouillons ignorés ; sortie ${writeSources?'sources (local)':site}`);
 return {articles:[...generated.keys()],drafts:[...drafts]};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.some(a=>!['--site=dist/site','--write-sources'].includes(a))||new Set(args).size!==args.length)throw Error('Usage : node scripts/build-articles.mjs [--site=dist/site | --write-sources]');await buildArticles({writeSources:args.includes('--write-sources')});}catch(e){console.error('Génération interrompue : '+e.message);process.exitCode=1;}
}
