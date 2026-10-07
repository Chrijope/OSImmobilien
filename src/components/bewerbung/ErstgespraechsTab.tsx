/**
 * Der Reiter Erstgespräch im Bewerberprofil, Schritt für Schritt.
 *
 * Drei Zonen:
 *   1. Kopfkarte: Status-Badges, die beiden Videocall-Knöpfe (Moderation,
 *      Präsentation), die Zeile „Nächster Schritt", der Grundton und die
 *      Fortschrittsleiste (Teil 1 mit zehn Punkten, Teil 2 mit 16 Abschnitten).
 *   2. Einklappbare Karten: KI-Zusammenfassung (nur wenn vorhanden, nach dem
 *      Abschließen eingeklappt), Vorwissen aus dem Fragebogen (in Punkt 1
 *      offen, ab Punkt 2 automatisch auf die Chip-Zeile eingeklappt),
 *      Altangaben von Bestandsbewerbern.
 *   3. Stationskarte (ErstgespraechStation.tsx) plus Seitenleiste mit
 *      Zwischenstand, der Liste „Wo wir stehen" und der Karte „Gespräch
 *      beenden".
 *
 * Gesprächsstand, Autosave und die drei Abschlusswege sind dieselben wie in
 * der Moderationsansicht (useErstgespraechSkript.ts,
 * useErstgespraechAbschluss.ts); das Schrittmodell liegt in
 * erstgespraechSchritte.ts. Der aktuelle Schritt wird je Bewerber im
 * sessionStorage gemerkt, damit ein Neuladen nicht auf Punkt 1 zurückspringt.
 */
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Save, CheckCircle2, XCircle, Video, ExternalLink, MonitorPlay, Calendar, ArrowRight, Check,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { updateBewerber, type Bewerber } from "@/lib/bewerbungStore";
import { EMPFEHLUNG_LABELS, berechneAssessmentScore, staerksterPfad, type AssessmentAntworten } from "@/lib/assessmentSkript";
import { antwortText, getFrage } from "@/lib/bewerberFormular";
import { getLizenzPaket } from "@/lib/lizenzPakete";
import {
  TEIL_1_ANZAHL, TEIL_2_ANZAHL, baueErstgespraechSchritte, leseSchrittMerker, punktId, schreibeSchrittMerker,
  schrittBezeichnung, schrittZustand, startSchrittId, teil1Punkte, zaehleErledigt,
  type ErstgespraechSchritt, type SchrittZustand, type ZustandsKontext,
} from "@/lib/erstgespraechSchritte";
import { moderationsUrl, praesentationsUrl } from "@/lib/praesentationsKopplung";
import { uebungsUrl } from "@/lib/praesentationsUebung";
import { ABLAUF_NEU, ablaufFuerBewerber } from "@/lib/bewerberArbeitsplatz";
import { einstiegTeilFuer } from "@/lib/erstgespraechStand";
import { VorwissenKarte, VorwissenFehltHinweis, type Vorwissen } from "@/components/bewerbung/VorwissenKarte";
import {
  ZusammenfassungKarte, FollowUpDialog, AbsageDialog, type FelderKontext,
} from "@/components/bewerbung/erstgespraechBausteine";
import { useErstgespraechSkript, useVorwissen } from "@/components/bewerbung/useErstgespraechSkript";
import { useErstgespraechAbschluss, useBeraterEmail, type AbsageModus } from "@/components/bewerbung/useErstgespraechAbschluss";
import { ErstgespraechLeiste } from "@/components/bewerbung/ErstgespraechLeiste";
import { ErstgespraechStation } from "@/components/bewerbung/ErstgespraechStation";
import { VideocallTab } from "@/components/bewerbung/VideocallTab";

const ZEIT_LABEL: Record<string, string> = { unter_10: "unter 10 Std", "10_bis_20": "10 bis 20 Std", vollzeit: "Vollzeit" };
const ERLAUBNIS_LABEL: Record<string, string> = {
  vorhanden: "Vorhanden", beantragt: "Beantragt", wuerde_beantragen: "Würde beantragen", lehnt_ab: "Lehnt ab",
};
const ENTSCHEIDUNG_LABEL: Record<string, string> = { ja: "Ja, will starten", nein: "Nein", bedenkzeit: "Bedenkzeit" };
const STARTWEICHE_LABEL: Record<string, string> = { direkt: "Will direkt starten", unterlagen: "Möchte Unterlagen" };

function datumKurz(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function uhrzeitKurz(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Die Vorabantwort des Fragebogens zu einer Frage, kurz für den Zwischenstand. */
function vorabWert(vorwissen: Vorwissen | null, frageKey: string): string {
  if (!vorwissen) return "";
  const frage = getFrage(frageKey);
  return frage ? antwortText(frage, vorwissen.antworten) : "";
}

/** Die Zeile „Nächster Schritt" in der Kopfkarte. */
function naechsterSchrittText(
  schritt: ErstgespraechSchritt,
  nachher: ErstgespraechSchritt | null,
  teil2An: boolean,
  entscheidung: string,
): string {
  if (schritt.art === "punkt") {
    if (schritt.nummer === 1) return "Punkt 1 · Einstieg und Rahmen. Die Vorwissen-Karte einmal überfliegen, dann anrufen.";
    if (schritt.nummer === 9) {
      return teil2An
        ? "Einschätzung festhalten, dann Teil 2 mit Abschnitt 1 (Der Direktvorschlag) beginnen."
        : "Einschätzung festhalten, dann Punkt 10: Closing-Termin buchen. Oder Teil 2 einschalten und direkt weitermachen.";
    }
    if (schritt.nummer === 10) return "Punkt 10 · Closing-Termin buchen und eintragen, dann Erstgespräch abschließen (Status springt auf Closing).";
  } else if (!nachher) {
    if (entscheidung === "ja") return "Weiter im Reiter Closing: Vertrag erzeugen und senden. Entscheidung, Paket und Adressen sind dort vorbefüllt.";
    return "Abschnitt 16 · Abschluss. Passende Variante sprechen, dann Gespräch beenden über die Karte rechts.";
  }
  return nachher
    ? `${schrittBezeichnung(schritt)}. Danach ${schrittBezeichnung(nachher)}.`
    : schrittBezeichnung(schritt);
}

const LISTE_KREIS: Record<SchrittZustand, string> = {
  erledigt: "bg-green-600 border-green-600 text-white",
  aktuell: "bg-primary border-primary text-white",
  angefangen: "bg-background border-primary text-primary",
  offen: "bg-background border-border text-muted-foreground",
  entfaellt: "bg-background border-border text-muted-foreground",
};

export type ErstgespraechsTabProps = {
  bewerber: Bewerber;
  canEdit: boolean;
  onRefresh: () => void;
  beraterName: string;
  /** Wechselt in den Reiter Closing (Karte „Nächster Reiter" bei Entscheidung Ja) */
  onWeiterZuClosing?: () => void;
};

/**
 * Die Weiche zwischen den beiden Abläufen.
 *
 * Sie hat mit Absicht keinen eigenen Zustand: Beide Fassungen bringen ihre
 * eigenen Hooks mit, und ein gemeinsamer Rumpf mit einem Zweig darin würde die
 * Reihenfolge der Hooks vom Bewerber abhängig machen. So ist es ein Wechsel
 * der Komponente, und React hängt sauber um.
 *
 * Woran der Ablauf hängt, steht allein in `bewerberprozessZuordnung.ts`, über
 * `ablaufFuerBewerber`. Ohne Kennzeichen ist es der bestehende Ablauf, und das
 * ist die Richtung, auf die es ankommt.
 */
export const ErstgespraechsTab = (props: ErstgespraechsTabProps) => {
  if (ablaufFuerBewerber(props.bewerber).id === "neu") {
    return (
      <VideocallTab
        bewerber={props.bewerber}
        canEdit={props.canEdit}
        onRefresh={props.onRefresh}
        beraterName={props.beraterName}
      />
    );
  }
  return <ErstgespraechsTabBestehend {...props} />;
};

/** Der bestehende Ablauf: zehn Punkte, Teil 2, unverändert. */
const ErstgespraechsTabBestehend = ({
  bewerber,
  canEdit,
  onRefresh,
  beraterName,
  onWeiterZuClosing,
}: ErstgespraechsTabProps) => {
  const { authUser } = useUser();

  // Gesprächsstand samt LocalStorage-Draft und Autosave, gemeinsam mit der
  // Moderationsansicht (useErstgespraechSkript.ts).
  const stand = useErstgespraechSkript(bewerber, canEdit);
  const {
    skript,
    assessment, setAssessment,
    closingDatum, closingUhrzeit,
    closingDirekt, closingDirektAn,
    syncFelder, loescheDraft,
  } = stand;
  const beraterEmail = useBeraterEmail(authUser?.id);
  const vorwissen = useVorwissen(bewerber.id);

  // ─── Dialoge (dieselben wie in der Moderation) ───
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectMode, setRejectMode] = useState<AbsageModus>("abgelehnt");
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [formularSendet, setFormularSendet] = useState(false);

  // Die drei Abschlusswege, dieselbe Logik wie in der Moderationsansicht.
  const { abschliessen, followUpSetzen, ablehnen } = useErstgespraechAbschluss({
    bewerber, beraterName, beraterEmail, stand, onRefresh,
  });

  // ─── Schrittmodell ───
  const abgeschlossen = !!(skript.durchgefuehrtAm ?? "").trim();
  const schritte = useMemo(() => baueErstgespraechSchritte(closingDirektAn), [closingDirektAn]);
  const punkte = useMemo(() => teil1Punkte(), []);
  const abschnitte = useMemo(() => schritte.filter((s) => s.art === "abschnitt"), [schritte]);

  // Bedienzustand je Bewerber im sessionStorage: aktueller Schritt, die über
  // „Weiter" verlassenen Punkte und der Beginn des Gesprächs im Reiter.
  const [merker, setMerker] = useState(() => {
    const m = leseSchrittMerker(bewerber.id);
    return {
      schrittId: startSchrittId(baueErstgespraechSchritte(closingDirektAn), m.schrittId, abgeschlossen),
      verlassen: m.verlassen ?? [],
      begonnenAm: m.begonnenAm,
    };
  });
  useEffect(() => {
    const m = leseSchrittMerker(bewerber.id);
    setMerker({
      schrittId: startSchrittId(baueErstgespraechSchritte(closingDirektAn), m.schrittId, abgeschlossen),
      verlassen: m.verlassen ?? [],
      begonnenAm: m.begonnenAm,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerber.id]);
  useEffect(() => {
    schreibeSchrittMerker(bewerber.id, merker);
  }, [bewerber.id, merker]);

  // Wird der Schalter ausgeschaltet, während ein Teil-2-Abschnitt offen ist,
  // darf der Zeiger nicht ins Leere zeigen: dann zurück zu Punkt 9.
  const aktuelleId = schritte.some((s) => s.id === merker.schrittId) ? merker.schrittId : punktId(9);
  useEffect(() => {
    if (aktuelleId !== merker.schrittId) setMerker((m) => ({ ...m, schrittId: aktuelleId }));
  }, [aktuelleId, merker.schrittId]);

  const index = Math.max(0, schritte.findIndex((s) => s.id === aktuelleId));
  const schritt = schritte[index];
  const nachher = index < schritte.length - 1 ? schritte[index + 1] : null;

  const springe = (id: string) => {
    if (!schritte.some((s) => s.id === id)) return;
    setMerker((m) => ({ ...m, schrittId: id, begonnenAm: m.begonnenAm ?? new Date().toISOString() }));
  };
  const weiter = () => {
    if (!nachher) return;
    // Teil 2: „Weiter" hakt den verlassenen Abschnitt automatisch als
    // besprochen ab, genau wie Teil 1 den Punkt als erledigt zählt. Das
    // Kästchen im Kartenkopf bleibt zum Zurücknehmen.
    if (schritt.art === "abschnitt" && canEdit) {
      const key = schritt.abschnitt.key;
      const bisher = closingDirekt.abgehakt ?? [];
      if (!bisher.includes(key)) stand.setClosingDirekt({ abgehakt: [...bisher, key] });
    }
    setMerker((m) => ({
      schrittId: nachher.id,
      // Teil 1: verlassen heißt erledigt.
      verlassen: schritt.art === "punkt" && !m.verlassen.includes(schritt.id) ? [...m.verlassen, schritt.id] : m.verlassen,
      begonnenAm: m.begonnenAm ?? new Date().toISOString(),
    }));
  };
  const zurueck = () => { if (index > 0) springe(schritte[index - 1].id); };

  // Pfeiltasten wie in der Moderation, aber nie mitten in einer Eingabe
  // oder in einem geöffneten Auswahlmenü.
  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="listbox"], [role="option"], [role="combobox"], [role="dialog"]')) return;
      if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); weiter(); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); zurueck(); }
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  });

  // ─── Zustände für Leiste und Liste ───
  const zustandKontext: ZustandsKontext = {
    aktuelleId,
    verlassen: merker.verlassen,
    abgeschlossen,
    assessment,
    closingDirekt,
    closingDatum,
    closingUhrzeit,
  };
  const zustandVon = (s: ErstgespraechSchritt) => schrittZustand(s, zustandKontext);
  const erledigt = zaehleErledigt(schritte, zustandKontext);
  const teil1Fertig = closingDirektAn && erledigt.teil1 >= TEIL_1_ANZAHL - 1;

  // ─── Einklappbare Karten ───
  // Vorwissen: in Punkt 1 offen, ab Punkt 2 automatisch eingeklappt
  // (Christians Entscheidung). Von Hand lässt sie sich jederzeit öffnen.
  const [vorwissenOffen, setVorwissenOffen] = useState(aktuelleId === punktId(1));
  useEffect(() => { setVorwissenOffen(aktuelleId === punktId(1)); }, [aktuelleId]);
  // KI-Zusammenfassung: nach dem Abschließen eingeklappt (Christians Entscheidung).
  const [zusammenfassungOffen, setZusammenfassungOffen] = useState(false);

  const score = berechneAssessmentScore(assessment);
  const vName = bewerber.vorname || "";
  const felderCtx: FelderKontext = { assessment, setAssessment, canEdit, vorwissen };

  /*
   * Den Bogen erneut schicken, und zwar den des jeweiligen Ablaufs.
   *
   * Dieselbe Falle wie im Dialog „Bewerber erfassen": Der Knopf hing fest an
   * `send-bewerber-formular` und schickte damit auch einem Bewerber des neuen
   * Ablaufs den alten Vorabbogen mit dreizehn Fragen. Welche Function richtig
   * ist, steht in `bewerberArbeitsplatz.ts`, an genau einer Stelle.
   */
  const formularLinkSenden = async () => {
    const einladung = ablaufFuerBewerber(bewerber).einladung;
    setFormularSendet(true);
    try {
      const { error } = await supabase.functions.invoke(einladung.funktion, {
        body: { bewerbungId: bewerber.id },
      });
      if (error) throw error;
      toast({ title: `${einladung.kurz} verschickt`, description: `An ${bewerber.email}` });
    } catch (e) {
      console.error("[erstgespraech] Einladung konnte nicht gesendet werden", e);
      toast({ title: "Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setFormularSendet(false);
    }
  };

  const handleSave = () => {
    updateBewerber(bewerber.id, {
      erstgespraechSkript: skript,
      ...syncFelder(),
      closingTerminDatum: closingDatum, closingTerminUhrzeit: closingUhrzeit,
    });
    loescheDraft();
    onRefresh();
    toast({ title: "Erstgespräch gespeichert" });
  };

  const handleAbschliessen = async () => {
    await abschliessen();
    setZusammenfassungOffen(false);
  };

  // Alte Skript-Angaben von Bestandsbewerbern weiter anzeigen
  const altAngaben: { label: string; wert: string }[] = [
    { label: "Ausgangslage (altes Skript)", wert: skript.ausgangslage },
    { label: "Beschäftigungsart", wert: bewerber.beschaeftigungsart },
    { label: "Vertriebserfahrung", wert: bewerber.erfahrung },
    { label: "Details Erfahrung", wert: skript.vorErfahrung },
    { label: "Ziele (altes Skript)", wert: bewerber.ziele },
    { label: "Budget-Antwort (altes Skript)", wert: skript.budget },
  ].filter((e) => (e.wert ?? "").trim() !== "");

  // ─── Kopfkarte: Badges ───
  const entscheidung = bewerber.closingEntscheidung || "";
  const einstiegTeil = einstiegTeilFuer(bewerber);
  /*
   * Welche Präsentation in der Übung vorgewählt ist. Abgeleitet aus dem
   * Kennzeichen am Bewerber, nicht aus der Seite: Derselbe Reiter läuft im
   * Bewerbungsmanagement und im Bewerberprozess, und ein Bewerber steht in
   * genau einer der beiden Listen. Die Ableitung selbst steht in
   * `bewerberArbeitsplatz.ts`, damit der Reiter Closing dieselbe benutzt.
   */
  const neuerProzess = ablaufFuerBewerber(bewerber).id === "neu";
  const profil = staerksterPfad(assessment.pfade);
  const paket = bewerber.paketwahl ? getLizenzPaket(bewerber.paketwahl) : null;
  const a = assessment as AssessmentAntworten;
  const hatIrgendwas = Object.values(a).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === "number" ? v > 0 : !!(v ?? "").toString().trim()));

  return (
    <div className="space-y-4">
      {/* ─── Zone 1: Kopfkarte ─── */}
      <Card className="p-4 space-y-2" data-testid="erstgespraech-kopf">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {abgeschlossen ? (
              <Badge className="h-6 gap-1 bg-green-600 text-white hover:bg-green-600 text-[11px]" data-testid="kopf-status">
                <Check className="h-3 w-3" />
                Geführt am {datumKurz(skript.durchgefuehrtAm)}, {uhrzeitKurz(skript.durchgefuehrtAm)} Uhr
                {skript.durchgefuehrtVon ? ` · ${skript.durchgefuehrtVon}` : ""}
              </Badge>
            ) : merker.begonnenAm ? (
              <Badge variant="outline" className="h-6 gap-1 border-primary/40 bg-primary/5 text-[11px] text-primary" data-testid="kopf-status">
                <Calendar className="h-3 w-3" />
                Erstgespräch läuft seit {uhrzeitKurz(merker.begonnenAm)} Uhr
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 gap-1 text-[11px] text-muted-foreground" data-testid="kopf-status">
                <Calendar className="h-3 w-3" />
                {hatIrgendwas ? "Erstgespräch begonnen" : "Noch nicht begonnen"}
              </Badge>
            )}
            <Badge variant="outline" className="h-6 text-[11px] font-normal text-muted-foreground">
              {vorwissen?.eingereichtAm
                ? `Fragebogen ausgefüllt am ${datumKurz(vorwissen.eingereichtAm)}`
                : vorwissen ? "Fragebogen ausgefüllt" : "Kein Fragebogen"}
            </Badge>
            {closingDirektAn ? (
              <Badge className="h-6 bg-violet-600 text-white hover:bg-violet-600 text-[11px]" data-testid="kopf-teil2">
                Teil 2: an, {erledigt.teil2} von {TEIL_2_ANZAHL}
              </Badge>
            ) : (
              <Badge variant="secondary" className="h-6 text-[11px] font-normal" data-testid="kopf-teil2">Teil 2: aus</Badge>
            )}
            {closingDirektAn && entscheidung ? (
              <Badge className="h-6 bg-green-600 text-white hover:bg-green-600 text-[11px]">
                Entscheidung: {ENTSCHEIDUNG_LABEL[entscheidung] ?? entscheidung}
              </Badge>
            ) : teil1Fertig ? (
              <Badge className="h-6 bg-green-600 text-white hover:bg-green-600 text-[11px]">Teil 1 erledigt</Badge>
            ) : (
              <Badge variant="outline" className="h-6 text-[11px] font-normal text-muted-foreground" data-testid="kopf-stand">
                {erledigt.teil1} von {TEIL_1_ANZAHL} Punkten erledigt
              </Badge>
            )}
          </div>

          {/* Einstieg in den Videocall: Die Moderation zeigt Folie für Folie
              dieselben Sprechtexte und Felder, die Präsentation läuft im
              zweiten Fenster für die Bildschirmfreigabe.

              Präsentation und Moderation führen seit dem 23.09.2026 für jeden
              Bewerber, im alten wie im neuen Ablauf, zum Videocall mit den
              fünf Wegen (bewerberVideocall.ts). Die alte Closing-Präsentation
              ist entfernt. */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {abgeschlossen ? `Gespeichert ${uhrzeitKurz(skript.durchgefuehrtAm)} Uhr` : "Autosave läuft"}
              </span>
              {/* „Moderation öffnen" führt bei jedem Bewerber, alt wie neu, in
                  dieselbe Moderation: links die Wahl zwischen
                  Closing-Präsentation (Vorabbogen), Kennenlern-Präsentation
                  und Rechner, Favoriten je Nutzer. Vorgewählt ist die
                  Präsentation, die zum Ablauf dieses Bewerbers passt; der
                  Einstieg (Teil 1 oder 2) reist mit, die Kennung ebenso,
                  deshalb steht dort sein Name und die Notizen landen bei ihm.
                  Die Folien des Kennenlernbogens tragen seine Antworten; die
                  des alten 22er-Decks bleiben blank, das Deck gibt es nur
                  noch in dieser Übung. */}
              <a
                href={uebungsUrl(
                  neuerProzess
                    ? { art: "kennenlernbogen", bewerberId: bewerber.id }
                    : { art: "vorabbogen", teil: einstiegTeil, bewerberId: bewerber.id },
                )}
                target="_blank"
                rel="noopener noreferrer"
                title="Moderation mit beiden Präsentationen und dem Rechner, geöffnet für diesen Bewerber"
              >
                <Button size="sm" variant="brand" className="gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Videocall: Moderation öffnen
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </Button>
              </a>
              <a
                href={praesentationsUrl(
                  bewerber.id,
                  1,
                  [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" "),
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <MonitorPlay className="h-3.5 w-3.5" /> Präsentation (Bildschirmfreigabe)
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </Button>
              </a>
              <a
                href={moderationsUrl(bewerber.id, 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                title="Die bisherige Moderation mit den Antworten dieses Bewerbers, Erfassung und Abschluss"
              >
                Moderation mit den Antworten von {[bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "diesem Bewerber"}
              </a>
            </div>
          )}
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Nächster Schritt: </span>
          <span className="font-semibold text-primary" data-testid="erstgespraech-naechster-schritt">
            {naechsterSchrittText(schritt, nachher, closingDirektAn, entscheidung)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Grundton: authentisch, freundlich, bestimmt. Zweck ist die Vorqualifizierung in beide Richtungen,
          geclosed wird im Folgetermin oder direkt in Teil 2.
        </p>

        <ErstgespraechLeiste
          punkte={punkte}
          abschnitte={abschnitte}
          teil2An={closingDirektAn}
          zustandVon={zustandVon}
          onSpringe={springe}
          teil1Erledigt={erledigt.teil1}
          teil2Erledigt={erledigt.teil2}
        />
      </Card>

      {/* ─── Zone 2: einklappbare Karten ─── */}
      <ZusammenfassungKarte
        skript={skript}
        mitClosing={closingDirektAn}
        offen={zusammenfassungOffen}
        onOffenChange={setZusammenfassungOffen}
      />

      {vorwissen ? (
        <VorwissenKarte
          vorname={vName}
          vorwissen={vorwissen}
          offen={vorwissenOffen}
          onOffenChange={setVorwissenOffen}
        />
      ) : (
        // Im bestehenden Ablauf bleibt alles, wie es war. Nur im neuen sagen
        // Satz und Knopf, was hier wirklich fehlt und was der Klick verschickt:
        // nicht der Vorabbogen, sondern die Einladung zum Kennenlernen.
        canEdit && bewerber.email && (
          <VorwissenFehltHinweis
            onErneutSenden={formularLinkSenden}
            sendet={formularSendet}
            {...(neuerProzess
              ? {
                  knopfText: `${ABLAUF_NEU.einladung.kurz} senden`,
                  hinweisText:
                    "Das Kennenlernen liegt noch nicht ausgefüllt vor. Das Gespräch läuft " +
                    "unverändert von Punkt 1 bis Punkt 10.",
                }
              : {})}
          />
        )
      )}

      {altAngaben.length > 0 && (
        <Card className="px-3 py-1 bg-muted/30">
          <Accordion type="single" collapsible>
            <AccordionItem value="alt" className="border-none">
              <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
                Angaben aus dem bisherigen Skript ({altAngaben.length})
              </AccordionTrigger>
              <AccordionContent className="pt-1">
                <dl className="text-xs space-y-1">
                  {altAngaben.map((e) => (
                    <div key={e.label} className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0 w-44">{e.label}</dt>
                      <dd className="whitespace-pre-wrap">{e.wert}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      )}

      {/* ─── Zone 3: Stationskarte und Seitenleiste ─── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <ErstgespraechStation
            schritt={schritt}
            schritte={schritte}
            bewerber={bewerber}
            canEdit={canEdit}
            vorname={vName}
            beraterName={beraterName || ""}
            vorwissen={vorwissen}
            ctx={felderCtx}
            stand={stand}
            onRefresh={onRefresh}
            onZurueck={zurueck}
            onWeiter={weiter}
            onFollowUp={() => setShowFollowUpDialog(true)}
            onAbsage={() => { setRejectMode("abgelehnt"); setShowRejectDialog(true); }}
          />
        </div>

        <aside className="space-y-4">
          {/* Zwischenstand, live aus den Feldern */}
          <Card className="p-4" data-testid="erstgespraech-zwischenstand">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Zwischenstand</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Score</dt>
              <dd className="text-right font-medium">
                {hatIrgendwas ? `${score.punkte} / ${score.maxPunkte} · ${EMPFEHLUNG_LABELS[score.empfehlung]}` : `0 / ${score.maxPunkte} · noch offen`}
              </dd>
              <dt className="text-muted-foreground">Profil</dt>
              <dd className="text-right font-medium">{profil?.label ?? "noch offen"}</dd>
              <dt className="text-muted-foreground">Zeit pro Woche</dt>
              <dd className="text-right font-medium">
                {ZEIT_LABEL[assessment.zeitProWoche ?? ""] ?? (vorabWert(vorwissen, "zeitProWoche") ? `vorab: ${vorabWert(vorwissen, "zeitProWoche")}` : "noch offen")}
              </dd>
              <dt className="text-muted-foreground">Gewerbe und 34c</dt>
              <dd className="text-right font-medium">
                {ERLAUBNIS_LABEL[assessment.bereitschaft34c ?? ""] ?? (vorabWert(vorwissen, "gewerbe34c") ? `vorab: ${vorabWert(vorwissen, "gewerbe34c")}` : "noch offen (Punkt 7)")}
              </dd>
              <dt className="text-muted-foreground">Harte Kriterien</dt>
              <dd className={`text-right font-medium ${score.koRot.length > 0 ? "text-red-600" : ""}`}>
                {score.koRot.length > 0 ? `${score.koRot.length} gerissen` : "keins gerissen"}
              </dd>
              <dt className="text-muted-foreground">Teil 2</dt>
              <dd className="text-right font-medium">
                {closingDirektAn ? `an, ${erledigt.teil2} von ${TEIL_2_ANZAHL} abgehakt` : "aus"}
              </dd>
              {closingDirektAn ? (
                <>
                  <dt className="text-muted-foreground">Entscheidung</dt>
                  <dd className="text-right font-medium">{ENTSCHEIDUNG_LABEL[entscheidung] ?? "noch offen (Abschnitt 15)"}</dd>
                  <dt className="text-muted-foreground">Paket</dt>
                  <dd className="text-right font-medium">{paket?.titel ?? "noch offen (Abschnitt 12)"}</dd>
                  {closingDirekt.startWeiche && (
                    <>
                      <dt className="text-muted-foreground">Startweiche</dt>
                      <dd className="text-right font-medium">{STARTWEICHE_LABEL[closingDirekt.startWeiche] ?? closingDirekt.startWeiche}</dd>
                    </>
                  )}
                  {entscheidung === "ja" && (
                    <>
                      <dt className="text-muted-foreground">Adressen</dt>
                      <dd className="text-right font-medium">{bewerber.vertragsAdresse?.trim() ? "Vertragsanschrift erfasst" : "noch offen"}</dd>
                    </>
                  )}
                  {closingDirekt.qualiCallAngeboten && (
                    <>
                      <dt className="text-muted-foreground">Folge-Call</dt>
                      <dd className="text-right font-medium">angeboten</dd>
                    </>
                  )}
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">Closing-Termin</dt>
                  <dd className="text-right font-medium">
                    {closingDatum ? `${closingDatum}${closingUhrzeit ? ` · ${closingUhrzeit} Uhr` : ""}` : "noch keiner"}
                  </dd>
                </>
              )}
            </dl>
          </Card>

          {/* Wo wir stehen */}
          <Card className="p-4" data-testid="erstgespraech-wo-wir-stehen">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Wo wir stehen</p>
            <ol className="space-y-0.5">
              {teil1Fertig ? (
                <li>
                  <button type="button" onClick={() => springe(punktId(9))}
                    className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted">
                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${LISTE_KREIS.erledigt}`}>
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    <span>
                      <span className="font-medium">Teil 1 · Punkt 1 bis 9 erledigt</span>
                      <span className="block text-[10px] text-muted-foreground">Punkt 10 entfällt, Teil 2 läuft. Klick öffnet die Punkte.</span>
                    </span>
                  </button>
                </li>
              ) : (
                punkte.map((p) => {
                  const entfaellt = closingDirektAn && p.id === punktId(10);
                  const z: SchrittZustand = entfaellt ? "entfaellt" : zustandVon(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={entfaellt}
                        onClick={() => springe(p.id)}
                        data-testid={`liste-${p.id}`}
                        data-zustand={z}
                        className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs transition ${
                          z === "aktuell" ? "bg-primary/10 text-primary font-semibold" : entfaellt ? "opacity-50" : "hover:bg-muted"
                        }`}
                      >
                        <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${LISTE_KREIS[z]}`}>
                          {z === "erledigt" ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : p.nummer}
                        </span>
                        <span className={`truncate ${entfaellt ? "line-through" : ""}`}>{schrittBezeichnung(p)}</span>
                      </button>
                    </li>
                  );
                })
              )}
              {closingDirektAn && (
                <>
                  <li className="pt-2 mt-1 border-t text-[10px] font-bold uppercase tracking-wider text-primary px-1">
                    Teil 2 · Closing direkt
                  </li>
                  {abschnitte.map((s) => {
                    const z = zustandVon(s);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => springe(s.id)}
                          data-testid={`liste-${s.id}`}
                          data-zustand={z}
                          className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs transition ${
                            z === "aktuell" ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
                          }`}
                        >
                          <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${LISTE_KREIS[z]}`}>
                            {z === "erledigt" ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : s.nummer}
                          </span>
                          <span className="truncate">{schrittBezeichnung(s)}</span>
                        </button>
                      </li>
                    );
                  })}
                </>
              )}
            </ol>
          </Card>

          {/* Gespräch beenden: dieselben Knöpfe und dieselbe Logik wie bisher */}
          {canEdit && (
            <Card className="p-4 space-y-2" data-testid="erstgespraech-beenden">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Gespräch beenden</p>
              {abgeschlossen ? (
                <Button size="sm" onClick={handleAbschliessen} className="w-full h-auto py-2 whitespace-normal bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Abgeschlossen · {new Date(skript.durchgefuehrtAm).toLocaleString("de-DE", {
                    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </Button>
              ) : (
                <Button size="sm" onClick={handleAbschliessen} className="w-full">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Erstgespräch abschließen
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleSave} className="w-full">
                <Save className="h-3.5 w-3.5 mr-1" /> Zwischenspeichern
              </Button>
              {/* Untereinander in voller Breite: nebeneinander wurden die
                  Beschriftungen in der schmalen Seitenleiste abgeschnitten. */}
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-600 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                onClick={() => { setRejectMode("kein_interesse"); setShowRejectDialog(true); }}
              >
                <XCircle className="h-3.5 w-3.5 mr-1 shrink-0" /> Kein Interesse
              </Button>
              <Button size="sm" variant="destructive" className="w-full"
                onClick={() => { setRejectMode("abgelehnt"); setShowRejectDialog(true); }}>
                <XCircle className="h-3.5 w-3.5 mr-1 shrink-0" /> Abgelehnt
              </Button>
              <p className="text-[10px] text-muted-foreground leading-snug pt-1">
                {abgeschlossen
                  ? "Erneutes Abschließen erzeugt die KI-Zusammenfassung neu, etwa wenn nachträglich Notizen ergänzt wurden. Kein Interesse und Abgelehnt bleiben erreichbar."
                  : closingDirektAn
                    ? "Abschließen speichert, erzeugt die KI-Zusammenfassung über Teil 1 und Teil 2 und setzt den Status. Kein Interesse und Abgelehnt öffnen den Dialog mit Grund und wertschätzender Absage-Mail."
                    : "Abschließen speichert, erzeugt die KI-Zusammenfassung und setzt den Status: mit Closing-Termin auf Closing. Kein Interesse und Abgelehnt öffnen den Dialog mit Grund und wertschätzender Absage-Mail."}
              </p>
            </Card>
          )}

          {closingDirektAn && entscheidung === "ja" && onWeiterZuClosing && (
            <Card className="p-4 space-y-2 border-green-600/40" data-testid="erstgespraech-naechster-reiter">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nächster Reiter</p>
              <Button size="sm" onClick={onWeiterZuClosing} className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5">
                Weiter im Reiter Closing <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Vertrag erzeugen und senden, Adressen prüfen, Startfahrplan optional.
              </p>
            </Card>
          )}
        </aside>
      </div>

      {/* ─── Follow-Up- und Absage-Dialog (gemeinsam mit der Moderation) ─── */}
      <FollowUpDialog
        open={showFollowUpDialog}
        onOpenChange={setShowFollowUpDialog}
        initial={{ datum: bewerber.followUpDatum || "", uhrzeit: bewerber.followUpUhrzeit || "", notiz: bewerber.followUpNotiz || "" }}
        onBestaetigen={followUpSetzen}
      />
      <AbsageDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        modus={rejectMode}
        initialGrund={skript.absageGrund || ""}
        bewerberEmail={bewerber.email}
        onBestaetigen={(grund, mail) => ablehnen(grund, rejectMode, mail)}
      />
    </div>
  );
};
