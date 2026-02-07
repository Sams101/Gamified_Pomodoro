function audioContext() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

function tone(ctx, { at = 0, duration = 0.2, frequency = 880, type = "sine", gain = 0.06 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(frequency, ctx.currentTime + at);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + duration);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + duration + 0.02);
}

export const ALARM_SOUNDS = Object.freeze([
  { id: "beep", name: "Beep" },
  { id: "chime", name: "Chime" },
  { id: "dingdong", name: "Ding-dong" },
  { id: "buzz", name: "Buzz" },
  { id: "waves", name: "Waves" }
]);

export function playAlarm(soundId) {
  const ctx = audioContext();
  if (!ctx) return;

  // Some browsers require a user gesture; if blocked, just no-op.
  // Ensure context is running if created in a suspended state.
  ctx.resume?.().catch(() => {});

  const id = String(soundId || "beep");

  if (id === "beep") {
    tone(ctx, { at: 0.0, duration: 0.18, frequency: 880, type: "sine", gain: 0.07 });
    tone(ctx, { at: 0.22, duration: 0.18, frequency: 880, type: "sine", gain: 0.07 });
    tone(ctx, { at: 0.44, duration: 0.18, frequency: 880, type: "sine", gain: 0.07 });
    setTimeout(() => ctx.close?.(), 900);
    return;
  }

  if (id === "chime") {
    tone(ctx, { at: 0.0, duration: 0.22, frequency: 784, type: "triangle", gain: 0.06 });
    tone(ctx, { at: 0.12, duration: 0.28, frequency: 1175, type: "triangle", gain: 0.05 });
    tone(ctx, { at: 0.28, duration: 0.36, frequency: 1568, type: "sine", gain: 0.045 });
    setTimeout(() => ctx.close?.(), 1200);
    return;
  }

  if (id === "dingdong") {
    tone(ctx, { at: 0.0, duration: 0.28, frequency: 988, type: "sine", gain: 0.06 });
    tone(ctx, { at: 0.34, duration: 0.38, frequency: 659, type: "sine", gain: 0.06 });
    setTimeout(() => ctx.close?.(), 1300);
    return;
  }

  if (id === "buzz") {
    tone(ctx, { at: 0.0, duration: 0.35, frequency: 140, type: "square", gain: 0.05 });
    tone(ctx, { at: 0.40, duration: 0.35, frequency: 140, type: "square", gain: 0.05 });
    setTimeout(() => ctx.close?.(), 1200);
    return;
  }

  // waves
  tone(ctx, { at: 0.0, duration: 0.22, frequency: 523, type: "sine", gain: 0.045 });
  tone(ctx, { at: 0.18, duration: 0.22, frequency: 659, type: "sine", gain: 0.045 });
  tone(ctx, { at: 0.36, duration: 0.22, frequency: 784, type: "sine", gain: 0.045 });
  tone(ctx, { at: 0.54, duration: 0.22, frequency: 659, type: "sine", gain: 0.045 });
  tone(ctx, { at: 0.72, duration: 0.22, frequency: 523, type: "sine", gain: 0.045 });
  setTimeout(() => ctx.close?.(), 1600);
}

