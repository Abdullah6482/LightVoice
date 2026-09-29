import { fromByteArray } from 'base64-js';
import type { ParsedBook } from '../epub/EPUBParser';

type Job = { id: number; base64: string; progress: (message: string) => void; resolve: (book: ParsedBook) => void; reject: (error: Error) => void };
let job: Job | null = null;
let counter = 0;
const listeners = new Set<() => void>();
let timeout: ReturnType<typeof setTimeout> | undefined;
export const getPDFJob = () => job;
export const subscribePDF = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());
export function finishPDF(id: number, book?: ParsedBook, error?: string) {
  if (!job || job.id !== id) return;
  const current = job;
  job = null;
  if (timeout) clearTimeout(timeout);
  notify();
  if (book) current.resolve(book); else current.reject(new Error(error || 'Unable to extract PDF text.'));
}
export function parsePDF(bytes: Uint8Array, title: string, progress: (message: string) => void): Promise<ParsedBook> {
  if (job) return Promise.reject(new Error('A PDF is already being imported.'));
  if (bytes.length > 20 * 1024 * 1024) return Promise.reject(new Error('Please select a PDF smaller than 20 MB.'));
  return new Promise((resolve, reject) => {
    const id = ++counter;
    job = { id, base64: fromByteArray(bytes), progress, resolve: book => resolve({ ...book, title: book.title.trim() || title }), reject };
    timeout = setTimeout(() => finishPDF(id, undefined, 'PDF extraction timed out. Try a smaller file.'), 180000);
    notify();
  });
}
