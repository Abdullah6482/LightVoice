import { Directory, File, Paths } from 'expo-file-system';

import type { FileStorage } from './FileStorage';

const libraryDirectory = new Directory(Paths.document, 'library');

export class ExpoFileStorage implements FileStorage {
  async write(bookId: string, name: string, data: Uint8Array | string): Promise<string> {
    if (!/^[a-zA-Z0-9-]+$/.test(bookId) || !/^[a-zA-Z0-9.-]+$/.test(name) || name.includes('..')) throw new Error('Invalid storage path.');
    const directory = new Directory(libraryDirectory, bookId);
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, name);
    file.create({ overwrite: true });
    file.write(data);
    return file.uri;
  }
  async ensureAppDirectories(): Promise<void> {
    libraryDirectory.create({ idempotent: true, intermediates: true });
  }

  async copyIntoLibrary(sourceUri: string, fileName: string): Promise<string> {
    await this.ensureAppDirectories();
    const source = new File(sourceUri);
    const destination = new File(libraryDirectory, fileName);
    source.copy(destination);
    return destination.uri;
  }

  async writeChapterText(bookId: string, chapterId: string, text: string): Promise<string> {
    const chapterDirectory = new Directory(libraryDirectory, bookId, 'chapters');
    chapterDirectory.create({ idempotent: true, intermediates: true });
    const destination = new File(chapterDirectory, `${chapterId}.txt`);
    destination.create({ overwrite: true, intermediates: true });
    destination.write(text);
    return destination.uri;
  }

  async readText(path: string): Promise<string> {
    return new File(path).text();
  }

  async removeBookFiles(bookId: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]+$/.test(bookId)) throw new Error('Invalid book ID.');
    const directory = new Directory(libraryDirectory, bookId);
    if (directory.exists) directory.delete();
  }
}
