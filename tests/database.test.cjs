const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { initialMigration } = require('../src/services/database/migrations/001_initial.ts');

test('repository inserts ordered chapters atomically and reads domain fields', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(initialMigration);
  const adapter = {
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    withExclusiveTransactionAsync: async (action) => {
      sqlite.exec('BEGIN');
      try { await action(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const path = require.resolve('../src/services/database/database.ts');
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { getDatabase: async () => adapter } };
  const { SQLiteLibraryRepository } = require('../src/services/database/repositories/SQLiteLibraryRepository.ts');
  const repository = new SQLiteLibraryRepository();
  const book = { id: 'a', title: 'Book', sourcePath: 'a/source.epub', format: 'epub', createdAt: 1, updatedAt: 1 };
  const chapters = [1, 0].map(index => ({ id: `a-${index}`, bookId: 'a', index, title: `Chapter ${index}`, textPath: `a/${index}.txt`, wordCount: 10 }));
  try {
    await repository.importBook(book, chapters);
    assert.equal((await repository.findById('a')).sourcePath, book.sourcePath);
    assert.deepEqual((await repository.findChapters('a')).map(c => c.index), [0, 1]);
    await assert.rejects(repository.importBook({ ...book, id: 'b' }, [{ ...chapters[0], id: 'new' }, { ...chapters[1], id: 'a-0' }]));
    assert.equal(await repository.findById('b'), null);
    assert.equal((await repository.findChapters('b')).length, 0);
    assert.equal((await repository.findAll()).length, 1);
    const { SQLitePlaybackRepository } = require('../src/services/database/repositories/SQLitePlaybackRepository.ts');
    const playback = new SQLitePlaybackRepository();
    await playback.save({ bookId: 'a', chapterId: 'a-0', textOffset: 6, positionMs: 0, playbackRate: 1, updatedAt: 2 });
    await playback.save({ bookId: 'a', chapterId: 'a-1', textOffset: 12, positionMs: 0, playbackRate: 1.5, updatedAt: 3 });
    assert.equal((await playback.findByBookId('a')).chapterId, 'a-1');
    assert.equal((await playback.latest()).textOffset, 12);
    assert.equal((await playback.latest()).playbackRate, 1.5);
  } finally { sqlite.close(); }
});
