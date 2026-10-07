import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format any date string (ISO, German, etc.) to dd.MM.yyyy */
export function formatDatum(value: string | null | undefined): string {
  if (!value) return "–";
  try {
    // Deutsches Datum zuerst pruefen, nicht erst als Notnagel. `new Date`
    // liest "07.08.2026" als 8. Juli und meldet dabei keinen Fehler, der Wert
    // kam also mit vertauschtem Tag und Monat wieder heraus. Nur bei Tagen ab
    // 13 lief es in "Invalid Date" und fiel auf. Fertig formatierte deutsche
    // Datumsangaben werden unveraendert durchgereicht.
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value.trim())) return value.trim();
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return value;
    }
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return value || "–";
  }
}

/** Format any date to dd.MM.yyyy, HH:MM */
export function formatDatumZeit(value: string | number | Date | null | undefined): string {
  if (!value) return "–";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "–";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
  } catch {
    return "–";
  }
}
