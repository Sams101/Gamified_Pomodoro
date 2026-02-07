import { nowIso, safeUUID } from "./utils.js";

const AUTH_DB_NAME = "pomodoro-quest-auth";
const AUTH_DB_VERSION = 1;
const SESSION_KEY = "pq_session_v1";

function openAuthDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable in this browser context."));
      return;
    }
    const req = indexedDB.open(AUTH_DB_NAME, AUTH_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const users = db.objectStoreNames.contains("users") ? req.transaction.objectStore("users") : db.createObjectStore("users", { keyPath: "email" });
      if (!users.indexNames.contains("by_id")) users.createIndex("by_id", "id", { unique: true });
      if (!users.indexNames.contains("by_createdAt")) users.createIndex("by_createdAt", "createdAt", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let authDbPromise = null;
async function authDb() {
  if (!authDbPromise) authDbPromise = openAuthDb();
  return authDbPromise;
}

async function authTx(storeNames, mode, fn) {
  const database = await authDb();
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateEmail(email) {
  const e = normalizeEmail(email);
  // Simple, permissive check (we're offline-only).
  if (!e) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  if (e.length > 254) return "Email is too long.";
  return null;
}

export function validatePassword(password) {
  const p = String(password || "");
  if (!p) return "Password is required.";
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "Password must include letters and numbers.";
  return null;
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPasswordPbkdf2(password, saltBytes, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto is unavailable in this browser.");
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

async function getUserByEmail(email) {
  const emailNorm = normalizeEmail(email);
  return authTx(["users"], "readonly", async (t) => reqToPromise(t.objectStore("users").get(emailNorm)));
}

async function verifyUserPassword(user, password) {
  const salt = base64ToBytes(user.password?.saltB64);
  const iterations = Number(user.password?.iterations) || 0;
  const expected = String(user.password?.hashB64 || "");
  if (!salt?.length || !iterations || !expected) throw new Error("Account record is corrupted.");

  const computed = await hashPasswordPbkdf2(password, salt, iterations);
  const computedB64 = bytesToBase64(computed);
  return computedB64 === expected;
}

export async function createAccount({ email, password, displayName }) {
  const emailNorm = normalizeEmail(email);
  const emailErr = validateEmail(emailNorm);
  if (emailErr) throw new Error(emailErr);
  const passErr = validatePassword(password);
  if (passErr) throw new Error(passErr);

  const name = String(displayName || "").trim();
  if (name.length > 60) throw new Error("Name is too long.");

  const iterations = 120_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasswordPbkdf2(password, salt, iterations);

  const user = {
    id: safeUUID(),
    email: emailNorm,
    displayName: name || emailNorm.split("@")[0],
    password: {
      alg: "PBKDF2-SHA256",
      iterations,
      saltB64: bytesToBase64(salt),
      hashB64: bytesToBase64(hash)
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await authTx(["users"], "readwrite", async (t) => {
    const store = t.objectStore("users");
    const existing = await reqToPromise(store.get(emailNorm));
    if (existing) throw new Error("An account with that email already exists on this device.");
    await reqToPromise(store.put(user));
  });

  const session = { userId: user.id, email: user.email, displayName: user.displayName, signedInAt: nowIso() };
  setSession(session);
  return session;
}

export async function signIn({ email, password }) {
  const emailNorm = normalizeEmail(email);
  const emailErr = validateEmail(emailNorm);
  if (emailErr) throw new Error(emailErr);
  if (!password) throw new Error("Password is required.");

  const user = await authTx(["users"], "readonly", async (t) => reqToPromise(t.objectStore("users").get(emailNorm)));
  if (!user) throw new Error("Invalid email or password.");

  const ok = await verifyUserPassword(user, password);
  if (!ok) throw new Error("Invalid email or password.");

  const session = { userId: user.id, email: user.email, displayName: user.displayName, signedInAt: nowIso() };
  setSession(session);
  return session;
}

export async function updateProfile({ displayName }) {
  const session = getSession();
  if (!session?.email) throw new Error("You must be signed in.");

  const nextName = String(displayName || "").trim();
  if (nextName.length > 60) throw new Error("Name is too long.");

  await authTx(["users"], "readwrite", async (t) => {
    const store = t.objectStore("users");
    const user = await reqToPromise(store.get(normalizeEmail(session.email)));
    if (!user) throw new Error("Account not found.");
    user.displayName = nextName || user.displayName || session.email.split("@")[0];
    user.updatedAt = nowIso();
    await reqToPromise(store.put(user));
  });

  const updatedSession = { ...session, displayName: nextName || session.displayName };
  setSession(updatedSession);
  return updatedSession;
}

export async function changePassword({ currentPassword, newPassword }) {
  const session = getSession();
  if (!session?.email) throw new Error("You must be signed in.");
  if (!currentPassword) throw new Error("Current password is required.");

  const passErr = validatePassword(newPassword);
  if (passErr) throw new Error(passErr);

  const user = await getUserByEmail(session.email);
  if (!user) throw new Error("Account not found.");

  const ok = await verifyUserPassword(user, currentPassword);
  if (!ok) throw new Error("Current password is incorrect.");

  const iterations = 120_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasswordPbkdf2(newPassword, salt, iterations);

  await authTx(["users"], "readwrite", async (t) => {
    const store = t.objectStore("users");
    const fresh = await reqToPromise(store.get(normalizeEmail(session.email)));
    if (!fresh) throw new Error("Account not found.");
    fresh.password = {
      alg: "PBKDF2-SHA256",
      iterations,
      saltB64: bytesToBase64(salt),
      hashB64: bytesToBase64(hash)
    };
    fresh.updatedAt = nowIso();
    await reqToPromise(store.put(fresh));
  });

  return true;
}

export async function listLocalAccounts() {
  return authTx(["users"], "readonly", async (t) => {
    const rows = await reqToPromise(t.objectStore("users").getAll());
    rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    return rows.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }));
  });
}
