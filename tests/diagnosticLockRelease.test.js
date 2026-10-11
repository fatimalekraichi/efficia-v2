import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createSessionCookie } from '../functions/admin/_shared.js';
import { onRequestGet, onRequestPost } from '../functions/api/admin/collection-locks.js';
import { onRequestGet as page } from '../functions/admin/collection-locks.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0023_free_diagnostic_collection_locks.sql','0024_free_diagnostic_lock_releases.sql']) {
    sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  }
  return { sqlite, prepare(sql) {
    const bound = (values=[]) => ({ bind: (...args) => bound(args),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({ success:true,meta:{ changes:Number(sqlite.prepare(sql).run(...values).changes) } }),
    }); return bound();
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results=[];for(const statement of statements) results.push(await statement.run());sqlite.exec('COMMIT');return results; }
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  } };
}
const old = () => new Date(Date.now()-16*60*1000).toISOString();
function seed(db, date=old()) { db.sqlite.prepare('INSERT INTO free_diagnostic_collection_locks VALUES (?,?,?,?)').run('analysis-test','lock-test',date,'refresh_search'); }
async function context(db, body, authenticated=true, origin='https://preview.local') {
  const env={ORDERS_DB:db, ADMIN_SESSION_SECRET:'lock-release-fixture'};
  const cookie=authenticated?(await createSessionCookie(env)).split(';')[0]:'';
  return {env,request:new Request('https://preview.local/api/admin/collection-locks',{
    method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),
  })};
}
const body={analysisId:'analysis-test',token:'lock-test',operator:'Opérateur de test',confirmed:true};

test('liste, page et libération refusées sans session avant D1',async()=>{
  const db={prepare(){throw Error('DB must not be touched');}};
  for(const handler of [onRequestGet,page]) assert.equal((await handler(await context(db,null,false))).status,401);
  assert.equal((await onRequestPost(await context(db,body,false))).status,401);
});
test('la liste ne montre que les verrous strictement plus vieux que 15 minutes',async()=>{
  const db=database();seed(db);
  db.sqlite.prepare('INSERT INTO free_diagnostic_collection_locks VALUES (?,?,?,?)').run('recent','new',new Date().toISOString(),'initial_collection');
  const result=await (await onRequestGet(await context(db))).json();
  assert.equal(result.locks.length,1);assert.equal(result.locks[0].operation,'refresh_search');
});
test('libérer journalise atomiquement le nom déclaré, la session et la date',async()=>{
  const db=database();seed(db);const ctx=await context(db,body);const before=Date.now();
  assert.equal((await onRequestPost(ctx)).status,200);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM free_diagnostic_collection_locks').get().n,0);
  const record=db.sqlite.prepare('SELECT * FROM free_diagnostic_lock_releases').get();
  assert.equal(record.declared_by,body.operator);assert.equal(record.operation,'refresh_search');
  assert.ok(Date.parse(record.released_at)>=before);assert.match(record.actor_session_hash,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(record).includes(ctx.request.headers.get('Cookie')));
});
test('aucune libération sans confirmation, nom ou origine identique',async()=>{
  const db=database();seed(db);
  for(const invalid of [{...body,confirmed:false},{...body,operator:''}]) assert.equal((await onRequestPost(await context(db,invalid))).status,400);
  assert.equal((await onRequestPost(await context(db,body,true,'https://elsewhere.test'))).status,403);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM free_diagnostic_collection_locks').get().n,1);
});
test('un verrou récent ou remplacé ne peut être libéré depuis un ancien écran',async()=>{
  for(const date of [old(),new Date().toISOString()]){
    const db=database();seed(db,date);
    assert.equal((await onRequestPost(await context(db,{...body,token:'wrong'}))).status,409);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM free_diagnostic_lock_releases').get().n,0);
  }
  const db=database();seed(db,new Date().toISOString());
  assert.equal((await onRequestPost(await context(db,body))).status,409);
});
test('échec du journal : le verrou est conservé et aucune libération partielle',async()=>{
  const db=database();seed(db);db.sqlite.exec('DROP TABLE free_diagnostic_lock_releases');
  assert.equal((await onRequestPost(await context(db,body))).status,503);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM free_diagnostic_collection_locks').get().n,1);
});
