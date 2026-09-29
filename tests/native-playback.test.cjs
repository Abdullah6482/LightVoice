const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {NativePlaybackController} = require('../src/services/narration/NativePlaybackController.ts');

function fixture(options={}) {
  const commands=[]; let listener; let fail=options.fail;
  const book={id:'book',title:'Book'};
  const chapter={id:'chapter',bookId:'book',textPath:'file:///story.txt'};
  const snapshot={ready:true,mode:'playing',book,chapter,chapters:[chapter],offset:25,length:200,excerpt:'story',settings:{playbackRate:1,continueToNextChapter:true},sleep:null};
  const native={snapshot:async()=>{if(fail)throw new Error('Unavailable');return options.snapshot ? JSON.stringify(snapshot):null;},progress:async()=>options.progress?JSON.stringify(options.progress):null,
    command:async json=>commands.push(JSON.parse(json)),addListener:(event,cb)=>{listener=cb;return {remove(){}};}};
  const repo={findById:async()=>book,findChapters:async()=>[chapter]};
  const progress={latest:async()=>options.legacy||null,findByBookId:async()=>options.legacy||null};
  const settings={load:async()=>snapshot.settings,save:async()=>{}};
  return {player:new NativePlaybackController(native,repo,progress,settings),commands,snapshot,emit:change=>listener({json:JSON.stringify({...snapshot,...change})}),recover:()=>{fail=false;}};
}
test('native playback attaches to a live session without restarting or pausing it',async()=>{
  const f=fixture({snapshot:true});await f.player.initialize();
  assert.equal(f.player.getSnapshot().mode,'playing');assert.equal(f.player.supportsBackground,true);
  await f.player.setForeground(false);await f.player.setForeground(true);
  assert.deepEqual(f.commands,[]);
  f.emit({mode:'paused',offset:60});assert.equal(f.player.getSnapshot().offset,60);
});
test('native initialization restores a legacy session paused, never autoplays',async()=>{
  const f=fixture({legacy:{bookId:'book',chapterId:'chapter',textOffset:42}});
  await f.player.initialize();
  assert.equal(f.commands[0].action,'load');assert.equal(f.commands[0].autoplay,false);assert.equal(f.commands[0].offset,42);
});
test('native durable checkpoints supersede older SQLite progress',async()=>{
  const f=fixture({progress:{bookId:'book',chapterId:'chapter',textOffset:85,updatedAt:200},legacy:{bookId:'book',chapterId:'chapter',textOffset:10,updatedAt:100}});
  await f.player.select('book');assert.equal(f.commands[0].offset,85);assert.equal(f.commands[0].autoplay,true);
});
test('native controls delegate sleep, seek, chapter changes and rate to service',async()=>{
  const f=fixture({snapshot:true});await f.player.initialize();
  await f.player.pause();await f.player.play();await f.player.seek(500);await f.player.moveChapter(1);await f.player.setSleep('chapter');await f.player.updateSettings({playbackRate:1.5});
  assert.deepEqual(f.commands.map(c=>c.action),['pause','play','seek','move','sleep','settings']);
  assert.equal(f.commands[2].offset,200);assert.equal(f.commands[4].value,'chapter');assert.equal(f.commands[5].rate,1.5);
});
test('initialization failures remain retryable',async()=>{
  const f=fixture({fail:true});await f.player.initialize();assert.equal(f.player.getSnapshot().ready,false);
  f.recover();await f.player.initialize();assert.equal(f.player.getSnapshot().ready,true);
});
