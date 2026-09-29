import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { SQLiteLibraryRepository } from '../database/repositories/SQLiteLibraryRepository';
import { ExpoFileStorage } from '../storage/ExpoFileStorage';
import { importBook } from './ImportBook';
import { parsePDF } from '../pdf/PDFService';

let importing = false;
export async function pickAndImport(progress: (message: string) => void) {
  if (importing) return null;
  importing = true;
  let cached: File | undefined;
  try {
    // Android's picker grants access to its content URI. In Expo Go, the
    // DocumentPicker cache can sit outside FileSystem's project-scoped roots.
    // Read that granted URI directly; importBook persists our own source copy.
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*', multiple: false, copyToCacheDirectory: Platform.OS !== 'android',
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    cached = new File(asset.uri);
    if (!/\.(epub|pdf)$/i.test(asset.name)) throw new Error('Please choose an EPUB or PDF file.');
    const limit = /\.pdf$/i.test(asset.name) ? 20 : 50;
    if (cached.size > limit * 1024 * 1024) throw new Error(`Please choose a file smaller than ${limit} MB.`);
    progress('Opening book…');
    const bytes = await cached.bytes();
    const hash = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    const id = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return await importBook(bytes, asset.name, id, new SQLiteLibraryRepository(), new ExpoFileStorage(), progress, parsePDF);
  } finally {
    // Only the picker's temporary copy is removed; the user-selected original is untouched.
    try { if (Platform.OS !== 'android' && cached?.exists && cached.uri.startsWith(Paths.cache.uri.replace(/\/$/, '') + '/')) cached.delete(); } catch { /* Cache can be reclaimed by the OS. */ }
    importing = false;
  }
}
