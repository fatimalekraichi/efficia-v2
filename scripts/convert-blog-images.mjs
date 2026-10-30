import { realpathSync } from 'node:fs';
import {readdir,lstat,readFile,mkdir,mkdtemp,rm,copyFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requireSize} from './blog/images.mjs';
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});if(r.status!==0)throw Error(`${cmd} : ${r.stderr||r.error||'échec'}`);};
async function regular(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw Error(`Fichier normal requis : ${path}`);}
export async function convertImages(root=process.cwd()){
 root=resolve(root);const content=join(root,'contenus/blog'),assets=join(root,'assets/images/blog'),temp=await mkdtemp(join(tmpdir(),'efficia-images-')),outputs=[];
 try{
  for(const p of [join(root,'contenus'),content,join(root,'assets'),join(root,'assets/images'),assets])if(!(await lstat(p)).isDirectory())throw Error('Dossier normal requis : '+p);
  for(const entry of (await readdir(content,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!entry.isDirectory()||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))throw Error('Dossier article invalide');
   const slug=entry.name,dir=join(content,slug),names=await readdir(dir),png=names.filter(n=>['une.png','illustration.png'].includes(n));
   if(!png.length)continue; // Existing migrated WebP assets remain byte-identical.
   if(png.length!==2)throw Error(`${slug} : une.png et illustration.png requis ensemble`);
   for(const name of png){const input=join(dir,name);await regular(input);await requireSize(input,[1536,1024]);
    for(const width of [1536,768]){
     const filename=`${slug}-${name.slice(0,-4)}-${width}.webp`,output=join(temp,filename);
     for(const quality of [82,76,70,64,58,52]){run('cwebp',['-quiet','-metadata','none','-q',String(quality),'-m','6','-resize',String(width),'0',input,'-o',output]);if((await lstat(output)).size<150000)break;}
     await requireSize(output,[width,width*2/3]);if((await lstat(output)).size>=150000)console.warn(`Image au-dessus de la cible 150 Ko : ${filename}`);outputs.push(filename);
    }
   }
   for(const [suffix,w,h] of [['og',1200,630],['instagram',1080,1350],['google',1200,900]]){
    const filename=`${slug}-${suffix}.jpg`,output=join(temp,filename);
    run('convert',[join(dir,'une.png'),'-auto-orient','-strip','-resize',`${w}x${h}^`,'-gravity','center','-extent',`${w}x${h}`,'-quality','85',output]);await requireSize(output,[w,h]);outputs.push(filename);
   }
  }
  // Nothing reaches assets until every conversion has passed.
  for(const name of outputs){const dest=join(assets,name);try{await regular(dest);}catch(e){if(e.code!=='ENOENT')throw e;}await copyFile(join(temp,name),dest);}
  return outputs.map(name=>'assets/images/blog/'+name);
 }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length>2)throw Error('Usage : node scripts/convert-blog-images.mjs');const files=await convertImages();console.log(`${files.length} images générées`);if(process.env.BLOG_IMAGE_MANIFEST)await writeFile(process.env.BLOG_IMAGE_MANIFEST,JSON.stringify(files));}catch(e){console.error(e.message);process.exitCode=1;}
}
