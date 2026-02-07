import { DB } from "./db.js";
import { PomodoroTimer, PHASE } from "./timer.js";
import { SCORING, getTodayKey } from "./scoring.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.js";
import { playAlarm } from "./sounds.js";
import { asInt, clampNumber, isDialogSupported, localDateKey } from "./utils.js";
import { wireUI } from "./ui.js";

const state = {
  settings: { ...DEFAULT_SETTINGS },
  tasks: [],
  activeTask: null,
  todayPoints: 0,
  dailyRows: [],
  range: "7"
};

function getState() {
  return {
    ...state,
    activeTaskId: state.settings.activeTaskId
  };
}

async function loadFromDb() {
  const rawSettings = await DB.getSettings();
  state.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...rawSettings });
  state.tasks = await DB.listTasks();
  state.activeTask = state.settings.activeTaskId ? await DB.getTask(state.settings.activeTaskId) : null;
  await refreshDailyPoints();
  state.todayPoints = (await getTodayPoints()) ?? 0;
}

async function refreshDailyPoints() {
  const all = await DB.listDailyPoints();
  state.dailyRows = filterRange(all, state.range);
}

function filterRange(rows, range) {
  if (range === "all") return rows;
  const days = range === "30" ? 30 : 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = localDateKey(cutoff);
  return rows.filter((r) => r.dateKey >= cutoffKey);
}

async function getTodayPoints() {
  const key = getTodayKey();
  const rows = await DB.listDailyPoints();
  const row = rows.find((r) => r.dateKey === key);
  return row?.points ?? 0;
}

function durationsForActiveTask() {
  const taskOverride = state.activeTask?.workMinutesOverride ? asInt(state.activeTask.workMinutesOverride, 0) : 0;
  return {
    workMinutes: taskOverride > 0 ? clampNumber(taskOverride, 1, 180) : state.settings.workMinutes,
    shortBreakMinutes: state.settings.shortBreakMinutes,
    longBreakMinutes: state.settings.longBreakMinutes
  };
}

const timer = new PomodoroTimer({
  getDurations: () => durationsForActiveTask()
});

async function setActiveTask(taskId) {
  state.settings.activeTaskId = taskId;
  state.activeTask = taskId ? await DB.getTask(taskId) : null;
  await DB.setSetting("activeTaskId", state.settings.activeTaskId);
  // Reset timer to correct work duration when switching tasks.
  timer.resetToWork(durationsForActiveTask().workMinutes);
  ui.renderAll();
}

async function openTaskEditor(task = null) {
  if (!isDialogSupported()) {
    const title = prompt("Task title", task?.title ?? "");
    if (!title) return;
    const planned = asInt(prompt("Planned pomodoros (0 = none)", String(task?.plannedPomodoros ?? 0)), 0);
    const override = asInt(prompt("Work override minutes (0 = none)", String(task?.workMinutesOverride ?? 0)), 0);
    const workMinutesOverride = override > 0 ? override : null;
    const saved = await DB.upsertTask({
      id: task?.id,
      title,
      plannedPomodoros: planned,
      workMinutesOverride
    });
    await reloadTasksKeepActive(saved.id);
    return;
  }

  const dialog = document.getElementById("taskDialog");
  const form = document.getElementById("taskDialogForm");
  const titleEl = document.getElementById("taskDialogTitle");
  titleEl.textContent = task ? "Edit task" : "New task";
  form.taskId.value = task?.id ?? "";
  form.title.value = task?.title ?? "";
  form.plannedPomodoros.value = String(task?.plannedPomodoros ?? 0);
  form.workMinutesOverride.value = String(task?.workMinutesOverride ?? 0);

  const cancelBtn = document.getElementById("cancelTaskDialogBtn");
  const onCancel = () => dialog.close("cancel");
  cancelBtn.addEventListener("click", onCancel, { once: true });

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const id = String(fd.get("taskId") || "") || null;
    const title = String(fd.get("title") || "").trim();
    const plannedPomodoros = clampNumber(asInt(fd.get("plannedPomodoros"), 0), 0, 999);
    const overrideRaw = asInt(fd.get("workMinutesOverride"), 0);
    const workMinutesOverride = overrideRaw > 0 ? clampNumber(overrideRaw, 1, 180) : null;

    const saved = await DB.upsertTask({
      id,
      title,
      plannedPomodoros,
      workMinutesOverride
    });
    dialog.close("confirm");
    form.removeEventListener("submit", onSubmit);
    await reloadTasksKeepActive(saved.id);
  };
  form.addEventListener("submit", onSubmit);
  dialog.showModal();
}

async function reloadTasksKeepActive(selectId = null) {
  state.tasks = await DB.listTasks();
  if (selectId) {
    await setActiveTask(selectId);
  } else if (state.settings.activeTaskId) {
    state.activeTask = await DB.getTask(state.settings.activeTaskId);
  }
  ui.renderAll();
}

async function markActiveTaskComplete() {
  if (!state.activeTask) return;
  if (state.activeTask.isCompleted) return;
  const updated = await DB.upsertTask({ ...state.activeTask, isCompleted: true });
  state.activeTask = updated;
  await reloadTasksKeepActive(updated.id);
  await awardPoints(SCORING.BONUS_ON_TASK_COMPLETE);
}

async function deleteActiveTask() {
  if (!state.activeTask) return;
  const ok = confirm(`Delete task "${state.activeTask.title}"? This removes its pomodoro history too.`);
  if (!ok) return;
  const deletingId = state.activeTask.id;
  await DB.deleteTask(deletingId);
  if (state.settings.activeTaskId === deletingId) {
    state.settings.activeTaskId = null;
    state.activeTask = null;
    await DB.setSetting("activeTaskId", null);
    timer.resetToWork(state.settings.workMinutes);
  }
  await reloadTasksKeepActive(null);
}

async function saveSettings(next) {
  const normalized = normalizeSettings({ ...state.settings, ...next });
  state.settings = normalized;
  for (const [k, v] of Object.entries(next)) await DB.setSetting(k, v);
  timer.resetToWork(durationsForActiveTask().workMinutes);
  ui.renderAll();
}

function maybePlayAlarm() {
  if (!state.settings.soundEnabled) return;
  playAlarm(state.settings.alarmSound);
}

function testAlarm(soundId) {
  playAlarm(soundId || state.settings.alarmSound);
}

async function awardPoints(pointsToAdd) {
  const key = getTodayKey();
  await DB.addPoints(key, pointsToAdd);
  state.settings.totalPoints = asInt(state.settings.totalPoints, 0) + pointsToAdd;
  await DB.setSetting("totalPoints", state.settings.totalPoints);
  state.todayPoints = await getTodayPoints();
  await refreshDailyPoints();
  ui.renderScores();
  ui.renderInsights();
}

async function onWorkComplete({ completedAtIso }) {
  if (!state.activeTask) {
    // Still award pomodoro points even without an active task? Spec is task-based tracking.
    // We'll require an active task to count a pomodoro.
    return;
  }

  const startedAt = timer.phaseStartedAt ?? completedAtIso;
  const endedAt = completedAtIso;
  const dateKey = localDateKey(new Date(endedAt));

  await awardPoints(SCORING.POINTS_PER_POMODORO);
  await DB.addCompletedPomodoro({
    taskId: state.activeTask.id,
    startedAt,
    endedAt,
    minutesPlanned: durationsForActiveTask().workMinutes,
    dateKey,
    points: SCORING.POINTS_PER_POMODORO
  });

  // Update task progress.
  const nextCompleted = (state.activeTask.completedPomodoros ?? 0) + 1;
  const planned = state.activeTask.plannedPomodoros ?? 0;
  let justCompletedTask = false;
  let isCompleted = Boolean(state.activeTask.isCompleted);
  if (!isCompleted && planned > 0 && nextCompleted >= planned) {
    isCompleted = true;
    justCompletedTask = true;
  }

  const updated = await DB.upsertTask({
    ...state.activeTask,
    completedPomodoros: nextCompleted,
    isCompleted
  });
  state.activeTask = updated;

  if (justCompletedTask) {
    await awardPoints(SCORING.BONUS_ON_TASK_COMPLETE);
  }

  // Update long-break counter.
  state.settings.pomodorosSinceLongBreak = (state.settings.pomodorosSinceLongBreak ?? 0) + 1;
  const takeLong = state.settings.pomodorosSinceLongBreak >= state.settings.longBreakInterval;
  if (takeLong) state.settings.pomodorosSinceLongBreak = 0;
  await DB.setSetting("pomodorosSinceLongBreak", state.settings.pomodorosSinceLongBreak);

  state.tasks = await DB.listTasks();
  ui.renderAll();

  maybePlayAlarm();

  // Move to break.
  const breakPhase = takeLong ? PHASE.LONG_BREAK : PHASE.SHORT_BREAK;
  const minutes = breakPhase === PHASE.LONG_BREAK ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes;
  timer.switchPhase(breakPhase, minutes);
}

function onBreakComplete() {
  maybePlayAlarm();
  timer.switchPhase(PHASE.WORK, durationsForActiveTask().workMinutes);
}

timer.addEventListener("complete", async (e) => {
  const { phase, completedAt } = e.detail;
  if (phase === PHASE.WORK) {
    await onWorkComplete({ completedAtIso: completedAt });
  } else {
    onBreakComplete();
  }
});

const api = {
  resetTimer() {
    timer.resetToWork(durationsForActiveTask().workMinutes);
  },
  skipBreak() {
    if (timer.phase === PHASE.WORK) return;
    timer.switchPhase(PHASE.WORK, durationsForActiveTask().workMinutes);
  }
};

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function guardActiveTaskForWorkStart() {
  timer.addEventListener("state", () => {
    if (timer.isRunning && timer.phase === PHASE.WORK && !state.activeTask) {
      timer.pause();
      alert("Select a task before starting a work session.");
    }
  });
}

function applyTitleTick() {
  timer.addEventListener("tick", () => {
    const phase = timer.phase === "work" ? "Work" : timer.phase === "shortBreak" ? "Break" : "Long break";
    document.title = `${timer.display} • ${phase}`;
  });
}

let ui;
async function boot() {
  await loadFromDb();

  // Initialize timer display.
  timer.resetToWork(durationsForActiveTask().workMinutes);

  ui = wireUI({
    timer,
    api,
    getState,
    setActiveTask,
    openTaskEditor,
    markActiveTaskComplete,
    deleteActiveTask,
    saveSettings,
    setRange: async (range) => {
      state.range = range;
      await refreshDailyPoints();
      ui.renderInsights();
    },
    openSettings: () => {
      const dialog = document.getElementById("settingsDialog");
      // Ensure current settings are reflected each time it's opened.
      ui.renderAll();
      dialog.showModal();
    },
    testAlarm
  });

  ui.renderAll();

  registerServiceWorker();
  guardActiveTaskForWorkStart();
  applyTitleTick();
}

boot().catch((err) => {
  console.error(err);
  alert("Failed to start app. Check console for details.");
});
