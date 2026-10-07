// Browser Push Notification helper
// DSGVO mode now persisted via user_settings (dataCache)

import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { isTestAccount } from "./dbStoreHelper";

const DSGVO_MODE_KEY = "mi_dsgvo_mode";

export function isPushSupported(): boolean {
  return "Notification" in window;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

// ── DSGVO mode (suppress push on customer-facing pages) ──

export function isDsgvoModeActive(): boolean {
  if (isTestAccount()) return localStorage.getItem(DSGVO_MODE_KEY) === "true";
  return getUserSetting<boolean>("dsgvo_mode", false);
}

export function setDsgvoMode(active: boolean) {
  if (isTestAccount()) { localStorage.setItem(DSGVO_MODE_KEY, active ? "true" : "false"); }
  else { setUserSetting("dsgvo_mode", active); }
  window.dispatchEvent(new CustomEvent("dsgvo-mode-changed"));
}

// Bekannte Themen-Kategorien (entsprechen settings.benachrichtigungen.themen Keys)
export type PushCategory =
  | "chat"
  | "aufgaben"
  | "termine"
  | "leads"
  | "pipeline"
  | "provisionen"
  | "team"
  | "system"
  | "bug"
  | "wettbewerb"
  | "academy";

/**
 * Prüft, ob der Nutzer Push-Benachrichtigungen für einen bestimmten Kanal/Kategorie aktiviert hat.
 * Gelesen aus user_settings.einstellungen.benachrichtigungen.
 * - kanaele.browser muss true sein (Master-Schalter für Browser-Push)
 * - themen[category] muss true sein, falls eine Kategorie übergeben wurde
 */
export function isPushCategoryEnabled(category?: PushCategory): boolean {
  const ben = getUserSetting<any>("benachrichtigungen", null);
  if (!ben) return true; // Default: an, solange keine Settings geladen
  const browserOn = ben?.kanaele?.browser !== false;
  if (!browserOn) return false;
  if (!category) return true;
  // System-/Bug-Pushes laufen unter "system"
  const themeKey = category === "bug" ? "system" : category;
  const themen = ben?.themen || {};
  // Wenn das Thema nicht definiert ist, default an
  return themen[themeKey] !== false;
}

export function showPushNotification(
  title: string,
  options?: { body?: string; icon?: string; tag?: string; onClick?: () => void; category?: PushCategory }
) {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  // Suppress push notifications in DSGVO mode
  if (isDsgvoModeActive()) return;
  // Respektiere Nutzer-Einstellungen (Kanal + Kategorie)
  if (!isPushCategoryEnabled(options?.category)) return;
  
  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon || "/favicon.ico",
      tag: options?.tag,
      badge: "/favicon.ico",
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto-close after 6 seconds
    setTimeout(() => notification.close(), 6000);
  } catch {
    // Silent fail for environments that don't support Notification constructor
  }
}
