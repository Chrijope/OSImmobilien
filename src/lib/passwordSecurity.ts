import i18n from "@/i18n";

type ZxcvbnModul = typeof import("@zxcvbn-ts/core");

/**
 * zxcvbn samt Woerterbuechern wiegt rund 800 KB gzip. Es wird erst beim
 * ersten Pruefen geladen, nicht schon beim Import dieses Moduls. So bleibt
 * etwa der HIBP-Abgleich (`checkPasswordPwned`) ohne diese Last, und die
 * Passwort-Seiten laden das Paket erst, wenn wirklich getippt wird.
 * Das Versprechen wird gemerkt, damit pro Sitzung nur einmal geladen wird.
 */
let _zxcvbnLaden: Promise<ZxcvbnModul> | null = null;
function zxcvbnBereit(): Promise<ZxcvbnModul> {
  if (!_zxcvbnLaden) {
    _zxcvbnLaden = Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ]).then(([core, common, en]) => {
      core.zxcvbnOptions.setOptions({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: {
          ...common.dictionary,
          ...en.dictionary,
          userInputs: ["moreimmo", "more.immo", "more immo", "immobilie", "immobilien"],
        },
      });
      merkeZxcvbnTexte(en.translations);
      return core;
    }).catch((e) => {
      // Beim naechsten Aufruf erneut versuchen, statt dauerhaft zu scheitern.
      _zxcvbnLaden = null;
      throw e;
    });
  }
  return _zxcvbnLaden;
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrengthResult {
  score: PasswordScore;
  /** Stufe als Text in der aktuellen Anzeigesprache. */
  label: string;
  /** Hinweise in der aktuellen Anzeigesprache. */
  feedback: string[];
  acceptable: boolean;
}

/**
 * Die Stufen als Text. Die Texte kommen aus i18next (`auth.passwort.*`):
 * Kunden sehen ihre Anzeigesprache, im CRM ist die Anzeige immer Deutsch.
 * Feste Schlüssel statt `staerke_${score}`, damit der Schlüsseltest sie prüft.
 */
export function staerkeText(score: PasswordScore): string {
  switch (score) {
    case 0:
      return i18n.t("auth.passwort.staerke_0");
    case 1:
      return i18n.t("auth.passwort.staerke_1");
    case 2:
      return i18n.t("auth.passwort.staerke_2");
    case 3:
      return i18n.t("auth.passwort.staerke_3");
    default:
      return i18n.t("auth.passwort.staerke_4");
  }
}

export async function evaluatePassword(pw: string, userInputs: string[] = []): Promise<PasswordStrengthResult> {
  const { zxcvbn } = await zxcvbnBereit();
  const res = zxcvbn(pw, userInputs);
  const score = res.score as PasswordScore;
  const feedback: string[] = [];
  const hinzu = (text: string) => {
    // Zwei zxcvbn-Hinweise koennen auf denselben Text fuehren, etwa die
    // Warnung und der Vorschlag zu Sequenzen. Dann nur einmal zeigen.
    if (!feedback.includes(text)) feedback.push(text);
  };
  if (res.feedback.warning) hinzu(translateFeedback(res.feedback.warning));
  for (const s of res.feedback.suggestions || []) hinzu(translateFeedback(s));
  return {
    score,
    label: staerkeText(score),
    feedback,
    acceptable: score >= 3 && pw.length >= 10,
  };
}

/**
 * Die Hinweise von zxcvbn in unserer Sprache.
 *
 * zxcvbn liefert englische Saetze aus `@zxcvbn-ts/language-en`. Frueher stand
 * hier eine Tabelle mit den Saetzen der alten zxcvbn-Fassung; seit dem Wechsel
 * auf zxcvbn-ts traf sie fast nie, und auch deutsche Nutzer sahen Englisch.
 * Deshalb wird jetzt ueber den Schluessel des Satzes (etwa
 * `warnings.straightRow`) uebersetzt, nicht ueber seinen Wortlaut.
 */
const HINWEISE: Record<string, () => string> = {
  "warnings.straightRow": () => i18n.t("auth.passwort.hinweis.tastaturreihe"),
  "warnings.keyPattern": () => i18n.t("auth.passwort.hinweis.tastaturmuster"),
  "warnings.simpleRepeat": () => i18n.t("auth.passwort.hinweis.wiederholung"),
  "warnings.extendedRepeat": () => i18n.t("auth.passwort.hinweis.wiederholte_sequenz"),
  "warnings.sequences": () => i18n.t("auth.passwort.hinweis.sequenz"),
  "warnings.recentYears": () => i18n.t("auth.passwort.hinweis.jahreszahlen"),
  "warnings.dates": () => i18n.t("auth.passwort.hinweis.datum"),
  "warnings.topTen": () => i18n.t("auth.passwort.hinweis.top_zehn"),
  "warnings.topHundred": () => i18n.t("auth.passwort.hinweis.top_hundert"),
  "warnings.common": () => i18n.t("auth.passwort.hinweis.sehr_verbreitet"),
  "warnings.similarToCommon": () => i18n.t("auth.passwort.hinweis.aehnlich_verbreitet"),
  "warnings.wordByItself": () => i18n.t("auth.passwort.hinweis.einzelnes_wort"),
  "warnings.namesByThemselves": () => i18n.t("auth.passwort.hinweis.namen_allein"),
  "warnings.commonNames": () => i18n.t("auth.passwort.hinweis.haeufige_namen"),
  "warnings.userInputs": () => i18n.t("auth.passwort.hinweis.persoenliche_angaben"),
  "warnings.pwned": () => i18n.t("auth.passwort.hinweis.geleakt"),
  "suggestions.l33t": () => i18n.t("auth.passwort.hinweis.ersetzungen"),
  "suggestions.reverseWords": () => i18n.t("auth.passwort.hinweis.umgekehrt"),
  "suggestions.allUppercase": () => i18n.t("auth.passwort.hinweis.nur_grossbuchstaben"),
  "suggestions.capitalization": () => i18n.t("auth.passwort.hinweis.grossschreibung"),
  "suggestions.dates": () => i18n.t("auth.passwort.hinweis.datum"),
  "suggestions.recentYears": () => i18n.t("auth.passwort.hinweis.jahreszahlen"),
  "suggestions.associatedYears": () => i18n.t("auth.passwort.hinweis.eigene_jahre"),
  "suggestions.sequences": () => i18n.t("auth.passwort.hinweis.sequenz"),
  "suggestions.repeated": () => i18n.t("auth.passwort.hinweis.wiederholte_sequenz"),
  "suggestions.longerKeyboardPattern": () => i18n.t("auth.passwort.hinweis.tastaturmuster"),
  "suggestions.anotherWord": () => i18n.t("auth.passwort.hinweis.weiteres_wort"),
  "suggestions.useWords": () => i18n.t("auth.passwort.hinweis.mehrere_worte"),
  "suggestions.noNeed": () => i18n.t("auth.passwort.hinweis.laenge_statt_zeichen"),
  "suggestions.pwned": () => i18n.t("auth.passwort.hinweis.geleakt_anderswo"),
};

/** Englischer Satz von zxcvbn → sein Schluessel, gefuellt beim Laden. */
const zxcvbnSchluessel = new Map<string, string>();

function merkeZxcvbnTexte(uebersetzungen: { warnings: Record<string, string>; suggestions: Record<string, string> }) {
  for (const gruppe of ["warnings", "suggestions"] as const) {
    for (const [schluessel, text] of Object.entries(uebersetzungen[gruppe])) {
      zxcvbnSchluessel.set(text, `${gruppe}.${schluessel}`);
    }
  }
}

function translateFeedback(text: string): string {
  const schluessel = zxcvbnSchluessel.get(text);
  const hinweis = schluessel ? HINWEISE[schluessel] : undefined;
  // Unbekannte Hinweise (neue zxcvbn-Fassung) bleiben im Original stehen.
  return hinweis ? hinweis() : text;
}

// HIBP k-anonymity check via pwnedpasswords.com
// Sendet nur die ersten 5 Zeichen des SHA-1-Hashes – das Passwort verlässt das Gerät nicht.
export async function checkPasswordPwned(pw: string): Promise<number> {
  try {
    const hash = await sha1Hex(pw);
    const prefix = hash.slice(0, 5).toUpperCase();
    const suffix = hash.slice(5).toUpperCase();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: ctrl.signal,
      headers: { "Add-Padding": "true" },
    });
    clearTimeout(timeout);
    if (!res.ok) return 0;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix) return parseInt(count, 10) || 0;
    }
    return 0;
  } catch {
    return 0; // bei Netzfehler nicht blockieren
  }
}

async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}