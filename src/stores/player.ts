import { useSyncExternalStore } from 'react';
import { SQLiteLibraryRepository } from '../services/database/repositories/SQLiteLibraryRepository';
import { SQLitePlaybackRepository } from '../services/database/repositories/SQLitePlaybackRepository';
import { SQLiteSettingsRepository } from '../services/database/repositories/SQLiteSettingsRepository';
import { ExpoFileStorage } from '../services/storage/ExpoFileStorage';
import { DeviceTTSEngine } from '../services/narration/DeviceTTSEngine';
import { PlayerController } from '../services/narration/PlayerController';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { NativePlaybackController, type NativePlayback } from '../services/narration/NativePlaybackController';

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativePlayback>('LightVoicePlayback') : null;
export const player = native
  ? new NativePlaybackController(native, new SQLiteLibraryRepository(), new SQLitePlaybackRepository(), new SQLiteSettingsRepository())
  : new PlayerController(new DeviceTTSEngine(), new SQLiteLibraryRepository(), new SQLitePlaybackRepository(), new SQLiteSettingsRepository(), (path) => new ExpoFileStorage().readText(path));
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
