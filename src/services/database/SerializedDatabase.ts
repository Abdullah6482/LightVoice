import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';

// Keep each prepare/execute/finalize lifecycle sequential on this connection.
export class SerializedDatabase {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private open: () => Promise<SQLiteDatabase>) {}
  private enqueue<T>(operation: (db: SQLiteDatabase) => Promise<T>, retryRead = false): Promise<T> {
    const task = this.queue.then(async () => {
      try { return await operation(await this.open()); }
      catch (error) {
        if (retryRead && /already released/i.test(String(error))) return operation(await this.open());
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
  getFirstAsync<T>(sql: string, ...params: SQLiteBindValue[]) {
    return this.enqueue((db) => db.getFirstAsync<T>(sql, ...params), true);
  }
  getAllAsync<T>(sql: string, ...params: SQLiteBindValue[]) {
    return this.enqueue((db) => db.getAllAsync<T>(sql, ...params), true);
  }
  runAsync(sql: string, ...params: SQLiteBindValue[]) {
    return this.enqueue((db) => db.runAsync(sql, ...params));
  }
  withExclusiveTransactionAsync(action: (db: SQLiteDatabase) => Promise<void>) {
    return this.enqueue(async (db) => {
      // Other app queries wait behind the entire transaction, not just its statements.
      await db.withTransactionAsync(() => action(db));
    });
  }
}
