export const initialMigration = `
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover_path TEXT,
    source_path TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'txt', 'pdf')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    text_path TEXT NOT NULL,
    audio_path TEXT,
    word_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE (book_id, chapter_index)
  );

  CREATE TABLE IF NOT EXISTS playback_progress (
    book_id TEXT PRIMARY KEY NOT NULL,
    chapter_id TEXT NOT NULL,
    position_ms INTEGER NOT NULL DEFAULT 0,
    text_offset INTEGER NOT NULL DEFAULT 0,
    playback_rate REAL NOT NULL DEFAULT 1.0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS chapters_book_order_idx
    ON chapters(book_id, chapter_index);
`;
