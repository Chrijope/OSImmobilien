import type { KundeData } from "@/lib/kundenStore";

/*
 * Die eine Regel, wann zwei Eintraege (Kontakte, Leads, Bewerber) Duplikate
 * sind. Festgelegt von Christian am 24.09.2026:
 *
 * Ein Duplikat liegt NUR vor, wenn mindestens eines davon gilt:
 *   1. Vor- UND Nachname sind vollstaendig identisch (nach Gross- und
 *      Kleinschreibung, ueberfluessigen Leerzeichen und Unicode-NFC).
 *   2. Die Telefonnummer ist vollstaendig identisch (nur Ziffern, +49, 0049
 *      und fuehrende 0 gelten gleich; unter sechs Ziffern nach der Vorwahl
 *      zaehlt die Nummer nicht).
 *   3. Die E-Mail ist vollstaendig identisch (klein, ohne Leerzeichen).
 *
 * Es gibt bewusst keine Aehnlichkeitssuche mehr (kein Levenshtein, keine
 * Phonetik, kein Vergleich nur des Vor- oder nur des Nachnamens, kein
 * vertauschter Name). Die fruehere Kategorie "aehnlicher Name (Tippfehler?)"
 * hat Paare mit gleichem Vornamen, aber voellig verschiedener Nummer und
 * E-Mail zu Duplikaten erklaert. Ein leeres Feld stimmt nie mit etwas ueberein.
 */

/** Mindestzahl an Ziffern nach der Vorwahl, damit eine Nummer zaehlt. */
export const TELEFON_MINDEST_ZIFFERN = 6;

/**
 * Bei auslaendischen Nummern ist die Laenge der Laendervorwahl (1 bis 3
 * Ziffern) nicht bekannt. Mit 3 + 6 Ziffern ist die Mindestlaenge auf jeden
 * Fall erfuellt, ohne eine Vorwahltabelle pflegen zu muessen.
 */
const AUSLAND_MINDEST_ZIFFERN = 3 + TELEFON_MINDEST_ZIFFERN;

/** Platzhalter, die die Lead-Annahme setzt, wenn ein Name fehlt. */
const NAMENS_PLATZHALTER = new Set(["—", "–", "-", "?"]);

/**
 * Vergleichsform eines Namensteils: Unicode-NFC, klein, Leerzeichen an den
 * Raendern weg und innen zusammengefasst. Sonst nichts, insbesondere keine
 * Umlaut-Umschrift: "Mueller" und "Müller" sind zwei verschiedene Namen.
 */
export function namensteilSchluessel(s?: string | null): string {
  if (!s) return "";
  const wert = s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  return NAMENS_PLATZHALTER.has(wert) ? "" : wert;
}

/** Schluessel des vollen Namens. Leer, sobald Vor- oder Nachname fehlt. */
export function nameSchluessel(vorname?: string | null, nachname?: string | null): string {
  const v = namensteilSchluessel(vorname);
  const n = namensteilSchluessel(nachname);
  if (!v || !n) return "";
  return `${v}|${n}`;
}

/**
 * Vergleichsform einer Telefonnummer.
 *
 * Deutsche Nummern ("+49 171 …", "0049 171 …", "0171 …", "+49 (0) 171 …")
 * werden auf die Ziffern nach der Vorwahl ohne fuehrende 0 gebracht, also
 * "1711234567". Auslaendische Nummern behalten ihre Laendervorwahl mit "+"
 * davor, damit "+43 …" nie mit einer deutschen Nummer zusammenfaellt.
 *
 * Leer, wenn nach der Vorwahl weniger als sechs Ziffern uebrig bleiben. Sonst
 * waeren alle Nummern, die nur aus "+49" bestehen, untereinander "gleich".
 */
export function telefonSchluessel(tel?: string | null): string {
  if (!tel) return "";
  const roh = String(tel).trim();
  let ziffern = roh.replace(/\D/g, "");
  if (!ziffern) return "";

  let international = false;
  if (roh.startsWith("+")) {
    international = true;
  } else if (ziffern.startsWith("00")) {
    international = true;
    ziffern = ziffern.slice(2);
  }

  if (international) {
    if (ziffern.startsWith("49")) {
      // "+49 (0) 171 …": die eingeklammerte 0 gehoert nicht zur Nummer.
      const national = ziffern.slice(2).replace(/^0+/, "");
      return national.length >= TELEFON_MINDEST_ZIFFERN ? national : "";
    }
    return ziffern.length >= AUSLAND_MINDEST_ZIFFERN ? `+${ziffern}` : "";
  }

  // Ohne Vorwahl: inlaendische Schreibweise, fuehrende 0 entfaellt.
  const national = ziffern.replace(/^0+/, "");
  return national.length >= TELEFON_MINDEST_ZIFFERN ? national : "";
}

export function isPlaceholderEmail(email?: string | null): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return true;
  if (!e.includes("@")) return true;
  if (/^-+$/.test(e)) return true;
  if (e.endsWith("@placeholder.local") || e.endsWith("@example.com")) return true;
  return false;
}

/** Vergleichsform einer E-Mail: klein, ohne Leerzeichen. Platzhalter zaehlen nicht. */
export function emailSchluessel(email?: string | null): string {
  const e = (email || "").toLowerCase().replace(/\s+/g, "");
  return isPlaceholderEmail(e) ? "" : e;
}

export type DuplikatKriterium = "email" | "telefon" | "name";

export interface DuplikatEintrag {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
}

/** Reihenfolge, in der Kriterien geprueft und im Etikett genannt werden. */
const KRITERIEN: DuplikatKriterium[] = ["email", "telefon", "name"];

function schluesselFuer(kriterium: DuplikatKriterium, e: Omit<DuplikatEintrag, "id">): string {
  if (kriterium === "email") return emailSchluessel(e.email);
  if (kriterium === "telefon") return telefonSchluessel(e.telefon);
  return nameSchluessel(e.vorname, e.nachname);
}

/**
 * Welche Kriterien zwei Eintraege gemeinsam erfuellen. Leere Liste heisst:
 * kein Duplikat.
 */
export function duplikatKriterien(
  a: Omit<DuplikatEintrag, "id">,
  b: Omit<DuplikatEintrag, "id">,
): DuplikatKriterium[] {
  return KRITERIEN.filter((k) => {
    const sa = schluesselFuer(k, a);
    return sa !== "" && sa === schluesselFuer(k, b);
  });
}

export function sindDuplikate(a: Omit<DuplikatEintrag, "id">, b: Omit<DuplikatEintrag, "id">): boolean {
  return duplikatKriterien(a, b).length > 0;
}

const KRITERIUM_TEXT: Record<DuplikatKriterium, string> = {
  email: "gleiche E-Mail",
  telefon: "gleiche Telefonnummer",
  name: "gleicher Name",
};

/** Etikett einer Gruppe, etwa "gleiche E-Mail und gleicher Name". */
export function duplikatEtikett(kriterien: DuplikatKriterium[]): string {
  const texte = KRITERIEN.filter((k) => kriterien.includes(k)).map((k) => KRITERIUM_TEXT[k]);
  if (texte.length <= 1) return texte[0] || "";
  return `${texte.slice(0, -1).join(", ")} und ${texte[texte.length - 1]}`;
}

export interface DuplikatGruppe<T extends DuplikatEintrag> {
  /** Stabiler Schluessel, unter dem "Ignorieren" die Gruppe merkt. */
  schluessel: string;
  /** Kriterium, ueber das die Gruppe gefunden wurde. */
  kriterium: DuplikatKriterium;
  /** Alle Kriterien, die ALLE Eintraege der Gruppe teilen. */
  kriterien: DuplikatKriterium[];
  eintraege: T[];
  /**
   * Schluessel, unter denen die fruehere Erkennung dieselbe Gruppe gemerkt
   * hat. Damit bleibt eine bereits ignorierte Gruppe ignoriert, obwohl sich
   * die Normalisierung geaendert hat.
   */
  alteSchluessel: string[];
}

const SCHLUESSEL_PRAEFIX: Record<DuplikatKriterium, string> = {
  email: "email",
  telefon: "phone",
  name: "name",
};

/**
 * Bildet die Duplikat-Gruppen einer Liste. Erst nach E-Mail, dann nach
 * Telefonnummer, dann nach vollem Namen; wer schon in einer Gruppe steht,
 * kommt in keine weitere. Linearer Aufwand, auch bei tausenden Eintraegen.
 */
export function findeDuplikatGruppen<T extends DuplikatEintrag>(eintraege: T[]): DuplikatGruppe<T>[] {
  const vergeben = new Set<string>();
  const gruppen: DuplikatGruppe<T>[] = [];

  for (const kriterium of KRITERIEN) {
    const nachSchluessel = new Map<string, T[]>();
    for (const e of eintraege) {
      if (vergeben.has(e.id)) continue;
      const s = schluesselFuer(kriterium, e);
      if (!s) continue;
      const liste = nachSchluessel.get(s);
      if (liste) liste.push(e);
      else nachSchluessel.set(s, [e]);
    }
    nachSchluessel.forEach((liste, s) => {
      if (liste.length < 2) return;
      liste.forEach((e) => vergeben.add(e.id));
      const kriterien = KRITERIEN.filter((k) => {
        const erster = schluesselFuer(k, liste[0]);
        return erster !== "" && liste.every((e) => schluesselFuer(k, e) === erster);
      });
      gruppen.push({
        schluessel: `${SCHLUESSEL_PRAEFIX[kriterium]}:${s}`,
        kriterium,
        kriterien,
        eintraege: liste,
        alteSchluessel: alteGruppenSchluessel(kriterium, liste),
      });
    });
  }

  return gruppen;
}

// ---------------------------------------------------------------------------
// Alte Gruppenschluessel, nur fuer bereits ignorierte Gruppen.
//
// "Ignorieren" speichert den Gruppenschluessel im Browser (localStorage). Die
// fruehere Erkennung hat Namen mit Umlaut-Umschrift normalisiert und bei
// Telefonnummern nur die letzten neun Ziffern verglichen. Damit eine dort
// ignorierte Gruppe nicht wieder auftaucht, werden ihre damaligen Schluessel
// hier nachgebildet. Fuer die Erkennung selbst spielen sie keine Rolle.
// ---------------------------------------------------------------------------

function alterNamensteil(s?: string | null): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[-_.'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function alterSchluessel(kriterium: DuplikatKriterium, e: DuplikatEintrag): string {
  if (kriterium === "email") {
    const mail = (e.email || "").trim().toLowerCase();
    return isPlaceholderEmail(mail) ? "" : `email:${mail}`;
  }
  if (kriterium === "telefon") {
    const ziffern = (e.telefon || "").replace(/\D/g, "");
    return ziffern.length < 5 ? "" : `phone:${ziffern.slice(-9)}`;
  }
  const v = alterNamensteil(e.vorname);
  const n = alterNamensteil(e.nachname);
  return v && n ? `name:${v}|${n}` : "";
}

function alteGruppenSchluessel(kriterium: DuplikatKriterium, liste: DuplikatEintrag[]): string[] {
  const alte = new Set<string>();
  for (const e of liste) {
    const s = alterSchluessel(kriterium, e);
    if (s) alte.add(s);
  }
  return [...alte];
}

// ---------------------------------------------------------------------------
// Pruefung beim Anlegen eines neuen Kontakts.
// ---------------------------------------------------------------------------

export type DuplikatMatch = {
  kontakt: KundeData;
  grund: "email" | "telefon" | "name_exakt";
  detail: string;
};

/**
 * Findet bestehende Kontakte, die nach der Regel oben Duplikate des neuen
 * Kontakts sind. Je Kontakt zaehlt der staerkste Grund: E-Mail vor Telefon
 * vor vollem Namen.
 */
export function findPotentialDuplicates(
  candidate: { vorname?: string; nachname?: string; email?: string; telefon?: string },
  kontakte: KundeData[]
): DuplikatMatch[] {
  const matches: DuplikatMatch[] = [];
  const seen = new Set<string>();

  for (const k of kontakte) {
    if (k.geloescht) continue;
    if (seen.has(k.id)) continue;
    const kriterien = duplikatKriterien(candidate, k);
    if (kriterien.length === 0) continue;
    seen.add(k.id);
    if (kriterien[0] === "email") {
      matches.push({ kontakt: k, grund: "email", detail: emailSchluessel(k.email) });
    } else if (kriterien[0] === "telefon") {
      matches.push({ kontakt: k, grund: "telefon", detail: k.telefon || "" });
    } else {
      matches.push({ kontakt: k, grund: "name_exakt", detail: `${k.vorname} ${k.nachname}` });
    }
  }

  return matches;
}
