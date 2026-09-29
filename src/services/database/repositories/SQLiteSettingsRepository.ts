import type { AppSettings } from '@/types/domain';

import { getDatabase } from '../database';
import type { SettingsRepository } from './contracts';
import { playbackRates } from '../../narration/passages';

const SETTINGS_KEY = 'app';

export const defaultSettings: AppSettings = {
  playbackRate: 1,
  continueToNextChapter: true,
};

export class SQLiteSettingsRepository implements SettingsRepository {
  async load(): Promise<AppSettings> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      SETTINGS_KEY,
    );

    if (!row) return defaultSettings;

    try {
      const saved = JSON.parse(row.value);
      return {
        playbackRate: playbackRates.includes(saved?.playbackRate) ? saved.playbackRate : 1,
        continueToNextChapter: typeof saved?.continueToNextChapter === 'boolean' ? saved.continueToNextChapter : true,
        voiceId: typeof saved?.voiceId === 'string' ? saved.voiceId : undefined,
        readerFontSize: [16, 18, 20, 22, 24, 28].includes(saved?.readerFontSize) ? saved.readerFontSize : 20,
        librarySort: ['newest', 'title', 'author'].includes(saved?.librarySort) ? saved.librarySort : 'newest',
      };
    } catch {
      return defaultSettings;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      SETTINGS_KEY,
      JSON.stringify(settings),
    );
  }
}
