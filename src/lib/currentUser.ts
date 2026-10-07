const CURRENT_USER_ID_KEY = "mi_current_user_id";

export function getCurrentUserId(): string | null {
  try {
    return localStorage.getItem(CURRENT_USER_ID_KEY);
  } catch {
    return null;
  }
}

export function setCurrentUserId(userId: string) {
  try {
    localStorage.setItem(CURRENT_USER_ID_KEY, userId);
  } catch {
    // ignore storage errors
  }
}

export function clearCurrentUserId() {
  try {
    localStorage.removeItem(CURRENT_USER_ID_KEY);
  } catch {
    // ignore storage errors
  }
}