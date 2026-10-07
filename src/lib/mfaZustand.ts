/**
 * Gemeinsame Ableitung des 2FA-Zustands aus der Faktorliste.
 *
 * Anlass: Oberfläche und Server haben zwei verschiedene Quellen befragt. Der
 * Wächter im Kundenportal las die Sicherheitsstufe der Sitzung
 * (`getAuthenticatorAssuranceLevel`), die Edge Function `manage-mfa` las die
 * echte Faktorliste. Die Sicherheitsstufe steckt im Anmeldetoken und kennt
 * einen frisch angelegten Faktor oft noch nicht. Dann bot die Oberfläche die
 * Einrichtung an, der Server lehnte sie mit "bereits aktiviert" ab, und der
 * Kunde saß fest.
 *
 * Maßgeblich ist deshalb ausschließlich die Faktorliste. Diese Datei hält die
 * Ableitung an einer Stelle, damit Kundenwächter und interner Wächter nicht
 * wieder auseinanderlaufen.
 */

export type MfaFaktor = {
  id?: string | null;
  status?: string | null;
  factor_type?: string | null;
};

/** Antwortform von `supabase.auth.mfa.listFactors()` und der Aktion `list`. */
export type MfaFaktorListe = {
  totp?: MfaFaktor[] | null;
  all?: MfaFaktor[] | null;
} | null | undefined;

export type MfaZustand =
  /** Fertig eingerichteter Faktor. Nur Code abfragen, nie Einrichtung anbieten. */
  | { art: "verifiziert"; factorId: string }
  /** Abgebrochener Versuch: Faktor angelegt, aber nie bestätigt. */
  | { art: "halbfertig" }
  /** Nichts vorhanden. */
  | { art: "keiner" }
  /** Liste nicht abrufbar oder unbrauchbar. Der Aufrufer entscheidet. */
  | { art: "unbekannt" };

/** Was der Nutzer als Nächstes zu sehen bekommt. */
export type MfaSchritt = "ok" | "challenge" | "einrichten" | "unklar";

function istTotp(f: MfaFaktor | null | undefined): boolean {
  if (!f) return false;
  // `totp` enthält nur TOTP-Faktoren, dort fehlt das Feld manchmal.
  return !f.factor_type || f.factor_type === "totp";
}

/** Alle TOTP-Faktoren aus `totp` und `all`, jeder nur einmal. */
function totpFaktoren(liste: MfaFaktorListe): MfaFaktor[] {
  const roh = [
    ...((liste?.totp ?? []) as MfaFaktor[]),
    ...(((liste?.all ?? []) as MfaFaktor[]).filter((f) => f?.factor_type === "totp")),
  ].filter(istTotp);
  const gesehen = new Set<string>();
  const ergebnis: MfaFaktor[] = [];
  for (const f of roh) {
    if (!f) continue;
    const schluessel = f.id || `ohne-id-${ergebnis.length}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(f);
  }
  return ergebnis;
}

/**
 * Leitet den Zustand aus einer bereits geholten Faktorliste ab.
 * `null`/`undefined` heißt: es gab keine brauchbare Antwort.
 */
export function mfaZustandAusListe(liste: MfaFaktorListe): MfaZustand {
  if (liste === null || liste === undefined) return { art: "unbekannt" };

  const faktoren = totpFaktoren(liste);
  const verifiziert = faktoren.filter((f) => f.status === "verified");

  if (verifiziert.length > 0) {
    const mitId = verifiziert.find((f) => typeof f.id === "string" && f.id.length > 0);
    // Ein bestätigter Faktor ohne Kennung lässt sich nicht abfragen. Dann lieber
    // "unbekannt" melden, als eine Einrichtung anzubieten, die der Server ablehnt.
    if (!mitId) return { art: "unbekannt" };
    return { art: "verifiziert", factorId: mitId.id as string };
  }

  if (faktoren.length > 0) return { art: "halbfertig" };
  return { art: "keiner" };
}

/**
 * Holt die Faktorliste. Zuerst aus der Sitzung, bei Fehler über den Server.
 * Antwortet keine der beiden Quellen, ist der Zustand "unbekannt".
 */
export async function mfaZustandErmitteln(quellen: {
  /** `supabase.auth.mfa.listFactors()` */
  ausSitzung: () => Promise<MfaFaktorListe>;
  /** Edge Function `manage-mfa` mit `{ action: "list" }` */
  vomServer?: () => Promise<MfaFaktorListe>;
}): Promise<MfaZustand> {
  try {
    const liste = await quellen.ausSitzung();
    const zustand = mfaZustandAusListe(liste);
    if (zustand.art !== "unbekannt") return zustand;
  } catch {
    /* zweite Quelle versuchen */
  }

  if (!quellen.vomServer) return { art: "unbekannt" };
  try {
    return mfaZustandAusListe(await quellen.vomServer());
  } catch {
    return { art: "unbekannt" };
  }
}

/**
 * Ableitung des nächsten Schritts. `sessionAal2` sagt, ob die laufende Sitzung
 * den zweiten Faktor bereits verwendet hat.
 */
export function mfaSchritt(zustand: MfaZustand, sessionAal2: boolean): MfaSchritt {
  switch (zustand.art) {
    case "verifiziert":
      return sessionAal2 ? "ok" : "challenge";
    case "halbfertig":
      // Abgebrochener Versuch. Neu einrichten ist erlaubt, die Edge Function
      // räumt den halbfertigen Faktor vor dem Anlegen selbst weg.
      return "einrichten";
    case "keiner":
      return "einrichten";
    default:
      return "unklar";
  }
}
