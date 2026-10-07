/**
 * Wie oft die Glocke an überfällige Inbox-Aufgaben erinnert.
 *
 * Vorgeschichte: Die Erinnerung hing an keinem Zeitplan, sondern lief bei
 * jedem Durchlauf der Seitenleiste mit, also beim Laden einer Seite, bei jeder
 * Änderung an Aufgaben oder Follow-ups und zusätzlich jede Minute. Gebremst
 * hat sie allein ein Merker im Browserspeicher
 * (`mi_inbox_overdue_notified_<nutzer>_<datum>`). Der gilt nur für genau ein
 * Fenster und genau eine Adresse: In der Lovable-Vorschau, am zweiten Gerät
 * oder in einem privaten Fenster fing die Zählung wieder bei null an, und die
 * Meldung kam mehrmals kurz hintereinander.
 *
 * Deshalb steht der Mindestabstand jetzt hier, und beides liegt in den
 * Nutzereinstellungen (`user_settings.einstellungen`), so wie die übrigen
 * persönlichen Einstellungen des Projekts:
 *
 *   - `inbox_erinnerung_takt`     der gewählte Takt
 *   - `inbox_erinnerung_zuletzt`  wann zuletzt erinnert wurde, als ISO-Zeit
 *
 * Damit gilt der Abstand je Nutzer statt je Browser. Ein Neuladen der Seite
 * oder ein zweites Gerät setzt ihn nicht mehr zurück.
 *
 * Die Vorgabe ist bewusst „zweimal täglich": Eine überfällige Aufgabe wird
 * durch häufigeres Erinnern nicht dringender, und wer alle paar Minuten
 * erinnert wird, schaut irgendwann gar nicht mehr hin. Zweimal täglich trifft
 * den Arbeitstag einmal am Morgen und einmal am Nachmittag.
 */
import { getUserSetting, setUserSetting } from "./userSettingsCache";

export type ErinnerungsTakt =
  | "stuendlich"
  | "zweimal_taeglich"
  | "einmal_taeglich"
  | "aus";

/** Schlüssel in `user_settings.einstellungen`. */
export const TAKT_SCHLUESSEL = "inbox_erinnerung_takt";
export const ZULETZT_SCHLUESSEL = "inbox_erinnerung_zuletzt";

export const STANDARD_TAKT: ErinnerungsTakt = "zweimal_taeglich";

/** Auswahl für die Oberfläche, in dieser Reihenfolge. */
export const TAKT_AUSWAHL: { wert: ErinnerungsTakt; label: string; hinweis: string }[] = [
  { wert: "stuendlich", label: "Stündlich", hinweis: "Höchstens einmal pro Stunde." },
  { wert: "zweimal_taeglich", label: "Zweimal täglich", hinweis: "Höchstens alle 12 Stunden." },
  { wert: "einmal_taeglich", label: "Einmal täglich", hinweis: "Höchstens alle 24 Stunden." },
  { wert: "aus", label: "Keine Erinnerung", hinweis: "Die Glocke schweigt. Die Zahl an der Inbox bleibt." },
];

const ABSTAND_MINUTEN: Record<ErinnerungsTakt, number> = {
  stuendlich: 60,
  zweimal_taeglich: 12 * 60,
  einmal_taeglich: 24 * 60,
  aus: Number.POSITIVE_INFINITY,
};

export function mindestabstandMinuten(takt: ErinnerungsTakt): number {
  return ABSTAND_MINUTEN[takt] ?? ABSTAND_MINUTEN[STANDARD_TAKT];
}

export function istTakt(wert: unknown): wert is ErinnerungsTakt {
  return typeof wert === "string"
    && Object.prototype.hasOwnProperty.call(ABSTAND_MINUTEN, wert);
}

export function getErinnerungsTakt(): ErinnerungsTakt {
  const roh = getUserSetting<unknown>(TAKT_SCHLUESSEL, STANDARD_TAKT);
  return istTakt(roh) ? roh : STANDARD_TAKT;
}

export function setErinnerungsTakt(takt: ErinnerungsTakt): void {
  setUserSetting(TAKT_SCHLUESSEL, takt);
}

/** Zeitpunkt der letzten Erinnerung, oder null, wenn noch nie erinnert wurde. */
export function getLetzteErinnerung(): string | null {
  const roh = getUserSetting<unknown>(ZULETZT_SCHLUESSEL, null);
  return typeof roh === "string" && roh ? roh : null;
}

export function merkeErinnerung(jetzt: Date = new Date()): void {
  setUserSetting(ZULETZT_SCHLUESSEL, jetzt.toISOString());
}

/**
 * Die Regel selbst, ohne Speicher: Ist der Mindestabstand vorbei?
 *
 * Randfälle bewusst benannt:
 *   - Kein oder unlesbarer Stand: einmal erinnern ist besser als schweigen.
 *   - Stand aus der Zukunft (verstellte Uhr, anderes Gerät): nicht erinnern,
 *     sonst hebelt eine falsche Uhr den Abstand aus.
 */
export function darfErinnern(params: {
  takt: ErinnerungsTakt;
  zuletzt?: string | null;
  jetzt?: Date;
}): boolean {
  if (params.takt === "aus") return false;

  const jetzt = params.jetzt ?? new Date();
  if (!params.zuletzt) return true;

  const stand = new Date(params.zuletzt).getTime();
  if (!Number.isFinite(stand)) return true;
  if (stand > jetzt.getTime()) return false;

  const vergangeneMinuten = (jetzt.getTime() - stand) / 60_000;
  return vergangeneMinuten >= mindestabstandMinuten(params.takt);
}

/** Einstellung und Merker zusammen: darf die Glocke jetzt läuten? */
export function darfJetztErinnern(jetzt: Date = new Date()): boolean {
  return darfErinnern({
    takt: getErinnerungsTakt(),
    zuletzt: getLetzteErinnerung(),
    jetzt,
  });
}
