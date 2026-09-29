import type { Book, Chapter } from '../../types/domain';
import type { LibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import { parseEPUB } from './EPUBParser';
import type { ParsedBook } from './EPUBParser';

export interface ImportStorage {
  write(bookId: string, name: string, data: Uint8Array | string): Promise<string>;
  removeBookFiles(bookId: string): Promise<void>;
}

export async function importBook(
  bytes: Uint8Array, name: string, id: string, repository: LibraryRepository,
  storage: ImportStorage, progress: (message: string) => void = () => {},
  pdfParser?: (bytes: Uint8Array, title: string, progress: (message: string) => void) => Promise<ParsedBook>,
): Promise<{ book: Book; duplicate: boolean; warnings: string[] }> {
  const existing = await repository.findById(id);
  if (existing) return { book: existing, duplicate: true, warnings: [] };
  progress('Reading chapters…');
  const format = name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
  if (format === 'pdf' && !pdfParser) throw new Error('PDF reader is not available.');
  const parsed = format === 'pdf' ? await pdfParser!(bytes, name.replace(/\.pdf$/i, ''), progress) : await parseEPUB(bytes, name.replace(/\.epub$/i, ''));
  try {
    // Clear files left by an interrupted attempt only after confirming no book owns them.
    await storage.removeBookFiles(id);
    const sourcePath = await storage.write(id, `source.${format}`, bytes);
    if (parsed.pdfReport) await storage.write(id, 'pdf-report.json', JSON.stringify(parsed.pdfReport));
    const coverPath = parsed.cover ? await storage.write(id, `cover.${parsed.cover.extension}`, parsed.cover.bytes) : undefined;
    const chapters: Chapter[] = [];
    for (const [index, chapter] of parsed.chapters.entries()) {
      progress(`Saving chapter ${index + 1} of ${parsed.chapters.length}…`);
      const chapterId = `${id}-${index}`;
      const textPath = await storage.write(id, `${index}.txt`, chapter.text);
      chapters.push({ id: chapterId, bookId: id, index, title: chapter.title, wordCount: chapter.wordCount, textPath });
    }
    const now = Date.now();
    const book: Book = { id, title: parsed.title, author: parsed.author, sourcePath, coverPath, format, createdAt: now, updatedAt: now };
    await repository.importBook(book, chapters);
    return { book, duplicate: false, warnings: parsed.warnings };
  } catch (error) {
    await storage.removeBookFiles(id).catch(() => {});
    throw error;
  }
}
