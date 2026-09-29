# LightVoice Development Notes & Milestone Specifications

This document contains internal architecture notes, extraction limits, and verification checklists for LightVoice.

## Milestones & Specifications

### EPUB & PDF Import
- Import an EPUB from the Library, view its cover and metadata, open its chapter list, and read extracted text.
- Chapters follow the EPUB spine. Navigation documents and explicitly non-linear content are excluded.
- Duplicate detection uses SHA-256 of the source file. Repacked editions count as different files.
- Source, cover, and chapter files stay in app storage; metadata is committed in one SQLite transaction.
- Failed imports clean up their files. Importing the same file again also clears an interrupted attempt's orphan files.
- Missing titles use the filename; missing covers use a placeholder. Malformed chapters abort the import rather than silently omitting prose.
- EPUB 3 contents and EPUB 2 NCX labels supply publisher chapter numbers. Reading-order positions are no longer displayed as chapter numbers. Existing EPUBs have a Refresh chapter titles action; it updates labels without changing IDs or saved progress.
- PDF importing extracts selectable text locally with bundled PDF.js in a WebView. Chapter headings and verified contents links/bookmarks define chapter ranges; front/back matter is stored separately in a persistent coverage report. Repeated margin text and page numbers are excluded from narration. Drop caps use glyph spacing, and unfinished sentences can continue across page/image boundaries. No files are uploaded.
- PDF coverage & extra material shows source page ranges, non-narrated material, and pages needing OCR. Original images remain in the stored source PDF, not separate spoken cards. Scanned/image-only PDFs require OCR (not implemented); password-protected PDFs require an unlocked copy. Cover extraction and an in-app original-PDF viewer are not implemented. Limits: 20 MB input, 1,500 pages, 12 MB extracted text.
- Existing page-based PDFs offer Create chapter edition: a separate copy using the current parser, leaving the original copy and its listening position untouched. Repeating this action opens the same edition. PDFs without reliable chapter boundaries keep explicitly labelled page sections with a warning; unusual layouts, multi-column text and mid-page chapter starts may need manual review. Detection does not guarantee OCR completeness or word-perfect reading order.
- All database reads and writes are serialized, including whole import transactions, to avoid overlapping native statement lifetimes on Android. Player initialization can be retried after a failure.

**Limits:**
- 50 MB compressed EPUB, 12 MB per extracted file, 60 MB cumulative extraction, 10,000 archive entries.
- EPUB spine documents are used as chapter units; table-of-contents fragment splitting is not yet implemented.
- Raster EPUB 2/3 covers are supported.
- Chapter viewing currently has no saved reading scroll position or font controls.
- Browser persistence is not implemented.

### Local Narration
- Tap Listen on a book or chapter to use the device's English TTS voice.
- The Player supports pause/resume, previous/next chapter, a chapter-position slider, speed selection, automatic continuation, and sleep timers (10/15/30/45/60 minutes or end of chapter).
- Settings and player speed share the same state.
- The most recently played book is restored paused after an app restart.
- Android TTS does not support native pause/resume. The controller stops speech and restarts at its last word boundary; engines without boundary callbacks may repeat a short passage (at most 240 characters).
- Progress is saved at passage completion, periodically on word boundaries, and on pause/seek/chapter changes. Percentages represent text position, not audio time; exact 15-second seeking needs generated audio. No OpenAI API calls are used.
- Expo Go and iOS retain foreground-only playback. The Android development build includes a native narration service for screen-off playback, notification/lock-screen controls, audio-focus and headset-disconnect pauses, native sleep timers and durable progress. See [Android setup and acceptance checklist](android-background-playback.md). Install an offline English voice in Android text-to-speech settings. The development app has its own storage: reimport books from Expo Go.

## Verification & Testing

- `npm test` checks generated EPUB fixtures, text cleaning, ordering, missing metadata, corrupt files, duplicate imports, rollback, and SQLite repository behavior.
- `npm run typecheck` and `npm run lint` check application code.
- `npm run generate:pdf` builds the offline PDF runtime (also run by postinstall and before npm start). Run it before direct `npx expo` builds in a fresh checkout.
- Tests include real PDF.js extraction and serialized database access.
- `node scripts/pdf-browser-smoke.cjs <path-to-playwright>` optionally checks the generated WebView script in Chromium with no network requests.
- Set `LIGHTVOICE_SAMPLE_PDF` to the local Volume 15 sample before running `npm test` to enable its regression test.

### Manual Verification Checklists

**On-device check:**
1. Import an EPUB, inspect its cover and chapter order, and open a chapter.
2. Restart the app and reopen the book.
3. Import the same file again to confirm duplicate detection.
4. Test canceling the picker and selecting a non-EPUB file.

**Narration check:**
1. Tap Listen, pause mid-sentence, resume, change speed, seek, and switch chapters.
2. Restart the app and press Play to resume.
3. Seek near the chapter end and verify both continuous playback and end-of-chapter sleep.
4. Test leaving the app: speech should pause and remain paused when returning (in foreground mode).

