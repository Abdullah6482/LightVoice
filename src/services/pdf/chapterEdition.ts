import { File } from 'expo-file-system';
import type { Book } from '../../types/domain';
import { SQLiteLibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import { ExpoFileStorage } from '../storage/ExpoFileStorage';
import { importBook } from '../epub/ImportBook';
import { parsePDF } from './PDFService';
import type { PDFReport } from './PDFReport';

let rebuilding = false;
export async function readPDFReport(book: Book): Promise<PDFReport | null> {
  if (book.format !== 'pdf') return null;
  const file = new File(new File(book.sourcePath).parentDirectory, 'pdf-report.json');
  if (!file.exists) return null;
  const report = JSON.parse(await file.text()) as PDFReport;
  if (report.version !== 2 || !Array.isArray(report.sections)) throw new Error('Unrecognized PDF analysis report.');
  return report;
}

export async function createChapterEdition(book: Book, progress: (message: string) => void) {
  if (book.format !== 'pdf') throw new Error('Choose a PDF book.');
  if (rebuilding) throw new Error('A chapter edition is already being prepared.');
  rebuilding = true;
  try {
    const repository = new SQLiteLibraryRepository();
    const id = `${book.id}-chapters-v2`;
    const existing = await repository.findById(id);
    if (existing) return existing;
    const bytes = await new File(book.sourcePath).bytes();
    const result = await importBook(bytes, `${book.title}.pdf`, id, repository, new ExpoFileStorage(), progress,
      async (data, _title, notify) => ({ ...await parsePDF(data, book.title, notify), title: `${book.title} (chapter edition)` }));
    return result.book;
  } finally { rebuilding = false; }
}
