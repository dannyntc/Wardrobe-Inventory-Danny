export const DEMO_SAVED_BOARD_KEY = "wardrobe-demo-saved-board-v1";
export const DEMO_DRAFT_KEY = "wardrobe-demo-unsaved-draft-v1";

export function readDemoRecord<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) || "null");
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDemoRecord<T>(key: string, value: T) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearDemoRecord(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures when storage is unavailable.
  }
}

export function canUseDemoStorage() {
  if (typeof window === "undefined") return false;
  const probeKey = "wardrobe-demo-storage-probe";
  try {
    window.localStorage.setItem(probeKey, "ok");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
