/**
 * Procedural Web Audio Engine (ref2game Standard)
 * Zero external MP3 files, zero latency, 0 KB bundle bloat.
 * Generates tactile micro-interactions and modal chime alerts using native Web Audio API.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function useTactileAudio() {
  /**
   * Tactile micro-click for UI buttons, tabs, and switches
   * Exponential frequency sweep: 2450 Hz -> 1200 Hz over 15ms
   */
  const playClick = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2450, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.015);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  };

  /**
   * Modal chime alert for claimed drops & milestone rewards
   * 3-harmonic sine bells (1820 Hz, 3940 Hz, 6280 Hz) with exponential decay
   */
  const playRewardChime = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      [1820, 3940, 6280].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const baseAmp = 0.12 / (idx + 1);
        gain.gain.setValueAtTime(baseAmp, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
      });
    } catch {
      // AudioContext unavailable or blocked
    }
  };

  return { playClick, playRewardChime };
}
