import type { AppSettings, PlaybackProgress } from '../../types/domain';
import type { LibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import type { PlaybackProgressRepository, SettingsRepository } from '../database/repositories/contracts';
import type { PlayerState } from './PlayerController';
import { playbackRates } from './passages';

export interface NativePlayback {
  snapshot(): Promise<string | null>;
  progress(bookId: string): Promise<string | null>;
  command(json: string): Promise<void>;
  forgetBook?(bookId: string): Promise<void>;
  preparePreview?(): Promise<void>;
  voices?(): Promise<{ identifier: string; name: string; language: string }[]>;
  addListener(event: 'state', listener: (value: { json: string }) => void): { remove(): void };
}

/** UI projection only. Android keeps speaking and persisting without JS listeners. */
export class NativePlaybackController {
  readonly supportsBackground = true;
  private state: PlayerState = { mode: 'idle', ready: false, chapters: [], offset: 0, length: 0, excerpt: '', settings: { playbackRate: 1, continueToNextChapter: true }, sleep: null };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private subscription?: { remove(): void };
  constructor(private native: NativePlayback, private library: LibraryRepository,
    private progress: PlaybackProgressRepository & { latest(): Promise<PlaybackProgress | null> }, private settings: SettingsRepository) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<PlayerState>) { this.state = { ...this.state, ...change }; this.listeners.forEach(listener => listener()); }
  private accept(json: string) {
    const value = JSON.parse(json) as PlayerState;
    if (!Array.isArray(value.chapters) || !value.settings || !Number.isFinite(value.offset)) throw new Error('Invalid native playback state.');
    this.publish({ ...value, settings: { ...this.state.settings, playbackRate: value.settings.playbackRate, continueToNextChapter: value.settings.continueToNextChapter }, book: value.book ?? undefined, chapter: value.chapter ?? undefined, error: value.error ?? undefined, ready: true });
  }
  private run(action: () => Promise<void>) {
    this.queue = this.queue.then(action).catch(error => this.publish({ error: error instanceof Error ? error.message : 'Android playback failed. Try again.', mode: 'error' }));
    return this.queue;
  }
  private send(command: Record<string, unknown>) { return this.native.command(JSON.stringify(command)); }
  initialize = () => this.run(async () => {
    if (this.state.ready) return;
    if (!this.subscription) this.subscription = this.native.addListener('state', ({ json }) => {
      try { this.accept(json); } catch { this.publish({ mode: 'error', error: 'Unable to synchronize Android playback. Reopen LightVoice.' }); }
    });
    this.publish({ settings: await this.settings.load() });
    const snapshot = await this.native.snapshot();
    if (snapshot) { this.accept(snapshot); return; }
    this.publish({ settings: await this.settings.load() });
    const saved = await this.progress.latest();
    if (saved) await this.load(saved.bookId, saved.chapterId, saved.textOffset, false);
    this.publish({ ready: true });
  });
  private async load(bookId: string, chapterId: string | undefined, offset: number, autoplay: boolean) {
    const [book, chapters] = await Promise.all([this.library.findById(bookId), this.library.findChapters(bookId)]);
    if (!book || !chapters.length) throw new Error('This book has no playable chapters.');
    const chapter = chapters.find(c => c.id === chapterId) || chapters[0];
    await this.send({ action: 'load', book, chapters, chapterId: chapter.id, offset: chapter.id === chapterId ? offset : 0, autoplay,
      rate: this.state.settings.playbackRate, continuous: this.state.settings.continueToNextChapter, voiceId: this.state.settings.voiceId ?? '' });
  }
  select = (bookId: string, chapterId?: string) => this.run(async () => {
    const stored = await this.native.progress(bookId);
    const local = stored ? JSON.parse(stored) as PlaybackProgress : null;
    const legacy = await this.progress.findByBookId(bookId);
    const saved = local && (!legacy || local.updatedAt >= legacy.updatedAt) ? local : legacy;
    const target = chapterId ?? saved?.chapterId;
    await this.load(bookId, target, target === saved?.chapterId ? saved?.textOffset ?? 0 : 0, true);
  });
  play = () => this.run(() => this.send({ action: 'play' }));
  pause = () => this.run(() => this.send({ action: 'pause' }));
  async preparePreview() {
    await this.queue;
    if (!this.native.preparePreview) throw new Error('Install the updated LightVoice APK to preview voices safely.');
    await this.native.preparePreview();
  }
  async forgetBook(bookId: string) {
    await this.queue;
    if (!this.native.forgetBook) throw new Error('Install the updated LightVoice APK before deleting books.');
    await this.native.forgetBook(bookId);
    if (this.state.book?.id === bookId) this.publish({ book: undefined, chapter: undefined, chapters: [], offset: 0, length: 0, excerpt: '', sleep: null, mode: 'idle', error: undefined });
  }
  async availableVoices() {
    if (!this.native.voices) throw new Error('Install the updated LightVoice APK to select offline voices.');
    return this.native.voices();
  }
  seek = (offset: number) => this.run(() => this.send({ action: 'seek', offset: Math.floor(Math.max(0, Math.min(this.state.length, offset))) }));
  moveChapter = (direction: number) => this.run(() => this.send({ action: 'move', direction }));
  setSleep = (minutes: number | 'chapter' | null) => this.run(() => this.send({ action: 'sleep', value: minutes }));
  setForeground(active: boolean) {
    if (!active) return Promise.resolve(); // Never stop the Android service on AppState changes.
    return this.run(async () => { const snapshot = await this.native.snapshot(); if (snapshot) this.accept(snapshot); });
  }
  updateSettings = (patch: Partial<AppSettings>) => this.run(async () => {
    const next = { ...this.state.settings, ...patch };
    if (!playbackRates.includes(next.playbackRate)) throw new Error('Unsupported playback speed.');
    await this.settings.save(next);
    this.publish({ settings: next });
    if ('playbackRate' in patch || 'continueToNextChapter' in patch || 'voiceId' in patch)
      await this.send({ action: 'settings', rate: next.playbackRate, continuous: next.continueToNextChapter, voiceId: next.voiceId ?? '' });
  });
}
