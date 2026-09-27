const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { PlayerController } = require('../src/services/narration/PlayerController.ts');
const { nextPassage, wordStart } = require('../src/services/narration/passages.ts');

function setup(options = {}) {
  let now = 10000;
  const book = { id: 'book', title: 'Story' };
  const chapters = [0, 1].map(index => ({ id: `c${index}`, bookId: book.id, index, title: `Chapter ${index}`, textPath: `text${index}` }));
  const texts = ['First sentence. Second sentence. Third sentence.', 'The next chapter.'];
  const spoken = [];
  const saved = options.saved ?? new Map();
  let settings = { playbackRate: 1, continueToNextChapter: true };
  let stopped = 0;
  const engine = { maxTextLength: 24, speak: (text, rate, callbacks) => spoken.push({ text, rate, ...callbacks }), stop: async () => { stopped++; } };
  const progress = {
    findByBookId: async id => saved.get(id) ?? null,
    latest: async () => [...saved.values()].at(-1) ?? null,
    save: async row => { if (options.failSave) throw new Error('Cannot save progress'); saved.set(row.bookId, { ...row }); },
  };
  const c = new PlayerController(engine, { findById: async () => book, findChapters: async () => chapters }, progress,
    { load: async () => settings, save: async value => { settings = value; } }, async path => texts[Number(path.at(-1))], () => now);
  return { c, spoken, saved, texts, engine, get stopped() { return stopped; }, advance: ms => { now += ms; } };
}
async function drain(c) {
  // Native speech callbacks enqueue asynchronous controller work.
  let pending;
  do { pending = c.queue; await pending; } while (pending !== c.queue);
}
test('passages cover the exact text within engine limits and respect surrogate pairs', () => {
  const text = 'First sentence.\n\n' + 'a'.repeat(30) + ' 😀 More words.';
  const parts = []; let offset = 0;
  while (offset < text.length) {
    const passage = nextPassage(text, offset, 12);
    assert.ok(passage.end > offset); assert.ok(passage.text.length <= 12);
    assert.equal(/[\uD800-\uDBFF]$/.test(passage.text), false);
    parts.push(passage.text); offset = passage.end;
  }
  assert.equal(parts.join(''), text);
  assert.equal(wordStart('hello world', 8), 6);
});
test('pause saves the word boundary and resume ignores stale completion callbacks', async () => {
  const { c, spoken, saved } = setup();
  await c.initialize(); await c.select('book', 'c0');
  const original = spoken[0]; original.onBoundary(6);
  await c.pause();
  assert.equal(saved.get('book').textOffset, 6);
  original.onDone(); await drain(c);
  assert.equal(c.getSnapshot().mode, 'paused'); assert.equal(c.getSnapshot().offset, 6);
  await c.play(); assert.equal(spoken.at(-1).text.startsWith('sentence.'), true);
});
test('restart restores a paused session without speaking automatically', async () => {
  const { c, spoken, saved } = setup();
  await c.initialize(); await c.select('book', 'c0'); spoken.at(-1).onBoundary(6); await c.pause();
  const restored = setup({ saved }); await restored.c.initialize();
  assert.equal(restored.c.getSnapshot().offset, 6);
  assert.equal(restored.c.getSnapshot().chapter.id, 'c0');
  assert.equal(restored.c.getSnapshot().mode, 'paused'); assert.equal(restored.spoken.length, 0);
});
test('finishing passages advances to the next chapter, unless continuous listening is off', async () => {
  for (const continuous of [true, false]) {
    const { c, spoken } = setup(); await c.initialize(); await c.updateSettings({ continueToNextChapter: continuous }); await c.select('book', 'c0');
    for (let n = 0; n < 10 && c.getSnapshot().chapter.id === 'c0' && c.getSnapshot().mode === 'playing'; n++) { spoken.at(-1).onDone(); await drain(c); }
    assert.equal(c.getSnapshot().chapter.id, continuous ? 'c1' : 'c0');
    assert.equal(c.getSnapshot().mode, continuous ? 'playing' : 'ended');
  }
});
test('end-of-chapter sleep timer overrides automatic chapter continuation', async () => {
  const { c, spoken } = setup(); await c.initialize(); await c.select('book', 'c0'); await c.setSleep('chapter');
  for (let n = 0; n < 10 && c.getSnapshot().mode === 'playing'; n++) { spoken.at(-1).onDone(); await drain(c); }
  assert.equal(c.getSnapshot().mode, 'ended'); assert.equal(c.getSnapshot().chapter.id, 'c0'); assert.equal(c.getSnapshot().sleep, null);
});
test('timed sleep stops mid-passage and clears itself', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const d = setup(); const { c, saved } = d; await c.initialize(); await c.select('book', 'c0'); await c.setSleep(10);
  const stopsBeforeTimer = d.stopped;
  context.mock.timers.tick(600000); await drain(c);
  assert.equal(c.getSnapshot().mode, 'paused'); assert.equal(c.getSnapshot().sleep, null);
  assert.ok(saved.get('book')); assert.ok(d.stopped > stopsBeforeTimer);
});
test('changing speed restarts at the saved offset and ignores the previous utterance', async () => {
  const { c, spoken } = setup(); await c.initialize(); await c.select('book', 'c0'); const old = spoken.at(-1); old.onBoundary(6);
  await c.updateSettings({ playbackRate: 1.5 });
  assert.equal(spoken.at(-1).rate, 1.5); assert.equal(c.getSnapshot().offset, 6);
  old.onError(new Error('stale')); await drain(c); assert.equal(c.getSnapshot().mode, 'playing');
});
test('chapter switches and seeks cannot be overwritten by old callbacks', async () => {
  const { c, spoken } = setup(); await c.initialize(); await c.select('book', 'c0'); const old = spoken.at(-1);
  await c.moveChapter(1); old.onBoundary(8); old.onDone(); await drain(c);
  assert.equal(c.getSnapshot().chapter.id, 'c1'); assert.equal(c.getSnapshot().offset, 0);
  await c.pause(); await c.seek(6); assert.equal(c.getSnapshot().mode, 'paused'); assert.equal(c.getSnapshot().offset, 4);
});
test('backgrounding saves and pauses; returning never auto-plays', async () => {
  const { c, spoken } = setup(); await c.initialize(); await c.select('book', 'c0'); spoken.at(-1).onBoundary(6);
  await c.setForeground(false); await c.setForeground(true);
  assert.equal(c.getSnapshot().mode, 'paused'); assert.equal(c.getSnapshot().offset, 6);
});
test('speech interruption pauses and persistence failures are visible', async () => {
  const { c, spoken } = setup(); await c.initialize(); await c.select('book', 'c0'); spoken.at(-1).onStopped(); await drain(c);
  assert.equal(c.getSnapshot().mode, 'paused');
  const broken = setup({ failSave: true }); await broken.c.initialize(); await broken.c.select('book', 'c0');
  assert.equal(broken.c.getSnapshot().mode, 'error'); assert.match(broken.c.getSnapshot().error, /save progress/);
  assert.equal(broken.spoken.length, 0);
});
