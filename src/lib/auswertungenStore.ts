// Shared store for editable Auswertungen data (levels, milestones)
// Persisted in user_settings DB

import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { isTestAccount } from "./dbStoreHelper";

export interface LevelData {
  level: number;
  name: string;
  xp: number;
  icon: string;
  praemieEmoji: string;
  praemie: string;
}

export interface MeilensteinData {
  id: string;
  icon: string;
  titel: string;
  desc: string;
  xp: string;
  bonus?: string;
  done: boolean;
  entwurf?: boolean;
}

export type PraemienStatus = "locked" | "freigeschaltet" | "angefordert" | "erhalten";

const DEFAULT_LEVELS: LevelData[] = [
  { level: 1, name: "Rookie", xp: 0, icon: "🌱", praemieEmoji: "", praemie: "" },
  { level: 2, name: "Aufsteiger", xp: 500, icon: "⚡", praemieEmoji: "⛽", praemie: "50 € Tankgutschein" },
  { level: 3, name: "Profi", xp: 4000, icon: "🔥", praemieEmoji: "🖊️", praemie: "Montblanc Kugelschreiber" },
  { level: 4, name: "Experte", xp: 8000, icon: "💎", praemieEmoji: "📱", praemie: "Apple iPhone 16 Pro" },
  { level: 5, name: "Elite", xp: 14000, icon: "👑", praemieEmoji: "💻", praemie: "Apple MacBook Pro" },
  { level: 6, name: "Legende", xp: 30000, icon: "🦅", praemieEmoji: "✈️", praemie: "Luxus-Incentive-Reise" },
];

const DEFAULT_MEILENSTEINE: MeilensteinData[] = [
  { id: "m1", icon: "🎯", titel: "Erste 10 Leads", desc: "Lege 10 Kontakte manuell an", xp: "+30 XP", done: false },
  { id: "m2", icon: "🏅", titel: "50er Club", desc: "50 Kontakte angelegt", xp: "+90 XP", done: false },
  { id: "m3", icon: "🏠", titel: "Erste Reservierung", desc: "Erste Kapitalanlage reserviert", xp: "+75 XP", bonus: "+25 € Bonus!", done: false },
  { id: "m4", icon: "⭐", titel: "5 Abschlüsse", desc: "5 Kapitalanlagen verkauft", xp: "+150 XP", bonus: "+75 € Bonus!", done: false },
  { id: "m5", icon: "🔥", titel: "7-Tage-Streak", desc: "7 Tage in Folge aktiv gewesen", xp: "+60 XP", done: false },
  { id: "m6", icon: "🏆", titel: "Top 3 Platzierung", desc: "Erreiche Top 3 in einer Kategorie", xp: "+150 XP", bonus: "+100 € Bonus!", done: false },
  { id: "m7", icon: "⚡", titel: "30-Tage-Streak", desc: "30 Tage in Folge aktiv", xp: "+180 XP", done: false },
  { id: "m8", icon: "💰", titel: "Millionär", desc: "1 Mio. € Verkaufsvolumen erreicht", xp: "+300 XP", bonus: "+250 € Bonus!", done: false },
  { id: "m9", icon: "🌟", titel: "Top-Performer", desc: "Bester des Monats werden", xp: "+225 XP", done: false },
];

// ── localStorage keys (testaccount fallback) ──
const LS_LEVELS = "mi_levels";
const LS_MEILENSTEINE = "mi_meilensteine";
const LS_PRAEMIEN = "mi_praemien_status";

// ── DB keys in user_settings.einstellungen ──
const DB_LEVELS = "auswertungen_levels";
const DB_MEILENSTEINE = "auswertungen_meilensteine";
const DB_PRAEMIEN = "auswertungen_praemien";

export function loadLevels(): LevelData[] {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(LS_LEVELS); if (raw) return JSON.parse(raw); } catch {}
    return [...DEFAULT_LEVELS];
  }
  const saved = getUserSetting<LevelData[] | null>(DB_LEVELS, null);
  return saved || [...DEFAULT_LEVELS];
}

export function saveLevels(levels: LevelData[]) {
  if (isTestAccount()) { localStorage.setItem(LS_LEVELS, JSON.stringify(levels)); return; }
  setUserSetting(DB_LEVELS, levels);
}

export function loadMeilensteine(): MeilensteinData[] {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(LS_MEILENSTEINE); if (raw) return JSON.parse(raw); } catch {}
    return [...DEFAULT_MEILENSTEINE];
  }
  const saved = getUserSetting<MeilensteinData[] | null>(DB_MEILENSTEINE, null);
  return saved || [...DEFAULT_MEILENSTEINE];
}

export function saveMeilensteine(m: MeilensteinData[]) {
  if (isTestAccount()) { localStorage.setItem(LS_MEILENSTEINE, JSON.stringify(m)); return; }
  setUserSetting(DB_MEILENSTEINE, m);
}

export function loadPraemienStatus(): Record<number, PraemienStatus> {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(LS_PRAEMIEN); if (raw) return JSON.parse(raw); } catch {}
    return {};
  }
  return getUserSetting<Record<number, PraemienStatus>>(DB_PRAEMIEN, {});
}

export function savePraemienStatus(s: Record<number, PraemienStatus>) {
  if (isTestAccount()) { localStorage.setItem(LS_PRAEMIEN, JSON.stringify(s)); return; }
  setUserSetting(DB_PRAEMIEN, s);
}
