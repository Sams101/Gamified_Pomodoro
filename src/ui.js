import { drawPointsChart } from "./chart.js";
import { SCORING, pointsRuleText } from "./scoring.js";
import { isDialogSupported } from "./utils.js";
import { changePassword, updateProfile } from "./auth.js";

export function wireUI({
  timer,
  api,
  getState,
  setSession,
  setActiveTask,
  openTaskEditor,
  markActiveTaskComplete,
  deleteActiveTask,
  saveSettings,
  setRange,
  openSettings,
  testAlarm,
  onSignOut
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
    signInBtn: document.getElementById("signInBtn"),
    profileWrap: document.getElementById("profileWrap"),
    profileBtn: document.getElementById("profileBtn"),
    profileMenu: document.getElementById("profileMenu"),
    profileName: document.getElementById("profileName"),
    profileEmail: document.getElementById("profileEmail"),
    profileSettingsBtn: document.getElementById("profileSettingsBtn"),
    signOutBtn: document.getElementById("signOutBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsForm: document.getElementById("settingsDialogForm"),
    profileFieldset: document.getElementById("profileFieldset"),
    updateProfileBtn: document.getElementById("updateProfileBtn"),
    changePasswordBtn: document.getElementById("changePasswordBtn"),
    profileStatus: document.getElementById("profileStatus"),
    closeSettingsDialogBtn: document.getElementById("closeSettingsDialogBtn"),
    testSoundBtn: document.getElementById("testSoundBtn"),
    pointsRule: document.getElementById("pointsRule"),
    pointsChart: document.getElementById("pointsChart"),
    pointsTableBody: document.getElementById("pointsTableBody"),
    range7: document.getElementById("range7"),
    range30: document.getElementById("range30"),
    rangeAll: document.getElementById("rangeAll")
  };

  const missing = Object.entries(els)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing required UI elements: ${missing.join(", ")}`);
  }

  els.pointsRule.textContent = pointsRuleText();

  function toggleTimerGuarded() {
    const { activeTask } = getState();
    const isStartingWork = !timer.isRunning && timer.phase === "work";
    if (isStartingWork && !activeTask) {
      alert("Select a task before starting a work session.");
      return;
    }
    timer.toggle();
  }

  els.newTaskBtn.addEventListener("click", () => openTaskEditor());
  els.markTaskCompleteBtn.addEventListener("click", () => markActiveTaskComplete());
  els.deleteTaskBtn.addEventListener("click", () => deleteActiveTask());

  function closeProfileMenu() {
    els.profileMenu.hidden = true;
    els.profileBtn?.setAttribute("aria-expanded", "false");
  }

  function toggleProfileMenu() {
    const open = !els.profileMenu.hidden;
    if (open) closeProfileMenu();
    else {
      els.profileMenu.hidden = false;
      els.profileBtn?.setAttribute("aria-expanded", "true");
    }
  }

  els.profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleProfileMenu();
  });
  document.addEventListener("click", () => closeProfileMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProfileMenu();
  });

  els.profileSettingsBtn?.addEventListener("click", () => {
    closeProfileMenu();
    openSettings();
  });
  els.signOutBtn?.addEventListener("click", () => {
    closeProfileMenu();
    onSignOut?.();
  });

  function setProfileStatus(msg) {
    els.profileStatus.textContent = msg ? String(msg) : "";
  }

  els.updateProfileBtn?.addEventListener("click", async () => {
    setProfileStatus("");
    try {
      const fd = new FormData(els.settingsForm);
      const displayName = String(fd.get("displayName") || "").trim();
      const nextSession = await updateProfile({ displayName });
      setProfileStatus("Name updated.");
      setSession?.(nextSession);
      renderAll();
    } catch (err) {
      setProfileStatus(err?.message || "Failed to update name.");
    }
  });

  els.changePasswordBtn?.addEventListener("click", async () => {
    setProfileStatus("");
    try {
      const fd = new FormData(els.settingsForm);
      const currentPassword = String(fd.get("currentPassword") || "");
      const newPassword = String(fd.get("newPassword") || "");
      const confirmNewPassword = String(fd.get("confirmNewPassword") || "");
      if (newPassword !== confirmNewPassword) throw new Error("New passwords do not match.");
      await changePassword({ currentPassword, newPassword });
      els.settingsForm.currentPassword.value = "";
      els.settingsForm.newPassword.value = "";
      els.settingsForm.confirmNewPassword.value = "";
      setProfileStatus("Password changed.");
    } catch (err) {
      setProfileStatus(err?.message || "Failed to change password.");
    }
  });

  els.closeSettingsDialogBtn.addEventListener("click", () => els.settingsDialog.close("cancel"));
  els.testSoundBtn.addEventListener("click", () => {
    const fd = new FormData(els.settingsForm);
    testAlarm(String(fd.get("alarmSound") || ""));
  });

  els.startPauseBtn.addEventListener("click", () => toggleTimerGuarded());
  els.resetBtn.addEventListener("click", () => api.resetTimer());
  els.skipBreakBtn.addEventListener("click", () => api.skipBreak());

  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      toggleTimerGuarded();
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
      theme: String(fd.get("theme") || "midnight"),
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
      const completed = task.completedPomodoros ?? 0;
      const progress = planned > 0 ? `${completed}/${planned}` : `${completed} done`;
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
    const { settings, session } = getState();
    if (els.settingsForm.theme) els.settingsForm.theme.value = settings.theme || "midnight";
    els.settingsForm.workMinutes.value = settings.workMinutes;
    els.settingsForm.shortBreakMinutes.value = settings.shortBreakMinutes;
    els.settingsForm.longBreakMinutes.value = settings.longBreakMinutes;
    els.settingsForm.longBreakInterval.value = settings.longBreakInterval;
    els.settingsForm.soundEnabled.checked = Boolean(settings.soundEnabled);
    els.settingsForm.alarmSound.value = settings.alarmSound || "chime";

    const signedIn = Boolean(session?.userId);
    els.profileFieldset.hidden = !signedIn;
    if (signedIn) {
      els.settingsForm.displayName.value = session.displayName || "";
    } else {
      els.settingsForm.displayName.value = "";
      setProfileStatus("");
    }
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

    const { session } = getState();
    const signedIn = Boolean(session?.userId);
    els.signInBtn.hidden = signedIn;
    els.profileWrap.hidden = !signedIn;
    if (signedIn) {
      els.profileName.textContent = session.displayName || "Account";
      els.profileEmail.textContent = session.email || "";
    }
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
