import { asInt, clampNumber } from "./utils.js";

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  soundEnabled: false,
  alarmSound: "chime",
  activeTaskId: null,
  pomodorosSinceLongBreak: 0,
  totalPoints: 0
});

export function normalizeSettings(raw = {}) {
  const out = { ...DEFAULT_SETTINGS, ...raw };
  out.workMinutes = clampNumber(asInt(out.workMinutes, DEFAULT_SETTINGS.workMinutes), 1, 180);
  out.shortBreakMinutes = clampNumber(asInt(out.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes), 1, 60);
  out.longBreakMinutes = clampNumber(asInt(out.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes), 1, 90);
  out.longBreakInterval = clampNumber(asInt(out.longBreakInterval, DEFAULT_SETTINGS.longBreakInterval), 2, 12);
  out.soundEnabled = Boolean(out.soundEnabled);
  out.alarmSound = String(out.alarmSound || DEFAULT_SETTINGS.alarmSound);
  out.activeTaskId = out.activeTaskId || null;
  out.pomodorosSinceLongBreak = clampNumber(asInt(out.pomodorosSinceLongBreak, 0), 0, 999999);
  out.totalPoints = clampNumber(asInt(out.totalPoints, 0), 0, 999999999);
  return out;
}
