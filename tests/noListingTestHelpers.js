import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createSessionCookie} from '../functions/admin/_shared.js';
import {onRequestGet,onRequestPost} from '../functions/api/admin/no-listing-diagnostics.js';
export const identity={company:'Atelier Horizon — EXEMPLE FICTIF',activity:'Électricien',city:'Namur',countryCode:'BE',
  searchCity:'Namur',searchCountryCode:'BE',query:'Électricien Namur',website:'https://exemple.invalid',absenceContext:'declared'};
export class LocalD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())this.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));}
  prepare(sql){const make=(params=[])=>({bind:(...p)=>make(p),first:async()=>this.sqlite.prepare(sql).get(...params)||null,
    all:async()=>({results:this.sqlite.prepare(sql).all(...params)}),run:async()=>{const r=this.sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}});return make();}
}
export async function harness(){
  const db=new LocalD1(),env={ORDERS_DB:db,ADMIN_SESSION_SECRET:'no-listing-test-secret',OUTSCRAPER_API_KEY:'fake-test-key'};
  const cookie=(await createSessionCookie(env)).split(';')[0];
  const context=(payload,params='')=>({env,request:new Request('https://test.invalid/api/admin/no-listing-diagnostics'+params,
    {method:payload?'POST':'GET',headers:{Cookie:cookie,Origin:'https://test.invalid','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})})});
  const send=async payload=>{const res=await onRequestPost(context(payload));return {status:res.status,...await res.json()};};
  const get=async params=>{const res=await onRequestGet(context(null,params));return {httpStatus:res.status,...await res.json()};};
  return {db,env,cookie,context,send,get,create:extra=>send({action:'create',idempotencyKey:crypto.randomUUID(),confirmed:true,data:identity,...extra})};
}
export function provider({count=3,response=null,geo=null}={}){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input));calls.push({url:url.href,method:options.method});
    if(url.hostname==='api.outscraper.com' && url.pathname==='/geocoding')return geo?geo():Response.json({city:'Namur',country_code:'BE',latitude:50.46,longitude:4.87});
    if(url.hostname==='api.app.outscraper.com' && url.pathname==='/maps/search-v3')return response?response():Response.json({data:[Array.from({length:count},(_,i)=>({name:`Électricien fictif ${i+1}`,place_id:`fictitious_${i+1}`,category:'Electrician',rating:i===0?null:4.5,reviews:i===0?null:12+i,location_link:`https://www.google.com/maps?cid=${100+i}`}))]});
    throw Error('Unexpected external request: '+url.origin);
  };
  return {calls,restore:()=>{globalThis.fetch=original;}};
}
