// Local packaging only. No deployment. Destination is created exclusively.
import { mkdir,readdir,copyFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname);
const destination=process.argv[2];if(!destination)throw Error('Destination required');
const out=path.resolve(destination);if(out===root||(out.startsWith(root+path.sep)&&out!==path.join(root,'dist','site')))throw Error('Use dist/site or a destination outside the source');
if(out===path.join(root,'dist','site'))await mkdir(path.join(root,'dist'),{recursive:true});
await mkdir(out,{recursive:false});
const excluded=new Set(['contenus','dist','.git','.wrangler','node_modules','tests','scripts','workers','config','migrations','docs','output','tmp']);
async function copy(from,to){for(const entry of await readdir(from,{withFileTypes:true})){
 if((from===root && excluded.has(entry.name))||entry.name==='node_modules'||entry.name.startsWith('.')||/\.(?:md|txt|sql|log|jsonc|toml|patch|sqlite|db)$/.test(entry.name)||['package.json','package-lock.json','posts.json'].includes(entry.name))continue;
 if(entry.isDirectory()){await mkdir(path.join(to,entry.name));await copy(path.join(from,entry.name),path.join(to,entry.name));}
 else if(entry.isFile())await copyFile(path.join(from,entry.name),path.join(to,entry.name));
}}
await copy(root,out);
console.log('Local package prepared; configuration and migrations remain outside public assets.');
