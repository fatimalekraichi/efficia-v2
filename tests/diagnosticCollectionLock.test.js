import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { withDiagnosticCollectionLock } from '../functions/lib/diagnosticCollectionLock.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0023_free_diagnostic_collection_locks.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0024_free_diagnostic_lock_releases.sql', import.meta.url), 'utf8'));
  return { sqlite, prepare(sql) { return { bind(...values) { return { async run() {
    return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
  } }; } }; } };
}

test('une panne du verrou bloque tout appel fournisseur', async () => {
  let calls = 0;
  const response = await withDiagnosticCollectionLock({ prepare() { throw new Error('D1 unavailable'); } }, 'test', async () => { calls++; });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('un résultat D1 inconnu ne vaut jamais acquisition du verrou', async () => {
  let calls = 0;
  const db = { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) };
  assert.equal((await withDiagnosticCollectionLock(db, 'test', async () => { calls++; })).status, 503);
  assert.equal(calls, 0);
});

test('une exception libère le verrou sans relancer automatiquement le fournisseur', async () => {
  const db = database(); let calls = 0;
  await assert.rejects(withDiagnosticCollectionLock(db, 'test', async () => { calls++; throw new Error('provider'); }), /provider/);
  assert.equal(calls, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM free_diagnostic_collection_locks').get().n, 0);
  assert.equal(await withDiagnosticCollectionLock(db, 'test', async () => 'explicit retry'), 'explicit retry');
});

test('un ancien verrou persiste et ne permet aucune reprise automatique facturable', async () => {
  const db = database(); let calls = 0;
  db.sqlite.prepare('INSERT INTO free_diagnostic_collection_locks (analysis_id, token, acquired_at) VALUES (?, ?, ?)').run('test', 'other-owner', '2000-01-01T00:00:00Z');
  const response = await withDiagnosticCollectionLock(db, 'test', async () => { calls++; });
  assert.equal(response.status, 409); assert.equal(calls, 0);
  assert.equal(db.sqlite.prepare('SELECT token FROM free_diagnostic_collection_locks').get().token, 'other-owner');
});
