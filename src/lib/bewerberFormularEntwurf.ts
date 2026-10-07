import type { FormularAntworten } from "./bewerberFormular";

/**
 * Zwischenspeicher des Vorab-Fragebogens auf dem Gerät des Bewerbers.
 *
 * Vorbild ist der Entwurf des Lead-Funnels (`LeadFunnelDialog.tsx`). Der
 * Wizard zeigt eine Frage je Schritt, und wer nach der neunten Frage
 * unterbrochen wird, soll nicht von vorn anfangen müssen. Deshalb liegt der
 * Stand im localStorage und wird beim nächsten Öffnen des Links geladen.
 *
 * Der Schlüssel enthält das Token: Der Entwurf gehört zu genau diesem Link.
 * Ein anderer Bewerber mit einem anderen Link sieht ihn nicht, auch nicht auf
 * demselben Gerät. Die Haltbarkeit entspricht der Gültigkeit des Links. Nach
 * dem Absenden wird sofort gelöscht, die Antworten sind dann in der Datenbank.
 */
const SCHLUESSEL_PRAEFIX = "mi_bewerber_fragebogen_";
const HALTBARKEIT_MS = 14 * 24 * 60 * 60 * 1000;

export interface FragebogenEntwurf {
  gespeichertAm: number;
  /** Schlüssel der zuletzt gezeigten Frage, "abschluss" für den Telefon-Schritt, null für die Startseite. */
  frageKey: string | null;
  antworten: FormularAntworten;
  telefon: string;
}

function schluessel(token: string): string {
  return `${SCHLUESSEL_PRAEFIX}${token}`;
}

function istAntwortObjekt(wert: unknown): wert is FormularAntworten {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return false;
  return Object.values(wert as Record<string, unknown>).every(
    (v) => typeof v === "string" || (Array.isArray(v) && v.every((e) => typeof e === "string")),
  );
}

export function ladeFragebogenEntwurf(token: string): FragebogenEntwurf | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const roh = window.localStorage.getItem(schluessel(token));
    if (!roh) return null;
    const entwurf = JSON.parse(roh) as Partial<FragebogenEntwurf>;
    if (
      !entwurf ||
      typeof entwurf.gespeichertAm !== "number" ||
      Date.now() - entwurf.gespeichertAm > HALTBARKEIT_MS ||
      !istAntwortObjekt(entwurf.antworten)
    ) {
      window.localStorage.removeItem(schluessel(token));
      return null;
    }
    return {
      gespeichertAm: entwurf.gespeichertAm,
      frageKey: typeof entwurf.frageKey === "string" ? entwurf.frageKey : null,
      antworten: entwurf.antworten,
      telefon: typeof entwurf.telefon === "string" ? entwurf.telefon : "",
    };
  } catch {
    return null;
  }
}

export function speichereFragebogenEntwurf(
  token: string,
  entwurf: Omit<FragebogenEntwurf, "gespeichertAm">,
): void {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(
      schluessel(token),
      JSON.stringify({ gespeichertAm: Date.now(), ...entwurf } satisfies FragebogenEntwurf),
    );
  } catch {
    // Privater Modus oder volle Quote. Der Fragebogen funktioniert auch ohne.
  }
}

export function loescheFragebogenEntwurf(token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.removeItem(schluessel(token));
  } catch {
    // Nichts zu tun.
  }
}
