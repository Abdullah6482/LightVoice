const chapterPattern = /^(?:chapter\s+(?:\d+|[IVXLCDM]+)|extra\s+chapter|prologue|epilogue)(?:\s*[:.\-–—]\s*.*)?$/i;
const supplementaryPattern = /^(?:about the author|afterword|acknowledg(?:e)?ments|appendix|character designs|copyright|newsletter|table of contents|contents)\b/i;
const normalize = text => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Content-stream order preserves small caps/drop caps better than sorting every glyph by Y.
export function textLines(items, height) {
  const lines = []; let line; let previous;
  for (const item of items) {
    if (!('str' in item)) continue;
    const x = item.transform[4], y = item.transform[5];
    if (!line) line = { text: '', x, y, height: item.height || 12 };
    if (previous && line.text && Math.abs(y - previous.transform[5]) > Math.max(item.height, previous.height, 12) * 1.3) {
      lines.push(line); line = { text: '', x, y, height: item.height || 12 }; previous = undefined;
    }
    const gap = previous ? x - (previous.transform[4] + previous.width) : 0;
    const space = line.text && !/\s$/.test(line.text) && !/^\s/.test(item.str) && gap > Math.max(1, (item.height || 12) * 0.12);
    line.text += (space ? ' ' : '') + item.str;
    previous = item;
    if (item.hasEOL) { lines.push(line); line = undefined; previous = undefined; }
  }
  if (line) lines.push(line);
  return lines.map(l => ({ ...l, text: l.text.replace(/[ \t]+/g, ' ').trim(), margin: l.y < height * 0.08 || l.y > height * 0.94 })).filter(l => l.text);
}

export function removeMargins(pages) {
  const counts = new Map();
  for (const page of pages) for (const key of new Set(page.lines.filter(l => l.margin).map(l => normalize(l.text).replace(/\d+/g, '#')))) counts.set(key, (counts.get(key) || 0) + 1);
  for (const page of pages) page.lines = page.lines.filter(l => !(l.margin && (/^(?:page\s*\|?\s*)?\d+$/i.test(l.text) || (counts.get(normalize(l.text).replace(/\d+/g, '#')) || 0) >= Math.max(3, pages.length * 0.4))));
}

function heading(page) {
  const lines = page.lines;
  // Contents pages often contain every chapter name: never split there.
  if (lines.slice(0, 3).some(l => /^(?:table of )?contents$/i.test(l.text))) return null;
  const index = lines.findIndex((l, i) => i < 3 && chapterPattern.test(l.text));
  if (index < 0) return null;
  let title = lines[index].text;
  const next = lines[index + 1];
  if (next && /^(?:chapter\s+(?:\d+|[IVXLCDM]+)|extra chapter)\s*[:.\-–—]?$/i.test(title) && next.text.length < 130 && Math.abs(next.y - lines[index].y) < 50) title += ' ' + next.text;
  return { title, line: index };
}

function paragraphs(lines) {
  if (!lines.length) return '';
  const left = Math.min(...lines.map(l => l.x));
  let result = ''; let previous;
  for (const line of lines) {
    const breakHere = previous && (line.x > left + 15 || Math.abs(previous.y - line.y) > Math.max(previous.height, line.height) * 1.9 || /^\s*[*#•]{3,}\s*$/.test(line.text) || /^\s*[*#•]{3,}\s*$/.test(previous.text));
    result += (result ? breakHere ? '\n\n' : ' ' : '') + line.text;
    previous = line;
  }
  return result;
}

export function dissectPages(pages, links = []) {
  removeMargins(pages);
  const warnings = [];
  const boundaries = [];
  for (const page of pages) {
    const found = heading(page);
    if (found) boundaries.push({ page: page.number, title: found.title, kind: 'chapter' });
  }
  // Validate navigation targets against visible text. Bad links are not authoritative.
  for (const link of links) {
    const page = pages[link.page - 1];
    if (!page || !link.title) continue;
    const target = normalize(page.lines.slice(0, 4).map(l => l.text).join(' '));
    if (boundaries.some(b => b.page === link.page) && !supplementaryPattern.test(link.title)) continue;
    if (supplementaryPattern.test(link.title)) {
      let start = link.page;
      if (!target.includes(normalize(link.title))) {
        if (/character designs/i.test(link.title) && page.lines.length && pages[link.page]?.lines.length === 0) { start++; warnings.push(`The “${link.title}” link was corrected from page ${link.page} to ${start}; story text was preserved.`); }
        else continue;
      }
      if (!boundaries.some(b => b.page === start)) boundaries.push({ page: start, title: link.title, kind: 'supplementary' });
    } else if (target.startsWith(normalize(link.title)) && !/contents/i.test(link.title)) {
      boundaries.push({ page: link.page, title: link.title, kind: 'chapter' });
    } else if (/^(?:chapter\s|extra chapter|prologue|epilogue)/i.test(link.title)) {
      warnings.push(`Could not verify the contents entry “${link.title}” at PDF page ${link.page}. Review the source PDF; automatic chapter detection may be incomplete.`);
    }
  }
  const firstStory = boundaries.filter(b => b.kind === 'chapter').sort((a,b) => a.page-b.page)[0]?.page;
  if (!firstStory) {
    warnings.push('No reliable chapter boundaries were found. Page sections are shown rather than guessed chapters.');
    const chapters = pages.filter(p => p.lines.length).map(p => ({ title: `Page ${p.number}`, text: paragraphs(p.lines), startPage: p.number, endPage: p.number }));
    const supplementary = pages.filter(p => !p.lines.length).map(p => ({ title: `Image or blank page ${p.number}`, startPage: p.number, endPage: p.number, text: '', imagePages: [p.number] }));
    return finish(chapters, supplementary, pages, warnings, 'pages');
  }
  // Clearly labelled back matter also works without links/bookmarks.
  for (const page of pages.filter(p => p.number > firstStory)) {
    const title = page.lines[0]?.text;
    if (title && supplementaryPattern.test(title) && title.length < 100 && !boundaries.some(b => b.page === page.number)) boundaries.push({ page: page.number, title, kind: 'supplementary' });
  }
  const ordered = boundaries.filter(b => b.page >= firstStory).sort((a,b) => a.page-b.page);
  const numbered = ordered.filter(b => b.kind === 'chapter').map(b => Number(/^chapter\s+(\d+)\b/i.exec(b.title)?.[1])).filter(n => Number.isFinite(n));
  if (numbered.some((n, i) => i > 0 && n !== numbered[i - 1] + 1)) warnings.push('Chapter numbering has gaps or repeats. Review the chapter list against the source PDF.');
  if (firstStory > 1) ordered.unshift({ page: 1, title: 'Front matter', kind: 'supplementary' });
  const chapters = [], supplementary = [];
  ordered.forEach((boundary, index) => {
    const endPage = (ordered[index + 1]?.page || pages.length + 1) - 1;
    const sectionPages = pages.slice(boundary.page - 1, endPage);
    let text = '';
    for (const page of sectionPages) {
      const part = paragraphs(page.lines);
      if (!part) continue;
      // Continue an unfinished sentence across page/image boundaries, without deleting hyphens.
      const separator = text && !/[.!?”’"']$/.test(text) && /^[a-z]/.test(part) ? ' ' : '\n\n';
      text += (text ? separator : '') + part;
    }
    const section = { title: boundary.title, text, startPage: boundary.page, endPage, imagePages: sectionPages.filter(p => !p.lines.length).map(p => p.number) };
    (boundary.kind === 'chapter' ? chapters : supplementary).push(section);
  });
  return finish(chapters, supplementary, pages, warnings, 'chapters');
}

function finish(chapters, supplementary, pages, warnings, mode) {
  const imagePages = pages.filter(p => !p.lines.length).map(p => p.number);
  if (imagePages.length) warnings.push(`${imagePages.length} pages have no selectable body text (PDF pages ${imagePages.join(', ')}). Their original images are retained in the source PDF; image text needs OCR and is not narrated.`);
  if (pages.some(p => p.lines.some(l => l.text.includes('\ufffd')))) warnings.push('Some characters could not be decoded. Check the original PDF before relying on narration.');
  return { chapters: chapters.filter(c => c.text).map(c => ({ ...c, wordCount: c.text.split(/\s+/).length })), warnings,
    pdfReport: { version: 2, mode, pageCount: pages.length, imagePages, sections: [...chapters.map(({ text: _text, ...c }) => ({ ...c, kind: 'chapter' })), ...supplementary.map(c => ({ ...c, kind: 'supplementary' }))].sort((a,b) => a.startPage-b.startPage), warnings } };
}
