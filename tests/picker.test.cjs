const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const mock = (name, exports) => {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
let canceled = false;
let pickedOptions;
let deleted = false;
let imported = false;
mock('react-native', { Platform: { OS: 'android' } });
mock('expo-document-picker', { getDocumentAsync: async options => {
  pickedOptions = options;
  return canceled ? { canceled: true } : { canceled: false, assets: [{ uri: 'content://documents/book', name: 'book.epub' }] };
} });
mock('expo-file-system', {
  Paths: { cache: { uri: 'file:///project/cache/' } },
  File: class {
    constructor(uri) { this.uri = uri; this.size = 3; this.exists = true; }
    async bytes() {
      assert.equal(this.uri, 'content://documents/book');
      assert.equal(pickedOptions.copyToCacheDirectory, false);
      return new Uint8Array([1, 2, 3]);
    }
    delete() { deleted = true; }
  },
});
mock('expo-crypto', { CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digest: async () => new Uint8Array([42]).buffer });
mock('../src/services/database/repositories/SQLiteLibraryRepository.ts', { SQLiteLibraryRepository: class {} });
mock('../src/services/storage/ExpoFileStorage.ts', { ExpoFileStorage: class {} });
mock('../src/services/epub/ImportBook.ts', { importBook: async bytes => { imported = true; assert.deepEqual([...bytes], [1, 2, 3]); return { duplicate: false }; } });
const { pickAndImport } = require('../src/services/epub/pickAndImport.ts');
test('Android reads the granted URI, preserves the original, and handles cancellation', async () => {
  await pickAndImport(() => {});
  assert.equal(imported, true);
  assert.equal(deleted, false);
  canceled = true; imported = false;
  assert.equal(await pickAndImport(() => {}), null);
  assert.equal(imported, false);
});
