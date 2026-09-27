export interface FileStorage {
  ensureAppDirectories(): Promise<void>;
  copyIntoLibrary(sourceUri: string, fileName: string): Promise<string>;
  writeChapterText(bookId: string, chapterId: string, text: string): Promise<string>;
  readText(path: string): Promise<string>;
  removeBookFiles(bookId: string): Promise<void>;
}
