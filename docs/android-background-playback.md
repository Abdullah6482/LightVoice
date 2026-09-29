# Android background narration

## Status

The development build uses the local `lightvoice-playback` Expo module. Expo Go,
iOS and web retain the existing foreground-only speech player. A JavaScript export
does not compile Kotlin; an EAS Android build and physical-device testing are
required before treating the native service as verified.

## Build and install

From this project directory:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

EAS may ask to create/link your Expo project and generate an Android signing key.
Install the resulting APK on the phone, then open it against the development server.
Use `--profile preview` for an internal APK that bundles JavaScript and does not
need a running development server. EAS account quotas/charges depend on your plan.

This is a separate Android app (`com.abdullah.lightvoice`) from Expo Go. Import
your books again; Expo Go's private library and listening progress are not
automatically accessible. Installing later APKs with the same signing key and
package preserves the development app's data; uninstalling clears it.

## Ownership and safety

- `NarrationService` owns the native TTS queue, MediaSession, notification controls,
  audio focus, headset-disconnect handling, wake lock, sleep deadline and progress.
  It does not need JS callbacks to advance passages or chapters.
- Native checkpoints use a separate SharedPreferences store, throttled to 3 seconds
  during speech and saved at passage completion/pause/chapter changes. The adapter
  prefers newer native checkpoints over SQLite's older foreground-player progress.
- Process death restores paused; there is no boot receiver or automatic restart.
  Force-stop always stops narration. Pause/resume may repeat the current word, or
  at most a 240-character passage if the voice has no word-boundary callbacks.
- Audio-focus loss and unplugged headphones pause, never auto-resume. Wake locks
  are released when paused and renewed with a bounded timeout while speaking.
- Only installed English voices marked offline by Android are selected. No
  cloud TTS, microphone permission, or book-text uploads are introduced.
- Original documents and development scratch files are excluded from EAS uploads
  by `.easignore`. The local module's own Android library is source code, not the
  generated root `android/` project.

## Physical Android acceptance checklist

1. Confirm the Player says Android background narration is enabled.
2. Play a chapter, lock the screen for at least 10 minutes, and verify passage
   transitions continue. Test a chapter transition while the screen stays locked.
3. Use notification and lock-screen Play/Pause, Previous, Next and Stop. A paused
   session should never restart merely because the app returns to the foreground.
4. Unplug wired headphones and disconnect Bluetooth. Accept an incoming call or
   play audio from another app. Narration must pause; resume explicitly.
5. Test timed sleep with the screen off, end-of-chapter sleep, speed changes,
   seeking, and disabling continuous listening.
6. Force-stop/reopen the app: restore paused near the latest checkpoint. Test
   switching books and returning to each saved position.
7. Disable/download the English offline TTS voice and confirm an actionable error
   rather than silent playback. Test without network connectivity.
8. Repeat on Android 13+ and the actual user's device; vendor battery restrictions
   may require device-specific investigation. Do not disable battery restrictions
   globally or claim immunity to force-stop/process termination.
