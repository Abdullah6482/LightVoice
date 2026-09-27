import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { cleanChapter } from './TextCleaner';

export interface ParsedBook {
  title: string;
  author?: string;
  cover?: { bytes: Uint8Array; extension: string };
  chapters: { title: string; text: string; wordCount: number }[];
  warnings: string[];
}

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false });
const list = <T,>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const label = (value: unknown): string => {
  if (typeof value === 'string') return cleanChapter(value).text;
  if (value && typeof value === 'object' && '#text' in value) return label(value['#text']);
  return '';
};

export function resolveEntry(base: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0].split('?')[0]);
  if (/^[a-z]+:/i.test(decoded) || decoded.startsWith('/') || decoded.includes('\\')) throw new Error('This EPUB contains an invalid file reference.');
  const parts = base.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('This EPUB references a file outside its archive.'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export async function parseEPUB(bytes: Uint8Array, fallbackTitle: string): Promise<ParsedBook> {
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Please select an EPUB smaller than 50 MB.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('This file is not a readable EPUB archive.'); }
  if (Object.keys(zip.files).length > 10000) throw new Error('This EPUB contains too many files.');
  let extracted = 0;
  const readBytes = async (path: string) => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`This EPUB is missing a required file: ${path}`);
    // Stream extraction so a compressed oversized entry cannot allocate unbounded memory.
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let length = 0;
      // JSZip exposes this documented API at runtime but omits it from JSZipObject's declarations.
      const stream = (entry as typeof entry & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
      stream.on('data', (chunk: Uint8Array) => {
        length += chunk.length;
        extracted += chunk.length;
        if (length > 12 * 1024 * 1024 || extracted > 60 * 1024 * 1024) {
          stream.pause(); reject(new Error('This EPUB is too large to extract on this device.')); return;
        }
        chunks.push(chunk);
      });
      stream.on('error', () => reject(new Error('A file inside this EPUB is damaged.')));
      stream.on('end', () => {
        const result = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        resolve(result);
      });
      stream.resume();
    });
  };
  const readText = async (path: string) => new TextDecoder().decode(await readBytes(path));
  const readXML = async (path: string) => {
    const text = await readText(path);
    if (/<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error(`Invalid EPUB metadata: ${path}`);
    return xml.parse(text);
  };
  const container = await readXML('META-INF/container.xml');
  const root = list<Record<string, string>>(container.container?.rootfiles?.rootfile)[0];
  if (!root?.['@_full-path']) throw new Error('This EPUB does not identify its book package.');
  const opfPath = resolveEntry('', root['@_full-path']);
  const pkg = (await readXML(opfPath)).package;
  if (!pkg?.manifest || !pkg?.spine) throw new Error('This EPUB has no chapter manifest or reading order.');
  const items = list<Record<string, string>>(pkg.manifest.item);
  const manifest = new Map(items.map((item) => [item['@_id'], item]));
  const result: ParsedBook = {
    title: label(list(pkg.metadata?.title)[0]) || fallbackTitle || 'Untitled book',
    author: list(pkg.metadata?.creator).map(label).filter(Boolean).join(', ') || undefined,
    chapters: [], warnings: [],
  };
  if (!label(list(pkg.metadata?.title)[0])) result.warnings.push('No title found; using the filename.');
  const coverId = list<Record<string, string>>(pkg.metadata?.meta).find((m) => m['@_name'] === 'cover')?.['@_content'];
  const cover = items.find((i) => (i['@_properties'] ?? '').split(/\s+/).includes('cover-image')) ?? manifest.get(coverId ?? '');
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (cover && extensions[cover['@_media-type']]) {
    const path = resolveEntry(opfPath, cover['@_href']);
    if (zip.file(path)) result.cover = { bytes: await readBytes(path), extension: extensions[cover['@_media-type']] };
  }
  if (!result.cover) result.warnings.push('No supported cover image found.');
  const seen = new Set<string>();
  for (const ref of list<Record<string, string>>(pkg.spine.itemref)) {
    if (ref['@_linear'] === 'no') continue;
    const item = manifest.get(ref['@_idref']);
    if (!item) throw new Error('The EPUB reading order points to a missing chapter.');
    if ((item['@_properties'] ?? '').split(/\s+/).includes('nav')) continue;
    if (!['application/xhtml+xml', 'text/html'].includes(item['@_media-type'])) throw new Error('This EPUB contains an unsupported chapter format.');
    const path = resolveEntry(opfPath, item['@_href']);
    if (seen.has(path)) continue;
    seen.add(path);
    const cleaned = cleanChapter(await readText(path));
    if (!cleaned.text) continue;
    result.chapters.push({ title: cleaned.title || `Chapter ${result.chapters.length + 1}`, text: cleaned.text, wordCount: cleaned.text.split(/\s+/).length });
  }
  if (!result.chapters.length) throw new Error('No readable chapters were found. The book may be image-only or encrypted.');
  return result;
}
