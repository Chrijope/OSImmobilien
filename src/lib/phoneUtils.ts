/**
 * Telefonnummer-Hilfen mit Ländervorwahl-Auswahl.
 * - normalizeTelefon: 01... -> +491... (deutsche Mobilnummern), 0... -> +49 mit Default DE.
 * - Erkennt vorhandenes "+" und lässt es unverändert.
 */

export interface CountryCode {
  code: string; // z. B. "+49"
  iso: string; // z. B. "DE"
  label: string; // z. B. "Deutschland (+49)"
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "+49", iso: "DE", label: "Deutschland (+49)", flag: "🇩🇪" },
  { code: "+43", iso: "AT", label: "Österreich (+43)", flag: "🇦🇹" },
  { code: "+41", iso: "CH", label: "Schweiz (+41)", flag: "🇨🇭" },
  { code: "+39", iso: "IT", label: "Italien (+39)", flag: "🇮🇹" },
  { code: "+33", iso: "FR", label: "Frankreich (+33)", flag: "🇫🇷" },
  { code: "+34", iso: "ES", label: "Spanien (+34)", flag: "🇪🇸" },
  { code: "+31", iso: "NL", label: "Niederlande (+31)", flag: "🇳🇱" },
  { code: "+32", iso: "BE", label: "Belgien (+32)", flag: "🇧🇪" },
  { code: "+352", iso: "LU", label: "Luxemburg (+352)", flag: "🇱🇺" },
  { code: "+45", iso: "DK", label: "Dänemark (+45)", flag: "🇩🇰" },
  { code: "+46", iso: "SE", label: "Schweden (+46)", flag: "🇸🇪" },
  { code: "+47", iso: "NO", label: "Norwegen (+47)", flag: "🇳🇴" },
  { code: "+358", iso: "FI", label: "Finnland (+358)", flag: "🇫🇮" },
  { code: "+44", iso: "GB", label: "Vereinigtes Königreich (+44)", flag: "🇬🇧" },
  { code: "+353", iso: "IE", label: "Irland (+353)", flag: "🇮🇪" },
  { code: "+351", iso: "PT", label: "Portugal (+351)", flag: "🇵🇹" },
  { code: "+30", iso: "GR", label: "Griechenland (+30)", flag: "🇬🇷" },
  { code: "+48", iso: "PL", label: "Polen (+48)", flag: "🇵🇱" },
  { code: "+420", iso: "CZ", label: "Tschechien (+420)", flag: "🇨🇿" },
  { code: "+421", iso: "SK", label: "Slowakei (+421)", flag: "🇸🇰" },
  { code: "+36", iso: "HU", label: "Ungarn (+36)", flag: "🇭🇺" },
  { code: "+385", iso: "HR", label: "Kroatien (+385)", flag: "🇭🇷" },
  { code: "+386", iso: "SI", label: "Slowenien (+386)", flag: "🇸🇮" },
  { code: "+40", iso: "RO", label: "Rumänien (+40)", flag: "🇷🇴" },
  { code: "+359", iso: "BG", label: "Bulgarien (+359)", flag: "🇧🇬" },
  { code: "+1", iso: "US", label: "USA / Kanada (+1)", flag: "🇺🇸" },
  { code: "+90", iso: "TR", label: "Türkei (+90)", flag: "🇹🇷" },
  { code: "+7", iso: "RU", label: "Russland (+7)", flag: "🇷🇺" },
];

export const DEFAULT_COUNTRY: CountryCode = COUNTRY_CODES[0];

/**
 * Normalisiert eine Telefonnummer.
 * Wenn die Nummer mit "0" beginnt (z. B. "0151..."), wird die führende 0 durch die Vorwahl ersetzt.
 * Bestehende "+"-Nummern werden unverändert gelassen.
 * Default-Vorwahl: +49 (Deutschland).
 */
export function normalizeTelefon(input: string | null | undefined, defaultCode: string = "+49"): string {
  if (!input) return "";
  // Vorhandene Müll-Präfixe wie "Tel:", "Tel.", "Telefon:" entfernen
  let raw = String(input).trim().replace(/^(tele(?:fon)?|tel)\s*[:.\-]?\s*/i, "");
  if (!raw) return "";
  if (raw.startsWith("+")) {
    // Führende 0 direkt nach Ländervorwahl entfernen, z. B. "+490151..." -> "+49151..."
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (raw.startsWith(c.code)) {
        const rest = raw.slice(c.code.length).trimStart();
        const cleaned = rest.startsWith("0") ? rest.slice(1) : rest;
        return `${c.code} ${cleaned.replace(/\s+/g, " ").trim()}`.trim();
      }
    }
    return raw.replace(/\s+/g, " ").trim();
  }
  // Entferne führende 00 (z. B. 0049 -> +49)
  if (raw.startsWith("00")) return normalizeTelefon("+" + raw.slice(2), defaultCode);
  if (raw.startsWith("0")) return `${defaultCode} ${raw.slice(1).replace(/\s+/g, " ").trim()}`;
  return raw;
}

/**
 * Bereitet eine Telefonnummer für WhatsApp (wa.me) auf.
 * Entfernt alle Nicht-Ziffern (inkl. +, Leerzeichen, Bindestriche).
 * Gibt leeren String zurück, wenn keine Ziffern vorhanden.
 */
export function toWhatsAppDigits(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).replace(/\D/g, "");
}

/**
 * Erzeugt einen WhatsApp-Direktlink (https://wa.me/…) aus einer beliebigen
 * Telefonnummer. Verwendet die normalisierte Nummer, falls vorhanden.
 */
export function whatsAppLink(input: string | null | undefined): string {
  const normalized = normalizeTelefon(input);
  const digits = toWhatsAppDigits(normalized);
  if (!digits) return "";
  return `https://wa.me/${digits}`;
}

/**
 * Splittet eine Telefonnummer in Vorwahl + Rest. Erkennt die längste passende Vorwahl.
 */
export function splitTelefon(value: string | null | undefined): { country: CountryCode; rest: string } {
  let v = (value || "").trim();
  // Müll-Präfixe wie "Tel:", "Tel.", "Tele", "Telefon:" entfernen
  v = v.replace(/^(tele(?:fon)?|tel)\s*[:.\-]?\s*/i, "").trim();
  // 00-Präfix -> +
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (!v) return { country: DEFAULT_COUNTRY, rest: "" };
  if (v.startsWith("+")) {
    // Längste passende Vorwahl finden
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (v.startsWith(c.code)) {
        let rest = v.slice(c.code.length).trim();
        // Führende 0 nach Ländervorwahl entfernen (z. B. +49 0151... -> +49 151...)
        rest = rest.replace(/^0+/, "");
        return { country: c, rest };
      }
    }
    return { country: DEFAULT_COUNTRY, rest: v };
  }
  if (v.startsWith("0")) return { country: DEFAULT_COUNTRY, rest: v.replace(/^0+/, "").trim() };
  return { country: DEFAULT_COUNTRY, rest: v };
}

/**
 * Eine Telefonnummer lesbar gruppiert, nur für die Anzeige.
 *
 * Anlass (24.09.2026): Im Kundenlink stand die Nummer des Ansprechpartners als
 * ein Block wie „+4917612345678“. Für den Wählvorgang (`tel:`) bleibt die
 * Nummer ohne Leerzeichen, das regelt die Stelle, die den Link baut.
 *
 * Gruppiert wird nur, was sich sicher gruppieren lässt:
 *   - Eine Nummer, die schon Leerzeichen trägt, bleibt, wie sie gepflegt ist.
 *   - Deutsche Mobilnummern (15x, 16x, 17x) haben eine dreistellige Vorwahl:
 *     „+49 176 1234 5678“.
 *   - Bei Festnetznummern ist die Länge der Ortsvorwahl ohne Verzeichnis nicht
 *     zu erkennen (089, 0911, 03581 …). Dort wird nur die Ländervorwahl
 *     abgesetzt, eine falsch gesetzte Lücke wäre schlimmer als keine.
 */
export function telefonAnzeige(input: string | null | undefined): string {
  const normalisiert = normalizeTelefon(input);
  if (!normalisiert) return "";
  const { country, rest } = splitTelefon(normalisiert);
  if (!rest || !/^\d+$/.test(rest)) return normalisiert;
  if (country.code === "+49" && /^1[5-7]\d/.test(rest) && rest.length >= 8) {
    const teilnehmer = rest.slice(3).match(/.{1,4}/g) ?? [];
    return [country.code, rest.slice(0, 3), ...teilnehmer].join(" ");
  }
  return `${country.code} ${rest}`;
}
