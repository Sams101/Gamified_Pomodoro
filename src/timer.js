import { formatMMSS, minutesToSeconds } from "./utils.js";

export const PHASE = Object.freeze({
  WORK: "work",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak"
});

export class PomodoroTimer extends EventTarget {
  constructor({ getDurations }) {
    super();
    this._getDurations = getDurations;
    this._interval = null;
    this._phase = PHASE.WORK;
    this._remainingSeconds = minutesToSeconds(getDurations().workMinutes);
    this._running = false;
    this._phaseStartedAt = null;
    this._tickAnchorMs = null;
    this._remainingAtAnchor = null;
  }

  get phase() {
    return this._phase;
  }
  get remainingSeconds() {
    return this._remainingSeconds;
  }
  get isRunning() {
    return this._running;
  }
  get display() {
    return formatMMSS(this._remainingSeconds);
  }

  get phaseStartedAt() {
    return this._phaseStartedAt;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  _startLoop() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), 250);
  }

  _stopLoop() {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
  }

  _tick() {
    if (!this._running) return;
    const elapsedSec = (performance.now() - this._tickAnchorMs) / 1000;
    const next = Math.max(0, Math.round(this._remainingAtAnchor - elapsedSec));
    if (next !== this._remainingSeconds) {
      this._remainingSeconds = next;
      this._emit("tick", { remainingSeconds: next, display: this.display });
    }
    if (next <= 0) {
      this.pause();
      this._emit("complete", { phase: this._phase, completedAt: new Date().toISOString() });
    }
  }

  start() {
    if (this._running) return;
    if (!this._phaseStartedAt) this._phaseStartedAt = new Date().toISOString();
    this._running = true;
    this._tickAnchorMs = performance.now();
    this._remainingAtAnchor = this._remainingSeconds;
    this._startLoop();
    this._emit("state", { running: true });
  }

  pause() {
    if (!this._running) return;
    this._running = false;
    this._stopLoop();
    this._emit("state", { running: false });
  }

  toggle() {
    if (this._running) this.pause();
    else this.start();
  }

  resetToWork(workMinutes) {
    this.pause();
    this._phase = PHASE.WORK;
    const minutes = workMinutes ?? this._getDurations().workMinutes;
    this._remainingSeconds = minutesToSeconds(minutes);
    this._phaseStartedAt = null;
    this._emit("phase", { phase: this._phase });
    this._emit("tick", { remainingSeconds: this._remainingSeconds, display: this.display });
  }

  switchPhase(nextPhase, minutes) {
    this.pause();
    this._phase = nextPhase;
    this._remainingSeconds = minutesToSeconds(minutes);
    this._phaseStartedAt = null;
    this._emit("phase", { phase: this._phase });
    this._emit("tick", { remainingSeconds: this._remainingSeconds, display: this.display });
  }
}
