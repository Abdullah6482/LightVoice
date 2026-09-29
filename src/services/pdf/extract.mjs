import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { textLines, dissectPages } from './structure.mjs';

// Executed inside a local WebView, where PDF.js has its browser APIs.
// The worker implementation is bundled too; no CDN or network requests.
export async function extractPDF(bytes, progress = () => {}) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Please select a PDF smaller than 20 MB.');
  const loading = getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: true, useWorkerFetch: false, useWasm: false, stopAtErrors: true });
  let doc;
  try {
    doc = await loading.promise;
    if (doc.numPages > 1500) throw new Error('Please select a PDF with fewer than 1,500 pages.');
    const metadata = await doc.getMetadata();
    const pages = [];
    const links = [];
    const destinationPage = async dest => {
      const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(resolved)) return null;
      return (typeof resolved[0] === 'number' ? resolved[0] : await doc.getPageIndex(resolved[0])) + 1;
    };
    const outline = async entries => {
      for (const entry of entries || []) {
        try { links.push({ title: entry.title, page: await destinationPage(entry.dest) }); } catch { /* Unusable navigation is not a chapter boundary. */ }
        await outline(entry.items);
      }
    };
    await outline(await doc.getOutline());
    let total = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      progress(number);
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const lines = textLines(content.items, page.view[3] - page.view[1]);
      total += lines.reduce((sum, line) => sum + line.text.length, 0);
      if (total > 12 * 1024 * 1024) throw new Error('The extracted PDF text is too large.');
      pages.push({ number, lines });
      if (lines.some(l => /^(?:table of )?contents$/i.test(l.text))) {
        for (const annotation of await page.getAnnotations()) {
          if (!annotation.dest || !annotation.rect) continue;
          const [left, bottom, right, top] = annotation.rect;
          const title = content.items.filter(i => 'str' in i && i.transform[4] >= left - 2 && i.transform[4] <= right + 2 && i.transform[5] >= bottom - 3 && i.transform[5] <= top + 3).map(i => i.str).join('').trim();
          try { links.push({ title, page: await destinationPage(annotation.dest) }); } catch { /* Ignore broken links. */ }
        }
      }
      page.cleanup();
    }
    const result = dissectPages(pages, links);
    if (!result.chapters.length) throw new Error('This PDF has no selectable text. Scanned or image-only PDFs need OCR, which is not supported yet.');
    return {
      title: typeof metadata.info?.Title === 'string' ? metadata.info.Title : '',
      author: typeof metadata.info?.Author === 'string' ? metadata.info.Author : undefined,
      ...result,
    };
  } finally { await loading.destroy(); }
}
