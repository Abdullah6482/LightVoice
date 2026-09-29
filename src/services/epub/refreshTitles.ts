import { File } from 'expo-file-system';
import { SQLiteLibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import { parseEPUB } from './EPUBParser';

export async function refreshTitles(bookId: string) {
  const repository = new SQLiteLibraryRepository();
  const book = await repository.findById(bookId);
  if (!book || book.format !== 'epub') throw new Error('Choose an EPUB book.');
  const parsed = await parseEPUB(await new File(book.sourcePath).bytes(), book.title);
  await repository.updateChapterTitles(bookId, parsed.chapters.map((chapter) => chapter.title));
}
