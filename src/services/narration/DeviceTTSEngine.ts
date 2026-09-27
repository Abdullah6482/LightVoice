import * as Speech from 'expo-speech';
import type { NarrationCallbacks, NarrationEngine } from './NarrationEngine';

export class DeviceTTSEngine implements NarrationEngine {
  get maxTextLength() { return Math.min(240, Speech.maxSpeechInputLength); }
  speak(text: string, rate: number, callbacks: NarrationCallbacks) {
    Speech.speak(text, {
      language: 'en', rate,
      onBoundary: (event: { charIndex: number }) => callbacks.onBoundary(event.charIndex),
      onDone: callbacks.onDone,
      onStopped: callbacks.onStopped,
      onError: () => callbacks.onError(new Error('The device voice could not speak. Check the text-to-speech voice installed in Android Settings, then try Play again.')),
    });
  }
  stop() { return Speech.stop(); }
}
