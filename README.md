# LightVoice

Personal EPUB library and audiobook reader, built with Expo SDK 57 and TypeScript. Android is the primary target.

## Run

Use Node 22.13+ (Node 24 LTS supported), then run `npm ci` and `npm start`. Open the project in a matching Expo Go client or development build. A custom development build must be rebuilt when native dependencies change.

## Current milestone

- Import an EPUB from the Library, view its cover and metadata, open its chapter list, and read extracted text.
- Chapters follow the EPUB spine. Navigation documents and explicitly non-linear content are excluded.
- Duplicate detection uses SHA-256 of the source file. Repacked editions count as different files.
- Source, cover, and chapter files stay in app storage; metadata is committed in one SQLite transaction.
- Failed imports clean up their files. Importing the same file again also clears an interrupted attempt's orphan files.
- Missing titles use the filename; missing covers use a placeholder. Malformed chapters abort the import rather than silently omitting prose.

Limits: 50 MB compressed EPUB, 12 MB per extracted file, 60 MB cumulative extraction, 10,000 archive entries. EPUB spine documents are used as chapter units; table-of-contents fragment splitting is not yet implemented. Raster EPUB 2/3 covers are supported. Chapter viewing currently has no saved reading scroll position or font controls. Browser persistence is not implemented.

## Local narration

Tap Listen on a book or chapter to use the device's English TTS voice. The Player supports pause/resume, previous/next chapter, a chapter-position slider, speed selection, automatic continuation, and sleep timers (10/15/30/45/60 minutes or end of chapter). Settings and player speed share the same state. The most recently played book is restored paused after an app restart.

Android TTS does not support native pause/resume. The controller stops speech and restarts at its last word boundary; engines without boundary callbacks may repeat a short passage (at most 240 characters). Progress is saved at passage completion, periodically on word boundaries, and on pause/seek/chapter changes. Percentages represent text position, not audio time; exact 15-second seeking needs generated audio. No OpenAI API calls are used.

This milestone supports foreground playback only. Leaving the app pauses and saves progress; reliable screen-off playback, audio-focus/headphone handling, and media notifications remain the next milestone. Use an installed English voice in Android text-to-speech settings. Offline availability depends on the voice installed on the device.

## Verification

`npm test` checks generated EPUB fixtures, text cleaning, ordering, missing metadata, corrupt files, duplicate imports, rollback, and SQLite repository behavior. `npm run typecheck` and `npm run lint` check application code. Start Expo once after adding routes to regenerate `.expo/types/router.d.ts`. `npx expo export --platform android` checks the Android JavaScript bundle.

On-device check: import an EPUB, inspect its cover and chapter order, open a chapter, restart the app and reopen the book, then import the same file again to confirm duplicate detection. Try canceling the picker and selecting a non-EPUB as well.

Narration check: tap Listen, pause mid-sentence, resume, change speed, seek, and switch chapters. Restart the app and press Play to resume. Seek near the chapter end and verify both continuous playback and end-of-chapter sleep. Test leaving the app: speech should pause and remain paused when returning. Automated tests use a fake speech engine plus real SQLite for persistence; actual voice behavior must be verified on Android.
