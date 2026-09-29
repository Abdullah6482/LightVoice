import type { Book, AppSettings } from '../../types/domain';

export function visibleBooks(books: Book[], query: string, sort: AppSettings['librarySort'] = 'newest') {
  const needle = query.trim().toLocaleLowerCase();
  return books.filter(book => `${book.title}\n${book.author ?? ''}`.toLocaleLowerCase().includes(needle)).sort((a, b) => {
    const result = sort === 'title' ? a.title.localeCompare(b.title)
      : sort === 'author' ? (a.author ?? '').localeCompare(b.author ?? '') || a.title.localeCompare(b.title)
        : b.createdAt - a.createdAt;
    return result || a.id.localeCompare(b.id);
  });
}
