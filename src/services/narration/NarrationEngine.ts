export interface NarrationCallbacks {
  onBoundary(offset: number): void;
  onDone(): void;
  onStopped(): void;
  onError(error: Error): void;
}

// Engines speak bounded passages. The player owns queueing, pause/resume and progress.
export interface NarrationEngine {
  readonly maxTextLength: number;
  speak(text: string, rate: number, callbacks: NarrationCallbacks): void;
  stop(): Promise<void>;
}
