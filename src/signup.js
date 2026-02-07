import { createAccount, validateEmail, validatePassword } from "./auth.js";

try {
  const theme = localStorage.getItem("pq_theme_v1");
  if (theme) document.documentElement.dataset.theme = theme;
} catch {}

const form = document.getElementById("signUpForm");
const errorEl = document.getElementById("signUpError");

function setError(msg) {
  errorEl.textContent = msg ? String(msg) : "";
  errorEl.style.display = msg ? "block" : "none";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");

  const fd = new FormData(form);
  const displayName = String(fd.get("displayName") || "").trim();
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const confirmPassword = String(fd.get("confirmPassword") || "");

  const emailErr = validateEmail(email);
  if (emailErr) return setError(emailErr);
  const passErr = validatePassword(password);
  if (passErr) return setError(passErr);
  if (password !== confirmPassword) return setError("Passwords do not match.");

  try {
    await createAccount({ email, password, displayName });
    window.location.href = "./index.html";
  } catch (err) {
    setError(err?.message || "Create account failed.");
  }
});
