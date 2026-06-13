const namespace = "vasudeva-terminal";

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
    // Local storage can be unavailable in locked-down browser contexts.
  }
}
