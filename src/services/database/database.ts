import * as SQLite from 'expo-sqlite';

import { initialMigration } from './migrations/001_initial';

const DATABASE_NAME = 'lightvoice.db';
const CURRENT_VERSION = 1;

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
      await database.execAsync(`PRAGMA user_version = ${CURRENT_VERSION}`);
    });
  }
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await migrate(database);
      return database;
    });
  }

  return databasePromise;
}
