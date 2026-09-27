import type { AppSettings, Book, Chapter, PlaybackProgress } from '../../types/domain';
import type { LibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import type { PlaybackProgressRepository, SettingsRepository } from '../database/repositories/contracts';
import type { NarrationEngine } from './NarrationEngine';
import { nextPassage, playbackRates, wordStart } from './passages';

type Mode = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export interface PlayerState {
  mode: Mode; ready: boolean; book?: Book; chapters: Chapter[]; chapter?: Chapter;
  offset: number; length: number; excerpt: string; error?: string;
  settings: AppSettings; sleep: number | 'chapter' | null;
}
export class PlayerController {
  private state: PlayerState = { mode: 'idle', ready: false, chapters: [], offset: 0, length: 0, excerpt: '', settings: { playbackRate: 1, continueToNextChapter: true }, sleep: null };
  private text = '';
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private lastSave = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private foreground = true;
  constructor(
    private engine: NarrationEngine,
    private library: LibraryRepository,
    private progress: PlaybackProgressRepository & { latest(): Promise<PlaybackProgress | null> },
    private settings: SettingsRepository,
    private readText: (path: string) => Promise<string>,
    private now = () => Date.now(),
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<PlayerState>) { this.state = { ...this.state, ...change }; this.listeners.forEach((listener) => listener()); }
  private command(action: () => Promise<void>) {
    this.queue = this.queue.then(action).catch(async (error: unknown) => {
      ++this.epoch;
      await this.engine.stop().catch(() => {});
      this.publish({ mode: 'error', error: error instanceof Error ? error.message : 'Playback failed. Try again.' });
    });
    return this.queue;
  }
  initialize = () => this.command(async () => {
    if (this.state.ready) return;
    try {
      this.publish({ settings: await this.settings.load() });
      const saved = await this.progress.latest();
      if (saved) await this.load(saved.bookId, saved.chapterId, saved.textOffset, false);
    } finally { this.publish({ ready: true }); }
  });
  private async save() {
    const { book, chapter, offset, settings } = this.state;
    if (!book || !chapter) return;
    await this.progress.save({ bookId: book.id, chapterId: chapter.id, textOffset: offset, positionMs: 0, playbackRate: settings.playbackRate, updatedAt: this.now() });
    this.lastSave = this.now();
  }
  private async silence() { ++this.epoch; await this.engine.stop(); }
  private async load(bookId: string, chapterId: string | undefined, offset: number, autoplay: boolean) {
    await this.silence();
    this.publish({ mode: 'loading', error: undefined });
    const [book, chapters] = await Promise.all([this.library.findById(bookId), this.library.findChapters(bookId)]);
    if (!book || !chapters.length) throw new Error('This book has no playable chapters.');
    const chapter = chapters.find((c) => c.id === chapterId) ?? chapters[0];
    const text = await this.readText(chapter.textPath);
    if (!text.trim()) throw new Error('This chapter has no readable text.');
    this.text = text;
    const position = chapter.id === chapterId ? wordStart(text, offset) : 0;
    this.publish({ book, chapters, chapter, offset: position, length: text.length, excerpt: text.slice(position, position + 240), mode: position === text.length ? 'ended' : 'paused' });
    if (autoplay && this.foreground) { this.publish({ mode: 'playing' }); await this.speak(); }
  }
  select = (bookId: string, chapterId?: string) => this.command(async () => {
    await this.silence(); await this.save();
    const saved = await this.progress.findByBookId(bookId);
    const target = chapterId ?? saved?.chapterId;
    const offset = target === saved?.chapterId ? saved?.textOffset ?? 0 : 0;
    await this.load(bookId, target, offset, false);
    await this.save();
    if (this.foreground) {
      if (this.state.offset >= this.text.length) this.publish({ offset: 0 });
      this.publish({ mode: 'playing' }); await this.speak();
    }
  });
  play = () => this.command(async () => {
    if (!this.foreground || !this.state.chapter || this.state.mode === 'playing') return;
    if (this.state.offset >= this.text.length) this.publish({ offset: 0 });
    this.publish({ mode: 'playing', error: undefined });
    await this.speak();
  });
  pause = () => this.command(async () => {
    await this.silence();
    if (this.state.chapter && this.state.mode !== 'ended') this.publish({ mode: 'paused' });
    await this.save();
  });
  setForeground(active: boolean) {
    this.foreground = active;
    if (!active) return this.pause();
    return this.command(async () => { if (typeof this.state.sleep === 'number' && this.now() >= this.state.sleep) await this.expireSleep(); });
  }
  seek = (offset: number) => this.command(async () => {
    if (!this.state.chapter) return;
    const playing = this.state.mode === 'playing';
    await this.silence();
    const position = wordStart(this.text, offset);
    this.publish({ offset: position, excerpt: this.text.slice(position, position + 240), mode: playing ? 'playing' : position === this.text.length ? 'ended' : 'paused', error: undefined });
    await this.save();
    if (playing) await this.speak();
  });
  moveChapter = (direction: number) => this.command(async () => {
    const { book, chapters, chapter, mode } = this.state;
    if (!book || !chapter) return;
    const next = chapters[chapters.findIndex((c) => c.id === chapter.id) + direction];
    if (!next) return;
    await this.silence(); await this.save();
    await this.load(book.id, next.id, 0, mode === 'playing');
    await this.save();
  });
  updateSettings = (patch: Partial<AppSettings>) => this.command(async () => {
    const next = { ...this.state.settings, ...patch };
    if (!playbackRates.includes(next.playbackRate)) throw new Error('Unsupported playback speed.');
    await this.settings.save(next);
    const restart = this.state.mode === 'playing' && next.playbackRate !== this.state.settings.playbackRate;
    if (restart) await this.silence();
    this.publish({ settings: next });
    await this.save();
    if (restart) await this.speak();
  });
  setSleep = (minutes: number | 'chapter' | null) => this.command(async () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const sleep = typeof minutes === 'number' ? this.now() + minutes * 60_000 : minutes;
    this.publish({ sleep });
    if (typeof minutes === 'number') this.timer = setTimeout(() => { void this.command(() => this.expireSleep()); }, minutes * 60_000);
  });
  private async expireSleep() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.silence();
    this.publish({ sleep: null, mode: this.state.chapter ? 'paused' : 'idle' });
    await this.save();
  }
  private async speak() {
    if (!this.foreground || this.state.mode !== 'playing') return;
    if (typeof this.state.sleep === 'number' && this.now() >= this.state.sleep) { await this.expireSleep(); return; }
    if (this.state.offset >= this.text.length) {
      this.publish({ mode: 'ended' }); await this.save();
      if (this.state.sleep === 'chapter') { this.publish({ sleep: null }); return; }
      const { book, chapter, chapters, settings } = this.state;
      const next = chapters[chapters.findIndex((c) => c.id === chapter?.id) + 1];
      if (book && next && settings.continueToNextChapter) {
        await this.load(book.id, next.id, 0, true);
        await this.save();
      }
      return;
    }
    const passage = nextPassage(this.text, this.state.offset, this.engine.maxTextLength);
    const token = ++this.epoch;
    this.publish({ excerpt: passage.text });
    this.engine.speak(passage.text, this.state.settings.playbackRate, {
      onBoundary: (index) => {
        if (token !== this.epoch || this.state.mode !== 'playing' || !Number.isFinite(index)) return;
        this.publish({ offset: Math.max(this.state.offset, Math.min(passage.end, passage.start + index)) });
        if (this.now() - this.lastSave > 3000) {
          this.lastSave = this.now();
          void this.command(async () => { if (token === this.epoch) await this.save(); });
        }
      },
      onDone: () => { void this.command(async () => {
        if (token !== this.epoch) return;
        this.publish({ offset: passage.end }); await this.save(); await this.speak();
      }); },
      onStopped: () => { void this.command(async () => {
        if (token !== this.epoch) return;
        ++this.epoch; this.publish({ mode: 'paused' }); await this.save();
      }); },
      onError: (error) => { void this.command(async () => { if (token === this.epoch) { await this.save(); throw error; } }); },
    });
  }
}
