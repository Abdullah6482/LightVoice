import { Parser } from 'htmlparser2';

// Preserve prose and scene boundaries; remove only explicitly non-reading elements.
export function cleanChapter(html: string): { text: string; title: string } {
  const blocks = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'li', 'blockquote', 'br', 'hr']);
  let output = '';
  let title = '';
  let heading = false;
  const stack: boolean[] = [];
  let hidden = 0;
  const parser = new Parser({
    onopentag(name, attrs) {
      const skip = hidden > 0 || ['head', 'script', 'style', 'nav', 'svg'].includes(name)
        || attrs['aria-hidden'] === 'true' || 'hidden' in attrs
        || (attrs['epub:type'] ?? '').split(/\s+/).includes('pagebreak');
      stack.push(skip);
      if (skip) hidden++;
      if (!hidden && blocks.has(name)) output += '\n\n';
      if (!hidden && /^h[1-3]$/.test(name) && !title) heading = true;
      if (!hidden && name === 'hr') output += '* * *\n\n';
    },
    ontext(text) {
      if (!hidden) {
        output += text.replace(/\s+/g, ' ');
        if (heading) title += text;
      }
    },
    onclosetag(name) {
      if (!hidden && blocks.has(name)) output += '\n\n';
      if (/^h[1-3]$/.test(name)) heading = false;
      if (stack.pop()) hidden--;
    },
  }, { decodeEntities: true });
  parser.end(html);
  return {
    text: output.split(/\n+/).map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean).join('\n\n'),
    title: title.replace(/\s+/g, ' ').trim(),
  };
}
