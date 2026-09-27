import { useEffect } from 'react';
import { AppState } from 'react-native';
import { player } from '../stores/player';

export function PlaybackLifecycle() {
  useEffect(() => {
    void player.initialize();
    void player.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => { void player.setForeground(state === 'active'); });
    return () => { subscription.remove(); void player.pause(); };
  }, []);
  return null;
}
