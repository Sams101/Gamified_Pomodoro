import { signIn, validateEmail } from "./auth.js";

try {
  const theme = localStorage.getItem("pq_theme_v1");
  if (theme) document.documentElement.dataset.theme = theme;
} catch {}

const form = document.getElementById("signInForm");
const errorEl = document.getElementById("signInError");

function setError(msg) {
  errorEl.textContent = msg ? String(msg) : "";
  errorEl.style.display = msg ? "block" : "none";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");

  const fd = new FormData(form);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");

  const emailErr = validateEmail(email);
  if (emailErr) return setError(emailErr);
  if (!password) return setError("Password is required.");

  try {
    await signIn({ email, password });
    window.location.href = "./index.html";
  } catch (err) {
    setError(err?.message || "Sign in failed.");
  }
});
