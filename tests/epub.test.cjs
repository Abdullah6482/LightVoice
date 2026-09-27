const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
// Compile pure service modules for Node; native Expo modules are never loaded here.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const JSZip = require('jszip');
const { parseEPUB, resolveEntry } = require('../src/services/epub/EPUBParser.ts');
const { cleanChapter } = require('../src/services/epub/TextCleaner.ts');
const { importBook } = require('../src/services/epub/ImportBook.ts');

async function fixture(options = {}) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file('OPS/book.opf', `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>${options.noMetadata ? '' : '<dc:title>My &amp; Book</dc:title><dc:creator>Writer</dc:creator>'}</metadata><manifest>
    <item id="one" href="Text/one.xhtml" media-type="application/xhtml+xml"/>
    <item id="two" href="Text/two%20chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    </manifest><spine><itemref idref="nav"/><itemref idref="two"/><itemref idref="${options.invalidSpine ? 'missing' : 'one'}"/></spine></package>`);
  zip.file('OPS/Text/one.xhtml', '<html><body><h1>First</h1><p>Hello.</p></body></html>');
  zip.file('OPS/Text/two chapter.xhtml', '<html><head><title>Ignored</title></head><body><h1>Second</h1><p>“Hello,” she said.</p><p>Next <em>paragraph</em>.</p></body></html>');
  if (!options.noCover) zip.file('OPS/cover.png', new Uint8Array([137, 80, 78, 71]));
  if (options.missingChapter) zip.remove('OPS/Text/one.xhtml');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

test('spine order, namespaced metadata, encoded paths and cover extraction', async () => {
  const book = await parseEPUB(await fixture(), 'Fallback');
  assert.equal(book.title, 'My & Book');
  assert.equal(book.author, 'Writer');
  assert.deepEqual(book.chapters.map(c => c.title), ['Second', 'First']);
  assert.match(book.chapters[0].text, /“Hello,” she said\.\n\nNext paragraph\./);
  assert.equal(book.cover.extension, 'png');
  assert.equal(book.warnings.length, 0);
});
test('missing metadata and cover still imports with useful fallbacks', async () => {
  const book = await parseEPUB(await fixture({ noMetadata: true, noCover: true }), 'Filename');
  assert.equal(book.title, 'Filename');
  assert.equal(book.cover, undefined);
  assert.equal(book.warnings.length, 2);
});
test('corrupt archive and missing required chapter fail explicitly', async () => {
  await assert.rejects(parseEPUB(new Uint8Array([1, 2, 3]), 'Bad'), /readable EPUB/);
  await assert.rejects(parseEPUB(await fixture({ invalidSpine: true }), 'Bad'), /missing chapter/);
  await assert.rejects(parseEPUB(await fixture({ missingChapter: true }), 'Bad'), /missing a required file/);
});
test('cleaning preserves dialogue and scene breaks while dropping navigation and page markers', () => {
  const result = cleanChapter('<body><nav>Contents</nav><h1>Chapter One</h1><p>“A &amp; B,” <em>she</em> said.</p><span epub:type="pagebreak">71</span><hr/><p>Afterward.</p><script>bad()</script></body>');
  assert.equal(result.text, 'Chapter One\n\n“A & B,” she said.\n\n* * *\n\nAfterward.');
  assert.equal(result.title, 'Chapter One');
});
test('archive paths cannot escape or reference remote files', () => {
  assert.equal(resolveEntry('OPS/book.opf', 'Text/../chapter.xhtml#p1'), 'OPS/chapter.xhtml');
  for (const href of ['../../escape', '/absolute', 'https://example.com/x', '%2e%2e/%2e%2e/x']) assert.throws(() => resolveEntry('OPS/book.opf', href));
});
function dependencies({ existing = null, failSave = false, failWrite = false } = {}) {
  const files = new Map(); let saved; let removals = 0;
  return {
    files, get saved() { return saved; }, get removals() { return removals; },
    repo: { findById: async () => existing, importBook: async (book, chapters) => { if (failSave) throw new Error('Disk full'); saved = { book, chapters }; } },
    storage: { write: async (id, name, value) => { if (failWrite && name.endsWith('.txt')) throw new Error('Disk full'); const path = `${id}/${name}`; files.set(path, value); return path; }, removeBookFiles: async () => { files.clear(); removals++; } },
  };
}
test('successful import writes source and text, then commits ordered metadata', async () => {
  const d = dependencies();
  const result = await importBook(await fixture(), 'test.epub', 'hash', d.repo, d.storage);
  assert.equal(result.duplicate, false);
  assert.equal(d.files.size, 4);
  assert.deepEqual(d.saved.chapters.map(c => c.index), [0, 1]);
  assert.equal(d.saved.book.sourcePath, 'hash/source.epub');
});
test('duplicate returns the existing book without touching files', async () => {
  const existing = { id: 'hash', title: 'Existing' }; const d = dependencies({ existing });
  const result = await importBook(new Uint8Array(), 'same.epub', 'hash', d.repo, d.storage);
  assert.equal(result.book, existing); assert.equal(result.duplicate, true); assert.equal(d.removals, 0);
});
test('file or database failures clean up imported files', async () => {
  for (const failure of [{ failSave: true }, { failWrite: true }]) {
    const d = dependencies(failure);
    await assert.rejects(importBook(await fixture(), 'test.epub', 'hash', d.repo, d.storage), /Disk full/);
    assert.equal(d.files.size, 0); assert.equal(d.saved, undefined);
  }
});
