// Build-only derivatives: the editorial agent writes only contenus/blog/<slug>/.
import { readdir, lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {spawnSync} from 'node:child_process';
// Preserve checked-in derivatives unless Git records a later source image change.
function changedSource(root, source, assets) {
 const last=spawnSync('git',['log','-1','--format=%H','--',...assets],{cwd:root,encoding:'utf8'});
 const sha=last.stdout?.trim();if(last.status!==0||!sha)return false;
 const delta=spawnSync('git',['diff',sha,'HEAD','--',source],{cwd:root,encoding:'utf8'});
 return delta.status===0&&delta.stdout.length>0;
}
export async function prepareBlogBuildImages(root=process.cwd()) {
 const base=resolve(root), content=join(base,'contenus/blog'), dest=join(base,'assets/images/blog');
 for(const dir of [content,dest]) { const st=await lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Dossier image invalide'); }
 let generated=0;const failures=[];
 for(const item of await readdir(content,{withFileTypes:true})) {
  if(!item.isDirectory()||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.name))throw Error('Dossier article invalide');
  try {
  const folder=join(content,item.name), names=await readdir(folder);
  const allOutputs=[];
  if(!names.includes('une.png'))continue;
  for(const name of ['une.png','illustration.png'].filter(n=>names.includes(n))) {
   const suffixes=[name.slice(0,-4)+'-1536.webp',name.slice(0,-4)+'-768.webp',...(name==='une.png'?['og.jpg','instagram.jpg','google.jpg']:[])];
   const assetPaths=suffixes.map(s=>'assets/images/blog/'+item.name+'-'+s);
   const present=await Promise.all(assetPaths.map(async p=>{try{const st=await lstat(join(base,p));return st.isFile()&&!st.isSymbolicLink();}catch{return false;}}));
   const input=join(folder,name),stat=await lstat(input);if(!stat.isFile()||stat.isSymbolicLink())throw Error('PNG normal requis');
   const bytes=await readFile(input), metadata=await sharp(bytes).metadata();
   if(metadata.format!=='png'||metadata.width!==1536||metadata.height!==1024)throw Error('PNG 1536 x 1024 requis');
   if(present.every(Boolean)&&!changedSource(base,'contenus/blog/'+item.name+'/'+name,assetPaths))continue;

   const outputs=[];
   for(const width of [1536,768]) {
    let image;
    for(const quality of [82,76,70,64,58,52]) { image=await sharp(bytes).resize(width,Math.round(width*2/3)).webp({quality,effort:6}).toBuffer();if(image.length<150000)break; }
    outputs.push([`${item.name}-${name.slice(0,-4)}-${width}.webp`,image]);
   }
   if(name==='une.png')for(const [suffix,width,height] of [['og',1200,630],['instagram',1080,1350],['google',1200,900]])outputs.push([`${item.name}-${suffix}.jpg`,await sharp(bytes).resize(width,height,{fit:'cover',position:'centre'}).jpeg({quality:85}).toBuffer()]);
   allOutputs.push(...outputs);
  }
  // Validate the whole article before writing any derivative.
  for(const [filename] of allOutputs){try{const st=await lstat(join(dest,filename));if(!st.isFile()||st.isSymbolicLink())throw Error('Asset normal requis');}catch(e){if(e.code!=='ENOENT')throw e;}}
  for(const [filename,bytes] of allOutputs){await writeFile(join(dest,filename),bytes);generated++;}
  }catch(error){failures.push(item.name);console.warn(`[images] ${item.name} : ${error.message}. Images existantes conservées ; les autres articles continuent.`);}
 }
 await writeFile(join(base,'.blog-image-preparation.json'),JSON.stringify({failures}));

 return generated;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`${await prepareBlogBuildImages()} images préparées pour le build`);
