import { readFile } from 'node:fs/promises';
export function imageSize(b) {
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return [b.readUInt32BE(16),b.readUInt32BE(20)];
 if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP') {
  for(let p=12;p+8<=b.length;) {
   const type=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),o=p+8;if(o+n>b.length)break;
   if(type==='VP8X'&&n>=10)return [1+b.readUIntLE(o+4,3),1+b.readUIntLE(o+7,3)];
   if(type==='VP8 '&&n>=10&&b[o+3]===0x9d&&b[o+4]===1&&b[o+5]===0x2a)return [b.readUInt16LE(o+6)&0x3fff,b.readUInt16LE(o+8)&0x3fff];
   if(type==='VP8L'&&n>=5&&b[o]===0x2f)return [1+(b[o+1]|(b[o+2]&63)<<8),1+((b[o+2]>>6)|b[o+3]<<2|(b[o+4]&15)<<10)];
   p=o+n+(n%2);
  }
 }
 if(b[0]===255&&b[1]===216) {
  let p=2;while(p+4<=b.length) {if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];if(marker===217||marker===218)break;const n=b.readUInt16BE(p);if(n<2||p+n>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&n>=7)return [b.readUInt16BE(p+5),b.readUInt16BE(p+3)];p+=n;}
 }
 throw Error('Image PNG/WebP/JPEG invalide ou non prise en charge');
}
export async function requireSize(file,expected) {
 const size=imageSize(await readFile(file));if(size[0]!==expected[0]||size[1]!==expected[1])throw Error(`Dimensions incorrectes : ${file} (${size.join(' × ')}, attendu ${expected.join(' × ')})`);
}
