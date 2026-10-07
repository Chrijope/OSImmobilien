/**
 * Das Ergebnis eines festen Termins am Kontakt: Stattgefunden, No-Show,
 * Verschoben.
 *
 * Feste Termine sind die Datumsfelder am Kontakt und an seinen Investments
 * (Setter-Termin, `meta.erstgespraechAm`, `meta.beratungsgespraechAm`, siehe
 * `festeTermine` in `kontaktTermine.ts`). Hinter ihnen steht keine
 * Termin-Zeile im Verlauf, deshalb laufen sie nicht ueber
 * `terminErgebnis.ts`, sondern hierueber.
 *
 * Drei Stellen rufen dieselben Funktionen: der Ergebnis-Kasten zum
 * Setter-Termin, der Ergebnis-Kasten zu den uebrigen vergangenen Erst- und
 * Beratungsgespraechen und die Rueckfrage am Haken der Kachel "Naechste
 * Aktion". So gibt es fuer feste Termine nur eine Fassung der No-Show-Kette.
 *
 * Die NoShow-Stufe selbst setzt `setzeNoShowStufe` aus `terminErgebnis.ts`,
 * dieselbe Funktion wie bei gebuchten Terminen.
 *
 * Seit 29.09.2026 gilt: Der Lead bleibt nach einem No-Show beim zustaendigen
 * Vertriebspartner. Nichts wird an eine Setterin zurueckgegeben oder
 * umgehaengt, die Setter-Rolle ruht.
 */

import { addAktivitaet, addGeteilteAufgabe } from "./aktivitaetenStore";
import { aktuellerZustaendiger, notifyUser } from "./bellNotifications";
import { getInvestmentsByKontakt, updateInvestment } from "./investmentsStore";
import { getEffectivePipelineStufe } from "./kontaktPipeline";
import { erledigteTermine, mitKontaktMeta } from "./kontaktTermine";
import { festerTerminSchluessel, noShowErfasst, noShowMetaPatch } from "./kundenNaechsteAktion";
import { mergeKontaktMetaMitGrund, updateKontakt, type KundeData } from "./kundenStore";
import { fortschrittsRang, istEndzustand } from "./pipelineStufen";
import { lokalesDatum, schliesseOffeneTermineZumZeitpunkt, setzeNoShowStufe } from "./terminErgebnis";

export type FesteGespraechsArt = "Erstgespräch" | "Beratungsgespräch";

/** Nur diese beiden festen Termine haben eine No-Show-Kette. */
export function festeGespraechsArt(titel?: string | null): FesteGespraechsArt | null {
  const t = (titel || "").trim();
  return t === "Erstgespräch" || t === "Beratungsgespräch" ? t : null;
}

export function noShowStufeFuer(art: FesteGespraechsArt): "eg_noshow" | "bg_noshow" {
  return art === "Erstgespräch" ? "eg_noshow" : "bg_noshow";
}

/**
 * Der naechste Schritt nach einem geplatzten Termin. Derselbe Wortlaut steht
 * als Titel im Leitfaden (`nextStepsGuide.ts`), der Test haelt beide gleich.
 */
export function neuerTerminSchritt(art: FesteGespraechsArt): string {
  return art === "Erstgespräch" ? "Neuen Erstgesprächstermin vereinbaren" : "Neuen Beratungstermin vereinbaren";
}

/**
 * Welche Stufe ein stattgefundener Termin setzt, oder `null` fuer keine.
 *
 * Beratungsgespraech: der Vorgang steht mindestens dort, auch nach einem
 * frueheren BG NoShow. Erstgespraech: nur ein EG NoShow heilt zurueck auf
 * "Erstgespraech", sonst bleibt die Stufe, bis das Beratungsgespraech
 * eingebucht ist (Leitfaden "erstgespraech_geplant"). Nie zurueck, nie an
 * einem verlorenen Vorgang.
 */
export function stufeNachStattgefunden(art: FesteGespraechsArt | null, jetzige: string | null | undefined): string | null {
  if (!art || istEndzustand(jetzige)) return null;
  if (art === "Erstgespräch") return jetzige === "eg_noshow" ? "erstgespraech_geplant" : null;
  if (jetzige === "beratungsgespraech") return null;
  return fortschrittsRang(jetzige) <= fortschrittsRang("beratungsgespraech") ? "beratungsgespraech" : null;
}

/** Nach dem Verschieben steht wieder ein Termin: die NoShow-Stufe heilt. */
export function stufeNachVerschieben(art: FesteGespraechsArt | null, jetzige: string | null | undefined): string | null {
  if (!art || jetzige !== noShowStufeFuer(art)) return null;
  return art === "Erstgespräch" ? "erstgespraech_geplant" : "beratungsgespraech";
}

/** Welche Antworten die Rueckfrage am Haken anbietet. */
export type RueckfrageWahl = "stattgefunden" | "nicht_stattgefunden" | "behalten";

/**
 * Die Knoepfe der Rueckfrage am Haken eines festen Termins.
 *
 * Seit 01.10.2026 immer alle drei, auch vor dem Termin: Christian will jeden
 * Termin jederzeit abschliessen koennen. "Behalten" bleibt als Weg zurueck.
 */
export function rueckfrageOptionen(): Array<{ wert: RueckfrageWahl; text: string }> {
  return [
    { wert: "stattgefunden", text: "Stattgefunden" },
    { wert: "nicht_stattgefunden", text: "Nicht stattgefunden" },
    { wert: "behalten", text: "Behalten" },
  ];
}

export interface FesterTerminAngabe {
  /** "Erstgespräch", "Beratungsgespräch" oder etwa "Notartermin". */
  titel: string;
  /** YYYY-MM-DD */
  datum: string;
  uhrzeit?: string;
  /**
   * Der Setter-Termin am Kontakt (`setterTerminDatum`). Nur er traegt
   * `terminErgebnis` und die No-Show-Historie, die Auswertungen lesen sie.
   */
  setterTermin?: boolean;
}

/** Aus Titel und `festerTerminSchluessel` ("YYYY-MM-DD HH:MM") wieder ein Termin. */
export function festerTerminAusSchluessel(titel: string, schluessel: string): FesterTerminAngabe {
  const [datum, uhrzeit] = schluessel.trim().split(" ");
  return { titel, datum: datum || "", uhrzeit: uhrzeit || undefined };
}

export interface FesterTerminKontext {
  kunde: KundeData;
  userName: string;
  melde: (meldung: { title: string; description?: string; variant?: "destructive" }) => void;
}

function wannText(t: FesterTerminAngabe): string {
  const [j, m, d] = t.datum.slice(0, 10).split("-");
  const datum = j && m && d ? `${d}.${m}.${j}` : t.datum;
  return t.uhrzeit ? `${datum} um ${t.uhrzeit}` : datum;
}

function kundenName(k: KundeData): string {
  return `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Kunde";
}

/**
 * Den Termin aus der Liste der naechsten Aktionen nehmen.
 *
 * Die Datumsfelder bleiben stehen, sie lesen Kontaktliste, Pipeline und
 * Portal. `meta.erledigteTermine` merkt sich stattdessen Tag und Uhrzeit.
 * Kontakt und Investment tragen oft denselben Termin; derselbe Schluessel
 * nimmt beide heraus. `zusatz` geht im selben Schreibvorgang mit.
 */
async function nimmAusListe(
  t: FesterTerminAngabe,
  ctx: FesterTerminKontext,
  zusatz: Record<string, unknown> = {},
  alsNoShow = false,
): Promise<boolean> {
  const schluessel = festerTerminSchluessel(t.datum, t.uhrzeit);
  const bisher = erledigteTermine(ctx.kunde);
  const ergebnis = await mergeKontaktMetaMitGrund(ctx.kunde.id, {
    ...(alsNoShow
      ? noShowMetaPatch(mitKontaktMeta(ctx.kunde), schluessel)
      : { erledigteTermine: [...bisher.filter((k) => k !== schluessel), schluessel] }),
    ...zusatz,
  });
  if (!ergebnis.ok) {
    ctx.melde({
      title: "Konnte nicht gespeichert werden",
      description: "grund" in ergebnis ? ergebnis.grund : undefined,
      variant: "destructive",
    });
    return false;
  }
  return true;
}

/**
 * Eine neue Stufe an Kontakt und fruehen Investments, wo `darf` es erlaubt.
 * Die Kachel "Naechster Schritt" liest die Investment-Stufe.
 */
function setzeStufe(kundeId: string, stufe: string, darf: (jetzige: string) => boolean) {
  for (const inv of getInvestmentsByKontakt(kundeId)) {
    if (inv.pipelineStufe !== stufe && darf(inv.pipelineStufe)) updateInvestment(inv.id, { pipelineStufe: stufe });
  }
}

/** "Stattgefunden": aus der Liste nehmen, Stufe wie in `stufeNachStattgefunden`, Vermerk. */
export async function festerTerminStattgefunden(t: FesterTerminAngabe, ctx: FesterTerminKontext): Promise<boolean> {
  if (!(await nimmAusListe(t, ctx))) return false;
  const art = festeGespraechsArt(t.titel);
  const stufe = stufeNachStattgefunden(art, getEffectivePipelineStufe(ctx.kunde));
  const patch: Partial<KundeData> = {};
  if (stufe) patch.pipelineStufe = stufe as KundeData["pipelineStufe"];
  if (t.setterTermin) {
    Object.assign(patch, {
      terminErgebnis: "erschienen",
      terminErgebnisAm: new Date().toISOString(),
      terminErgebnisVon: ctx.userName,
      status: "kontaktiert",
    });
  }
  if (Object.keys(patch).length) updateKontakt(ctx.kunde.id, patch);
  if (stufe) setzeStufe(ctx.kunde.id, stufe, (s) => stufeNachStattgefunden(art, s) === stufe);
  addAktivitaet({
    kundeId: ctx.kunde.id,
    art: "meeting",
    beschreibung: `${t.titel} stattgefunden ✓`,
    details: `Termin: ${wannText(t)}`,
    von: ctx.userName,
    erledigtAm: new Date().toISOString(),
  });
  ctx.melde({ title: `${t.titel} stattgefunden ✓`, description: wannText(t) });
  return true;
}

/**
 * "No-Show" bzw. "Nicht stattgefunden".
 *
 * Der Termin verschwindet aus den naechsten Aktionen, ohne als erledigt zu
 * gelten, samt Buchung, Meeting und Aufgabe zum selben Zeitpunkt. Der
 * No-Show wird je Termin gemerkt (`meta.noShowTermine`); ist er fuer diesen
 * Termin schon erfasst, wird nur geschlossen. Bei Erst- und Beratungsgespraech setzt die Kette die NoShow-Stufe
 * (nie zurueck, siehe `darfNoShowStufeSetzen`), und der zustaendige
 * Vertriebspartner bekommt eine Glocke und die Aufgabe "Neuen ...termin
 * vereinbaren" (sofort, nach 24 und nach 48 Stunden). Der Lead bleibt bei
 * ihm; an Zustaendigkeit und Setter wird nichts geaendert.
 *
 * Andere feste Termine (Notar, Versicherung) werden nur aufgehoben und
 * vermerkt, fuer sie gibt es keine NoShow-Stufe.
 */
export async function festerTerminNichtStattgefunden(t: FesterTerminAngabe, ctx: FesterTerminKontext): Promise<boolean> {
  const k = ctx.kunde;
  const art = festeGespraechsArt(t.titel);
  // Bestandsfall: Fuer genau diesen Termin ist der No-Show schon erfasst.
  // Dann nur noch schliessen, keine zweite Folgekette.
  const schonErfasst = !!art && noShowErfasst(mitKontaktMeta(k), t.datum, t.uhrzeit);
  if (!(await nimmAusListe(t, ctx, {}, !!art))) return false;
  const berater = k.berater || "dem zuständigen Vertriebspartner";

  // Derselbe Termin als Buchung, Meeting und Aufgabe (etwa von der
  // Terminseite): als nicht stattgefunden schliessen, nicht als erledigt.
  await schliesseOffeneTermineZumZeitpunkt(k.id, t.datum, t.uhrzeit);

  if (schonErfasst) {
    ctx.melde({ title: "Termin geschlossen", description: "Der No-Show war schon erfasst, es entstehen keine neuen Aufgaben." });
    return true;
  }

  if (t.setterTermin) {
    // Wie bisher: Ergebnis und Historie am Kontakt, die Auswertungen lesen sie.
    updateKontakt(k.id, {
      terminErgebnis: "noshow",
      terminErgebnisAm: new Date().toISOString(),
      terminErgebnisVon: ctx.userName,
      setterTerminGebucht: false,
      setterTerminDatum: "",
      setterTerminUhrzeit: "",
      status: "kontaktiert" as KundeData["status"],
      noShowHistorie: [
        ...(k.noShowHistorie || []),
        { datum: t.datum, uhrzeit: t.uhrzeit || "", berater: k.berater || ctx.userName, gemeldetAm: new Date().toISOString(), setter: k.setter || "" },
      ],
    });
  }

  if (!art) {
    addAktivitaet({
      kundeId: k.id,
      art: "notiz",
      beschreibung: `✖ ${t.titel} am ${wannText(t)} nicht stattgefunden`,
      von: ctx.userName,
    });
    ctx.melde({ title: `${t.titel} aufgehoben`, description: "Der Termin steht nicht mehr in den nächsten Aktionen." });
    return true;
  }

  const stufeGesetzt = setzeNoShowStufe(k.id, noShowStufeFuer(art));
  const schritt = neuerTerminSchritt(art);
  addAktivitaet({
    kundeId: k.id,
    art: "notiz",
    beschreibung: `❌ No-Show beim ${art} am ${wannText(t)}. Der Lead bleibt bei ${berater}, ein neuer Termin ist nötig.`,
    von: ctx.userName,
  });

  // Glocke und Aufgaben nur an den, dem der Kunde jetzt gehoert.
  const zustaendig = aktuellerZustaendiger(k.id, k.zustaendig_id || undefined);
  const titel = `🔁 No-Show-Erinnerung: ${kundenName(k)}, ${schritt.charAt(0).toLowerCase()}${schritt.slice(1)}`;
  const nachricht =
    `Der Termin „${art}" am ${wannText(t)} hat nicht stattgefunden. Bitte den Kunden anrufen und einen neuen Termin eintragen. ` +
    "Die Erinnerung kommt nach 24 und nach 48 Stunden noch einmal.";
  if (zustaendig) notifyUser(zustaendig, { titel, nachricht, link: `/kunden/${k.id}` });
  const tag = (versatz: number) => {
    const d = new Date();
    d.setDate(d.getDate() + versatz);
    return lokalesDatum(d);
  };
  const basis = {
    beschreibung: nachricht,
    prioritaet: "hoch" as const,
    typ: "anruf" as const,
    uhrzeit: "09:00",
    kundeId: k.id,
    kundeName: kundenName(k),
    zugewiesenAn: zustaendig,
    erstelltVonName: ctx.userName,
  };
  void addGeteilteAufgabe({ ...basis, titel, faellig_am: tag(0) });
  void addGeteilteAufgabe({ ...basis, titel: `${titel} (Erinnerung nach 24 h)`, faellig_am: tag(1) });
  void addGeteilteAufgabe({ ...basis, titel: `${titel} (Erinnerung nach 48 h)`, faellig_am: tag(2) });

  ctx.melde({
    title: "No-Show registriert",
    description: stufeGesetzt
      ? `Der Lead bleibt bei ${berater} und steht jetzt auf „${art === "Erstgespräch" ? "EG NoShow" : "BG NoShow"}". Nächster Schritt: ${schritt}.`
      : `Der Lead bleibt bei ${berater}. Nächster Schritt: ${schritt}.`,
  });
  return true;
}

/**
 * "Verschoben" fuer einen festen Termin ohne Setter-Feld: der alte Termin
 * geht aus der Liste, der neue steht am Kontakt, eine NoShow-Stufe heilt.
 * Den Setter-Termin verschiebt weiterhin der Dialog im Kundenprofil.
 */
export async function festerTerminVerschieben(
  t: FesterTerminAngabe,
  neuDatum: string,
  neuUhrzeit: string,
  ctx: FesterTerminKontext,
): Promise<boolean> {
  const art = festeGespraechsArt(t.titel);
  if (!art || !neuDatum || !neuUhrzeit) return false;
  const felder = art === "Erstgespräch"
    ? { erstgespraechAm: neuDatum, erstgespraechUhrzeit: neuUhrzeit }
    : { beratungsgespraechAm: neuDatum, beratungsgespraechUhrzeit: neuUhrzeit };
  if (!(await nimmAusListe(t, ctx, felder))) return false;
  const stufe = stufeNachVerschieben(art, getEffectivePipelineStufe(ctx.kunde));
  if (stufe) {
    updateKontakt(ctx.kunde.id, { pipelineStufe: stufe as KundeData["pipelineStufe"] });
    setzeStufe(ctx.kunde.id, stufe, (s) => s === noShowStufeFuer(art));
  }
  addAktivitaet({
    kundeId: ctx.kunde.id,
    art: "meeting",
    beschreibung: `🔁 ${art} verschoben auf ${neuDatum} um ${neuUhrzeit}`,
    von: ctx.userName,
  });
  ctx.melde({ title: "Termin verschoben ✓", description: `Neuer Termin: ${neuDatum} um ${neuUhrzeit}` });
  return true;
}
