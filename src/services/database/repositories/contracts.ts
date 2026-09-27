import type { AppSettings, Book, Chapter, PlaybackProgress } from '@/types/domain';

export interface BookRepository {
  findAll(): Promise<Book[]>;
  findById(id: string): Promise<Book | null>;
  save(book: Book): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ChapterRepository {
  findByBookId(bookId: string): Promise<Chapter[]>;
  saveMany(chapters: Chapter[]): Promise<void>;
}

export interface PlaybackProgressRepository {
  findByBookId(bookId: string): Promise<PlaybackProgress | null>;
  save(progress: PlaybackProgress): Promise<void>;
}

export interface SettingsRepository {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}
