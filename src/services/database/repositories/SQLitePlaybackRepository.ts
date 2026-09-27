import type { PlaybackProgress } from '../../../types/domain';
import type { PlaybackProgressRepository } from './contracts';
import { getDatabase } from '../database';

const columns = 'book_id AS bookId, chapter_id AS chapterId, position_ms AS positionMs, text_offset AS textOffset, playback_rate AS playbackRate, updated_at AS updatedAt';
export class SQLitePlaybackRepository implements PlaybackProgressRepository {
  async findByBookId(bookId: string) {
    return (await getDatabase()).getFirstAsync<PlaybackProgress>(`SELECT ${columns} FROM playback_progress WHERE book_id = ?`, bookId);
  }
  async latest() {
    return (await getDatabase()).getFirstAsync<PlaybackProgress>(`SELECT ${columns} FROM playback_progress ORDER BY updated_at DESC LIMIT 1`);
  }
  async save(progress: PlaybackProgress) {
    await (await getDatabase()).runAsync(`INSERT INTO playback_progress (book_id,chapter_id,position_ms,text_offset,playback_rate,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(book_id) DO UPDATE SET chapter_id=excluded.chapter_id,
      position_ms=excluded.position_ms,text_offset=excluded.text_offset,playback_rate=excluded.playback_rate,updated_at=excluded.updated_at`,
    progress.bookId, progress.chapterId, progress.positionMs, progress.textOffset, progress.playbackRate, progress.updatedAt);
  }
}
