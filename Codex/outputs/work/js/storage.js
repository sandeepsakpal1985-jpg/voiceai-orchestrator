const namespace = "vasudeva-terminal-v2";

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(`${namespace}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  try {
    localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
  } catch {
    // Silently fail in locked-down browser environments
  }
}

export function removeState(key) {
  try {
    localStorage.removeItem(`${namespace}:${key}`);
  } catch {}
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(`${namespace}:`))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}
