// Erkennt, ob ein eingehender Lead zu einem bereits vorhandenen Kontakt gehoert.
//
// Das Vorgehen ist bewusst dasselbe wie in der Datenbankfunktion
// `create_empfehlung_kontakt` (Migration 20260623094942): E-Mail-Adressen
// werden ohne Ruecksicht auf Gross- und Kleinschreibung verglichen, und
// Telefonnummern werden auf ihre reine Ziffernfolge reduziert
// (`regexp_replace(telefon, '[^0-9]', '', 'g')`), wobei Nummern mit weniger
// als sechs Ziffern gar nicht erst verglichen werden. Es gibt absichtlich
// keine zweite, eigene Normalisierung, sonst haetten Datenbank und Edge
// Function zwei verschiedene Vorstellungen davon, was dieselbe Nummer ist.
//
// An einer Stelle ist diese Pruefung strenger als die Datenbankfunktion: Eine
// gleiche Telefonnummer allein legt nichts zusammen. Zwei Kollegen unter
// derselben Firmennummer, ein Ehepaar am Festnetz oder eine Zentrale wuerden
// sonst zu einer einzigen Person verschmelzen. Ein falsches Zusammenlegen ist
// schlimmer als eine Dublette, deshalb muss beim Telefontreffer zusaetzlich der
// Nachname uebereinstimmen. Unscharfe Vergleiche gibt es nirgends.

export interface DublettenKandidat {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
}

export interface DublettenAnfrage {
  email?: string | null;
  telefon?: string | null;
  nachname?: string | null;
}

export type DublettenTreffer =
  | { art: "keine" }
  | { art: "email"; id: string; name: string }
  | { art: "telefon"; id: string; name: string }
  | { art: "mehrdeutig"; grund: "email" | "telefon"; anzahl: number };

/** Reine Ziffernfolge einer Telefonnummer, wie regexp_replace in der Datenbank. */
export function nurZiffern(telefon: string | null | undefined): string {
  return String(telefon || "").replace(/[^0-9]/g, "");
}

/**
 * Vergleichsform einer Telefonnummer. Leer, wenn zu wenig Ziffern uebrig
 * bleiben: Bei unter sechs Ziffern ist die Nummer als Kennzeichen einer Person
 * wertlos, das sieht die Datenbankfunktion genauso.
 */
export function telefonVergleichsform(telefon: string | null | undefined): string {
  const ziffern = nurZiffern(telefon);
  return ziffern.length >= 6 ? ziffern : "";
}

/** Vergleichsform einer E-Mail-Adresse: ohne Randleerzeichen, klein. */
export function emailVergleichsform(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Vergleichsform eines Nachnamens. Der Platzhalter "—", den die Lead-Annahme
 * setzt, wenn ein Formular nur einen einzelnen Namen liefert, zaehlt als
 * unbekannt und darf nie als Uebereinstimmung durchgehen.
 */
export function nachnameVergleichsform(nachname: string | null | undefined): string {
  const wert = String(nachname || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!wert || wert === "—" || wert === "-" || wert === "?") return "";
  return wert;
}

/**
 * Sucht den bestehenden Kontakt, zu dem die neue Anfrage gehoert.
 *
 * Reihenfolge: erst die E-Mail-Adresse, sie gehoert in aller Regel genau einer
 * Person. Erst wenn es dort keinen Treffer gibt, zaehlt die Telefonnummer, und
 * dann nur zusammen mit gleichem Nachnamen.
 *
 * Passen mehrere verschiedene Kontakte, wird nichts zusammengelegt. Die Wahl
 * waere geraten, und Raten ist genau das, was hier nicht passieren darf.
 */
export function findeKontaktDublette(
  anfrage: DublettenAnfrage,
  kandidaten: DublettenKandidat[],
): DublettenTreffer {
  const email = emailVergleichsform(anfrage.email);
  const telefon = telefonVergleichsform(anfrage.telefon);
  const nachname = nachnameVergleichsform(anfrage.nachname);

  if (email) {
    const treffer = eindeutigeKontakte(
      kandidaten.filter((k) => emailVergleichsform(k.email) === email),
    );
    if (treffer.length === 1) {
      return { art: "email", id: treffer[0].id, name: anzeigename(treffer[0]) };
    }
    if (treffer.length > 1) {
      return { art: "mehrdeutig", grund: "email", anzahl: treffer.length };
    }
  }

  if (telefon && nachname) {
    const treffer = eindeutigeKontakte(
      kandidaten.filter(
        (k) =>
          telefonVergleichsform(k.telefon) === telefon &&
          nachnameVergleichsform(k.nachname) === nachname,
      ),
    );
    if (treffer.length === 1) {
      return { art: "telefon", id: treffer[0].id, name: anzeigename(treffer[0]) };
    }
    if (treffer.length > 1) {
      return { art: "mehrdeutig", grund: "telefon", anzahl: treffer.length };
    }
  }

  return { art: "keine" };
}

/** Dieselbe Zeile kann ueber mehrere Wege in die Kandidatenliste geraten. */
function eindeutigeKontakte(kandidaten: DublettenKandidat[]): DublettenKandidat[] {
  const nachId = new Map<string, DublettenKandidat>();
  for (const k of kandidaten) {
    if (k?.id) nachId.set(k.id, k);
  }
  return [...nachId.values()];
}

function anzeigename(kandidat: DublettenKandidat): string {
  return `${(kandidat.vorname || "").trim()} ${(kandidat.nachname || "").trim()}`.trim();
}
