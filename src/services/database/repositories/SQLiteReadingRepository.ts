import { getDatabase } from '../database';

export class SQLiteReadingRepository {
  async load(bookId: string) {
    return (await getDatabase()).getFirstAsync<{ chapterId: string; paragraphIndex: number }>(
      'SELECT chapter_id AS chapterId, paragraph_index AS paragraphIndex FROM reading_progress WHERE book_id = ?', bookId);
  }
  async save(bookId: string, chapterId: string, paragraphIndex: number) {
    await (await getDatabase()).runAsync(`INSERT INTO reading_progress (book_id, chapter_id, paragraph_index)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM chapters WHERE id = ? AND book_id = ?)
      ON CONFLICT(book_id) DO UPDATE SET chapter_id=excluded.chapter_id, paragraph_index=excluded.paragraph_index`,
    bookId, chapterId, Math.max(0, Math.floor(paragraphIndex)), chapterId, bookId);
  }
}
