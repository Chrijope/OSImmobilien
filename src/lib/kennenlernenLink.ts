/**
 * Welcher Link zum Kennenlernbogen gerade gilt, und wann ein neuer nötig ist.
 *
 * ## Der Fehler, den das behebt
 *
 * Beide Bögen des Bewerberprozesses schreiben in dieselbe Tabelle
 * `bewerber_formular`: der frühere Vorabbogen (`send-bewerber-formular`) und
 * der aktuelle Kennenlernbogen (`send-bewerber-kennenlernen`). Die Karte im
 * Reiter Übersicht nahm bis zum 15.09.2026 die jüngste Zeile, gleich welcher
 * Art, und baute daraus `portal.more.immo/kennenlernen/<token>`. Bei allen
 * Bewerbern, die früher nur den Vorabbogen bekommen hatten, war das der Token
 * des Vorabbogens, längst abgelaufen oder ersetzt. „Link kopieren" und „So
 * sieht es aus" liefen deshalb auf „Dieser Link ist abgelaufen".
 *
 * Hier steht die Regel genau einmal, ohne React und ohne Supabase, damit sie
 * sich prüfen lässt:
 *
 *   1. Es zählen nur Zeilen des Kennenlernbogens. Der Vorabbogen ist für den
 *      Link so, als gäbe es ihn nicht.
 *   2. Gilt ein offener, nicht abgelaufener Link, ist er der Link.
 *   3. Sonst, wenn der Bogen eingereicht ist, führt der Link auf dessen
 *      Abschlussseite. Das ist die Wahrheit, und ein neuer Token würde den
 *      Bewerber ein zweites Mal zum Ausfüllen auffordern.
 *   4. Sonst fehlt ein Link, und die Karte lässt sich einen neuen erzeugen.
 */

/** Die öffentliche Adresse des Kennenlernens, wie sie in der Mail steht. */
export const KENNENLERNEN_BASIS = "https://portal.more.immo/kennenlernen";

/** Eine Zeile aus `bewerber_formular`, so wie die Abfrage sie liefert. */
export type KennenlernLinkZeile = {
  token?: string | null;
  status?: string | null;
  antworten?: unknown;
  created_at?: string | null;
  expires_at?: string | null;
};

export type KennenlernLinkStand =
  /** Ein offener, noch gültiger Link. */
  | { art: "gueltig"; token: string; link: string; laeuftAbAm: string }
  /** Kein offener Link, aber der Bogen ist eingereicht. Der Link zeigt die Abschlussseite. */
  | { art: "eingereicht"; token: string; link: string }
  /** Es gibt keinen brauchbaren Link. `grund` sagt, warum. */
  | { art: "fehlt"; grund: "keiner" | "abgelaufen" | "ersetzt" | "nur_vorabbogen" };

/**
 * Stammt diese Zeile aus dem Kennenlernbogen?
 *
 * Dasselbe Merkmal wie in `_shared/kennenlernen-versand.ts` auf der
 * Serverseite: das Kennzeichen `bogen`, das der Versand schon beim Anlegen
 * setzt, oder ein gewählter Weg, den nur dieser Bogen kennt. Der Vorabbogen
 * legt seine Zeile ohne Antworten an und hat beides nicht.
 */
export function istKennenlernZeile(antworten: unknown): boolean {
  if (!antworten || typeof antworten !== "object") return false;
  const a = antworten as Record<string, unknown>;
  return a.bogen === "kennenlernen" || (typeof a.weg === "string" && a.weg.trim() !== "");
}

/**
 * Hat der Bewerber diese Zeile wirklich abgeschickt?
 *
 * Das zweite, weitere Merkmal neben `istKennenlernZeile`, seit dem 16.09.2026.
 * Es fragt nicht, WELCHER Bogen vorliegt, sondern nur, OB einer ausgefüllt
 * wurde. Es gilt deshalb auch für den früheren Vorabbogen und für jede seiner
 * Fassungen seit dem 19.08.2026.
 *
 * ## Warum es das zusätzlich braucht
 *
 * `istKennenlernZeile` erkennt den Kennenlernbogen an zwei jungen Merkmalen,
 * am Kennzeichen `bogen` und am gewählten `weg`. Für die Wahl des Links ist
 * das genau richtig und bleibt unangetastet. Als Beleg für eine geöffnete Mail
 * ist es zu eng, aus zwei Gründen:
 *
 *   1. Der frühere Vorabbogen trägt beides nicht. Seine Zeile wird zwar ohne
 *      Antworten angelegt, beim Absenden füllt `submit-bewerber-formular` sie
 *      aber mit den Antworten des eigenen Katalogs, also mit `region`,
 *      `beschaeftigung` und so fort. Ein ausgefüllter Vorabbogen ist deshalb
 *      eine Zeile mit Inhalt, nur eben ohne `bogen` und ohne `weg`.
 *   2. `submit-bewerber-formular` ersetzt beim Absenden die ganze Spalte
 *      `antworten` durch die geprüften Angaben. Das beim Anlegen gesetzte
 *      Kennzeichen `bogen` überlebt das Absenden also gar nicht.
 *
 * Christians Entscheidung vom 16.09.2026: Beide Bögen zählen als Beleg. Beide
 * Links stehen ausschließlich in einer Mail von uns. Wer einen davon
 * abgeschickt hat, hat also eine Mail bekommen und geöffnet.
 *
 * ## Warum der Status allein genügt
 *
 * Auf `eingereicht` setzt eine Zeile im ganzen System genau eine Stelle:
 * `submit-bewerber-formular`, und nur gegen ein gültiges, nicht abgelaufenes
 * Token aus der Mail. Der Vorgabewert der Spalte ist `offen`, das Aufräumen
 * setzt `abgelaufen`, ein neuer Versand setzt `ersetzt`. Es gibt keinen Weg,
 * auf dem eine Zeile ohne Zutun des Bewerbers auf `eingereicht` landet.
 *
 * Nach dem Inhalt der Antworten wird bewusst nicht gefragt. Der Beleg ist das
 * Absenden selbst und nicht, was dabei angekreuzt wurde.
 */
export function istAusgefuellterBogen(zeile: KennenlernLinkZeile | null | undefined): boolean {
  return String(zeile?.status ?? "").trim() === "eingereicht";
}

/**
 * Wurde diese Zeile nur für einen Link angelegt, ohne dass eine Mail hinausging?
 *
 * „Link kopieren" und „So sieht es aus" in der Akte erzeugen bei Bedarf still
 * einen Token. Ohne dieses Kennzeichen sähe die Liste danach ein Briefsymbol
 * und die Akte „Die Einladung ging am … hinaus", obwohl nichts verschickt
 * wurde. Der Versand entfernt das Kennzeichen, sobald die Mail wirklich
 * hinausgeht.
 */
export function ohneMailErzeugt(antworten: unknown): boolean {
  if (!antworten || typeof antworten !== "object") return false;
  return (antworten as Record<string, unknown>).ohneMail === true;
}

export function kennenlernLink(token: string): string {
  return `${KENNENLERNEN_BASIS}/${token}`;
}

/** Jüngste zuerst. Die Abfragen bestellen so, hier wird es sicherheitshalber wiederholt. */
function jüngsteZuerst<T extends KennenlernLinkZeile>(zeilen: readonly T[]): T[] {
  return [...zeilen].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

/** Nur die Zeilen des Kennenlernbogens, jüngste zuerst. */
export function kennenlernZeilen<T extends KennenlernLinkZeile>(
  zeilen: readonly T[] | null | undefined,
): T[] {
  return jüngsteZuerst(zeilen ?? []).filter((z) => istKennenlernZeile(z.antworten));
}

function abgelaufen(zeile: KennenlernLinkZeile, jetzt: Date): boolean {
  if (!zeile.expires_at) return false;
  const ablauf = new Date(zeile.expires_at);
  return !Number.isNaN(ablauf.getTime()) && ablauf.getTime() <= jetzt.getTime();
}

export function kennenlernLinkStand(
  zeilen: readonly KennenlernLinkZeile[] | null | undefined,
  jetzt: Date = new Date(),
): KennenlernLinkStand {
  const alle = zeilen ?? [];
  const eigene = kennenlernZeilen(alle);

  const offen = eigene.find((z) => z.status === "offen" && !!z.token && !abgelaufen(z, jetzt));
  if (offen?.token) {
    return {
      art: "gueltig",
      token: offen.token,
      link: kennenlernLink(offen.token),
      laeuftAbAm: String(offen.expires_at || ""),
    };
  }

  const eingereicht = eigene.find((z) => z.status === "eingereicht" && !!z.token);
  if (eingereicht?.token) {
    return { art: "eingereicht", token: eingereicht.token, link: kennenlernLink(eingereicht.token) };
  }

  if (eigene.length === 0) {
    return { art: "fehlt", grund: alle.length > 0 ? "nur_vorabbogen" : "keiner" };
  }
  // Es gibt Kennenlern-Zeilen, aber keine brauchbare: entweder abgelaufen
  // (auch ein noch „offener" Status mit verstrichenem Datum) oder ersetzt.
  const warOffen = eigene.some((z) => z.status === "offen" || z.status === "abgelaufen");
  return { art: "fehlt", grund: warOffen ? "abgelaufen" : "ersetzt" };
}

/** Muss für Kopieren oder Ansehen erst ein neuer Token her? Verengt den Typ, damit `link` danach sicher da ist. */
export function brauchtNeuenLink(
  stand: KennenlernLinkStand,
): stand is Extract<KennenlernLinkStand, { art: "fehlt" }> {
  return stand.art === "fehlt";
}
