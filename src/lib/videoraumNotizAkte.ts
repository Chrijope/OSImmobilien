/**
 * Die Gespraechsnotiz aus dem Videoraum in die Kundenakte bringen.
 *
 * ## Das Problem
 *
 * Was ein Berater im Gespraech ins Notizfeld tippt, landete bisher nur in
 * `videoraeume.notiz`. Gelesen wurde das an genau einer Stelle, auf der
 * Gastgeberseite desselben Raumes. Im Kundenprofil stand nichts, und wer den
 * Raum loeschte, loeschte die Notiz mit.
 *
 * ## Wann abgelegt wird
 *
 * Beim Auflegen. Dann ist das Gespraech vorbei und der Text fertig. Laufend
 * mitzuschreiben haette zwanzig halbe Fassungen desselben Gedankens in den
 * Verlauf gestellt.
 *
 * ## Warum genau ein Eintrag je Raum
 *
 * Christians Vorgabe: alles aus einem Gespraech gehoert in EINE Notiz. Wer
 * den Raum spaeter wieder oeffnet und den Text ergaenzt, bekommt deshalb
 * keinen zweiten Eintrag, sondern der vorhandene wird fortgeschrieben. Im
 * Profil steht damit immer der vollstaendige Stand und nicht zwei Haelften.
 *
 * Wiedergefunden wird der Eintrag ueber eine Marke im `meta` des Raums. Der
 * Weg ueber `meta` und nicht ueber eine Suche im Verlauf, weil die Suche ein
 * eindeutiges Merkmal am Eintrag braeuchte, das es dort nicht gibt: Die
 * Tabelle `aktivitaeten` kennt weder eine Raum- noch eine Investmentkennung.
 * Die Marke traegt zusaetzlich den zuletzt abgelegten Text, damit sich ohne
 * weitere Abfrage beantworten laesst, ob sich ueberhaupt etwas geaendert hat.
 *
 * ## Was hier bewusst nicht passiert
 *
 * Die Notiz bleibt zusaetzlich am Raum stehen. Nichts wird verschoben, nichts
 * geloescht, wer den Raum spaeter oeffnet, findet seinen Text wieder.
 *
 * Und nichts hiervon darf das Auflegen aufhalten. Jeder Fehlschlag geht in
 * die Konsole und kommt als Ergebniswert zurueck, es fliegt nie eine
 * Ausnahme.
 */

import { ladeRaum, speichereRaumMeta, type Videoraum } from "./videoraumStore";
import { addAktivitaetSicher, aktivitaetExistiert, updateAktivitaet } from "./aktivitaetenStore";

/** Schluessel der Merkmarke im `meta` des Raums. */
const META_SCHLUESSEL = "notizAktivitaet";

export type NotizAblageErgebnis =
  /** Neu in der Kundenakte angelegt. */
  | "abgelegt"
  /** Der vorhandene Eintrag wurde fortgeschrieben. */
  | "aktualisiert"
  /** Derselbe Text steht schon in der Akte. */
  | "unveraendert"
  /** Nichts getippt, also auch nichts anzulegen. */
  | "leer"
  /** Spontaner Raum ohne Kontakt. Es gibt keine Akte, in die etwas koennte. */
  | "kein_kontakt"
  /** Datenbank oder Berechtigung. Der Berater merkt davon nichts. */
  | "fehlgeschlagen";

interface Merkmarke {
  aktivitaetId: string;
  text: string;
}

function leseMarke(meta: unknown): Merkmarke | null {
  const roh = (meta as Record<string, unknown> | null | undefined)?.[META_SCHLUESSEL];
  if (!roh || typeof roh !== "object") return null;
  const { aktivitaetId, text } = roh as Record<string, unknown>;
  if (typeof aktivitaetId !== "string" || !aktivitaetId) return null;
  return { aktivitaetId, text: typeof text === "string" ? text : "" };
}

/**
 * Die Ueberschrift des Eintrags im Verlauf.
 *
 * Das Datum kommt aus dem Raum und nicht aus der Uhr: Der Titel darf sich
 * beim Fortschreiben nicht aendern, sonst traegt derselbe Eintrag morgen ein
 * anderes Datum als das Gespraech.
 */
export function baueNotizTitel(raum: Pick<Videoraum, "titel" | "art" | "termin_at" | "created_at">): string {
  const name = raum.titel?.trim()
    || (raum.art === "objektvorstellung" ? "Objektvorstellung" : "Beratungsgespräch");
  const roh = raum.termin_at || raum.created_at;
  const zeitpunkt = roh ? new Date(roh) : null;
  const datum = zeitpunkt && !Number.isNaN(zeitpunkt.getTime())
    ? zeitpunkt.toLocaleDateString("de-DE")
    : "";
  return datum ? `Gesprächsnotiz: ${name} vom ${datum}` : `Gesprächsnotiz: ${name}`;
}

/**
 * Das Investment als Zeile ueber dem Text.
 *
 * Die Tabelle `aktivitaeten` hat kein Feld fuer ein Investment, und keine
 * Ansicht filtert den Verlauf danach. Damit die Notiz trotzdem sagt, um
 * welches Objekt es ging, steht es im Text. Schlaegt das Nachschlagen fehl,
 * bleibt die Zeile weg; das ist kein Grund, die Notiz zu verlieren.
 */
async function investmentZeile(investmentId: string | null): Promise<string> {
  if (!investmentId) return "";
  try {
    const { getInvestmentById } = await import("./investmentsStore");
    const inv = getInvestmentById(investmentId);
    if (!inv) return "";
    const name = [inv.objektTitel, inv.weNr ? `WE ${inv.weNr}` : ""]
      .filter(Boolean).join(", ") || inv.label;
    return name ? `Investment: ${name}` : "";
  } catch (e) {
    console.warn("videoraumNotizAkte, Investment nicht nachgeschlagen:", e);
    return "";
  }
}

async function ablegen(raumId: string, notiz: string, von?: string): Promise<NotizAblageErgebnis> {
  const text = (notiz || "").trim();
  if (!raumId || !text) return "leer";

  try {
    // Frisch geladen, damit die Marke des letzten Auflegens auch dann steht,
    // wenn die Seite seitdem nicht neu aufgebaut wurde.
    const raum = await ladeRaum(raumId);
    if (!raum) return "fehlgeschlagen";
    if (!raum.kontakt_id) return "kein_kontakt";

    const meta = (raum.meta || {}) as Record<string, unknown>;
    const marke = leseMarke(meta);
    if (marke && marke.text === text) return "unveraendert";

    const beschreibung = baueNotizTitel(raum);
    const details = [await investmentZeile(raum.investment_id), text]
      .filter(Boolean).join("\n\n");

    const merke = async (aktivitaetId: string) => {
      const ok = await speichereRaumMeta(raumId, {
        ...meta,
        [META_SCHLUESSEL]: { aktivitaetId, text } satisfies Merkmarke,
      });
      // Ohne Marke entstuende beim naechsten Auflegen ein zweiter Eintrag.
      if (!ok) console.warn("videoraumNotizAkte: Merkmarke nicht am Raum gesichert.");
    };

    // Fortschreiben, solange es den gemerkten Eintrag noch gibt. Ist er von
    // Hand geloescht worden, entsteht ein neuer: Ein fehlender Eintrag ist
    // kein Grund, die Notiz verschwinden zu lassen.
    if (marke && await aktivitaetExistiert(marke.aktivitaetId)) {
      // Nur Text und Ueberschrift, `datum` bleibt unangetastet. Sonst
      // spraenge die Notiz im Verlauf nach oben und saehe aus, als waere
      // gerade etwas passiert.
      // `still`, weil der Berater diese Aenderung nicht angestossen hat: Eine
      // Fehlermeldung waere fuer ihn beim Auflegen nicht zuzuordnen.
      await updateAktivitaet(marke.aktivitaetId, { beschreibung, details }, { still: true });
      await merke(marke.aktivitaetId);
      return "aktualisiert";
    }

    const eintrag = await addAktivitaetSicher({
      kundeId: raum.kontakt_id,
      art: "notiz",
      beschreibung,
      details,
      von,
    });
    if (!eintrag) return "fehlgeschlagen";
    await merke(eintrag.id);
    return "abgelegt";
  } catch (e) {
    console.error("videoraumNotizAkte:", e);
    return "fehlgeschlagen";
  }
}

/**
 * Laeufe je Raum hintereinander, nicht nebeneinander.
 *
 * Zwei schnell aufeinanderfolgende Aufrufe duerfen nicht beide die noch
 * fehlende Marke lesen und je einen Eintrag anlegen. Dasselbe Muster wie in
 * `notizSpeicher`.
 */
const laufend = new Map<string, Promise<NotizAblageErgebnis>>();

/**
 * Die Gespraechsnotiz des Raums in der Kundenakte ablegen oder fortschreiben.
 *
 * Wirft nie. Das Auflegen ist wichtiger als der Eintrag.
 */
export function legeGespraechsnotizAb(
  raumId: string,
  notiz: string,
  von?: string,
): Promise<NotizAblageErgebnis> {
  const vorher = laufend.get(raumId) || Promise.resolve<NotizAblageErgebnis>("leer");
  const naechster = vorher
    .catch(() => undefined)
    .then(() => ablegen(raumId, notiz, von));
  laufend.set(raumId, naechster);
  void naechster.finally(() => {
    if (laufend.get(raumId) === naechster) laufend.delete(raumId);
  });
  return naechster;
}
