import { nowIso, safeUUID } from "./utils.js";

// IndexedDB versions only ever move forward. If a user previously loaded a newer
// build (or a dev copy) that bumped the version, re-opening with a lower
// version fails with: "The requested version (...) is less than the existing version (...)".
// Keep this monotonically increasing and make upgrades idempotent.
const DB_VERSION = 3;

export function createDB(dbName = "pomodoro-quest") {
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("IndexedDB is unavailable in this browser context."));
        return;
      }
      const req = indexedDB.open(String(dbName), DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;

        // Create stores/indexes only if missing so upgrades are safe.
        const ensureStore = (name, opts) => (db.objectStoreNames.contains(name) ? req.transaction.objectStore(name) : db.createObjectStore(name, opts));
        const ensureIndex = (store, indexName, keyPath, opts) => {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, opts);
        };

        const tasks = ensureStore("tasks", { keyPath: "id" });
        ensureIndex(tasks, "by_completed", "isCompleted", { unique: false });
        ensureIndex(tasks, "by_createdAt", "createdAt", { unique: false });

        const pomodoros = ensureStore("pomodoros", { keyPath: "id" });
        ensureIndex(pomodoros, "by_taskId", "taskId", { unique: false });
        ensureIndex(pomodoros, "by_dateKey", "dateKey", { unique: false });

        ensureStore("dailyPoints", { keyPath: "dateKey" });
        ensureStore("settings", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  let dbPromise = null;
  async function db() {
    if (!dbPromise) dbPromise = openDb();
    return dbPromise;
  }

  async function tx(storeNames, mode, fn) {
    const database = await db();
    const transaction = database.transaction(storeNames, mode);
    const done = new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    try {
      const result = await fn(transaction);
      await done;
      return result;
    } catch (err) {
      try {
        transaction.abort();
      } catch {}
      throw err;
    }
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async getSettings() {
      return tx(["settings"], "readonly", async (t) => {
        const store = t.objectStore("settings");
        const all = await reqToPromise(store.getAll());
        const out = {};
        for (const row of all) out[row.key] = row.value;
        return out;
      });
    },

    async setSetting(key, value) {
      return tx(["settings"], "readwrite", async (t) => {
        const store = t.objectStore("settings");
        await reqToPromise(store.put({ key, value, updatedAt: nowIso() }));
        return true;
      });
    },

    async listTasks() {
      return tx(["tasks"], "readonly", async (t) => {
        const store = t.objectStore("tasks");
        const tasks = await reqToPromise(store.getAll());
        tasks.sort((a, b) => (a.isCompleted === b.isCompleted ? (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt) : a.isCompleted ? 1 : -1));
        return tasks;
      });
    },

    async getTask(id) {
      return tx(["tasks"], "readonly", async (t) => reqToPromise(t.objectStore("tasks").get(id)));
    },

    async upsertTask(task) {
      return tx(["tasks"], "readwrite", async (t) => {
        const store = t.objectStore("tasks");
        const existing = task.id ? await reqToPromise(store.get(task.id)) : null;
        const now = nowIso();
        const isCompleted = Boolean(task.isCompleted ?? existing?.isCompleted ?? false);
        const row = {
          id: task.id || safeUUID(),
          title: String(task.title || "").trim(),
          plannedPomodoros: Number.isFinite(task.plannedPomodoros) ? task.plannedPomodoros : 0,
          completedPomodoros: Number.isFinite(task.completedPomodoros) ? task.completedPomodoros : (existing?.completedPomodoros ?? 0),
          workMinutesOverride: task.workMinutesOverride ?? existing?.workMinutesOverride ?? null,
          isCompleted,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          completedAt: isCompleted ? (existing?.completedAt ?? now) : null
        };
        await reqToPromise(store.put(row));
        return row;
      });
    },

    async deleteTask(id) {
      return tx(["tasks", "pomodoros"], "readwrite", async (t) => {
        await reqToPromise(t.objectStore("tasks").delete(id));
        const index = t.objectStore("pomodoros").index("by_taskId");
        const req = index.openCursor(IDBKeyRange.only(id));
        await new Promise((resolve, reject) => {
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) return resolve();
            cursor.delete();
            cursor.continue();
          };
          req.onerror = () => reject(req.error);
        });
        return true;
      });
    },

    async addCompletedPomodoro({ taskId, startedAt, endedAt, minutesPlanned, dateKey, points }) {
      return tx(["pomodoros"], "readwrite", async (t) => {
        const store = t.objectStore("pomodoros");
        const row = {
          id: safeUUID(),
          taskId,
          startedAt,
          endedAt,
          minutesPlanned,
          dateKey,
          points
        };
        await reqToPromise(store.put(row));
        return row;
      });
    },

    async addPoints(dateKey, pointsToAdd) {
      return tx(["dailyPoints"], "readwrite", async (t) => {
        const store = t.objectStore("dailyPoints");
        const existing = await reqToPromise(store.get(dateKey));
        const next = {
          dateKey,
          points: (existing?.points ?? 0) + pointsToAdd,
          updatedAt: nowIso()
        };
        await reqToPromise(store.put(next));
        return next;
      });
    },

    async listDailyPoints() {
      return tx(["dailyPoints"], "readonly", async (t) => {
        const store = t.objectStore("dailyPoints");
        const rows = await reqToPromise(store.getAll());
        rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        return rows;
      });
    }
  };
}
