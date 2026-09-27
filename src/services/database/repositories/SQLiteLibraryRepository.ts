import type { Book, Chapter } from '../../../types/domain';
import { getDatabase } from '../database';

const bookColumns = `id, title, author, cover_path AS coverPath, source_path AS sourcePath,
  format, created_at AS createdAt, updated_at AS updatedAt`;
const chapterColumns = `id, book_id AS bookId, chapter_index AS "index", title,
  text_path AS textPath, audio_path AS audioPath, word_count AS wordCount`;

export interface LibraryRepository {
  findAll(): Promise<Book[]>;
  findById(id: string): Promise<Book | null>;
  findChapters(bookId: string): Promise<Chapter[]>;
  importBook(book: Book, chapters: Chapter[]): Promise<void>;
}

export class SQLiteLibraryRepository implements LibraryRepository {
  async findAll(): Promise<Book[]> {
    return (await getDatabase()).getAllAsync<Book>(`SELECT ${bookColumns} FROM books ORDER BY created_at DESC, id`);
  }
  async findById(id: string): Promise<Book | null> {
    return (await getDatabase()).getFirstAsync<Book>(`SELECT ${bookColumns} FROM books WHERE id = ?`, id);
  }
  async findChapters(bookId: string): Promise<Chapter[]> {
    return (await getDatabase()).getAllAsync<Chapter>(`SELECT ${chapterColumns} FROM chapters WHERE book_id = ? ORDER BY chapter_index`, bookId);
  }
  async importBook(book: Book, chapters: Chapter[]): Promise<void> {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(`INSERT INTO books (id,title,author,cover_path,source_path,format,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        book.id, book.title, book.author ?? null, book.coverPath ?? null, book.sourcePath, book.format, book.createdAt, book.updatedAt);
      for (const chapter of chapters) {
        await tx.runAsync(`INSERT INTO chapters (id,book_id,chapter_index,title,text_path,word_count) VALUES (?,?,?,?,?,?)`,
          chapter.id, book.id, chapter.index, chapter.title, chapter.textPath, chapter.wordCount);
      }
    });
  }
}
