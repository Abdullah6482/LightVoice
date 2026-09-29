const assert = require('node:assert/strict');
const { test } = require('node:test');
const { deflateSync } = require('node:zlib');

function pdf(pages = ['A chapter begins here.', 'Another page of the story.']) {
  const objects = [];
  const add = content => { objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content)); };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((text, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    const bytes = deflateSync(Buffer.from(text ? `BT /F1 12 Tf 72 700 Td (${text}) Tj ET` : ''));
    add(Buffer.concat([Buffer.from(`<< /Length ${bytes.length} /Filter /FlateDecode >>\nstream\n`), bytes, Buffer.from('\nendstream')]));
  });
  add('<< /Title (PDF Test Story) /Author (Test Writer) >>');
  const chunks = [Buffer.from('%PDF-1.4\n')]; const offsets = [0]; let length = chunks[0].length;
  objects.forEach((obj, i) => { offsets.push(length); const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from('\nendobj\n')]); chunks.push(chunk); length += chunk.length; });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${length}\n%%EOF`;
  return new Uint8Array(Buffer.concat([...chunks, Buffer.from(xref)]));
}
test('PDF.js extracts compressed text pages in order and preserves metadata', async () => {
  const { extractPDF } = await import('../src/services/pdf/extract.mjs');
  const pages = [];
  const book = await extractPDF(pdf(), number => pages.push(number));
  assert.equal(book.title, 'PDF Test Story'); assert.equal(book.author, 'Test Writer');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['Page 1', 'Page 2']);
  assert.match(book.chapters[0].text, /A chapter begins here/); assert.deepEqual(pages, [1, 2]);
});
test('blank pages do not renumber later PDF pages', async () => {
  const { extractPDF } = await import('../src/services/pdf/extract.mjs');
  const book = await extractPDF(pdf(['First page.', '', 'Third page.']));
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['Page 1', 'Page 3']);
  assert.ok(book.warnings.some(warning => /1 pages/.test(warning)));
  assert.equal(book.pdfReport.mode, 'pages');
  assert.deepEqual(book.pdfReport.sections.map(s => s.startPage), [1, 2, 3]);
});
test('image-only and malformed PDFs produce actionable errors', async () => {
  const { extractPDF } = await import('../src/services/pdf/extract.mjs');
  await assert.rejects(extractPDF(pdf([''])), /OCR/);
  await assert.rejects(extractPDF(new Uint8Array([1, 2, 3])));
});
module.exports = { pdf };

const line = (text, y = 700, x = 72) => ({ text, y, x, height: 12, margin: y < 64 });
const page = (number, ...lines) => ({ number, lines: [...lines, line(`Page | ${number}`, 20)] });

test('chapter dissection keeps inserts, scene breaks, front/back matter and corrects an early artwork link', async () => {
  const { dissectPages } = await import('../src/services/pdf/structure.mjs');
  const result = dissectPages([
    page(1, line('Table of Contents'), line('Chapter 1: Start', 680), line('Chapter 2: Finish', 660)),
    page(2, line('Chapter 1:'), line('Start', 680), line('The story begins', 620)),
    page(3),
    page(4, line('and continues.'), line('***', 660), line('A new scene.', 620)),
    page(5, line('Chapter 2:'), line('Finish', 680), line('The final story paragraph.', 620)),
    page(6),
    page(7, line('About the Author:'), line('A short biography.', 650)),
  ], [{ title: 'Character Designs', page: 5 }]);
  assert.deepEqual(result.chapters.map(c => [c.title,c.startPage,c.endPage]), [['Chapter 1: Start',2,4],['Chapter 2: Finish',5,5]]);
  assert.deepEqual(result.chapters[0].imagePages, [3]);
  assert.match(result.chapters[0].text, /begins and continues/);
  assert.match(result.chapters[0].text, /\*\*\*/);
  assert.ok(result.chapters.every(c => !c.text.includes('Page |')));
  const assigned = result.pdfReport.sections.flatMap(s => Array.from({length:s.endPage-s.startPage+1},(_,i)=>i+s.startPage));
  assert.deepEqual(assigned,[1,2,3,4,5,6,7]);
  assert.ok(result.warnings.some(w => /corrected/.test(w)));
});

test('small caps stay joined but word gaps remain', async () => {
  const { textLines } = await import('../src/services/pdf/structure.mjs');
  const item = (str,x,width,height=12,hasEOL=false) => ({ str,transform:[1,0,0,1,x,700],width,height,hasEOL });
  const lines = textLines([item('I',72,5,24),item('T',77,6),item('WAS',88,20,12,true)],792);
  assert.equal(lines[0].text,'IT WAS');
});

test('unverified links are warned about instead of creating false chapters', async () => {
  const { dissectPages } = await import('../src/services/pdf/structure.mjs');
  const result = dissectPages([page(1,line('Ordinary prose.')),page(2,line('Continued prose.'))], [{title:'Chapter 2: Missing',page:2}]);
  assert.equal(result.pdfReport.mode,'pages');
  assert.ok(result.warnings.some(w => /Could not verify/.test(w)));
});

test('user-supplied Volume 15 matches audited chapters and covers every source page', {skip: !process.env.LIGHTVOICE_SAMPLE_PDF}, async () => {
  const fs = require('node:fs');
  const { extractPDF } = await import('../src/services/pdf/extract.mjs');
  const book = await extractPDF(new Uint8Array(fs.readFileSync(process.env.LIGHTVOICE_SAMPLE_PDF)));
  assert.deepEqual(book.chapters.map(c=>[c.startPage,c.endPage]),[[11,28],[29,51],[52,75],[76,96],[97,111],[112,133],[134,160],[161,182],[183,204],[205,221],[222,244],[245,258],[259,276],[277,301]]);
  assert.match(book.chapters[0].text,/IT WAS THE MORNING AFTER/);
  assert.ok(book.chapters.every(c=>!c.text.includes('Page |')));
  assert.equal(book.pdfReport.imagePages.length,21);
  assert.deepEqual(book.pdfReport.sections.flatMap(s=>Array.from({length:s.endPage-s.startPage+1},(_,i)=>s.startPage+i)),Array.from({length:308},(_,i)=>i+1));
  assert.equal(book.pdfReport.sections.find(s=>s.title==='Character Designs').startPage,302);
});
