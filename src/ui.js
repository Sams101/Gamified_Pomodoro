import { drawPointsChart } from "./chart.js";
import { SCORING, pointsRuleText } from "./scoring.js";
import { isDialogSupported } from "./utils.js";

export function wireUI({
  timer,
  api,
  getState,
  setActiveTask,
  openTaskEditor,
  markActiveTaskComplete,
  deleteActiveTask,
  saveSettings,
  setRange,
  openSettings,
  testAlarm
}) {
  const els = {
    totalPoints: document.getElementById("totalPoints"),
    todayPoints: document.getElementById("todayPoints"),
    taskList: document.getElementById("taskList"),
    activeTaskLabel: document.getElementById("activeTaskLabel"),
    phaseLabel: document.getElementById("phaseLabel"),
    timeLabel: document.getElementById("timeLabel"),
    timerMeta: document.getElementById("timerMeta"),
    startPauseBtn: document.getElementById("startPauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    skipBreakBtn: document.getElementById("skipBreakBtn"),
    newTaskBtn: document.getElementById("newTaskBtn"),
    markTaskCompleteBtn: document.getElementById("markTaskCompleteBtn"),
    deleteTaskBtn: document.getElementById("deleteTaskBtn"),
    openSettingsBtn: document.getElementById("openSettingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsForm: document.getElementById("settingsDialogForm"),
    closeSettingsDialogBtn: document.getElementById("closeSettingsDialogBtn"),
    testSoundBtn: document.getElementById("testSoundBtn"),
    pointsRule: document.getElementById("pointsRule"),
    pointsChart: document.getElementById("pointsChart"),
    pointsTableBody: document.getElementById("pointsTableBody"),
    range7: document.getElementById("range7"),
    range30: document.getElementById("range30"),
    rangeAll: document.getElementById("rangeAll")
  };

  els.pointsRule.textContent = pointsRuleText();

  els.newTaskBtn.addEventListener("click", () => openTaskEditor());
  els.markTaskCompleteBtn.addEventListener("click", () => markActiveTaskComplete());
  els.deleteTaskBtn.addEventListener("click", () => deleteActiveTask());

  els.openSettingsBtn.addEventListener("click", () => openSettings());
  els.closeSettingsDialogBtn.addEventListener("click", () => els.settingsDialog.close("cancel"));
  els.testSoundBtn.addEventListener("click", () => {
    const fd = new FormData(els.settingsForm);
    testAlarm(String(fd.get("alarmSound") || ""));
  });

  els.startPauseBtn.addEventListener("click", () => timer.toggle());
  els.resetBtn.addEventListener("click", () => api.resetTimer());
  els.skipBreakBtn.addEventListener("click", () => api.skipBreak());

  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      timer.toggle();
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      api.resetTimer();
    } else if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      api.skipBreak();
    }
  });

  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(els.settingsForm);
    await saveSettings({
      workMinutes: Number(fd.get("workMinutes")),
      shortBreakMinutes: Number(fd.get("shortBreakMinutes")),
      longBreakMinutes: Number(fd.get("longBreakMinutes")),
      longBreakInterval: Number(fd.get("longBreakInterval")),
      soundEnabled: fd.get("soundEnabled") === "on",
      alarmSound: String(fd.get("alarmSound") || "")
    });
    els.settingsDialog.close("confirm");
  });

  for (const [btn, range] of [
    [els.range7, "7"],
    [els.range30, "30"],
    [els.rangeAll, "all"]
  ]) {
    btn.addEventListener("click", () => setRange(range));
  }

  function renderTasks() {
    const { tasks, activeTaskId } = getState();
    els.taskList.innerHTML = "";

    for (const task of tasks) {
      const item = document.createElement("div");
      item.className = "task" + (task.id === activeTaskId ? " active" : "") + (task.isCompleted ? " completed" : "");
      item.setAttribute("role", "listitem");
      item.tabIndex = 0;

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "task-title";
      title.textContent = task.title || "(untitled)";
      const sub = document.createElement("div");
      sub.className = "task-sub";
      const planned = task.plannedPomodoros || 0;
      const progress = planned > 0 ? `${task.completedPomodoros}/${planned}` : `${task.completedPomodoros} done`;
      const override = task.workMinutesOverride ? ` • ${task.workMinutesOverride}m work` : "";
      sub.textContent = `${progress}${override}`;
      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.className = "task-right";
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = task.isCompleted ? "Completed" : task.id === activeTaskId ? "Active" : "Idle";
      right.appendChild(pill);

      item.appendChild(left);
      item.appendChild(right);

      item.addEventListener("click", () => setActiveTask(task.id));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setActiveTask(task.id);
        if (e.key === "e") openTaskEditor(task);
      });
      item.addEventListener("dblclick", () => openTaskEditor(task));

      els.taskList.appendChild(item);
    }
  }

  function renderTimer() {
    const { settings, activeTask } = getState();
    els.timeLabel.textContent = timer.display;
    const phaseText = timer.phase === "work" ? "Work" : timer.phase === "shortBreak" ? "Short break" : "Long break";
    els.phaseLabel.textContent = phaseText;

    const taskTitle = activeTask ? activeTask.title : "No active task";
    els.activeTaskLabel.textContent = activeTask ? `Active: ${taskTitle}` : taskTitle;

    const canSkip = timer.phase !== "work";
    els.skipBreakBtn.disabled = !canSkip;

    const metaLeft = `Rule: ${SCORING.POINTS_PER_POMODORO}/pomodoro, +${SCORING.BONUS_ON_TASK_COMPLETE} on task completion`;
    const metaRight = `Long break every ${settings.longBreakInterval} pomodoros`;
    els.timerMeta.textContent = `${metaLeft} • ${metaRight}`;

    els.startPauseBtn.textContent = timer.isRunning ? "Pause" : timer.remainingSeconds === 0 ? "Start" : "Start";
  }

  function renderScores() {
    const { settings, todayPoints } = getState();
    els.totalPoints.textContent = String(settings.totalPoints ?? 0);
    els.todayPoints.textContent = String(todayPoints ?? 0);
  }

  function renderSettingsForm() {
    const { settings } = getState();
    els.settingsForm.workMinutes.value = settings.workMinutes;
    els.settingsForm.shortBreakMinutes.value = settings.shortBreakMinutes;
    els.settingsForm.longBreakMinutes.value = settings.longBreakMinutes;
    els.settingsForm.longBreakInterval.value = settings.longBreakInterval;
    els.settingsForm.soundEnabled.checked = Boolean(settings.soundEnabled);
    els.settingsForm.alarmSound.value = settings.alarmSound || "chime";
  }

  function renderInsights() {
    const { dailyRows, range } = getState();
    els.range7.setAttribute("aria-pressed", range === "7" ? "true" : "false");
    els.range30.setAttribute("aria-pressed", range === "30" ? "true" : "false");
    els.rangeAll.setAttribute("aria-pressed", range === "all" ? "true" : "false");

    drawPointsChart(els.pointsChart, dailyRows);
    els.pointsTableBody.innerHTML = "";
    for (const row of dailyRows.slice().reverse()) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = row.dateKey;
      const td2 = document.createElement("td");
      td2.textContent = String(row.points);
      tr.appendChild(td1);
      tr.appendChild(td2);
      els.pointsTableBody.appendChild(tr);
    }
  }

  function renderAll() {
    renderTasks();
    renderTimer();
    renderScores();
    renderSettingsForm();
    renderInsights();
    els.markTaskCompleteBtn.disabled = !getState().activeTask;
    els.deleteTaskBtn.disabled = !getState().activeTask;
  }

  timer.addEventListener("tick", () => renderTimer());
  timer.addEventListener("phase", () => renderTimer());
  timer.addEventListener("state", () => renderTimer());

  if (!isDialogSupported()) {
    // Minimal fallback: still usable, but editor will use prompt().
    document.documentElement.classList.add("no-dialog");
  }

  return { renderAll, renderTasks, renderScores, renderInsights, renderTimer };
}
