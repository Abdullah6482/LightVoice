import * as SQLite from 'expo-sqlite';

import { initialMigration } from './migrations/001_initial';
import { SerializedDatabase } from './SerializedDatabase';

const DATABASE_NAME = 'lightvoice.db';
const CURRENT_VERSION = 2;

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function migrate(database: SQLite.SQLiteDatabase) {
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = result?.user_version ?? 0;

  if (version > CURRENT_VERSION) {
    throw new Error(`Database version ${version} is newer than this app supports.`);
  }

  if (version < 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(initialMigration);
      await database.execAsync('PRAGMA user_version = 1');
    });
  }
  if (version < 2) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`CREATE TABLE IF NOT EXISTS reading_progress (
        book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        paragraph_index INTEGER NOT NULL DEFAULT 0
      ); PRAGMA user_version = 2;`);
    });
  }
}

async function openDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true }).then(async (database) => {
      try { await migrate(database); return database; }
      catch (error) { await database.closeAsync().catch(() => {}); throw error; }
    }).catch((error) => { databasePromise = undefined; throw error; });
  }

  return databasePromise;
}

const database = new SerializedDatabase(openDatabase);
export async function getDatabase() {
  await openDatabase();
  return database;
}
