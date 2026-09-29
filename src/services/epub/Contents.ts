import { Parser } from 'htmlparser2';

export function navigationLinks(html: string): { href: string; title: string }[] {
  const links: { href: string; title: string }[] = [];
  let depth = 0;
  let tocDepth = -1;
  let link: { href: string; title: string } | undefined;
  const parser = new Parser({
    onopentag(name, attrs) {
      depth++;
      if (name === 'nav' && ((attrs['epub:type'] ?? '').split(/\s+/).includes('toc') || attrs.role === 'doc-toc')) tocDepth = depth;
      if (tocDepth >= 0 && name === 'a' && attrs.href) link = { href: attrs.href, title: '' };
    },
    ontext(text) { if (link) link.title += text; },
    onclosetag(name) {
      if (name === 'a' && link) { link.title = link.title.replace(/\s+/g, ' ').trim(); if (link.title) links.push(link); link = undefined; }
      if (depth === tocDepth) tocDepth = -1;
      depth--;
    },
  }, { decodeEntities: true });
  parser.end(html);
  return links;
}
