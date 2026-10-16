/**
 * Exposés aus einem Ordner den Einheiten zuordnen (Christian, 16.10.2026).
 *
 * Der Ordner „OSImmobilien Exposés“ enthält je Einheit eine fertige PDF,
 * etwa „Barfusstraße 9/Exposé Barfusstraße 9 WE03.pdf“. Hier steht nur die
 * reine Zuordnung, ohne Datenbank und ohne Speicher: Dateiname → Objekt und
 * Einheit. Hochgeladen wird erst im Dialog „Exposés zuordnen“ auf der Seite
 * Objekte, und erst nach Bestätigung.
 *
 * REGELN
 *
 *   Datei      nur PDFs, deren Name mit „Exposé“ beginnt. Alles unter
 *              `_Generator/` und alle übrigen Dateien bleiben liegen.
 *   Objekt     Straße und Hausnummer aus dem Dateinamen gegen Adresse und
 *              Titel des Objekts. „Barfusstraße“, „Barfußstr.“ und
 *              „Barfussstraße“ gelten als dieselbe Straße.
 *   Einheit    mit WE-Nummer: die Einheit mit derselben Nummer („WE03“ = „3“
 *              = „WE 3“), über `eigeneEinheitNummer` wie beim Grundriss.
 *              Ohne WE-Nummer (Zossen): eine Einheit, deren Bezeichnung oder
 *              Lage die Adresse nennt, sonst die einzige Einheit des
 *              Objekts, sonst das Objekt selbst, wenn es keine Einheiten hat.
 *   Unklar     alles andere. Unklares wird nie hochgeladen, nie geraten.
 *
 * Gespeichert wird die PDF unverändert. Der Name der Unterlage ist der
 * Dateiname ohne „.pdf“; nur der technische Ablagepfad ist vereinfacht.
 */
import { eigeneEinheitNummer, einheitNummern } from "../../supabase/functions/_shared/grundriss-erkennung.ts";

export interface ExposeDatei {
  /** Pfad im gewählten Ordner, etwa „OSImmobilien Exposés/Barfusstraße 9/Exposé … WE03.pdf“. */
  pfad: string;
  /** Der Dateiname allein. */
  name: string;
}

/** Was die Zuordnung von einem Objekt braucht. */
export interface ZuordnungsObjekt {
  id: string;
  titel: string;
  adresse: string;
  wohnungen: Array<{ id: string; weNr: string; lage?: string; etage?: string; dokumente?: Array<{ name: string; url: string }> }>;
  dokumente?: Array<{ name: string; url: string }>;
}

export type ExposeZuordnung =
  | {
    art: "einheit";
    datei: ExposeDatei;
    dokumentName: string;
    objektId: string;
    objektTitel: string;
    wohnungId: string;
    weNr: string;
    /** Eine Unterlage mit diesem Namen hängt schon an der Einheit. */
    schonDa: boolean;
  }
  | {
    art: "objekt";
    datei: ExposeDatei;
    dokumentName: string;
    objektId: string;
    objektTitel: string;
    schonDa: boolean;
  }
  | { art: "unklar"; datei: ExposeDatei; dokumentName: string; grund: string }
  | { art: "ignoriert"; datei: ExposeDatei; grund: string };

/** Klein, ohne Akzente, „ß“ als „ss“, Straße als „str“, doppelte Buchstaben einfach. */
export function adressSchluessel(text: string): string {
  return (text || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/strasse|str\./g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    // „barfusstr“ und „barfussstr“ (aus „Barfußstraße“) werden gleich.
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

/** Straße und Hausnummer aus einem Dateinamen, ohne „Exposé“ und WE-Angabe. */
export function adresseAusDateiname(name: string): { strasse: string; hausnummer: string } | null {
  const ohneEndung = name.replace(/\.pdf$/i, "").normalize("NFC");
  const ohneWort = ohneEndung.replace(/^expos[eé]\s*/i, "");
  const ohneWe = ohneWort.replace(/\b(?:we|whg|wohnung)[\s._-]*\d+[a-z]?\b.*$/i, "").trim();
  const treffer = /^(.*?\D)\s*(\d+\s*[a-z]?)$/i.exec(ohneWe);
  if (!treffer) return null;
  const strasse = adressSchluessel(treffer[1]);
  const hausnummer = treffer[2].replace(/\s+/g, "").toLowerCase();
  return strasse ? { strasse, hausnummer } : null;
}

/** Nennt der Text diese Straße mit dieser Hausnummer? „38“ passt zu „38 a“, nicht zu „381“. */
function nenntAdresse(text: string, a: { strasse: string; hausnummer: string }): boolean {
  const s = adressSchluessel(text);
  const nummer = a.hausnummer.replace(/[a-z]$/, "");
  const muster = new RegExp(`(?:^| )${a.strasse} ${nummer}(?![0-9])`);
  return muster.test(s);
}

function istExpose(datei: ExposeDatei): string | null {
  const teile = datei.pfad.split("/");
  if (teile.some((t) => t.startsWith("_"))) return "Hilfsordner (_Generator)";
  if (!/\.pdf$/i.test(datei.name)) return "keine PDF";
  if (!/^expos[eé](?![a-z])/i.test(datei.name.normalize("NFC"))) return "kein Exposé im Namen";
  return null;
}

/** Hängt schon eine Unterlage dieses Namens oder mit diesem Ablagepfad dort? */
function vorhanden(doks: Array<{ name: string; url: string }> | undefined, name: string, dateiTeil: string): boolean {
  return (doks ?? []).some((d) => d.name === name || (d.url || "").endsWith(dateiTeil));
}

/** Der technische Dateiname im Speicher: nur Kleinbuchstaben, Ziffern und Bindestriche. */
export function speicherDateiname(name: string): string {
  const basis = name.replace(/\.pdf$/i, "").normalize("NFC").toLowerCase().replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${basis || "expose"}.pdf`;
}

/**
 * Der Ablagepfad. Eine Einheit landet unter `objekte/<id>/wohnungen/<wid>/…`,
 * ein Objekt unter `objekte/<id>/dokumente/…`; beides ist nach
 * `eimerFuerObjektDatei` der geschützte Eimer `objekt-dokumente`.
 */
export function exposeAblagePfad(z: Extract<ExposeZuordnung, { art: "einheit" | "objekt" }>): string {
  const datei = speicherDateiname(z.datei.name);
  return z.art === "einheit"
    ? `objekte/${z.objektId}/wohnungen/${z.wohnungId}/${datei}`
    : `objekte/${z.objektId}/dokumente/${datei}`;
}

export function exposeZuordnen(datei: ExposeDatei, objekte: ZuordnungsObjekt[]): ExposeZuordnung {
  const ignoriert = istExpose(datei);
  if (ignoriert) return { art: "ignoriert", datei, grund: ignoriert };

  const dokumentName = datei.name.replace(/\.pdf$/i, "").normalize("NFC");
  const dateiTeil = `/${speicherDateiname(datei.name)}`;
  const unklar = (grund: string): ExposeZuordnung => ({ art: "unklar", datei, dokumentName, grund });
  const adresse = adresseAusDateiname(datei.name);
  if (!adresse) return unklar("Keine Adresse im Dateinamen erkannt");

  const we = einheitNummern(dokumentName)[0];
  const passendeObjekte = objekte.filter((o) => nenntAdresse(o.adresse, adresse) || nenntAdresse(o.titel, adresse));

  if (we) {
    if (passendeObjekte.length === 0) return unklar(`Kein Objekt mit der Adresse „${adresse.strasse} ${adresse.hausnummer}“ gefunden`);
    const treffer = passendeObjekte.flatMap((o) =>
      o.wohnungen.filter((w) => eigeneEinheitNummer(w.weNr) === we).map((w) => ({ o, w })));
    if (treffer.length === 0) {
      const titel = passendeObjekte.map((o) => o.titel).join(", ");
      return unklar(`WE ${we} gibt es in ${titel} nicht`);
    }
    if (treffer.length > 1) return unklar(`WE ${we} ist mehrdeutig (${treffer.length} Einheiten)`);
    const { o, w } = treffer[0];
    return {
      art: "einheit", datei, dokumentName, objektId: o.id, objektTitel: o.titel, wohnungId: w.id, weNr: w.weNr,
      schonDa: vorhanden(w.dokumente, dokumentName, dateiTeil),
    };
  }

  // Ohne WE-Nummer: zuerst eine Einheit, die die Adresse selbst nennt.
  const nachBezeichnung = objekte.flatMap((o) =>
    o.wohnungen.filter((w) => nenntAdresse(`${w.weNr} ${w.lage ?? ""} ${w.etage ?? ""}`, adresse)).map((w) => ({ o, w })));
  if (nachBezeichnung.length === 1) {
    const { o, w } = nachBezeichnung[0];
    return {
      art: "einheit", datei, dokumentName, objektId: o.id, objektTitel: o.titel, wohnungId: w.id, weNr: w.weNr,
      schonDa: vorhanden(w.dokumente, dokumentName, dateiTeil),
    };
  }
  if (nachBezeichnung.length > 1) return unklar(`${nachBezeichnung.length} Einheiten nennen diese Adresse`);
  if (passendeObjekte.length === 0) return unklar(`Kein Objekt mit der Adresse „${adresse.strasse} ${adresse.hausnummer}“ gefunden`);
  if (passendeObjekte.length > 1) return unklar(`${passendeObjekte.length} Objekte mit dieser Adresse`);
  const o = passendeObjekte[0];
  if (o.wohnungen.length === 1) {
    const w = o.wohnungen[0];
    return {
      art: "einheit", datei, dokumentName, objektId: o.id, objektTitel: o.titel, wohnungId: w.id, weNr: w.weNr,
      schonDa: vorhanden(w.dokumente, dokumentName, dateiTeil),
    };
  }
  if (o.wohnungen.length === 0) {
    return { art: "objekt", datei, dokumentName, objektId: o.id, objektTitel: o.titel, schonDa: vorhanden(o.dokumente, dokumentName, dateiTeil) };
  }
  return unklar(`${o.titel} hat ${o.wohnungen.length} Einheiten, im Dateinamen steht keine WE-Nummer`);
}

/** Alle Dateien, sortiert nach Pfad. Zwei Dateien für dieselbe Einheit werden beide unklar. */
export function exposesZuordnen(dateien: ExposeDatei[], objekte: ZuordnungsObjekt[]): ExposeZuordnung[] {
  const liste = [...dateien]
    .sort((a, b) => a.pfad.localeCompare(b.pfad, "de", { numeric: true }))
    .map((d) => exposeZuordnen(d, objekte));
  const ziel = (z: ExposeZuordnung) => (z.art === "einheit" ? `w:${z.wohnungId}` : z.art === "objekt" ? `o:${z.objektId}` : null);
  const zaehler = new Map<string, number>();
  for (const z of liste) { const k = ziel(z); if (k) zaehler.set(k, (zaehler.get(k) ?? 0) + 1); }
  return liste.map((z) => {
    const k = ziel(z);
    if (!k || (zaehler.get(k) ?? 0) < 2 || z.art === "ignoriert" || z.art === "unklar") return z;
    return { art: "unklar", datei: z.datei, dokumentName: z.dokumentName, grund: "Mehrere Exposés für dieselbe Einheit" };
  });
}
