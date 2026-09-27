export type BookFormat = 'epub' | 'txt' | 'pdf';

export interface Book {
  id: string;
  title: string;
  author?: string;
  coverPath?: string;
  sourcePath: string;
  format: BookFormat;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  index: number;
  title: string;
  textPath: string;
  audioPath?: string;
  wordCount: number;
}

export interface PlaybackProgress {
  bookId: string;
  chapterId: string;
  positionMs: number;
  textOffset: number;
  playbackRate: number;
  updatedAt: number;
}

export interface AppSettings {
  playbackRate: number;
  continueToNextChapter: boolean;
}
