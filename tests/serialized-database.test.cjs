const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { SerializedDatabase } = require('../src/services/database/SerializedDatabase.ts');
test('concurrent callers never overlap statement lifetimes, including transactions', async () => {
  let active = 0; let maximum = 0; const events = [];
  const query = async sql => { active++; maximum = Math.max(active, maximum); events.push(sql); await new Promise(resolve => setImmediate(resolve)); active--; return []; };
  const native = { getAllAsync: query, runAsync: query, withTransactionAsync: async action => { events.push('BEGIN'); await action(); events.push('COMMIT'); } };
  const db = new SerializedDatabase(async () => native);
  await Promise.all([db.getAllAsync('read1'), db.withExclusiveTransactionAsync(async tx => { await tx.runAsync('write1'); await tx.runAsync('write2'); }), db.getAllAsync('read2')]);
  assert.equal(maximum, 1);
  assert.deepEqual(events, ['read1', 'BEGIN', 'write1', 'write2', 'COMMIT', 'read2']);
});
test('a released read statement retries once and failures do not poison the queue', async () => {
  let reads = 0; let writes = 0;
  const db = new SerializedDatabase(async () => ({
    getFirstAsync: async () => { if (++reads === 1) throw new Error('Cannot use shared object that was already released'); return { value: 42 }; },
    runAsync: async () => { writes++; throw new Error('write failed'); },
  }));
  assert.equal((await db.getFirstAsync('read')).value, 42);
  await assert.rejects(db.runAsync('write'), /write failed/); assert.equal(writes, 1);
  assert.equal((await db.getFirstAsync('read')).value, 42);
});
