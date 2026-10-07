import { updateKontakt, getKontaktById, kontaktZustaendigkeitGeleert, kontaktPerFunktionZurueckgeben, type KundeData } from "@/lib/kundenStore";
import { vorstellungsAufgabeNachPoolRueckgabe, vorstellungsAufgabeNachZuweisung } from "@/lib/handbuch/vorstellungsAufgabe";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { kennungZuName, nameMehrdeutig } from "@/lib/beraterNamensabgleich";
import { LEITUNG_ROLLEN, notifyLeadAbgegeben, notifyLeadZugewiesen, notifyRueckgabeAnZentrale, type ZurueckgegebenerKontakt } from "@/lib/bellNotifications";
import { istProvisionsrelevant } from "@/lib/abschlussDefinition";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { grundSatz, grundVollstaendig, normalisiereGrund, type UebergabeGrund } from "@/lib/uebergabeGrund";

export interface BeraterHistorieEintrag {
  /** Name des Beraters in dieser Phase */
  name: string;
  /**
   * Kennung des Beraters in dieser Phase. Seit dem 28.09.2026 mitgeschrieben,
   * weil zwei Partner gleich heissen koennen. Aeltere Eintraege haben nur den
   * Namen.
   */
  id?: string;
  /** ISO-Zeitstempel: ab wann dieser Vertriebspartner zuständig war */
  von: string;
  /** ISO-Zeitstempel: bis wann (= Wechselzeitpunkt). Bei aktuell aktivem Vertriebspartner leer. */
  bis?: string;
  /** UUID des Nutzers, der den Wechsel durchgeführt hat */
  geaendertVonId?: string;
  /** Name des Nutzers, der den Wechsel durchgeführt hat */
  geaendertVonName?: string;
  /**
   * Warum dieser Vertriebspartner den Kontakt bekommen hat. Nur bei einer
   * Uebergabe gesetzt, also wenn vorher jemand anders zustaendig war.
   * Schluessel aus `uebergabeGrund.ts`.
   */
  grund?: string;
  /** Freitext zum Grund, vom uebergebenden Partner geschrieben. */
  grundText?: string;
  /** Von wem uebernommen. Steht redundant hier, damit ein Eintrag fuer sich lesbar bleibt. */
  vonName?: string;
}

/** Eine Uebergabe, aus der Verlaufsspur zusammengesetzt. */
export interface Uebergabe {
  /** Wer abgegeben hat. */
  von: string;
  /** Wer bekommen hat. */
  an: string;
  /** Wann, als ISO-Zeitstempel. */
  am: string;
  /** Grundschluessel aus `uebergabeGrund.ts`, falls erfasst. */
  grund?: string;
  /** Freitext zum Grund. */
  grundText?: string;
  /** Wer den Wechsel ausgeloest hat. */
  geaendertVonName?: string;
}

/**
 * Ist das eine Uebergabe oder eine Erstverteilung?
 *
 * Eine Uebergabe liegt vor, sobald der Kontakt schon jemandem gehoert, egal
 * ob per Zustaendigkeit oder nur ueber den Freitext `berater`. Nur dann gibt
 * es ein "von Partner A", und nur dann ist ein Grund ueberhaupt sinnvoll.
 * Ein Lead aus dem offenen Pool hat keinen Vorgaenger, dort waere die
 * Pflichtangabe eine leere Uebung.
 */
export function istUebergabe(kunde?: Pick<KundeData, "berater" | "zustaendig_id"> | null): boolean {
  if (!kunde) return false;
  return !!(kunde.berater || "").trim() || !!(kunde.zustaendig_id || "").trim();
}

/** Die Meldung, wenn bei einer Uebergabe der Grund fehlt. */
export const GRUND_FEHLT_MELDUNG =
  "Für die Übergabe fehlt der Grund. Der neue Vertriebspartner soll wissen, warum er den Lead bekommt.";

/**
 * Wechselt den Vertriebspartner eines Kontakts atomar:
 * - schreibt den alten Wert in `meta.beraterHistorie` (mit „bis"-Datum)
 * - setzt das neue Vertriebspartner-Feld + neue zustaendig_id (falls Nutzer gefunden)
 * - benachrichtigt den neuen Vertriebspartner (sofern zugeordnet & nicht der Aktuelle)
 *
 * Bei einer Uebergabe (der Kontakt gehoert schon jemandem) ist der Grund
 * Pflicht. Fehlt er, wirft diese Funktion, statt still weiterzulaufen: Ein
 * halb erfasster Wechsel waere schlimmer als gar keiner, denn der Lead waere
 * weg und niemand wuesste warum. Bei der Erstverteilung aus dem offenen Pool
 * gibt es keinen Vorgaenger und deshalb auch keine Pflicht.
 *
 * @returns true wenn etwas geändert wurde.
 * @throws wenn bei einer Uebergabe der Grund fehlt.
 */
export function reassignBerater(
  kontaktId: string,
  newBeraterName: string,
  options?: {
    changedById?: string;
    changedByName?: string;
    /**
     * Die AKTIVE Rolle des Handelnden (`user.role`). Nur wenn Admin, Inhaber
     * oder Vertriebsleitung umhaengen, erfaehrt der bisherige Partner davon
     * (Christians Entscheidung vom 29.09.2026).
     */
    changedByRole?: string;
    /** Falls false, keine In-App-Benachrichtigung. Default true. */
    notify?: boolean;
    /**
     * Falls true, keine Einzelmail an den Partner. Die Bulk-Variante setzt
     * das und verschickt am Ende eine gebuendelte Mail, statt bei fuenfzig
     * Kontakten fuenfzig Einzelmails loszutreten.
     */
    mailUnterdruecken?: boolean;
    /**
     * Warum der Lead den Partner wechselt. Pflicht, sobald der Kontakt schon
     * jemandem gehoert. Absichtlich optional im Typ, weil derselbe Aufruf
     * auch die Erstverteilung bedient; erzwungen wird zur Laufzeit.
     */
    grund?: UebergabeGrund;
    /**
     * Kennung des neuen Partners. Hat Vorrang vor dem Namen, denn zwei
     * Partner koennen gleich heissen. Fehlt sie, wird der Name nur bei genau
     * einem Treffer aufgeloest.
     */
    zielId?: string;
  }
): boolean {
  const kunde = getKontaktById(kontaktId);
  if (!kunde) return false;

  const oldBerater = (kunde.berater || "").trim();
  // Vor dem Schreiben festhalten: `updateKontakt` kann dasselbe Objekt
  // veraendern, danach stuende hier schon der neue Wert.
  const alterZustaendiger = (kunde.zustaendig_id || "").trim();
  const next = (newBeraterName || "").trim();
  if (!next) return false;

  // Pflichtangabe vor jeder Schreiboperation pruefen, damit bei einem
  // Abbruch nichts halb geschrieben ist.
  const uebergabe = istUebergabe(kunde);
  const grund = normalisiereGrund(options?.grund);
  if (uebergabe && !grundVollstaendig(grund)) {
    throw new Error(GRUND_FEHLT_MELDUNG);
  }

  // Neue zustaendig_id: die mitgegebene Kennung, sonst der Name, aber nur
  // eindeutig. Bei einem doppelten Namen wird nicht geraten, sondern
  // abgebrochen, bevor etwas geschrieben ist.
  const newZustaendigId = zielKennung(next, options?.zielId);

  // Nur abbrechen, wenn wirklich beides schon stimmt. Der Freitext `berater`
  // allein reicht nicht: Seit die Sichtbarkeit an `zustaendig_id` haengt, gab
  // es Kontakte, bei denen der Name bereits passte, die Zuständigkeit aber
  // noch bei jemand anderem lag. Ein Abbruch an dieser Stelle hätte genau
  // diesen Zwischenzustand stehen lassen.
  if (oldBerater === next && (kunde.zustaendig_id || "") === (newZustaendigId || "")) return false;

  // Vorhandene Historie aus meta lesen (falls vorhanden)
  const existingHistorie: BeraterHistorieEintrag[] = Array.isArray((kunde as any).beraterHistorie)
    ? [...(kunde as any).beraterHistorie]
    : [];

  const now = new Date().toISOString();

  // Letzten offenen Eintrag schließen oder neuen für den alten Vertriebspartner anlegen
  if (oldBerater) {
    const lastOpen = [...existingHistorie].reverse().find(e => !e.bis && gleichePerson(e, alterZustaendiger, oldBerater));
    if (lastOpen) {
      lastOpen.bis = now;
    } else {
      // Falls keine offene Phase existiert: rekonstruiere Eintrag für den alten Vertriebspartner
      // mit „von" = Erstellungsdatum (Best-Effort).
      existingHistorie.push({
        name: oldBerater,
        ...(alterZustaendiger ? { id: alterZustaendiger } : {}),
        von: kunde.erstellt_am || now,
        bis: now,
      });
    }
  }

  // Neuen offenen Eintrag für den neuen Vertriebspartner. Der Grund haengt
  // an diesem Eintrag, denn er beantwortet "warum habe ich den bekommen".
  existingHistorie.push({
    name: next,
    ...(newZustaendigId ? { id: newZustaendigId } : {}),
    von: now,
    geaendertVonId: options?.changedById,
    geaendertVonName: options?.changedByName,
    ...(uebergabe && grund?.key ? { grund: grund.key } : {}),
    ...(uebergabe && grund?.text ? { grundText: grund.text } : {}),
    ...(oldBerater ? { vonName: oldBerater } : {}),
  });

  // Beim Zuweisen die Pipeline-Stufe NICHT verändern — der Lead bleibt in seiner
  // aktuellen Stufe (i.d.R. "neuer_lead") und erscheint dadurch beim zugewiesenen
  // Vertriebspartner unter "Neuer Lead". Die Legacy-Stufe "zugewiesen" existiert
  // nicht mehr als eigener Bucket.
  const currentStufe = (kunde.pipelineStufe || "").trim();
  const ensureStufe = currentStufe === "" ? { pipelineStufe: "neuer_lead" } : {};

  const gespeichert = updateKontakt(kontaktId, {
    berater: next,
    zustaendig_id: newZustaendigId,
    beraterHistorie: existingHistorie as any,
    ...ensureStufe,
  } as Partial<KundeData>);

  // Handbuch-Lead mit Selbstauskunft: Die Aufgabe zur Objekt-Vorstellung geht
  // mit zum neuen Partner (oder entsteht jetzt).
  void vorstellungsAufgabeNachZuweisung(kunde, newZustaendigId, options?.changedById);

  // Glocken und Mail erst, wenn die Datenbank die Umhaengung angenommen hat
  // (seit 29.09.2026). Vorher gingen sie auch bei einer Ablehnung raus, und
  // der Partner bekam einen Lead gemeldet, den er nicht hatte.
  void Promise.resolve(gespeichert).then(
    (ok) => { if (ok) meldeUmhaengung(); },
    () => { /* abgelehnt: keine Glocke, der Zwischenspeicher meldet den Fehler */ },
  );
  return true;

  function meldeUmhaengung() {
    // Benachrichtigung an neuen Vertriebspartner
    if (options?.notify !== false && newZustaendigId && newZustaendigId !== options?.changedById) {
      try {
        const leadName = `${kunde.vorname} ${kunde.nachname}`.trim();
        // Der Grund geht mit in die Glocke. Er ist der eigentliche Inhalt der
        // Meldung: Wer den Lead bekommt, soll nicht erst im Profil suchen
        // muessen, warum er ihn bekommt.
        notifyLeadZugewiesen(leadName, next, newZustaendigId, kontaktId, {
          vonName: oldBerater || undefined,
          grund: uebergabe ? grundSatz(grund) : "",
        });
      } catch (e) {
        console.warn("notifyLeadZugewiesen failed", e);
      }
      // Zusaetzlich eine Mail. Die Glocke sieht nur, wer gerade im CRM ist.
      if (!options?.mailUnterdruecken) {
        void sendeLeadPartnerMail(kontaktId, newZustaendigId);
      }
    }

    // Meldung an den bisherigen Zustaendigen, wenn ihm die Leitung den Lead
    // weggenommen hat. Christians Regel vom 29.09.2026: nur wenn Admin, Inhaber
    // oder Vertriebsleitung (aktive Rolle) umhaengen. Gibt ein Partner selbst an
    // einen Kollegen ab, bekommt er nichts, er weiss es ja.
    const durchLeitung = (LEITUNG_ROLLEN as readonly string[]).includes(options?.changedByRole || "");
    if (
      options?.notify !== false &&
      durchLeitung &&
      alterZustaendiger &&
      alterZustaendiger !== options?.changedById &&
      alterZustaendiger !== newZustaendigId
    ) {
      try {
        const leadName = `${kunde.vorname} ${kunde.nachname}`.trim();
        notifyLeadAbgegeben(leadName, alterZustaendiger);
      } catch (e) {
        console.warn("notifyLeadAbgegeben failed", e);
      }
    }
  }
}

/**
 * Stoesst die Mail „Neuer Lead" an den zustaendigen Partner an.
 *
 * Bewusst ohne await und ohne Fehlerwurf: Die Zuweisung selbst darf nicht an
 * einem Mailproblem haengen. Doppelversand verhindert die Function selbst
 * ueber eine Merkmarke am Kontakt.
 */
export async function sendeLeadPartnerMail(kontaktId: string, partnerId: string): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("send-lead-partner-mail", {
      body: { kontaktId, partnerId },
    });
  } catch (e) {
    console.warn("send-lead-partner-mail fehlgeschlagen", e);
  }
}

/**
 * Wie sendeLeadPartnerMail, nur fuer mehrere Kontakte an denselben Partner.
 *
 * Die Function entscheidet selbst: ab drei noch nicht gemeldeten Kontakten
 * eine Sammelmail, darunter Einzelmails. Bereits gemeldete Kontakte werden
 * dort aussortiert, doppelt kommt nichts an.
 */
export async function sendeLeadPartnerSammelMail(kontaktIds: string[], partnerId: string): Promise<void> {
  if (kontaktIds.length === 0) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("send-lead-partner-mail", {
      body: { kontaktIds, partnerId },
    });
  } catch (e) {
    console.warn("send-lead-partner-mail (Sammel) fehlgeschlagen", e);
  }
}

/**
 * Bulk-Variante: gibt zurück, wie viele tatsächlich umgezogen wurden.
 *
 * Die Mail an den Partner geht hier gebuendelt am Ende raus, nicht je
 * Kontakt. Die In-App-Glocke bleibt je Kontakt, damit jeder Lead einzeln
 * anklickbar gemeldet wird.
 *
 * Zum Grund: `grund` gilt fuer alle, `grundJeKontakt` sticht ihn fuer
 * einzelne Kontakte aus. Damit ist der haeufige Fall ein Klick und der
 * seltene trotzdem moeglich. Geprueft wird vor dem ersten Schreibvorgang:
 * Fehlt irgendwo der Grund, wird gar nichts umgehaengt, statt die Haelfte.
 *
 * @throws wenn fuer eine Uebergabe in der Auswahl kein gueltiger Grund vorliegt.
 */
export function reassignBeraterBulk(
  kontaktIds: string[],
  newBeraterName: string,
  options?: {
    changedById?: string;
    changedByName?: string;
    /** Aktive Rolle des Handelnden, siehe `reassignBerater`. */
    changedByRole?: string;
    notify?: boolean;
    /** Gemeinsamer Grund fuer die ganze Auswahl. */
    grund?: UebergabeGrund;
    /** Abweichender Grund je Kontakt, Schluessel ist die Kontakt-Id. */
    grundJeKontakt?: Record<string, UebergabeGrund | undefined>;
    /** Kennung des neuen Partners, Vorrang vor dem Namen. */
    zielId?: string;
  }
): number {
  const grundFuer = (id: string): UebergabeGrund | undefined =>
    options?.grundJeKontakt?.[id] ?? options?.grund;

  // Erst pruefen, dann schreiben. Ein Abbruch mitten in der Schleife wuerde
  // eine halb umgehaengte Auswahl hinterlassen, die niemand mehr auseinander
  // sortieren kann.
  for (const id of kontaktIds) {
    const kunde = getKontaktById(id);
    if (!kunde) continue;
    if (istUebergabe(kunde) && !grundVollstaendig(grundFuer(id))) {
      throw new Error(GRUND_FEHLT_MELDUNG);
    }
  }

  // Ziel-Id einmal aufloesen, genau wie reassignBerater es je Kontakt tut.
  const zielId = zielKennung(newBeraterName.trim(), options?.zielId);

  const umgezogen: string[] = [];
  for (const id of kontaktIds) {
    if (reassignBerater(id, newBeraterName, { ...options, grund: grundFuer(id), mailUnterdruecken: true })) {
      umgezogen.push(id);
    }
  }

  // Gleiche Bedingungen wie bei der Einzelmail: nicht bei abgeschalteter
  // Benachrichtigung und nicht, wenn jemand sich selbst zuweist.
  if (
    umgezogen.length > 0 &&
    options?.notify !== false &&
    zielId &&
    zielId !== options?.changedById
  ) {
    void sendeLeadPartnerSammelMail(umgezogen, zielId);
  }

  return umgezogen.length;
}

/**
 * Gibt einen Kontakt zurück in den offenen Pool.
 *
 * Beides muss weg, sonst entsteht der halbe Zustand, an dem die Sichtbarkeit
 * hängt: `zustaendig_id` auf NULL UND der Freitext `berater` geleert. Bleibt
 * der Name stehen, sieht der Lead im CRM weiterhin betreut aus, während die
 * Zugriffsregel ihn längst niemandem mehr zeigt.
 *
 * Die Nachtprüfung meldet Pool-Leads nach drei Tagen (Migration
 * `20260807130000`). Das ist der Auffangmechanismus dahinter.
 *
 * @returns true wenn etwas geändert wurde.
 */
/**
 * Gibt den Lead an die Zentrale zurueck: Zustaendigkeit weg, Verlaufsspur zu.
 *
 * Seit dem 21.09.2026 nimmt die Funktion einen Grund entgegen. Er landet im
 * abgeschlossenen Eintrag der Historie und ist damit die Quelle fuer alles,
 * was die Lead-Verwaltung ueber den Rueckläufer anzeigt: von wem, wann und
 * warum. Ohne Grund funktioniert sie weiter, denn das Abschalten eines Kontos
 * (KontoAbschaltenDialog) gibt Leads frei, ohne dass jemand einen Grund
 * eintippen koennte.
 */
export function releaseBeraterToPool(
  kontaktId: string,
  options?: { changedById?: string; changedByName?: string; grund?: UebergabeGrund },
): boolean {
  return schreibePoolRueckgabe(kontaktId, options) !== null;
}

/**
 * Wie `releaseBeraterToPool`, wartet aber auf die Datenbank.
 *
 * Fuer „An die Zentrale zurückgeben“. Dort muss der Partner erfahren, ob die
 * Rueckgabe wirklich angekommen ist, sonst meldet die Seite „zurückgegeben“,
 * waehrend die Zeilensicherheit sie abgelehnt hat und der Lead einen Moment
 * spaeter wieder in seiner Liste steht (so bis zum 28.09.2026).
 *
 * Der Grund ist Pflicht, anders als beim Abschalten eines Kontos: Er ist das
 * Einzige, was die Zentrale ueber den bisherigen Verlauf erfaehrt.
 *
 * Meldet selbst nichts. Die Glocke an die Zentrale schickt
 * `leadsAnZentraleZurueckgeben`, einmal je Aktion.
 *
 * @returns true, wenn die Datenbank die Rueckgabe angenommen hat; false,
 *   wenn es nichts zurueckzugeben gab oder die Datenbank abgelehnt hat.
 * @throws GRUND_FEHLT_MELDUNG, bevor irgendetwas geschrieben wird.
 */
export async function leadAnZentraleZurueckgeben(
  kontaktId: string,
  options?: {
    changedById?: string;
    changedByName?: string;
    grund?: UebergabeGrund;
  },
): Promise<boolean> {
  if (!grundVollstaendig(normalisiereGrund(options?.grund))) throw new Error(GRUND_FEHLT_MELDUNG);
  const rueckgabe = poolRueckgabeVorbereiten(kontaktId, options);
  if (!rueckgabe) return false;

  // Ueber die Datenbankfunktion: Ein UPDATE des Partners scheitert an seiner
  // eigenen Leseregel, sobald der Lead ihm nicht mehr gehoert (28.09.2026).
  const perFunktion = await kontaktPerFunktionZurueckgeben(kontaktId, rueckgabe.historie);
  if (perFunktion !== null) {
    if (perFunktion) void vorstellungsAufgabeNachPoolRueckgabe(rueckgabe.kunde);
    return perFunktion;
  }

  // Bisheriger Weg, solange die Migration 20260928190000 fehlt, und beim
  // Testkonto. Er traegt nur selbst angelegte Leads und die der Leitung.
  try {
    await schreibeVorbereiteteRueckgabe(kontaktId, rueckgabe);
  } catch {
    // Gemeldet hat der Zwischenspeicher bereits, und er hat den alten Stand
    // wiederhergestellt. Hier zaehlt nur das Ergebnis.
    return false;
  }
  // Ohne Fehler heisst noch nicht getroffen: nachlesen.
  return kontaktZustaendigkeitGeleert(kontaktId);
}

/**
 * Gibt mehrere Leads an die Zentrale zurueck und meldet das einmal.
 *
 * Seit dem 28.09.2026 bekommt die Zentrale bei JEDER gelungenen Rueckgabe
 * eine Glocke, eine je Aktion, nicht je Kontakt; seit dem 29.09.2026 sind das
 * Admin, Inhaber und Vertriebsleitung, nicht mehr das Backoffice. Vorher
 * gab es sie nur ab Reservierung, und dann je Kontakt einzeln. Kunden ab
 * Reservierung stehen in der Meldung namentlich. Gesperrt wird nach Stufe
 * weiterhin nicht.
 *
 * @returns je Auftrag, ob die Rueckgabe angekommen ist (gleiche Reihenfolge).
 * @throws GRUND_FEHLT_MELDUNG, wenn ein Grund fehlt, bevor etwas geschrieben wird.
 */
export async function leadsAnZentraleZurueckgeben(
  auftraege: Array<{
    kontaktId: string;
    grund?: UebergabeGrund;
    /** Die effektive Pipeline-Stufe des Kunden, vom Aufrufer ermittelt. */
    stufe?: string | null;
  }>,
  options?: { changedById?: string; changedByName?: string },
): Promise<boolean[]> {
  // Erst alle pruefen, damit nicht die Haelfte zurueckgeht.
  for (const a of auftraege) {
    if (!grundVollstaendig(normalisiereGrund(a.grund))) throw new Error(GRUND_FEHLT_MELDUNG);
  }
  // Namen vor dem Schreiben festhalten, danach kann ein Partner den Kontakt
  // nicht mehr lesen.
  const namen = new Map(auftraege.map((a) => {
    const k = getKontaktById(a.kontaktId);
    return [a.kontaktId, `${k?.vorname || ""} ${k?.nachname || ""}`.trim() || "Ein Kontakt"];
  }));
  const ergebnisse = await Promise.all(auftraege.map((a) =>
    leadAnZentraleZurueckgeben(a.kontaktId, { ...options, grund: a.grund }).catch(() => false),
  ));

  const gemeldet: ZurueckgegebenerKontakt[] = auftraege
    .filter((_, i) => ergebnisse[i])
    .map((a) => ({
      kontaktId: a.kontaktId,
      name: namen.get(a.kontaktId) || "Ein Kontakt",
      stufeAbReservierung: istProvisionsrelevant(a.stufe)
        ? PIPELINE_STUFEN.find((s) => s.key === a.stufe)?.label || String(a.stufe)
        : undefined,
      grund: grundSatz(normalisiereGrund(a.grund)),
    }));
  try {
    notifyRueckgabeAnZentrale(gemeldet, { durch: options?.changedByName, durchId: options?.changedById });
  } catch (e) {
    // Die Rueckgabe steht, eine fehlende Glocke darf sie nicht kippen.
    console.warn("notifyRueckgabeAnZentrale failed", e);
  }
  return ergebnisse;
}

/** Die Meldung, wenn ein Name ohne Kennung auf mehrere Nutzer passt. */
export const NAME_MEHRDEUTIG_MELDUNG =
  "Diesen Namen tragen mehrere Nutzer. Bitte wähle den Vertriebspartner aus der Liste, damit der Lead beim richtigen landet.";

/**
 * Kennung des Ziels: die mitgegebene, sonst die zum Namen, aber nur bei genau
 * einem Treffer. Passt der Name auf mehrere Nutzer, wird geworfen statt
 * geraten. Ist er unbekannt, bleibt es wie bisher bei einer Zuweisung ohne
 * Kennung.
 */
function zielKennung(name: string, zielId?: string): string | undefined {
  const id = (zielId || "").trim();
  if (id) return id;
  if (nameMehrdeutig(name)) throw new Error(NAME_MEHRDEUTIG_MELDUNG);
  return kennungZuName(name);
}

/**
 * Meint dieser Historieneintrag die Person? Ueber die Kennung, wenn Eintrag
 * und Kontakt eine haben, sonst wie bisher ueber den Namen.
 */
function gleichePerson(e: BeraterHistorieEintrag, kennung: string | null | undefined, name: string): boolean {
  const id = (kennung || "").trim();
  if (id && e.id) return e.id === id;
  return e.name === name;
}

/** Der Name zu einer Nutzerkennung aus den Profilen, leer, wenn unbekannt. */
function profilNameZuKennung(kennung?: string | null): string {
  const id = (kennung || "").trim();
  if (!id) return "";
  try {
    return (loadAllUsers().find(u => u.id === id)?.name || "").trim();
  } catch {
    return "";
  }
}

/** Gemeinsamer Kern beider Wege. null, wenn es nichts zurueckzugeben gab. */
function schreibePoolRueckgabe(
  kontaktId: string,
  options?: { changedById?: string; changedByName?: string; grund?: UebergabeGrund },
): Promise<unknown> | null {
  const rueckgabe = poolRueckgabeVorbereiten(kontaktId, options);
  return rueckgabe ? schreibeVorbereiteteRueckgabe(kontaktId, rueckgabe) : null;
}

/** Schreibt eine vorbereitete Rueckgabe ueber `updateKontakt`. */
function schreibeVorbereiteteRueckgabe(
  kontaktId: string,
  { kunde, historie }: { kunde: KundeData; historie: BeraterHistorieEintrag[] },
): Promise<unknown> {
  // Kein neuer offener Eintrag: Der Lead gehört jetzt niemandem. Genau das
  // soll die Historie auch zeigen.
  const schreiben = Promise.resolve(updateKontakt(kontaktId, {
    berater: "",
    zustaendig_id: "",
    beraterHistorie: historie as any,
  } as Partial<KundeData>));

  // Handbuch-Lead: Die offene Aufgabe zur Objekt-Vorstellung entfällt. Bei
  // der nächsten Zuteilung entsteht sie neu.
  void vorstellungsAufgabeNachPoolRueckgabe(kunde);

  return schreiben;
}

/**
 * Die Verlaufsspur nach der Rueckgabe, noch ohne zu schreiben. null, wenn es
 * nichts zurueckzugeben gibt.
 */
function poolRueckgabeVorbereiten(
  kontaktId: string,
  options?: { changedById?: string; changedByName?: string; grund?: UebergabeGrund },
): { kunde: KundeData; historie: BeraterHistorieEintrag[] } | null {
  const kunde = getKontaktById(kontaktId);
  if (!kunde) return null;

  const oldBerater = (kunde.berater || "").trim();
  const hatteZustaendigen = !!(kunde.zustaendig_id || "").trim();
  if (!oldBerater && !hatteZustaendigen) return null;

  // Kopien der Eintraege: Lehnt die Datenbank ab, darf der Zwischenspeicher
  // keine schon geschlossenen Eintraege behalten.
  const existingHistorie: BeraterHistorieEintrag[] = Array.isArray((kunde as any).beraterHistorie)
    ? (kunde as any).beraterHistorie.map((e: BeraterHistorieEintrag) => ({ ...e }))
    : [];

  const now = new Date().toISOString();

  const grund = normalisiereGrund(options?.grund);
  const grundFelder = grundVollstaendig(grund)
    ? { grund: grund?.key, grundText: grund?.text }
    : {};

  /*
   * Der Eintrag entsteht auch, wenn nur `zustaendig_id` gesetzt war. Ohne ihn
   * erkennt `istRuecklaeufer` den Kontakt nicht, und ein Kontakt ohne leadTyp
   * waere nach der Rueckgabe nirgends mehr zu sehen (bis 28.09.2026). Den
   * Namen dann ueber die Kennung holen, nie umgekehrt.
   */
  const offene = existingHistorie.filter(e => e && !e.bis);
  const name = oldBerater
    || profilNameZuKennung(kunde.zustaendig_id)
    || offene[offene.length - 1]?.name
    || "Unbekannter Betreuer";

  // Der Lead gehoert niemandem mehr, also bleibt kein Eintrag offen. Ein
  // offener Rest wuerde die Rueckläufer-Erkennung blockieren.
  const lastOpen = [...offene].reverse().find(e => gleichePerson(e, kunde.zustaendig_id, name));
  for (const e of offene) e.bis = now;
  // Kennung des bisherigen Zuständigen festhalten (seit 30.09.2026). Die
  // Lead-Verwaltung zeigt daran, wer zurückgegeben hat, und warnt, wenn der
  // Lead wieder an genau ihn gehen soll. Der Name allein ist nicht eindeutig.
  const bisherigeId = (kunde.zustaendig_id || "").trim();
  if (lastOpen) {
    if (!lastOpen.id && bisherigeId) lastOpen.id = bisherigeId;
    lastOpen.geaendertVonId = options?.changedById ?? lastOpen.geaendertVonId;
    lastOpen.geaendertVonName = options?.changedByName ?? lastOpen.geaendertVonName;
    Object.assign(lastOpen, grundFelder);
  } else {
    existingHistorie.push({
      name,
      ...(bisherigeId ? { id: bisherigeId } : {}),
      von: kunde.erstellt_am || now,
      bis: now,
      geaendertVonId: options?.changedById,
      geaendertVonName: options?.changedByName,
      ...grundFelder,
    });
  }

  return { kunde, historie: existingHistorie };
}

/** Bulk-Variante: gibt zurück, wie viele tatsächlich freigegeben wurden. */
export function releaseBeraterToPoolBulk(
  kontaktIds: string[],
  options?: { changedById?: string; changedByName?: string; grund?: UebergabeGrund },
): number {
  let changed = 0;
  for (const id of kontaktIds) {
    if (releaseBeraterToPool(id, options)) changed++;
  }
  return changed;
}

/**
 * Liest die Historie eines Kontakts (chronologisch, älteste zuerst).
 * Filtert leere/ungültige Einträge raus.
 */
export function getBeraterHistorie(kunde: KundeData): BeraterHistorieEintrag[] {
  const raw = (kunde as any).beraterHistorie;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e: any): e is BeraterHistorieEintrag => e && typeof e.name === "string" && e.name.trim().length > 0)
    .sort((a, b) => (a.von || "").localeCompare(b.von || ""));
}

/**
 * Nur ehemalige Vertriebspartner (= mit „bis"-Datum), neueste zuerst.
 */
export function getEhemaligeBerater(kunde: KundeData): BeraterHistorieEintrag[] {
  return getBeraterHistorie(kunde)
    .filter(e => !!e.bis)
    .reverse();
}

/**
 * Die Uebergaben dieses Kontakts, neueste zuerst.
 *
 * Setzt je zwei aufeinanderfolgende Eintraege der Verlaufsspur zu einem
 * Wechsel zusammen. Der Grund haengt am nachfolgenden Eintrag, weil er
 * beantwortet, warum dieser Partner den Kontakt bekommen hat. Deshalb wird
 * hier gepaart statt ihn doppelt zu speichern.
 *
 * Die Erstverteilung (erster Eintrag ohne Vorgaenger) ist keine Uebergabe
 * und taucht hier nicht auf.
 */
export function getUebergaben(kunde: KundeData): Uebergabe[] {
  const historie = getBeraterHistorie(kunde);
  const uebergaben: Uebergabe[] = [];
  for (let i = 1; i < historie.length; i++) {
    const eintrag = historie[i];
    uebergaben.push({
      von: (eintrag.vonName || historie[i - 1].name || "").trim(),
      an: eintrag.name,
      am: eintrag.von,
      grund: eintrag.grund,
      grundText: eintrag.grundText,
      geaendertVonName: eintrag.geaendertVonName,
    });
  }
  return uebergaben.reverse();
}
