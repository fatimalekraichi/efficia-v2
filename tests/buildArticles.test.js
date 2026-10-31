import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildArticles} from '../scripts/build-articles.mjs';
import {parseArticle,renderMarkdown} from '../scripts/blog/markdown.mjs';
import {imageSize} from '../scripts/blog/images.mjs';
import {isPreviewBuild,previewHtml} from '../scripts/blog/build-mode.mjs';
import {validatePosts} from '../scripts/blog/posts.mjs';
const root=new URL('../',import.meta.url).pathname;
const first='fiche-google-ou-site-internet-artisan';
test('preview : fragments HTML protégés et traitement idempotent',()=>{
 for(const source of ['<table><tr><td>Signature</td></tr></table>','<html><body>Page</body></html>']) {
  const result=previewHtml(source);
  assert.match(result,/<head>\s*<meta name="robots" content="noindex, nofollow">/);
  assert.equal(previewHtml(result),result);
  assert.ok(result.includes(source.includes('Signature')?'Signature':'Page'));
 }
});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'efficia-md-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const name of ['scripts','contenus','blog','assets/images/blog'])await cp(join(root,name),join(dir,name),{recursive:true});
 await mkdir(join(dir,'js'));await cp(join(root,'js/ga4.js'),join(dir,'js/ga4.js'));
 for(const file of (await readdir(root)).filter(f=>f.endsWith('.html')||['sitemap.xml','_headers','_redirects'].includes(f)))await cp(join(root,file),join(dir,file));
 return dir;
}
async function snapshot(dir,prefix=''){
 const result={};for(const e of await readdir(join(dir,prefix),{withFileTypes:true})){
  if(e.name==='dist')continue;const name=join(prefix,e.name);if(e.isDirectory())Object.assign(result,await snapshot(dir,name));else result[name]=createHash('sha256').update(await readFile(join(dir,name))).digest('hex');
 }return result;
}
async function edit(dir,slug,fn){const file=join(dir,'contenus/blog',slug,'article.md');await writeFile(file,fn(await readFile(file,'utf8')));}
const run=dir=>buildArticles({root:dir,writeSources:true});
test('générateur : migration, idempotence et aucun fichier commerce modifié',async t=>{
 const dir=await fixture(t),before=await snapshot(dir);await run(dir);const once=await snapshot(dir);for(const slug of await readdir(join(dir,"blog"))){const html=await readFile(join(dir,"blog",slug),"utf8");assert.ok(!html.includes("{{"),"Aucun marqueur de gabarit résiduel");}await run(dir);assert.deepEqual(await snapshot(dir),once);
 for(const file of Object.keys(before))if(!file.startsWith('blog/')&&!['blog.html','sitemap.xml','js/ga4.js'].includes(file))assert.equal(once[file],before[file],file);
});
test('build dans dist/site : sources intactes, fichiers commerce du package préservés, contenus privés exclus',async t=>{
 const dir=await fixture(t),before=await snapshot(dir);const result=spawnSync(process.execPath,[join(dir,'scripts/package-commerce.mjs'),'dist/site'],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const site=join(dir,'dist/site');await writeFile(join(site,'achat.html'),'commerce préparé');await mkdir(join(site,'functions'));await writeFile(join(site,'functions/sentinel.js'),'fonction préparée');
 await buildArticles({root:dir});assert.deepEqual(await snapshot(dir),before);assert.equal(await readFile(join(site,'achat.html'),'utf8'),'commerce préparé');assert.equal(await readFile(join(site,'functions/sentinel.js'),'utf8'),'fonction préparée');assert.ok(!(await readdir(site)).includes('contenus'));
 const filter=spawnSync(process.execPath,[join(root,'scripts/publish-blog.mjs'),'--today=2026-10-30'],{cwd:dir,encoding:'utf8'});assert.equal(filter.status,0,filter.stderr);assert.equal((await readdir(join(site,'blog'))).length,2);
});
test('brouillon ignoré même sans images ; ancienne page, carte, schéma, sitemap et GA4 retirés',async t=>{
 const dir=await fixture(t),slug='fiche-google-soi-meme-ou-confier';await edit(dir,slug,s=>s.replace('statut: "valide"','statut: "brouillon"'));
 await rm(join(dir,'assets/images/blog',slug+'-og.jpg'));await run(dir);
 assert.ok(!(await readdir(join(dir,'blog'))).includes(slug+'.html'));for(const f of ['blog.html','sitemap.xml','js/ga4.js'])assert.ok(!(await readFile(join(dir,f),'utf8')).includes(slug));
});
const cases=[
 ['champ obligatoire',s=>s.replace(/^extrait:.*\n/m,''),/champ obligatoire extrait/],
 ['slug différent du dossier',s=>s.replace(first,'autre-slug'),/Slug unique/],
 ['date inexistante',s=>s.replace('2026-10-12','2026-02-30'),/Date invalide/],
 ['title trop long',s=>s.replace(/^title_seo:.*$/m,'title_seo: "'+ 'a'.repeat(66)+'"'),/maximum 65/],
 ['meta trop courte',s=>s.replace(/^meta_description:.*$/m,'meta_description: "court"'),/120 à 160/],
 ['meta trop longue',s=>s.replace(/^meta_description:.*$/m,'meta_description: "'+'a'.repeat(161)+'"'),/120 à 160/],
 ['H1 dans le corps',s=>s+'\n# Autre titre\n',/Un seul H1/],
 ['H4 interdit',s=>s+'\n#### Autre titre\n',/Un seul H1/],
 ['exclamation',s=>s+'\nAttention !\n',/exclamation/],
 ...['garanti','garantie','explosez','n°1','SEO local','taux de conversion'].map(word=>[word,s=>s+'\n'+word+'\n',/mot interdit/]),
 ...['79 €','990 €','10 €','0,50 €','1 000 €'].map(price=>[price,s=>s+'\nPrix : '+price+'\n',/TTC obligatoire/]),
 ['lien inexistant',s=>s+'\n[Lire](/page-inexistante)\n',/lien interne inexistant/],
 ['article futur',s=>s+'\n[Lire](/blog/avis-google-artisan)\n',/publié après/],
 ['lien absolu futur',s=>s+'\n[Lire](https://efficiadigital.com/blog/avis-google-artisan.html)\n',/publié après/],
 ['ancre inexistante',s=>s+'\n[Lire](/contact#absent)\n',/ancre inexistante/],
 ['HTML interdit',s=>s+'\n<script>alert(1)</script>\n',/HTML/],
 ['URL javascript',s=>s+'\n[Lire](javascript:alert)\n',/protocole interdit/],
 ['statut inconnu',s=>s.replace('statut: "valide"','statut: "public"'),/Statut invalide/]
];
for(const [name,change,error] of cases)test('garde-fou : '+name,async t=>{const dir=await fixture(t);await edit(dir,first,change);const before=await snapshot(dir);await assert.rejects(run(dir),error);assert.deepEqual(await snapshot(dir),before,'erreur avant toute écriture');});
test('0 € et 0,00 € autorisés ; prix non nuls TTC autorisés',async t=>{const dir=await fixture(t);await edit(dir,first,s=>s+'\n0 €, 0,00 €, 79 € TTC et 10 € TTC.\n');await run(dir);});
test('images manquantes et mauvaises dimensions refusées',async t=>{const dir=await fixture(t),file=join(dir,'assets/images/blog/fiche-google-ou-site-internet-une-1536.webp');await cp(join(dir,'assets/images/blog/fiche-google-ou-site-internet-une-768.webp'),file);await assert.rejects(run(dir),/Dimensions incorrectes/);await rm(file);await assert.rejects(run(dir),/ENOENT/);});
test('liens symboliques interdits',async t=>{const dir=await fixture(t);await symlink(join(dir,'blog'),join(dir,'contenus/blog/echappatoire'));await assert.rejects(run(dir),/Lien symbolique/);});
test('YAML sans ambiguïté et Markdown structuré',()=>{
 assert.throws(()=>parseArticle('---\nslug: a\nslug: b\n---\ntexte'),/dupliqué/);
 assert.throws(()=>parseArticle('---\nslug: &alias\n---\ntexte'),/guillemets/);
 const html=renderMarkdown('## Titre\n\n### Sous-titre\n\n- [ ] Texte\n\n> Citation\n\n| Colonne | Autre |\n|---|---|\n| **Fort** | `Code` |').map(b=>b.html).join('');assert.match(html,/<h3>/);assert.match(html,/blog-checklist-visual/);assert.match(html,/<blockquote>/);assert.match(html,/<table>/);assert.match(html,/<strong>Fort/);assert.match(html,/<code>Code/);
 assert.throws(()=>imageSize(Buffer.from('not an image')),/invalide/);
});
test('sortie limitée au package ; mode sources interdit sur Cloudflare',async t=>{const dir=await fixture(t);await assert.rejects(buildArticles({root:dir,site:'../ailleurs'}),/Seul/);await assert.rejects(buildArticles({root:dir}),/Packaging/);const result=spawnSync(process.execPath,[join(dir,'scripts/build-articles.mjs'),'--write-sources'],{cwd:dir,env:{...process.env,CF_PAGES:'1'},encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/réservé au local/);});

async function newArticle(dir,slug='nouvel-article'){
 const folder=join(dir,'contenus/blog',slug);await mkdir(folder);
 const {meta}=parseArticle(await readFile(join(dir,'contenus/blog',first,'article.md'),'utf8'));
 Object.assign(meta,{slug,title_seo:'Un nouvel article pour les artisans | Efficia',h1:'Un nouvel article pour les artisans',date_publication:'2026-12-01',illustration_apres:'Un paragraphe pour placer une image.'});
 await writeFile(join(folder,'article.md'),'---\n'+Object.entries(meta).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n\n## Un titre\n\nUn paragraphe pour placer une image.\n\nUn texte avec un [contact](/contact).\n');
 // Header fixtures test dimensions, not image encoding (the converter validates pixels).
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1536,16);png.writeUInt32BE(1024,20);
 for(const name of ['une','illustration']){
  await writeFile(join(folder,name+'.png'),png);
  for(const width of [1536,768])await cp(join(dir,'assets/images/blog/fiche-google-ou-site-internet-une-'+width+'.webp'),join(dir,'assets/images/blog',`${slug}-${name}-${width}.webp`));
 }
 await cp(join(dir,'assets/images/blog/fiche-google-ou-site-internet-og.jpg'),join(dir,'assets/images/blog',slug+'-og.jpg'));
 for(const [name,w,h] of [['instagram',1080,1350],['google',1200,900]]){const b=Buffer.from([255,216,255,192,0,11,8,0,0,0,0,1,1,0,0]);b.writeUInt16BE(h,7);b.writeUInt16BE(w,9);await writeFile(join(dir,'assets/images/blog',slug+'-'+name+'.jpg'),b);}
 return slug;
}
test('nouvel article : seuls Markdown + images suffisent ; génération complète sans toucher au gabarit',async t=>{
 const dir=await fixture(t),slug=await newArticle(dir);await run(dir);const html=await readFile(join(dir,'blog',slug+'.html'),'utf8');assert.match(html,/Un nouvel article/);assert.match(html,/nouvel-article-illustration-1536.webp/);assert.match(html,/<\/p>\n<figure class="blog-figure">/);
 for(const f of ['blog.html','sitemap.xml','js/ga4.js'])assert.ok((await readFile(join(dir,f),'utf8')).includes('/blog/'+slug));
 const firstPass=await snapshot(dir);await run(dir);assert.deepEqual(await snapshot(dir),firstPass);
});
test('nouvel article : PNG, formats sociaux et placement requis ; doublon de slug refusé',async t=>{
 const dir=await fixture(t),slug=await newArticle(dir);await edit(dir,slug,s=>s.replace('illustration_apres: "Un paragraphe pour placer une image."','illustration_apres: "Absent"'));await assert.rejects(run(dir),/illustration_apres/);
 await edit(dir,slug,s=>s.replace('illustration_apres: "Absent"','illustration_apres: "Un paragraphe pour placer une image."'));
 await rm(join(dir,'assets/images/blog',slug+'-instagram.jpg'));await assert.rejects(run(dir),/ENOENT/);
 await mkdir(join(dir,'contenus/blog/doublon'));await cp(join(dir,'contenus/blog',slug,'article.md'),join(dir,'contenus/blog/doublon/article.md'));await assert.rejects(run(dir),/Slug unique/);
});


test('conversion réelle : sept images, dimensions et résultat reproductible', {skip: ['convert','cwebp'].some(cmd=>spawnSync(cmd,['-version']).error)}, async t=>{
 const {convertImages}=await import('../scripts/convert-blog-images.mjs');
 const dir=await mkdtemp(join(tmpdir(),'efficia-image-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const content=join(dir,'contenus/blog/exemple'),assets=join(dir,'assets/images/blog');await mkdir(content,{recursive:true});await mkdir(assets,{recursive:true});
 const r=spawnSync('convert',['-size','1536x1024','gradient:#112233-#ddeeff',join(content,'une.png')]);assert.equal(r.status,0,String(r.stderr));await cp(join(content,'une.png'),join(content,'illustration.png'));
 await writeFile(join(assets,'legacy.webp'),'inchangé');
 const files=await convertImages(dir);assert.equal(files.length,7);const hashes=[];
 for(const file of files){const b=await readFile(join(dir,file));const expected=file.endsWith('-og.jpg')?[1200,630]:file.endsWith('-instagram.jpg')?[1080,1350]:file.endsWith('-google.jpg')?[1200,900]:file.endsWith('-768.webp')?[768,512]:[1536,1024];assert.deepEqual(imageSize(b),expected);hashes.push(createHash('sha256').update(b).digest('hex'));}
 assert.equal(await readFile(join(assets,'legacy.webp'),'utf8'),'inchangé');assert.deepEqual(await convertImages(dir),files);
 for(let i=0;i<files.length;i++)assert.equal(createHash('sha256').update(await readFile(join(dir,files[i]))).digest('hex'),hashes[i]);
});

function postsFor(slug){
 const url='https://efficiadigital.com/blog/'+slug;
 return {facebook:{text:'Votre fiche mérite des informations claires. '.repeat(11),url},instagram:{text:'Votre activité mérite une présentation claire et utile. '.repeat(13)+'\n#artisan #Belgique #commerce\nLien dans la bio',image:slug+'-instagram.jpg'},google:{text:'Nous vous invitons à vérifier les informations présentées sur votre fiche avant de préparer votre prochaine mise à jour. '.repeat(9),url,image:slug+'-google.jpg',topicType:'STANDARD',actionType:'LEARN_MORE'}};
}
test('posts.json : structure stricte, réseaux, longueurs, liens et images',()=>{
 const valid=postsFor(first);assert.deepEqual(validatePosts(valid,first),valid);
 const change=fn=>{const p=structuredClone(valid);fn(p);assert.throws(()=>validatePosts(p,first),/posts.json/);};
 change(p=>p.tiktok={text:'non autorisé'});change(p=>delete p.google);change(p=>p.facebook.secret='interdit');
 change(p=>p.facebook.url='https://example.com');change(p=>p.facebook.text='trop court');
 change(p=>p.instagram.image='../prive.jpg');change(p=>p.instagram.text+=' https://example.com');
 change(p=>p.google.topicType='EVENT');change(p=>p.google.text+=' Appelez le 0471 23 45 67');
 change(p=>p.facebook.text+=' 99 €');change(p=>p.facebook.text+=' !');
});
test('posts.json invalide bloque aussi un brouillon avant toute écriture',async t=>{
 const dir=await fixture(t),slug=await newArticle(dir);await edit(dir,slug,s=>s.replace('statut: "valide"','statut: "brouillon"'));
 await writeFile(join(dir,'contenus/blog',slug,'posts.json'),JSON.stringify({facebook:{text:'incomplet'}}));
 const before=await snapshot(dir);await assert.rejects(run(dir),/posts.json/);assert.deepEqual(await snapshot(dir),before);
});
test('fichiers supplémentaires non autorisés dans un article',async t=>{
 const dir=await fixture(t);await writeFile(join(dir,'contenus/blog',first,'secret.json'),'{}');await assert.rejects(run(dir),/fichier non autorisé/);
});
test('mode preview explicite, branche absente ou inconnue = production',()=>{
 for(const env of [{},{CF_PAGES:'1'},{CF_PAGES:'1',CF_PAGES_BRANCH:''},{CF_PAGES:'1',CF_PAGES_BRANCH:'main'},{CF_PAGES:'1',CF_PAGES_BRANCH:'inconnue'},{CF_PAGES_BRANCH:'feat/blog-n8n-preview'},{CF_PAGES:'0',CF_PAGES_BRANCH:'feat/blog-n8n-preview'}])assert.equal(isPreviewBuild(env),false);
 assert.equal(isPreviewBuild({CF_PAGES:'1',CF_PAGES_BRANCH:'feat/blog-n8n-preview'}),true);
 assert.equal(isPreviewBuild({CF_PAGES:'1',CF_PAGES_BRANCH:'blog/2026-11-10-artisan'}),true);
});
async function packageAndBuild(dir,branch){
 const env={...process.env,CF_PAGES:'1'};delete env.CF_PAGES_BRANCH;if(branch!==undefined)env.CF_PAGES_BRANCH=branch;
 for(const [script,args] of [['package-commerce.mjs',['dist/site']],['build-articles.mjs',[]],['publish-blog.mjs',['--today=2026-10-30']]]){
  const r=spawnSync(process.execPath,[join(dir,'scripts',script),...args],{cwd:dir,env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 }
 return join(dir,'dist/site');
}
for(const branch of ['main',undefined,'inconnue'])test(`build ${branch??'sans branche'} : brouillon et futurs absents partout, posts privés`,async t=>{
 const dir=await fixture(t),slug=await newArticle(dir);await edit(dir,slug,s=>s.replace('statut: "valide"','statut: "brouillon"').replace('2026-12-01','2026-10-01'));
 await writeFile(join(dir,'contenus/blog',slug,'posts.json'),JSON.stringify(postsFor(slug)));
 // Accidental copies outside contenus must also be excluded by packaging.
 await writeFile(join(dir,'posts.json'),'PRIVATE_POST_SENTINEL');
 const site=await packageAndBuild(dir,branch),files=await readdir(join(site,'blog'));
 assert.ok(!files.includes(slug+'.html'));assert.ok(!files.includes('avis-google-artisan.html'));
 for(const file of ['blog.html','sitemap.xml','js/ga4.js']){
  const text=await readFile(join(site,file),'utf8');assert.ok(!text.includes(slug));assert.ok(!text.includes('avis-google-artisan'));
 }
 assert.ok(!(await readdir(site)).includes('contenus'));assert.ok(!(await readdir(site)).includes('posts.json'));
 assert.ok(!(await readFile(join(site,'_headers'),'utf8')).includes('# Efficia preview robots'));
 assert.ok(!(await readFile(join(site,'index.html'),'utf8')).includes('data-blog-preview-banner'));
});
test('preview : brouillon complet et futurs visibles, bandeau et noindex sur toutes les pages, sources privées',async t=>{
 const dir=await fixture(t),slug=await newArticle(dir);await edit(dir,slug,s=>s.replace('statut: "valide"','statut: "brouillon"'));
 await writeFile(join(dir,'contenus/blog',slug,'posts.json'),JSON.stringify(postsFor(slug)));
 const before=await snapshot(dir),site=await packageAndBuild(dir,'feat/blog-n8n-preview');
 for(const name of [slug,'avis-google-artisan']){
  const html=await readFile(join(site,'blog',name+'.html'),'utf8');assert.match(html,/Brouillon — non publié/);assert.match(html,/data-blog-preview-banner/);
  for(const f of ['blog.html','sitemap.xml','js/ga4.js'])assert.ok((await readFile(join(site,f),'utf8')).includes(name));
 }
 async function verify(folder){for(const e of await readdir(folder,{withFileTypes:true})){const file=join(folder,e.name);if(e.isDirectory())await verify(file);else if(e.name.endsWith('.html')){const html=await readFile(file,'utf8');assert.match(html,/<meta name="robots" content="noindex, nofollow">/,file);assert.doesNotMatch(html,/<meta\b[^>]*content="index,\s*follow"/i,file);}assert.notEqual(e.name,'posts.json');}}
 await verify(site);assert.match(await readFile(join(site,'_headers'),'utf8'),/\/\*\n  X-Robots-Tag: noindex, nofollow/);
 assert.deepEqual(await snapshot(dir),before,'sources inchangées');
 const r=spawnSync(process.execPath,[join(dir,'scripts/publish-blog.mjs'),'--today=2026-10-30'],{cwd:dir,env:{...process.env,CF_PAGES:'1',CF_PAGES_BRANCH:'feat/blog-n8n-preview'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 assert.equal((await readFile(join(site,'blog',slug+'.html'),'utf8')).match(/name="robots"/g).length,1,'directives idempotentes');
});
