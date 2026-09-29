import { SQLiteLibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import { ExpoFileStorage } from '../storage/ExpoFileStorage';
import { player } from '../../stores/player';

const repository = new SQLiteLibraryRepository();
const storage = new ExpoFileStorage();
// A durable cleanup queue makes interrupted deletions retryable. Finish cleanup before
// importing, since a reimport may reuse the content-derived book ID.
export async function finishPendingDeletions() {
  for (const row of await repository.pendingFileDeletions()) {
    await storage.removeBookFiles(row.value);
    await repository.finishFileDeletion(row.value);
  }
}
export async function deleteBook(id: string) {
  await player.forgetBook(id);
  await repository.remove(id);
  try { await finishPendingDeletions(); }
  catch { throw new Error('Book removed from the library, but file cleanup is pending. Reopen the Library to retry before importing again. Your original file is unchanged.'); }
}
