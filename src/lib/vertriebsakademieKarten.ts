/**
 * Wiederholungsrhythmus für die Karteikarten.
 *
 * Bewusst einfach gehalten: gewusst heißt später wieder, nicht gewusst heißt
 * bald wieder. Kein vollständiges Wiederholungsverfahren, weil der Nutzen bei
 * fünf Karten am Tag nicht über den Aufwand hinausginge.
 *
 * Gespeichert wird lokal im Browser. Karteikarten sind Übung, kein Nachweis,
 * deshalb muss dafür nichts in die Datenbank.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "va_karten_v1";

/** Abstände in Tagen je Stufe. Stufe 0 heißt: heute wieder. */
const ABSTAENDE = [0, 1, 3, 7, 16, 35];

export interface KartenStand {
  stufe: number;
  faelligAmTag: number;
}

export type KartenState = Record<string, KartenStand>;

function lies(): KartenState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

let state: KartenState = lies();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* Speicher voll oder gesperrt, dann bleibt es bei der Sitzung */ }
  listeners.forEach((l) => l());
}

export const vaKarten = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(): KartenState {
    return state;
  },
  bewerten(id: string, gewusst: boolean, heute: number) {
    const alt = state[id]?.stufe ?? 0;
    const stufe = gewusst ? Math.min(alt + 1, ABSTAENDE.length - 1) : 0;
    state = {
      ...state,
      [id]: { stufe, faelligAmTag: heute + ABSTAENDE[stufe] + (gewusst ? 0 : 1) },
    };
    emit();
  },
  zuruecksetzen() {
    state = {};
    emit();
  },
};

export function useVaKarten(): KartenState {
  return useSyncExternalStore(vaKarten.subscribe, vaKarten.get, vaKarten.get);
}

/** Ist die Karte heute dran? Neue Karten sind immer fällig. */
export function istFaellig(stand: KartenStand | undefined, heute: number): boolean {
  if (!stand) return true;
  return stand.faelligAmTag <= heute;
}

/** Wie sicher sitzt die Karte, in Prozent der höchsten Stufe. */
export function sicherheit(stand: KartenStand | undefined): number {
  if (!stand) return 0;
  return Math.round((stand.stufe / (ABSTAENDE.length - 1)) * 100);
}

export const KARTEN_STUFEN = ABSTAENDE.length;
