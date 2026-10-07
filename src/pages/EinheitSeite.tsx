import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, CalendarDays, Clock, ExternalLink, Eye, FileText, Home, Languages, Link2, Loader2, MapPin, Pencil, Phone, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logoImg from "@/assets/moreimmo-logo.png";
import { useUser } from "@/contexts/UserContext";
import { darfGepflegtWerden } from "@/lib/investagonHerkunft";
import { darfObjektBearbeiten } from "@/lib/objektBearbeitenRecht";
import { ArrowLeft } from "lucide-react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { cacheGet } from "@/lib/dataCache";
import {
  getObjektById, getHausgeldMonatForWohnung, getHausgeldNichtUmlegbarForWohnung,
  type ObjektData, type ObjektWohnung,
} from "@/lib/objekteStore";
import {
  aufEinenBlickZeilen, kaltmieteVon, renditeVon, preisJeQm, weitereEinheiten, zaehleEinheiten, einheitImAngebot,
  eur0, dez, prozent,
} from "@/lib/objektKennzahlen";
import { objektseiteFelder, objektartInfo, objektartAbleiten, istNeubauArt, investagonStand, springtInDieEinheit, zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { starteObjektTexteBeiBedarf } from "@/lib/objektTexteKi";
import { istGlobalobjekt, objektAnlageklasse, objektBauzustand } from "@/lib/objektKlassen";
import { objektdetailsAnzeige, SANIERUNGEN_UEBERSCHRIFT, VERMERK_BAUTRAEGER } from "@/lib/objektdetailsAnzeige";
import { detectBundesland } from "@/lib/bundeslandGrEst";
import { kaufnebenkostenKachelText } from "@/lib/exposeInhalt";
import { verwaltungsartLabel } from "@/lib/verwaltungInfo";
import { rollenLabel } from "@/lib/rollenLabel";
import { ObjektseiteZugang } from "@/components/objektseite/ObjektseiteZugang";
import { Brotkrumen, ArtChip, EinheitStatusChip, Kachel, Detail, KartenTitel, Hinweis, BlickZeileAnzeige, InfoSymbol, ReiterBeschriftung } from "@/components/objektseite/Bausteine";
import { Galerie } from "@/components/objektseite/Galerie";
import { UmgebungsKarte } from "@/components/maps/UmgebungsKarte";
import { EinheitFelderDialog } from "@/components/objektseite/EinheitFelderDialog";
import { ObjektseiteFelderDialog } from "@/components/objektseite/ObjektseiteFelderDialog";
import { ObjektTexteKarte } from "@/components/objektseite/ObjektTexteKarte";
import { InterneHighlightsKarte } from "@/components/objektseite/InterneHighlightsKarte";
import { PassendeKundenKarte } from "@/components/objektseite/PassendeKundenKarte";
import { WeitereEinheitenTabelle } from "@/components/objektseite/EinheitenTabelle";
import { EinheitFinanzen, FINANZEN_ERKLAERUNG } from "@/components/objektseite/EinheitFinanzen";
import { EinheitInvestmentrechner, INVESTMENTKALKULATION_ERKLAERUNG } from "@/components/objektseite/EinheitInvestmentrechner";
import { ExposeErzeugenDialog } from "@/components/expose/ExposeErzeugenDialog";
import { exposePfad } from "@/lib/objektExposeStore";
import { einheitUnterlagenGruppen } from "@/lib/objektUnterlagenRegeln";
import { EmptyState } from "@/components/ui/empty-state";
import { darfEinheitInvestmentrechner, darfKundenaktionen, darfLotseNutzen, siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import { ObjektLotse, KiMarke } from "@/components/objektseite/lotse/ObjektLotse";
import { LotseSymbol } from "@/components/objektseite/lotse/LotseSymbol";
import { kalkulationFuerLotse } from "@/lib/lotseStore";
import type { InvestmentEingabe, InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import { cn } from "@/lib/utils";
import { DokumenteAnsicht } from "@/components/objektseite/DokumenteAnsicht";
import { grundrissUebernahmeFuer } from "@/lib/grundrissAusPdf";
import { KundeZuordnenDialog } from "@/components/reservierung/KundeZuordnenDialog";
import { darfReservieren } from "@/lib/reservierungsRechte";
import { getInvestmentById } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { empfehlungAusSuche, hatKundenParameter, kundeIdAusRueckweg, kundenbezugAusSuche, kundenRueckwegAusSuche, mitEmpfehlung, mitRueckweg, type Kundenbezug } from "@/lib/empfehlungAuswahl";
import { useKundenSprache } from "@/lib/kundenSprache";
import { uhrzeit, vormerkungBlockiert, vormerkungSpaltenVorhanden, VORMERKUNG_MIGRATION_HINWEIS } from "@/lib/einheitVormerkung";

/**
 * Die Einheiten-Seite: eine Wohnung mit Übersicht, Finanzen und Dokumenten.
 *
 * Adresse `/objekte/:id/einheiten/:weId`. Die bisherige Wohnungsansicht
 * bleibt unter `/objekte/:id/wohnung/:weId` als Verwaltungsansicht bestehen
 * und ist über „Wohnung bearbeiten" erreichbar. Zugang wie die Objektseite.
 */
export default function EinheitSeite() {
  const { id = "", weId = "" } = useParams<{ id: string; weId: string }>();
  return (
    <ObjektseiteZugang verwaltungPfad={`/objekte/${id}/wohnung/${weId}`} mitVertriebsleitung>
      <EinheitSeiteInhalt id={id} weId={weId} />
    </ObjektseiteZugang>
  );
}

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

function EinheitSeiteInhalt({ id, weId }: { id: string; weId: string }) {
  const navigate = useNavigate();
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "objekt_dokumente", "wohnungs_dokumente"]);
  const bereit = useCacheReady(["objekte", "wohnungen"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekt = useMemo(() => getObjektById(id), [id, liveVersion]);
  const wohnung = objekt?.wohnungen.find((w) => w.id === weId);

  if (!objekt || !wohnung) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          {bereit ? (
            <>
              <p className="text-muted-foreground">{objekt ? "Diese Einheit gibt es nicht mehr." : "Objekt nicht gefunden."}</p>
              <Button variant="outline" onClick={() => navigate(objekt ? zielRouteFuerObjekt(objekt) : "/objekte")}>{objekt ? "Zur Objektseite" : "Zur Objektliste"}</Button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Einheit wird geladen…</p>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <EinheitAnsicht objekt={objekt} wohnung={wohnung} />
    </DashboardLayout>
  );
}

/**
 * Der Weg zurueck, dort wo vorher der Ansprechpartner stand.
 *
 * Bis zum 16.09.2026 zeigte diese Karte den ANGEMELDETEN Nutzer als "Dein
 * Ansprechpartner", also den Betrachter sich selbst, dazu Knoepfe fuer Termin
 * und Rueckruf bei ihm. Im Kundenexpose ergibt das Sinn, in der internen
 * Einheitenansicht nicht. Christian hat sie deshalb entfernen lassen.
 *
 * An ihre Stelle kommt, was an dieser Stelle wirklich fehlte: der Rueckweg.
 * Einen Pfad gab es zwar schon im Brotkrumen darunter, aber den hat niemand
 * als Rueckweg gelesen.
 */
function ZurueckLeiste({ objekt, alleinigeEinheit }: { objekt: ObjektData; alleinigeEinheit: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /*
   * Kam man aus dem Kundenprofil, steht dessen Adresse in `?zurueck=` (seit
   * dem 24.09.2026). Angenommen wird nur ein Pfad ins Kundenprofil, siehe
   * `kundenRueckwegAusSuche`. Der Weg zum Objekt behält Kunde und Rückweg,
   * damit man auch von dort zum Kunden zurückfindet.
   */
  const kundenRueck = kundenRueckwegAusSuche(searchParams.toString());
  const kundenLabel = kundenRueck ? kundenRueckwegBeschriftung(kundenRueck) : "";
  const objektZiel = alleinigeEinheit
    ? "/objekte"
    : mitRueckweg(mitEmpfehlung(`/objekte/${objekt.id}`, empfehlungAusSuche(searchParams.toString())), kundenRueck);
  const label = alleinigeEinheit ? "Zurück zur Objektliste" : `Zurück zu ${objekt.titel || "Objekt"}`;
  return (
    <div className="mb-3 -ml-2 flex max-w-full flex-wrap items-center gap-1">
      {/* max-w-full und truncate: Ein langer Objekttitel lief auf dem Handy über den Rand und schob die ganze Seite zur Seite. */}
      {kundenRueck && (
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground max-w-full" onClick={() => navigate(kundenRueck)}>
          <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{kundenLabel}</span>
        </Button>
      )}
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground max-w-full" onClick={() => navigate(objektZiel)}>
        <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
      </Button>
    </div>
  );
}

/** „Zurück zu Otto Hans", ohne erreichbaren Kontakt „Zurück zum Kundenprofil". */
function kundenRueckwegBeschriftung(ziel: string): string {
  const kundeId = kundeIdAusRueckweg(ziel);
  const kontakt = kundeId ? getKontaktById(kundeId) : undefined;
  const name = kontakt ? [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ").trim() : "";
  return name ? `Zurück zu ${name}` : "Zurück zum Kundenprofil";
}

/**
 * Für wen die Seite gerade gilt, wenn man aus dem Kundenprofil kam.
 *
 * Christians Entscheidung vom 25.09.2026: Im Kundenbezug öffnet „Exposé
 * anzeigen" das Exposé dieses Kunden, in seiner Sprache aus dem
 * Kundenprofil, und „Kundenlink senden" ist mit ihm vorbelegt. Damit das
 * niemanden überrascht, steht es hier ausdrücklich, auch bei Deutsch.
 */
function KundenbezugHinweis({ bezug }: { bezug: Kundenbezug }) {
  const { sprache } = useKundenSprache(bezug.kontaktId);
  const kontakt = getKontaktById(bezug.kontaktId);
  const name = kontakt ? [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ").trim() : "";
  const sprachName = sprache === "en" ? "Englisch" : "Deutsch";
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="kundenbezug-hinweis" data-sprache={sprache}>
      <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        Kundenbezug: <b>{name || "Kunde aus dem Kundenprofil"}</b>. „Exposé anzeigen“ und „Kundenlink senden“ gelten für diesen Kontakt, Exposé und PDF sind auf <b>{sprachName}</b>, wie im Kundenprofil eingestellt.
      </span>
    </div>
  );
}

function EinheitAnsicht({ objekt, wohnung: w }: { objekt: ObjektData; wohnung: ObjektWohnung }) {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  // Die strengere der beiden Regeln, siehe `darfEinheitInvestmentrechner`.
  const darfRechner = darfEinheitInvestmentrechner(user.role);
  /*
   * Der OS Lotse (seit dem 28.09.2026) allein nach der aktiven Rolle. Der
   * Reiter ist nur Anzeige, die Function `objekt-lotse` prüft Rolle und
   * Zustimmung selbst.
   */
  const darfLotse = darfLotseNutzen(user.role);
  /*
   * Der gewählte Reiter und welche Reiter schon einmal offen waren. Rechner
   * und Lotse werden erst beim ersten Öffnen eingehängt und bleiben dann, bis
   * die Einheit wechselt: Der Rechner verlöre sonst beim Reiterwechsel seine
   * Eingaben und meldete dem Lotsen wieder die Anfangswerte (LOTSE-R3-004),
   * der Lotse bräche eine laufende Antwort ab.
   */
  const [reiter, setReiter] = useState("uebersicht");
  const [rechnerGeoeffnet, setRechnerGeoeffnet] = useState(false);
  const [lotseGeoeffnet, setLotseGeoeffnet] = useState(false);
  const reiterWaehlen = (wert: string) => {
    setReiter(wert);
    if (wert === "investmentrechner") setRechnerGeoeffnet(true);
    if (wert === "lotse") setLotseGeoeffnet(true);
  };
  /*
   * Der Stand des Reiters „Investmentkalkulation“, damit der Lotse dieselben
   * Zahlen zitiert. Er gilt nur für die Einheit, zu der er gemeldet wurde:
   * Beim Wechsel auf eine andere Einheit bliebe sonst die alte Rechnung stehen.
   */
  const [rechnerStand, setRechnerStand] = useState<{ wohnungId: string; eingabe: InvestmentEingabe; ergebnis: InvestmentErgebnis; kundenbezogen: boolean } | null>(null);
  const rechnerMelden = useCallback(
    (stand: { eingabe: InvestmentEingabe; ergebnis: InvestmentErgebnis; kundenbezogen: boolean }) => setRechnerStand({ wohnungId: w.id, ...stand }),
    [w.id],
  );
  /*
   * Wer diese Einheit und dieses Objekt pflegen darf.
   *
   * Getrennt gefragt, weil beides auseinanderfallen kann: Ein selbst
   * angelegtes Objekt kann eine aus Investagon uebernommene Einheit tragen,
   * wenn spaeter abgeglichen wurde, und umgekehrt.
   */
  // Dazu seit dem 30.09.2026 dieselbe Schreibregel wie die Datenbank
  // (`darf_objekt_schreiben`): Sonst lehnte sie still ab, und die Seite
  // meldete trotzdem „gespeichert“.
  const darfWohnungPflegen = darfGepflegtWerden(w) && darfObjektBearbeiten(user.role, objekt, authUser?.id);
  const darfObjektPflegen = darfGepflegtWerden(objekt);
  /*
   * Objektangaben, Beschreibung und Standortargumente ändert seit dem
   * 23.09.2026 nur der Admin, also Admin und Inhaber (Christians Vorgabe),
   * jeweils über den Stift an der Karte. Vorher durfte auch der
   * Objektpartner. Der Stift ist keine Zugriffskontrolle, die leistet allein
   * die Zeilensicherheit auf `objekte`.
   */
  const istAdmin = siehtAdminOnlyNavigation(user.role);
  /*
   * „Kundenlink senden“, „Als Kunde ansehen“ und „Exposé anzeigen“ seit dem
   * 05.10.2026 auch für Vertriebsleitung und Vertriebspartner (Christians
   * Go). Die Knöpfe sind nur Anzeige: Welche Kunden jemand wählen darf und
   * was er sieht, prüfen `send-kunden-expose` und `get-kundenansicht`.
   */
  const kundenaktionen = darfKundenaktionen(user.role);
  const [pflegeOffen, setPflegeOffen] = useState(false);
  const [exposeDialogOffen, setExposeDialogOffen] = useState(false);
  /*
   * „Für Kunden reservieren“ (Christians Plan vom 23.09.2026).
   *
   * Der Knopf steht an einer freien Einheit im Angebot, nie an einer Einheit
   * eines Globalobjekts. Läuft für einen anderen Kunden gerade eine
   * Vereinbarung, steht stattdessen „vorgemerkt bis HH:MM“. Die Rollen prüft
   * zusätzlich die Datenbank (`vormerke_einheit`), der Knopf ist nur die
   * Anzeige; gibt man die Seite später für Partner frei, braucht es hier
   * nichts Neues.
   *
   * `?empfehlung=<investmentId>` kommt aus der Empfehlungsliste: Kunde und
   * Investment sind im Dialog dann vorgewählt, und eine Vormerkung für genau
   * diesen Kunden versperrt den Knopf nicht.
   */
  const [zuordnenOffen, setZuordnenOffen] = useState(false);
  const [suchParameter] = useSearchParams();
  const empfehlungInvestmentId = suchParameter.get("empfehlung");
  const empfehlungKundeId = empfehlungInvestmentId ? getInvestmentById(empfehlungInvestmentId)?.kontaktId : undefined;
  /*
   * Der Kundenbezug (Entscheidung vom 25.09.2026, siehe `kundenbezugAusSuche`):
   * aus dem Kundenprofil über die Objektauswahl gekommen. Dann gilt das
   * Exposé für diesen Kunden, und der Weg zurück führt wieder dorthin.
   */
  const kundenbezug = kundenbezugAusSuche(suchParameter.toString());
  const kundenkontext = !!kundenbezug || hatKundenParameter(suchParameter.toString());
  const kundenRueck = kundenRueckwegAusSuche(suchParameter.toString());
  const exposeLink = kundenbezug
    ? mitRueckweg(mitEmpfehlung(exposePfad(objekt.id, w.id, kundenbezug.kontaktId), kundenbezug.investmentId), kundenRueck)
    : exposePfad(objekt.id, w.id);
  const reservierbar = darfReservieren(user.role) && !istGlobalobjekt(objekt)
    && w.status === "frei" && !w.kundeId && einheitImAngebot(w);
  const vormerkungFremd = vormerkungBlockiert(w, empfehlungKundeId);
  // Nur Admin und Inhaber sehen, dass die Migration noch fehlt; der Rückfallweg läuft trotzdem.
  const vormerkungMigrationFehlt = istAdmin && vormerkungSpaltenVorhanden() === false;
  /*
   * Die Vormerkung endet von selbst, ohne dass sich an den Daten etwas
   * ändert. Damit „vorgemerkt bis“ dann auch verschwindet, zeichnet sich die
   * Seite zum Ende einmal neu.
   */
  const [, setVormerkungTakt] = useState(0);
  useEffect(() => {
    if (!w.vorgemerktBis) return;
    const rest = new Date(w.vorgemerktBis).getTime() - Date.now();
    if (!Number.isFinite(rest) || rest <= 0) return;
    const zeitgeber = setTimeout(() => setVormerkungTakt((n) => n + 1), Math.min(rest + 1000, 2 ** 31 - 1));
    return () => clearTimeout(zeitgeber);
  }, [w.vorgemerktBis]);
  const felder = objektseiteFelder(objekt);
  /*
    Kurzbeschreibung und Standortargumente entstehen seit dem 22.09.2026 bei
    Bedarf von selbst. Seit dem 23.09.2026 steht die Textkarte auf jeder
    Einheitsseite und stösst denselben Lauf an; dieser Anstoss bleibt als
    Absicherung für das Exposé dieser Einheit. Doppelt läuft er nicht, das
    verhindert die Merkliste in `starteObjektTexteBeiBedarf`.
  */
  useEffect(() => {
    void starteObjektTexteBeiBedarf(objekt);
    // Nur bei einem Objektwechsel, nicht bei jeder neuen Objektreferenz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt.id]);
  const art = objektartInfo(felder.objektart) ?? objektartInfo(objektartAbleiten(objekt));
  const neubau = istNeubauArt(art?.id);
  const anlageklasse = objektAnlageklasse(objekt) || undefined;
  const bauzustand = objektBauzustand(objekt) || undefined;
  const bundesland = detectBundesland(objekt.plz, objekt.ort);
  const investagon = investagonStand(objekt);
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const miete = kaltmieteVon(w);
  const hausgeld = getHausgeldMonatForWohnung(objekt, w);
  const hausgeldNu = getHausgeldNichtUmlegbarForWohnung(objekt, w);
  // Derselbe Betrag wie im Reiter „Finanzen“, aus derselben Rechnung.
  const nkText = kaufnebenkostenKachelText(objekt, w);
  const gesamt = (w.vkGesamt || 0) + (w.stellplatzPreis || 0);
  // Eine Regel überall (M20): Wohnungsmiete durch Wohnungspreis, Stellplatz getrennt.
  const rendite = renditeVon(w);
  // "X von Y frei" zaehlt nur, was im Angebot steht, genau wie die Liste
  // "Weitere Einheiten" darunter (Christians Regel vom 23.09.2026).
  const zaehler = zaehleEinheiten(objekt.wohnungen.filter(einheitImAngebot));
  const weitere = weitereEinheiten(objekt.wohnungen);
  // Bei genau einer Einheit gibt es keine Objektseite: Diese Seite trägt dann
  // auch die Objektangaben und die Objektaktionen, die sonst dort lägen.
  // Dieselbe Regel wie beim Sprung aus der Objektliste: Ein Einzelobjekt zeigt
  // hier alles, ein Globalobjekt behaelt seine Objektseite.
  const alleinigeEinheit = springtInDieEinheit(objekt);
  const globalobjekt = istGlobalobjekt(objekt);
  /*
   * „Als Kunde ansehen“ öffnet die Kundenansicht dieser Wohnung in einem
   * neuen Tab, ohne CRM-Leiste. Kommt man aus der Objektauswahl eines Kunden,
   * reist das Investment als `?investmentId=` mit: Dann steht der zuständige
   * Partner des Kunden im Kasten.
   */
  const kundenansichtPfad = `/objekte/${objekt.id}/einheiten/${w.id}/kundenansicht${empfehlungInvestmentId ? `?investmentId=${encodeURIComponent(empfehlungInvestmentId)}` : ""}`;
  const [objektPflegeOffen, setObjektPflegeOffen] = useState(false);
  const adresse = [objekt.adresse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  // Die Einheitsseite zeigt die Bilder der Einheit. Erst wenn keine
  // hinterlegt sind, treten die Fotos des Objekts an ihre Stelle, damit kein
  // leerer Rahmen steht. Der Hinweis unter der Galerie sagt, was gerade
  // gezeigt wird.
  const eigeneBilder = w.bilder && w.bilder.length > 0 ? w.bilder : [];
  const bilder = eigeneBilder.length > 0 ? eigeneBilder : objekt.bilder;
  const zeigtObjektbilder = eigeneBilder.length === 0 && objekt.bilder.length > 0;
  const baujahr = objekt.globalDaten?.baujahr || undefined;
  const afa = objekt.afaDaten;
  const zahlOderLeer = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };

  // Ohne Anlageklasse: die steht schon in der Kachel „Typ und Nutzung" über der Karte.
  const blick = aufEinenBlickZeilen({
    wohnung: w, ort: objekt.ort, bundesland, baujahr, bauzustand, neubau,
    hausgeldMonat: hausgeld, hausgeldNichtUmlegbarMonat: hausgeldNu,
    energie: felder.energieausweis,
    verwaltungsart: verwaltungsartLabel(meta.verwaltungsart) || undefined,
    verwaltungWegMonatObjekt: zahlOderLeer(meta.verwaltungskostenWeg),
    verwaltungSevMonatObjekt: zahlOderLeer(meta.verwaltungskostenSev),
    mietgarantieKaltObjekt: zahlOderLeer(meta.garantierteErstvermietungKalt),
  });

  // Verwaltung, Gemeinschaftseigentum und Sanierungen wie auf der Objektseite,
  // hier zusätzlich mit dem Miteigentumsanteil dieser Einheit.
  const details = objektdetailsAnzeige(objekt, w);
  const sanierungen = details.sanierungen;
  // Beträge gibt es nur an gepflegten Maßnahmen, deshalb bleibt die Summe dort.
  const sanierungSumme = felder.sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
  const anteilBetrag = w.sanierungAnteilBetrag ?? (w.sanierungAnteilProzent && sanierungSumme > 0 ? sanierungSumme * w.sanierungAnteilProzent / 100 : undefined);

  // Seit dem 23.09.2026 stehen die Objektunterlagen auf jeder Einheitsseite,
  // nicht mehr nur bei genau einer Einheit. Warum und nach welchen Regeln,
  // steht an `einheitUnterlagenGruppen`.
  const unterlagenGruppen = einheitUnterlagenGruppen(objekt, w);

  const passenderRechnerStand = rechnerStand?.wohnungId === w.id ? rechnerStand : null;
  const lotseKalkulation = useMemo(
    // Mit Kundenkontext geht nur die kundenfreie Standardrechnung an den Lotsen (LOTSE-003). Schon die
    // Parameter in der Adresse zählen, auch wenn der Kontakt nicht geladen ist (Runde 6).
    () => (darfLotse && lotseGeoeffnet ? kalkulationFuerLotse(objekt, w, passenderRechnerStand, kundenkontext) : null),
    [darfLotse, lotseGeoeffnet, objekt, w, passenderRechnerStand, kundenkontext],
  );
  const reiterZahl = 4 + (darfRechner ? 1 : 0) + (darfLotse ? 1 : 0);
  // Umbrechen statt überstehen: lieber zwei Zeilen als über den Nachbarn.
  // „Investmentkalkulation“ bricht an der Wortfuge, weil beide Teile eigene
  // Flex-Elemente sind. Den Namen ohne Leerzeichen hält dort ein aria-label.
  const reiterKlasse = "whitespace-normal rounded-lg py-2 text-center leading-tight [overflow-wrap:anywhere]";

  const massnahmen = (
    <div className={KARTE}>
      <KartenTitel zusatz={sanierungen.art === "keine" ? undefined : sanierungen.wert}>{SANIERUNGEN_UEBERSCHRIFT}</KartenTitel>
      {sanierungen.eintraege.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {sanierungen.art === "neubau"
            ? `${sanierungen.wert}, keine Sanierungen genannt.`
            : sanierungen.art === "import"
              ? sanierungen.unter
              : `Keine Angaben vom Bauträger.${istAdmin
                  ? ` Sanierungen trägst du ${alleinigeEinheit ? "über den Stift an den Objektangaben" : "auf der Objektseite über den Stift an den Objektdetails"} ein.`
                  : ""}`}
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {sanierungen.eintraege.map((s, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{s.jahr && <b>{s.jahr} </b>}{s.massnahme}{s.beleg && <InfoSymbol className="ml-1" text={`Beleg: ${s.beleg}`} />}</span>
              {s.betrag ? <span className="tabular-nums text-muted-foreground">{eur0(s.betrag)}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {sanierungen.art === "bautraeger" && <Hinweis>Maßnahmen {VERMERK_BAUTRAEGER}, nicht von uns geprüft.</Hinweis>}
      {sanierungen.eintraege.length > 0 && sanierungen.importJahre.length > 0 && (
        <Hinweis>{sanierungen.importJahre.length > 1 ? "Sanierungsjahre" : "Sanierungsjahr"} laut Objektdaten: {sanierungen.importJahre.join(", ")}</Hinweis>
      )}
      {(anteilBetrag || w.sanierungAnteilProzent) && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-accent px-3 py-2 text-sm">
          <span className="flex items-center gap-1 font-medium">Dein Anteil <InfoSymbol text="Anteil dieser Einheit nach Miteigentumsanteil. Ob und wie er steuerlich wirkt, prüft der Steuerberater." /></span>
          <span className="font-semibold tabular-nums">{[w.sanierungAnteilProzent ? prozent(w.sanierungAnteilProzent, 1) : "", anteilBetrag ? eur0(anteilBetrag) : ""].filter(Boolean).join(" = ")}</span>
        </div>
      )}
      {/* Bei einem Einzelobjekt steht das Gemeinschaftseigentum schon in den
          Objektangaben. Sonst gibt es hier keine andere Stelle dafür. */}
      {!alleinigeEinheit && (
        <Hinweis>Gemeinschaftseigentum: {[details.gemeinschaftseigentum.wert, details.gemeinschaftseigentum.unter].filter(Boolean).join(", ")}</Hinweis>
      )}
    </div>
  );

  // Eine Karte für alle Einzelheiten: Fakten links, Mietübersicht rechts, jede Zeile mit Erklärung.
  const objektdetails = (
    <div className={KARTE} data-testid="karte-objektdetails">
      <KartenTitel rechts={<span className="text-xs text-muted-foreground">Info-Symbol zeigt die Erklärung</span>}>Objektdetails</KartenTitel>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fakten</div>
          {blick.fakten.map((z) => <BlickZeileAnzeige key={z.label} zeile={z} />)}
        </div>
        <div>
          <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:mt-0">Mietübersicht</div>
          {blick.miete.map((z) => <BlickZeileAnzeige key={z.label} zeile={z} />)}
        </div>
      </div>
    </div>
  );

  /*
   * Die Objektangaben eines Einzelobjekts, dort wo sonst die Objektseite
   * stünde.
   *
   * Beschreibung und Standortargumente stehen seit dem 23.09.2026 nicht mehr
   * hier, sondern in derselben Textkarte wie auf der Objektseite, mit
   * Herkunft, Belegen und dem Bearbeiten-Stift für den Admin. Vorher zeigte
   * diese Karte sie ohne Kennzeichnung und bot sie über einen zweiten Weg zum
   * Überschreiben an.
   */
  const objektangaben = (
    <div className={KARTE}>
      <KartenTitel rechts={istAdmin && (
        <Button variant="ghost" size="icon" className="h-[40px] w-[40px] sm:h-7 sm:w-7" aria-label="Objektangaben bearbeiten" title="Objektangaben bearbeiten" onClick={() => setObjektPflegeOffen(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}>Objektangaben</KartenTitel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Detail label="Objektart" wert={art ? art.label : "Keine Angabe"} unter={art && !felder.objektart ? "Abgeleitet, noch nicht festgelegt" : undefined} />
        <Detail label="Gemeinschaftseigentum" wert={details.gemeinschaftseigentum.wert} unter={details.gemeinschaftseigentum.unter} />
        <Detail label="Verwaltung" wert={details.verwaltung.wert} unter={details.verwaltung.unter} />
      </div>
      <Hinweis>
        Das Objekt hat nur diese eine Einheit, deshalb gibt es keine eigene Objektseite.
        {istAdmin ? " Die Objektangaben änderst du über den Stift an dieser Karte, auch Energieausweis und Sanierungen." : ""}
        {` Beschreibung und Standort stehen in ihrer eigenen Karte, Sanierungen unter „${SANIERUNGEN_UEBERSCHRIFT}", der Energieausweis unter „Objektdetails".`}
      </Hinweis>
    </div>
  );

  return (
    // Keine eigene Maximalbreite: Die Seite füllt den Inhaltsbereich wie die Objektübersicht.
    <div className="min-w-0">
      <ZurueckLeiste objekt={objekt} alleinigeEinheit={alleinigeEinheit} />
      {/* Der Satz nennt Exposé und Kundenlink, also nur für die Rollen mit diesen Knöpfen. */}
      {kundenbezug && kundenaktionen && <KundenbezugHinweis bezug={kundenbezug} />}
      <Brotkrumen stufen={alleinigeEinheit
        ? [{ label: "Objekte", to: "/objekte" }, { label: objekt.titel || "Objekt" }]
        : [{ label: "Objekte", to: "/objekte" }, { label: objekt.titel || "Objekt", to: `/objekte/${objekt.id}` }, { label: w.weNr || "Einheit" }]} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Wohnung {w.weNr.replace(/^WE\s*/i, "")}</h1>
            <EinheitStatusChip status={w.status} />
            {art && <ArtChip>{art.label}{bauzustand && art.id === "sanierter_bestand" ? `, ${bauzustand.toLowerCase()}` : ""}</ArtChip>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{adresse}</div>
        </div>
        {/*
          * Oben rechts zwei Gruppen (Bauplan Kundenansicht vom 23.09.2026,
          * Teil 3): „Für den Kunden“ und „Intern“. „Exposé für Kunden“ ist in
          * „Kundenlink senden“ aufgegangen, derselbe Dialog.
          *
          * Beim Globalobjekt wird nur das ganze Haus verkauft. Kundenansicht
          * und Kundenlink gibt es dort deshalb nur auf der Objektseite, hier
          * steht stattdessen der Satz dazu.
          */}
        <div className="flex flex-col gap-3 sm:items-end" data-testid="einheit-aktionen">
          {globalobjekt ? (
            <p className="max-w-sm text-xs text-muted-foreground sm:text-right" data-testid="hinweis-globalobjekt">
              Dieses Haus wird nur als Ganzes verkauft. Kundenansicht und Kundenlink stehen auf der Objektseite.
            </p>
          ) : (kundenaktionen || reservierbar) && (
            <div className="flex flex-col gap-1 sm:items-end" role="group" aria-label="Für den Kunden">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Für den Kunden</span>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {/*
                  * Der Kundenlink für dieselben Rollen, die der Server zulässt
                  * (`send-kunden-expose`). Vertriebspartner wählen dort nur
                  * eigene und vertretene Kunden.
                  */}
                {kundenaktionen && (
                  <Button variant="outline" className="gap-1.5" onClick={() => setExposeDialogOffen(true)}><Link2 className="h-4 w-4" /> Kundenlink senden</Button>
                )}
                {/* „Für Kunden reservieren“ in Marken-Orange, damit er unter den Kundenaktionen heraussticht (Christian, 24.09.2026). */}
                {reservierbar && (vormerkungFremd ? (
                  <Badge
                    variant="outline"
                    className="gap-1 py-1.5 text-muted-foreground"
                    title={istAdmin && w.vorgemerktKundeName
                      ? `Vorgemerkt für ${w.vorgemerktKundeName}${w.vorgemerktBeraterName ? `, von ${w.vorgemerktBeraterName}` : ""}`
                      : "Für einen anderen Kunden ist gerade eine Reservierungsvereinbarung unterwegs."}
                  >
                    <Clock className="h-3 w-3" /> vorgemerkt bis {uhrzeit(w.vorgemerktBis)}
                  </Badge>
                ) : (
                  <Button variant="brand" className="gap-1.5" onClick={() => setZuordnenOffen(true)}><CalendarCheck className="h-4 w-4" /> Für Kunden reservieren</Button>
                ))}
              </div>
              {reservierbar && vormerkungMigrationFehlt && (
                <span className="text-[11px] text-muted-foreground">{VORMERKUNG_MIGRATION_HINWEIS}</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1 sm:items-end" role="group" aria-label="Intern">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Intern</span>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {/* Das Exposé öffnet immer in einem eigenen Tab, ohne CRM-Rahmen (seit dem 23.09.2026). Dieselben Rollen wie die Exposé-Seite selbst. */}
              {/* „Als Kunde ansehen“ links daneben, gleich groß (Christian, 05.10.2026). Nicht beim Globalobjekt. */}
              {kundenaktionen && !globalobjekt && (
                <Button asChild variant="outline" className="gap-1.5 max-md:min-h-[40px]">
                  <a href={kundenansichtPfad} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Als Kunde ansehen</a>
                </Button>
              )}
              {kundenaktionen && (
                <Button asChild variant="outline" className="gap-1.5 max-md:min-h-[40px]">
                  <a href={exposeLink} target="_blank" rel="noopener noreferrer" data-testid="expose-anzeigen"><Eye className="h-4 w-4" /> Exposé anzeigen</a>
                </Button>
              )}
              {/*
                * Pflegen und bearbeiten nur, wo es auch etwas bewirkt.
                *
                * Was aus Investagon kommt, wird dort gepflegt und bei uns alle 15
                * Minuten ueberschrieben. Ein Knopf, der die eigene Aenderung beim
                * naechsten Abgleich stillschweigend verwirft, kostet Zeit und
                * Vertrauen. Deshalb ausblenden statt deaktivieren: Ein grauer
                * Knopf laedt zum Draufklicken und Ratlossein ein.
                */}
              {darfWohnungPflegen && (
                <>
                  <Button variant="outline" className="gap-1.5" onClick={() => setPflegeOffen(true)}><Sparkles className="h-4 w-4" /> Einheit pflegen</Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => navigate(`/objekte/${objekt.id}/wohnung/${w.id}`)}><Pencil className="h-4 w-4" /> Wohnung bearbeiten</Button>
                </>
              )}
              {alleinigeEinheit ? (
                <>
                  {/*
                    * „Objektangaben pflegen" ist am 23.09.2026 entfallen: Der Admin
                    * öffnet dieselbe Pflege jetzt über den Stift an der Karte
                    * „Objektangaben". Sie schreibt nur in `meta`, das fasst der
                    * Abgleich nicht an, deshalb gibt es den Stift auch bei
                    * Investagon. „Objekt bearbeiten" verschwindet dort, das
                    * schreibt in Spalten, die zurueckgeholt werden.
                    */}
                  {darfObjektPflegen && darfObjektBearbeiten(user.role, objekt, authUser?.id) && (
                    <Button variant="outline" className="gap-1.5" onClick={() => navigate(`/objekte/${objekt.id}/verwaltung`)}><Pencil className="h-4 w-4" /> Objekt bearbeiten</Button>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="gap-1 py-1.5 text-muted-foreground"><Home className="h-3 w-3" /> {zaehler.frei} von {zaehler.gesamt} frei</Badge>
              )}
            </div>
          </div>
        </div>
      </div>
      {kundenaktionen && <p className="mb-3 text-xs text-muted-foreground" data-testid="aktionen-erklaerung">
        {globalobjekt
          ? '„Exposé anzeigen" öffnet in einem neuen Tab die neutrale Vorschau dieser Einheit mit Standardannahmen.'
          : '„Als Kunde ansehen" öffnet in einem neuen Tab genau die Seite, die der Kunde über seinen Link bekommt, ohne Link und ohne Zählen. „Kundenlink senden" schickt ihm seine persönliche Objektübersicht per Mail oder kopiert den Link: 60 Tage gültig, mit den Wohnungen des Hauses, die du auswählst, und neutralen Standardannahmen, nie mit Werten aus der Selbstauskunft. Jeder gesendete Link liegt im Kundenprofil beim Investment. „Exposé anzeigen" öffnet die interne Vorschau des Exposés in einem neuen Tab.'}
      </p>}

      <Tabs value={reiter} onValueChange={reiterWaehlen}>
        {/*
          Die Reiter durften nicht breiter werden als ihre Zelle: Mit nowrap lief
          „Investmentkalkulation“ samt Info-Symbol über die Zelle hinaus, und der
          aktive Nachbar deckte das Symbol ab. Deshalb Abstand zwischen den
          Zellen, ab lg Spalten nach Inhalt statt gleich breit, und darunter
          bricht die Beschriftung in ihrer Zelle um (reiterKlasse).
          Seit dem 05.10.2026 steht die Leiste immer links (Christian): Ab lg
          so breit wie ihre Reiter, die Spalten beginnen links statt mittig.
        */}
        <TabsList className={cn("mb-4 grid h-auto w-full justify-start gap-1 rounded-xl p-1 lg:w-fit lg:max-w-full",
          reiterZahl === 6 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(6,auto)]"
            : reiterZahl === 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(5,auto)]"
              : "grid-cols-2 lg:grid-cols-[repeat(4,auto)]")}>
          {/*
            Reihenfolge nach Christians Vorgabe vom 22.09.2026: erst die
            Übersicht, dann die Unterlagen, dann die Zahlen. Wer ein Objekt
            beurteilt, schaut es sich an, prüft die Unterlagen und rechnet
            danach, nicht umgekehrt.
          */}
          <TabsTrigger value="uebersicht" className={reiterKlasse}>Übersicht</TabsTrigger>
          <TabsTrigger value="dokumente" className={reiterKlasse}>Dokumente</TabsTrigger>
          {/* Das Info-Symbol sagt vor dem Klick, welcher Reiter wofür da ist (Christian, 23.09.2026). */}
          <TabsTrigger value="finanzen" className={reiterKlasse}><ReiterBeschriftung info={FINANZEN_ERKLAERUNG}>Finanzen</ReiterBeschriftung></TabsTrigger>
          {darfRechner && <TabsTrigger value="investmentrechner" className={reiterKlasse} aria-label="Investmentkalkulation"><ReiterBeschriftung info={INVESTMENTKALKULATION_ERKLAERUNG}><span className="inline-flex flex-wrap justify-center"><span>Investment</span><span>kalkulation</span></span></ReiterBeschriftung></TabsTrigger>}
          {/* Die Karte stand bis zum 01.10.2026 als Reiter unter der Galerie (Christians Vorgabe: hierher, vor den Lotsen). */}
          <TabsTrigger value="karte" className={reiterKlasse}>Karte</TabsTrigger>
          {darfLotse && (
            <TabsTrigger value="lotse" className={reiterKlasse} data-testid="reiter-lotse">
              <span className="inline-flex items-center gap-1.5"><LotseSymbol ruhig className="h-4 w-4" /> OS Lotse <KiMarke /></span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="uebersicht">
          {/*
            Anordnung seit dem 24.09.2026, zweite Fassung (Christians Vorgabe),
            analog zur Objektseite:
            1. die Galerie über die ganze Breite,
            2. die vier Kacheln (2 × 2) links, die Objektdetails rechts,
            3. Beschreibung und Standort links, so breit wie ihr Text (7 zu 4
               wie auf der Objektseite), rechts die Sanierungen samt
               Gemeinschaftseigentum,
            4. die weiteren Einheiten des Hauses (beim Einzelobjekt an ihrer
               Stelle die Objektangaben) über die ganze Breite.
            Unter xl liegt alles untereinander, in dieser Reihenfolge.

            Zeile 2 streckt die Kacheln auf die Höhe der Objektdetails, damit
            die Zeile ruhig wirkt. Zeile 3 ist oben bündig: Die Beschreibung
            ist meist deutlich höher als die Sanierungen.

            grid-cols-1 ist hier Pflicht: Ohne feste Spalte bemaß sich das
            Raster am breitesten Inhalt (die Tabelle „Weitere Einheiten“), und
            auf dem Handy liefen alle Karten rund 100 px über den Rand.
          */}
          <div className="grid grid-cols-1 gap-4">
            <div className="min-w-0" data-testid="uebersicht-galerie">
              <Galerie bilder={bilder} adresse={adresse} titel={`${objekt.titel}, ${w.weNr}`}
                hoehe="aspect-[4/3] sm:aspect-auto sm:h-80 lg:h-96 2xl:h-[30rem]"
                titelbildObjektId={["admin", "inhaber", "objektpartner"].includes(user.role) ? objekt.id : undefined}
                titelbildUrl={objekt.bildUrl}
                hinweis={zeigtObjektbilder
                  ? (alleinigeEinheit
                      ? "Fotos aus der Objektanlage. Dokumente und Karte liegen in den Reitern oben."
                      : "Für diese Einheit sind noch keine eigenen Fotos hinterlegt, gezeigt werden die Fotos des Gebäudes.")
                  : (investagon.ausInvestagon
                      ? "Fotos dieser Einheit aus Investagon."
                      : "Fotos dieser Einheit aus der Objektanlage.")} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="uebersicht-kennzahlen">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" data-testid="einheit-kacheln">
                <Kachel label="Gesamtinvestition" wert={gesamt > 0 ? eur0(gesamt) : "Keine Angabe"}
                  unter={gesamt > 0 ? <>{w.stellplatzPreis ? `Kaufpreis ${eur0(w.vkGesamt)} plus Stellplatz ${eur0(w.stellplatzPreis)}` : `Kaufpreis ${eur0(w.vkGesamt)}`}<br />{nkText}</> : undefined} />
                <Kachel label="Monatsmiete kalt" wert={miete > 0 ? eur0(miete) : "Keine Angabe"}
                  unter={miete > 0 ? <>{rendite > 0 ? `${prozent(rendite, 2)} Rendite, Jahreskaltmiete durch Kaufpreis` : ""}<br />{hausgeldNu > 0 ? `Hausgeld nicht umlegbar ${eur0(hausgeldNu)} je Monat` : ""}</> : undefined}
                  info="Die eine Rendite im CRM: zwölf Kaltmieten geteilt durch den Kaufpreis." />
                <Kachel label="Wohnfläche" wert={w.groesse > 0 ? `${dez(w.groesse, 1)} m²` : "Keine Angabe"} unter={preisJeQm(w.vkGesamt, w.groesse) > 0 ? `${eur0(preisJeQm(w.vkGesamt, w.groesse))} je m²` : undefined} info="Kaufpreis geteilt durch Wohnfläche." />
                <Kachel label="Typ und Nutzung" wert={<span className="text-lg sm:text-xl">{anlageklasse || "Eigentumswohnung"}</span>}
                  unter={[w.vermietet ? "Kapitalanlage, vermietet" : "Kapitalanlage", afa ? `AfA ${afa.afaModell} ${dez(afa.afaSatz, 1)} %` : ""].filter(Boolean).join(" · ")} />
              </div>
              <div className="min-w-0">{objektdetails}</div>
            </div>

            {/*
              Dieselbe Karte wie auf der Objektseite, mit denselben Texten
              des Objekts, auf jeder Einheitsseite. Bis zum 23.09.2026 stand
              sie nur bei Häusern mit genau einer Einheit hier; bei mehreren
              Einheiten fehlten Beschreibung und Standort auf der
              Einheitsseite ganz. Christian will sie ausdrücklich auf allen
              Einheitsseiten sehen. Der Stift folgt denselben Rechten wie auf
              der Objektseite, der interne Vermerk ebenso.
            */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] xl:items-start" data-testid="uebersicht-beschreibung">
              <ObjektTexteKarte objekt={objekt} darfBearbeiten={istAdmin} className="min-w-0" />
              {/* Rechts die Sanierungen, darunter die internen Highlights (01.10.2026) und die passenden Kunden (Objektscore, 04.10.2026). */}
              <div className="min-w-0 space-y-4">
                <div className="min-w-0" data-testid="karte-sanierungen">{massnahmen}</div>
                <InterneHighlightsKarte objekt={objekt} wohnung={w} />
                <PassendeKundenKarte objekt={objekt} wohnung={w} />
              </div>
            </div>

            {alleinigeEinheit ? objektangaben : (
            <div className={cn(KARTE, "min-w-0")}>
              <KartenTitel rechts={<span className="text-xs text-muted-foreground">{zaehler.frei} von {zaehler.gesamt} frei</span>}>Weitere Einheiten in diesem Haus</KartenTitel>
              <WeitereEinheitenTabelle wohnungen={weitere} aktuelleId={w.id}
                onWechsel={(e) => navigate(`/objekte/${objekt.id}/einheiten/${e.id}`)} />
              <Hinweis>Ein Klick wechselt auf die Seite der anderen Einheit. Verkaufte Einheiten erscheinen nicht. „{objekt.titel}" in der Brotkrumenzeile führt zur Objektseite mit allen Einheiten.</Hinweis>
            </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="finanzen">
          <EinheitFinanzen objekt={objekt} wohnung={w} />
        </TabsContent>

        <TabsContent value="dokumente">
          {unterlagenGruppen.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Noch keine Dateien hinterlegt"
              description={'Weder zum Objekt noch zu dieser Wohnung liegen Dateien vor.' + (darfWohnungPflegen ? ' Hochladen geht in der Objektanlage im Schritt „Unterlagen".' : '')}
            />
          ) : (
            // Umschalter, Liste nach Oberbegriffen und Vorschau, dieselbe Ansicht wie auf der Objektseite.
            <div className={KARTE}>
              <DokumenteAnsicht bereiche={unterlagenGruppen} grundrissUebernahme={grundrissUebernahmeFuer(objekt, w.id)}
                zip={{ objektTitel: objekt.titel, weNr: w.weNr }} />
            </div>
          )}
          <Hinweis>
            „Für Kunden freigegeben“ heißt: erscheint im Kundenlink und im Exposé. Was „Nur im CRM“ trägt, bleibt im CRM.
            {alleinigeEinheit
              ? " Das Objekt hat nur diese eine Einheit, deshalb gibt es keine eigene Objektseite. Die Unterlagen zum Objekt stehen hier."
              : " Die Unterlagen zum Objekt gelten für das ganze Haus und stehen genauso auf der Objektseite."}
            {darfWohnungPflegen && ' Dateien je Einheit lädst du in der Objektanlage im Schritt „Unterlagen" hoch.'}
          </Hinweis>
        </TabsContent>

        <TabsContent value="karte">
          <UmgebungsKarte adresse={adresse} titel={`${objekt.titel}, ${w.weNr}`} hoehe={400} meta={objekt.meta} />
        </TabsContent>

        {/* Eingehängt ab dem ersten Öffnen, siehe `reiterWaehlen`; der Schlüssel setzt beim Einheitswechsel zurück. */}
        {darfRechner && rechnerGeoeffnet && (
          <TabsContent value="investmentrechner" forceMount className="data-[state=inactive]:hidden">
            <EinheitInvestmentrechner key={w.id} objekt={objekt} wohnung={w} onErgebnis={rechnerMelden} sichtbar={reiter === "investmentrechner"} />
          </TabsContent>
        )}

        {darfLotse && lotseGeoeffnet && (
          <TabsContent value="lotse" forceMount className="data-[state=inactive]:hidden">
            <ObjektLotse
              key={w.id}
              objektId={objekt.id}
              wohnungId={w.id}
              bezeichnung={`Wohnung ${w.weNr.replace(/^WE\s*/i, "")}${objekt.adresse ? `, ${objekt.adresse}` : ""}`}
              kalkulation={lotseKalkulation}
              vermietet={w.vermietet}
              // Dieselbe Form wie `wohnungen.meta`, nur für die Begrüßung (Rücklage, Hausgeld gesamt).
              einheitMeta={{ investagonRaw: w.investagonRaw, ruecklageZufuehrungMonat: w.ruecklageZufuehrungMonat, hausgeldNichtUmlagefaehigEuro: w.hausgeldNichtUmlagefaehigEuro }}
              // Keine Rechnung für einen Kunden im Lotsen (05.10.2026): Die steht in der Investmentkalkulation und unter Finanzen.
            />
          </TabsContent>
        )}
      </Tabs>

      <EinheitFelderDialog objektId={objekt.id} wohnung={w} offen={pflegeOffen} onOpenChange={setPflegeOffen} />
      {alleinigeEinheit && istAdmin && <ObjektseiteFelderDialog objekt={objekt} offen={objektPflegeOffen} onOpenChange={setObjektPflegeOffen} />}
      {/* Im Kundenbezug mit Kunde und Investment vorbelegt, weiterhin änderbar. */}
      {exposeDialogOffen && (
        <ExposeErzeugenDialog
          objekt={objekt} vorgewaehlteWohnungId={w.id} offen={exposeDialogOffen} onOpenChange={setExposeDialogOffen}
          vorgewaehlterKundeId={kundenbezug?.kontaktId ?? null} vorgewaehltesInvestmentId={kundenbezug?.investmentId ?? null}
        />
      )}
      {zuordnenOffen && (
        <KundeZuordnenDialog objekt={objekt} wohnung={w} offen={zuordnenOffen} onOpenChange={setZuordnenOffen}
          vorgewaehltesInvestmentId={empfehlungInvestmentId} bearbeiterName={user.name} />
      )}
    </div>
  );
}
