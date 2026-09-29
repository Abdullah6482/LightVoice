const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const mock = (name,exports) => { const id = require.resolve(name); require.cache[id] = {id,filename:id,loaded:true,exports}; };
const original = {id:'original',title:'Story',format:'pdf',sourcePath:'file:///original/source.pdf'};
let existing, writes=0, reads=0, fail=false;
mock('expo-file-system',{File:class { constructor(uri){this.uri=uri;} async bytes(){reads++;assert.equal(this.uri,original.sourcePath);return new Uint8Array([1]);} }});
mock('../src/services/database/repositories/SQLiteLibraryRepository.ts',{SQLiteLibraryRepository:class {async findById(id){assert.equal(id,'original-chapters-v2');return existing;}}});
mock('../src/services/storage/ExpoFileStorage.ts',{ExpoFileStorage:class {}});
mock('../src/services/pdf/PDFService.ts',{parsePDF:async()=>({title:'Story',chapters:[],warnings:[]})});
mock('../src/services/epub/ImportBook.ts',{importBook:async(bytes,name,id,repo,storage,progress,parser)=>{writes++;if(fail)throw new Error('Failed import'); const parsed=await parser(bytes,'',progress);return {book:{...original,id,title:parsed.title}};}});
const {createChapterEdition} = require('../src/services/pdf/chapterEdition.ts');
test('chapter edition uses a new ID, leaves the original untouched, and reopens an existing edition',async()=>{
  const snapshot = {...original};
  const edition = await createChapterEdition(original,()=>{});
  assert.equal(edition.id,'original-chapters-v2');assert.equal(edition.title,'Story (chapter edition)');
  assert.deepEqual(original,snapshot);assert.equal(writes,1);
  existing=edition;
  assert.equal(await createChapterEdition(original,()=>{}),edition);
  assert.equal(writes,1);assert.equal(reads,1);
});
test('failed edition creation releases the guard for a retry',async()=>{
  existing=null;fail=true;
  await assert.rejects(createChapterEdition(original,()=>{}),/Failed import/);
  fail=false;
  assert.equal((await createChapterEdition(original,()=>{})).id,'original-chapters-v2');
});
