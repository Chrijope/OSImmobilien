import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { normalisiereTitel } from "@/lib/dokumentGruppen";
import { einheitUnterlagenGruppen, objektUnterlagenEintraege, type EinheitUnterlage } from "@/lib/objektUnterlagenRegeln";
import { OBJEKTDATEN_ROLLEN } from "@/lib/objektdatenZugang";

/**
 * Das Objektpaket für die Finanzierung: Liegen die Unterlagen vor, die ein
 * Finanzierer zu einer Wohnung sehen will?
 *
 * Christian am 27.10.2026: Keine Pflichtfelder beim Anlegen, nichts wird
 * blockiert. Die Prüfung zeigt nur deutlich, was fehlt, und zwar nur den
 * Rollen, die Unterlagen nachreichen können (`darfObjektpaketHinweisSehen`).
 * Die Finanzierungskarte soll dieselbe Funktion später vor dem Einreichen
 * nutzen, deshalb steht hier nichts, was an einer Seite hängt.
 *
 * Erkannt wird eine Unterlage am Titel der Datei (Stichworte in der Form von
 * `normalisiereTitel`) und, bei Dateien aus Investagon, an deren Kategorie.
 * Leere Standardfächer ohne Datei zählen nicht.
 */

interface Pflichtunterlage {
  name: string;
  /** Investagon-Kategorien (Rohwert), die diese Unterlage eindeutig meinen. */
  kategorien: string[];
  /**
   * Feste Dokumentkategorie im CRM (Name des Fachs, seit dem 28.10.2026). Eine
   * Datei in diesem Fach zählt vor jeder Titelprüfung und ohne `mindestens`:
   * Wer sie dort ablegt, hat sie zugeordnet.
   */
  crmKategorie?: string;
  /** Passt der normalisierte Titel? */
  titelPasst: (titel: string) => boolean;
  /** Nur bei einer vermieteten oder gekündigten Einheit nötig. */
  nurVermietet?: boolean;
  /** So viele Dateien oder im Titel genannte Jahre braucht es. */
  mindestens?: number;
}

const wort = (titel: string, w: string) => new RegExp(`(?:^| )${w}(?= |$|\\d)`).test(titel);

/**
 * Festgelegt von Christian am 27.10.2026, hier anpassen.
 *
 * Reihenfolge ist die Anzeige. Eine Unterlage streichen oder ergänzen heißt
 * nur, hier einen Eintrag zu ändern; Seiten und Finanzierungskarte lesen die
 * Liste von hier.
 */
export const FINANZIERUNG_PFLICHTUNTERLAGEN: readonly Pflichtunterlage[] = [
  {
    // Die Aufteilungspläne liegen meist in derselben Datei, sie werden nicht getrennt geprüft.
    name: "Teilungserklärung mit Aufteilungsplänen",
    kategorien: ["declaration_of_division"],
    titelPasst: (t) => t.includes("teilungserklaerung"),
  },
  {
    name: "Grundbuchauszug",
    kategorien: ["land_register"],
    titelPasst: (t) => t.includes("grundbuch") || wort(t, "gb") || wort(t, "gba"),
  },
  {
    name: "Mietvertrag",
    kategorien: ["rental_agreement"],
    crmKategorie: "Mietvertrag",
    titelPasst: (t) => t.includes("mietvertrag"),
    nurVermietet: true,
  },
  {
    name: "Energieausweis",
    kategorien: ["energy_certificate"],
    titelPasst: (t) => t.includes("energieausweis") || t.includes("energiepass"),
  },
  {
    name: "Wirtschaftsplan",
    kategorien: ["economic_plan"],
    crmKategorie: "Wirtschaftsplan",
    titelPasst: (t) => t.includes("wirtschaftsplan"),
  },
  {
    name: "WEG-Protokolle der letzten 3 Jahre",
    kategorien: [],
    crmKategorie: "WEG-Protokolle",
    // „Übergabeprotokoll" ist kein WEG-Protokoll, deshalb braucht „protokoll" einen Bezug zur Gemeinschaft.
    titelPasst: (t) => t.includes("eigentuemerversammlung")
      || (t.includes("protokoll") && (wort(t, "weg") || wort(t, "etv") || t.includes("eigentuemer") || t.includes("versammlung"))),
    mindestens: 3,
  },
  {
    name: "Baubeschreibung",
    kategorien: [],
    titelPasst: (t) => t.includes("baubeschreibung") || t.includes("leistungsbeschreibung"),
  },
];

export interface ObjektpaketErgebnis {
  fehlend: string[];
  vorhanden: string[];
  vollstaendig: boolean;
}

/** Wer den Hinweis sieht: dieselben vier Rollen wie die Gruppe „Objektdaten" (Christian, 27.10.2026). */
export function darfObjektpaketHinweisSehen(rolle: string | null | undefined): boolean {
  return !!rolle && OBJEKTDATEN_ROLLEN.includes(rolle);
}

/** Vermietet oder gekündigt: Es gibt einen Mieter, also auch einen Mietvertrag. */
export function einheitIstVermietet(w: Pick<ObjektWohnung, "vermietet" | "vermietungsStatus">): boolean {
  const status = w.vermietungsStatus ?? (w.vermietet ? "vermietet" : "leerstand");
  return status === "vermietet" || status === "gekuendigt";
}

type Datei = Pick<EinheitUnterlage, "name" | "investagonKategorie">;

function liegtVor(p: Pflichtunterlage, dateien: Datei[]): boolean {
  if (p.crmKategorie && dateien.some((d) => d.name === p.crmKategorie)) return true;
  const treffer = dateien.filter((d) =>
    (!!d.investagonKategorie && p.kategorien.includes(d.investagonKategorie)) || p.titelPasst(normalisiereTitel(d.name)));
  const noetig = p.mindestens ?? 1;
  if (treffer.length >= noetig) return true;
  // Mehrere Jahre in einer Datei („WEG-Protokolle 2023 2024 2025") zählen je Jahr.
  // ponytail: ob die Jahre wirklich die letzten drei sind, prüft das nicht.
  const jahre = new Set(treffer.flatMap((d) => d.name.match(/(?:19|20)\d{2}/g) ?? []));
  return jahre.size >= noetig;
}

/** Prüfung einer Einheit gegen die Dateien zum Objekt und zur Wohnung. */
function pruefeEinheit(objekt: Pick<ObjektData, "dokumente" | "meta">, wohnung: ObjektWohnung): ObjektpaketErgebnis {
  const dateien = einheitUnterlagenGruppen(objekt, wohnung).flatMap((g) => g.eintraege);
  const vermietet = einheitIstVermietet(wohnung);
  const vorhanden: string[] = [];
  const fehlend: string[] = [];
  for (const p of FINANZIERUNG_PFLICHTUNTERLAGEN) {
    if (p.nurVermietet && !vermietet) continue;
    (liegtVor(p, dateien) ? vorhanden : fehlend).push(p.name);
  }
  return { fehlend, vorhanden, vollstaendig: fehlend.length === 0 };
}

const weLabel = (w: ObjektWohnung) => `WE ${(w.weNr || "?").replace(/^WE\s*/i, "")}`;

/**
 * Was für die Finanzierung fehlt.
 *
 * Mit Einheit: die Dateien zum Objekt und zu dieser Wohnung; der Mietvertrag
 * zählt nur, wenn sie vermietet ist.
 *
 * Ohne Einheit (Objektseite, Objektliste): jede noch nicht verkaufte Einheit
 * wird einzeln geprüft. Eine Unterlage gilt als vorhanden, wenn sie bei allen
 * Einheiten vorliegt, für die sie nötig ist. Fehlt sie nur bei einigen, steht
 * dahinter, bei welchen. Ein Objekt ohne Einheiten wird nur mit seinen
 * eigenen Dateien geprüft, der Mietvertrag entfällt dort.
 */
export function fehlendeFinanzierungsunterlagen(
  objekt: Pick<ObjektData, "dokumente" | "meta" | "wohnungen">,
  wohnung?: ObjektWohnung,
): ObjektpaketErgebnis {
  if (wohnung) return pruefeEinheit(objekt, wohnung);

  const einheiten = (objekt.wohnungen || []).filter((w) => w.status !== "verkauft");
  if (einheiten.length === 0) {
    const dateien = objektUnterlagenEintraege(objekt);
    const vorhanden: string[] = [];
    const fehlend: string[] = [];
    for (const p of FINANZIERUNG_PFLICHTUNTERLAGEN) {
      if (p.nurVermietet) continue;
      (liegtVor(p, dateien) ? vorhanden : fehlend).push(p.name);
    }
    return { fehlend, vorhanden, vollstaendig: fehlend.length === 0 };
  }

  const je = einheiten.map((w) => ({ w, e: pruefeEinheit(objekt, w) }));
  const vorhanden: string[] = [];
  const fehlend: string[] = [];
  for (const p of FINANZIERUNG_PFLICHTUNTERLAGEN) {
    const betroffen = je.filter(({ e }) => e.fehlend.includes(p.name) || e.vorhanden.includes(p.name));
    if (betroffen.length === 0) continue; // etwa der Mietvertrag, wenn nichts vermietet ist
    const ohne = betroffen.filter(({ e }) => e.fehlend.includes(p.name)).map(({ w }) => weLabel(w));
    if (ohne.length === 0) vorhanden.push(p.name);
    else if (ohne.length === betroffen.length) fehlend.push(p.name);
    else fehlend.push(`${p.name} (${ohne.length > 3 ? `${ohne.slice(0, 3).join(", ")} und ${ohne.length - 3} weitere` : ohne.join(", ")})`);
  }
  return { fehlend, vorhanden, vollstaendig: fehlend.length === 0 };
}
