/**
 * Gemeinsame Helfer für die prüfbaren Aufgaben der Vertriebsakademie.
 *
 * Alles hier ist reine Rechenlogik ohne React, damit es einzeln testbar ist.
 * Es gibt keinen Netzwerkaufruf und keine KI: Jede Aufgabe trägt ihre Lösung
 * im Inhalt, ausgewertet wird durch Vergleich.
 */

/**
 * Deterministisches Mischen mit fester Saat.
 *
 * Wichtig: Math.random würde bei jedem Rendern eine neue Reihenfolge erzeugen,
 * die Karten würden beim Tippen springen. Die Saat ist die Aufgaben-ID, damit
 * dieselbe Aufgabe immer gleich gemischt erscheint.
 */
export function mischeMitSaat<T>(items: T[], saat: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < saat.length; i++) {
    h ^= saat.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  const kopie = [...items];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * Mischt die Antwortmöglichkeiten einer Quizfrage und zieht die Lösung mit.
 *
 * Nötig, weil lange Zeit nur die Fragen gemischt wurden. Die Antworten standen
 * damit immer in der Reihenfolge der Inhaltsdatei, und dort ist die richtige
 * meist als zweite notiert: In 137 von 187 Abschlusstestfragen war sie die
 * zweite Wahl, in zwei Kapiteln sogar in jeder Frage die mittlere. Bei einer
 * Bestehensquote von siebzig Prozent besteht man so jeden Test, ohne das
 * Kapitel gelesen zu haben.
 *
 * Die Saat ist der Fragetext, nicht die Position: Dieselbe Frage erscheint
 * immer gleich gemischt, auch wenn eine andere Frage dazukommt oder wegfällt.
 */
export function mischeAntworten<T extends { frage: string; optionen: string[]; korrekt: number }>(
  f: T,
): T {
  const reihenfolge = mischeMitSaat(
    f.optionen.map((_, i) => i),
    f.frage,
  );
  return {
    ...f,
    optionen: reihenfolge.map((i) => f.optionen[i]),
    korrekt: reihenfolge.indexOf(f.korrekt),
  };
}

/**
 * Deutsche Zahleneingabe zu einer Zahl.
 *
 * Der Partner tippt "1.234,56" oder "1234.56" oder "3,6 %". Beides muss gehen,
 * sonst scheitert die Aufgabe an der Tastatur statt am Rechnen.
 */
export function parseZahl(eingabe: string): number | null {
  const roh = eingabe
    .replace(/[€%\s]/g, "")
    .replace(/ /g, "")
    .trim();
  if (!roh) return null;
  let normalisiert = roh;
  const hatKomma = roh.includes(",");
  const hatPunkt = roh.includes(".");
  if (hatKomma && hatPunkt) {
    // Punkt ist Tausendertrenner, Komma ist Dezimaltrenner
    normalisiert = roh.replace(/\./g, "").replace(",", ".");
  } else if (hatKomma) {
    normalisiert = roh.replace(",", ".");
  } else if (hatPunkt) {
    // Ein Punkt mit genau drei Nachkommastellen ist ein Tausendertrenner
    const teile = roh.split(".");
    if (teile.length > 2 || (teile[1] && teile[1].length === 3)) {
      normalisiert = roh.replace(/\./g, "");
    }
  }
  const zahl = Number(normalisiert);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Liegt der Wert innerhalb der erlaubten Toleranz um den Zielwert? */
export function imZielbereich(wert: number, zielwert: number, toleranzProzent = 1): boolean {
  if (zielwert === 0) return Math.abs(wert) <= toleranzProzent / 100;
  const abweichung = Math.abs((wert - zielwert) / zielwert) * 100;
  return abweichung <= toleranzProzent;
}

/** Anteil richtiger Antworten in Prozent. */
export function quote(richtig: number, gesamt: number): number {
  return gesamt > 0 ? Math.round((richtig / gesamt) * 100) : 0;
}

/** Sind zwei Reihenfolgen identisch? */
export function reihenfolgeStimmt(ist: string[], soll: string[]): boolean {
  return ist.length === soll.length && ist.every((v, i) => v === soll[i]);
}

/** Sekunden als mm:ss. */
export function formatSekunden(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/**
 * Hat der Partner reduzierte Bewegung eingestellt?
 *
 * Die CSS-Animationen schalten sich über die Medienabfrage selbst ab. Wer aber
 * auf `animationend` wartet oder Konfetti zeichnet, muss es vorher wissen.
 */
export function reduzierteBewegung(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
