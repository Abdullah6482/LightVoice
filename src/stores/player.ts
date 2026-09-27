import { useSyncExternalStore } from 'react';
import { SQLiteLibraryRepository } from '../services/database/repositories/SQLiteLibraryRepository';
import { SQLitePlaybackRepository } from '../services/database/repositories/SQLitePlaybackRepository';
import { SQLiteSettingsRepository } from '../services/database/repositories/SQLiteSettingsRepository';
import { ExpoFileStorage } from '../services/storage/ExpoFileStorage';
import { DeviceTTSEngine } from '../services/narration/DeviceTTSEngine';
import { PlayerController } from '../services/narration/PlayerController';

export const player = new PlayerController(new DeviceTTSEngine(), new SQLiteLibraryRepository(), new SQLitePlaybackRepository(), new SQLiteSettingsRepository(), (path) => new ExpoFileStorage().readText(path));
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
