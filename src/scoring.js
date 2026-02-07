import { localDateKey } from "./utils.js";

export const SCORING = Object.freeze({
  POINTS_PER_POMODORO: 10,
  BONUS_ON_TASK_COMPLETE: 50
});

export function pointsRuleText() {
  return `${SCORING.POINTS_PER_POMODORO} per pomodoro + ${SCORING.BONUS_ON_TASK_COMPLETE} when task completes`;
}

export function getTodayKey() {
  return localDateKey(new Date());
}

