// Deliberately bounded Markdown/YAML dialect: no raw HTML, executable content or YAML tags.
export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const plain = value => value.replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
export function parseArticle(source) {
 const match=source.replace(/\r\n/g,'\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
 if(!match) throw Error('En-tête YAML délimité par --- requis');
 const meta=Object.create(null);
 for(const line of match[1].split('\n')) {
  if(!line.trim()||line.trimStart().startsWith('#'))continue;
  const row=line.match(/^([a-z][a-z0-9_]*):\s*(.*?)\s*$/);if(!row)throw Error('YAML : une chaîne simple par ligne est requise');
  const [,key,raw]=row;if(Object.hasOwn(meta,key))throw Error(`Champ YAML dupliqué : ${key}`);
  let value=raw;
  if(raw.startsWith('"')) {try {value=JSON.parse(raw);}catch {throw Error(`Chaîne YAML invalide : ${key}`);}}
  else if(raw.startsWith("'")) {if(!raw.endsWith("'"))throw Error(`Chaîne YAML invalide : ${key}`);value=raw.slice(1,-1).replaceAll("''", "'");}
  else if(/[\[\]{}&*!|>#`]|:\s/.test(raw)) throw Error(`Valeur YAML à mettre entre guillemets : ${key}`);
  if(typeof value!=='string')throw Error(`Chaîne requise : ${key}`);meta[key]=value;
 }
 return {meta,body:match[2].trim()};
}
export function safeUrl(value) {
 if(/[\s\\\u0000-\u001f]/u.test(value)||value.startsWith('//'))throw Error(`Lien interdit : ${value}`);
 if(!/^(?:https?:\/\/|\/|#|mailto:|tel:)/i.test(value))throw Error(`Lien relatif ou protocole interdit : ${value}`);
 return escape(value);
}
export function inline(source) {
 // Parse tokens rather than doing replacements inside generated HTML attributes.
 let out='';
 for(let i=0;i<source.length;) {
  const part=source.slice(i);let m;
  if((m=part.match(/^`([^`\n]+)`/))) {out+=`<code>${escape(m[1])}</code>`;i+=m[0].length;}
  else if(part.startsWith('**')&&(m=part.match(/^\*\*(.+?)\*\*/))) {out+=`<strong>${inline(m[1])}</strong>`;i+=m[0].length;}
  else if((m=part.match(/^\*([^*\n]+)\*/))) {out+=`<em>${inline(m[1])}</em>`;i+=m[0].length;}
  else if((m=part.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)/))) {out+=`<a href="${safeUrl(m[2])}">${inline(m[1])}</a>`;i+=m[0].length;}
  else {out+=escape(source[i]);i++;}
 }
 return out;
}
export function renderMarkdown(body) {
 if(/<\/?[a-z!]|<!--|!\[|^\s*```|^\s*~~~|^\s*\[.+\]:/im.test(body))throw Error('HTML, images, références et blocs de code interdits dans le corps');
 const lines=body.split('\n'),blocks=[];let i=0;
 const add=(html,text,kind)=>blocks.push({html,text,kind});
 const cell=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
 while(i<lines.length) {
  let line=lines[i];if(!line.trim()){i++;continue;}
  if(/^\s+\S/.test(line))throw Error('Indentation et listes imbriquées non prises en charge');
  if(/^#+\s/.test(line)) {
   const m=line.match(/^(#{2,3}) (.+)$/);if(!m)throw Error('Un seul H1 dans le champ h1 ; corps en ## / ### uniquement');
   add(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>\n`,plain(inline(m[2])),'heading');i++;continue;
  }
  if(i+1<lines.length&&/^\|?\s*:?-{3,}/.test(lines[i+1])) {
   const headers=cell(line),separator=cell(lines[i+1]);if(headers.length!==separator.length||separator.some(c=>!/^:?-{3,}:?$/.test(c)))throw Error('Tableau Markdown invalide');
   i+=2;let html='<section class="blog-table-scroll" role="region" aria-label="Tableau comparatif" tabindex="0"><table>\n<thead>\n<tr>\n'+headers.map(x=>`<th scope="col">${inline(x)}</th>\n`).join('')+'</tr>\n</thead>\n<tbody>\n';
   while(i<lines.length&&lines[i].startsWith('|')){const cells=cell(lines[i++]);if(cells.length!==headers.length)throw Error('Colonnes du tableau incohérentes');html+='<tr>\n'+cells.map(x=>`<td>${inline(x)}</td>\n`).join('')+'</tr>\n';}
   add(html+'</tbody>\n</table></section>\n',headers.join(' '),'table');continue;
  }
  if(line.startsWith('>')) {
   const quote=[];while(i<lines.length&&lines[i].startsWith('>'))quote.push(lines[i++].replace(/^> ?/,''));
   const inner=renderMarkdown(quote.join('\n'));add('<blockquote>\n'+inner.map(b=>b.html).join('')+'</blockquote>\n',inner.map(b=>b.text).join(' '),'quote');continue;
  }
  if(/^(?:- |\d+\. )/.test(line)) {
   const ordered=/^\d/.test(line),pattern=ordered?/^\d+\. (.*)$/:/^- (.*)$/;const rows=[];
   while(i<lines.length&&pattern.test(lines[i]))rows.push(lines[i++].match(pattern)[1]);
   const checklist=rows.every(r=>r.startsWith('[ ] '));if(rows.some(r=>r.startsWith('[ ] '))&&!checklist)throw Error('Liste à cocher mixte interdite');
   const tag=ordered?'ol':'ul';add(`<${tag}${checklist?' class="blog-checklist-visual"':''}>\n`+rows.map(r=>`<li>${inline(checklist?r.slice(4):r)}</li>\n`).join('')+`</${tag}>\n`,rows.map(r=>plain(inline(r))).join(' '),'list');continue;
  }
  const paragraph=[];while(i<lines.length&&lines[i].trim()&&!/^(?:#|>|- |\d+\. |\|)/.test(lines[i]))paragraph.push(lines[i++]);
  if(!paragraph.length)throw Error(`Markdown non pris en charge : ${line}`);
  const content=paragraph.join('\n');add(`<p>${inline(content)}</p>\n`,plain(inline(content)),'paragraph');
 }
 return blocks;
}
