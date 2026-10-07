import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, CalendarCheck, ExternalLink, Eye, FileText, Hammer, KeyRound, Link2, Loader2, Mail, MapPin, Pencil, Phone, Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { cacheGet } from "@/lib/dataCache";
import { getObjektById, hebeHausReservierungAuf, objektImAngebot, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { darfGepflegtWerden, PFLEGE_GESPERRT_HINWEIS } from "@/lib/investagonHerkunft";
import { darfObjektBearbeiten } from "@/lib/objektBearbeitenRecht";
import { darfKundenaktionen, siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import { objektKennzahlen, verkaufsstand, eur0, dez, prozent } from "@/lib/objektKennzahlen";
import { objektseiteFelder, objektartAbleiten, objektartInfo, investagonStand, willVerwaltungsansicht, springtInDieEinheit, zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { istGlobalobjekt, objektAnlageklasse, objektBauzustand } from "@/lib/objektKlassen";
import { objektdetailsAnzeige } from "@/lib/objektdetailsAnzeige";
import { detectBundesland } from "@/lib/bundeslandGrEst";
import { objektUnterlagenEintraege, objektUnterlagenLink } from "@/lib/objektUnterlagenRegeln";
import { grundrissUebernahmeFuer } from "@/lib/grundrissAusPdf";
import { ObjektseiteZugang } from "@/components/objektseite/ObjektseiteZugang";
import { Brotkrumen, ArtChip, EinheitStatusChip, ObjektStatusChip, Kachel, Detail, KartenTitel, Hinweis, InfoSymbol } from "@/components/objektseite/Bausteine";
import { BelegungsAngaben } from "@/components/objektseite/BelegungsAngaben";
import { KundeZuordnenDialog } from "@/components/reservierung/KundeZuordnenDialog";
import { darfReservieren } from "@/lib/reservierungsRechte";
import { getInvestmentById } from "@/lib/investmentsStore";
import { hausBelegungsAnzeige, hausKnopfStand, hausTeilweiseHinweis, OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS } from "@/lib/objektBelegung";
import { ObjektTexteKarte } from "@/components/objektseite/ObjektTexteKarte";
import { InterneHighlightsKarte } from "@/components/objektseite/InterneHighlightsKarte";
import { Galerie } from "@/components/objektseite/Galerie";
import { DokumenteAnsicht } from "@/components/objektseite/DokumenteAnsicht";
import { UmgebungsKarte } from "@/components/maps/UmgebungsKarte";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { EinheitenTabelle } from "@/components/objektseite/EinheitenTabelle";
import { ObjektseiteFelderDialog } from "@/components/objektseite/ObjektseiteFelderDialog";
import { EmpfehlungsLeiste } from "@/components/objektseite/EmpfehlungsLeiste";
import { ExposeErzeugenDialog } from "@/components/expose/ExposeErzeugenDialog";
import { empfehlungAusSuche, empfehlungsAuswahlFuerObjekt, kundeIdAusRueckweg, kundenRueckwegAusSuche, mitEmpfehlung, mitRueckweg, ohneEmpfehlung } from "@/lib/empfehlungAuswahl";
import { empfehlungsKandidaten, gespeicherteObjektKoordinate, siehtEmpfehlungen } from "@/lib/einheitEmpfehlung";
import { kundenScoreDaten, scoreFuerKandidat } from "@/lib/objektScoreDaten";
import { usePassendeKunden } from "@/components/objektscore/usePassendeKunden";
import type { ObjektScore } from "@/lib/objektScore";

/**
 * Die Objektseite: das Gebäude mit allen Einheiten.
 *
 * Sie übernimmt die Adresse `/objekte/:id`, damit der Klick in der
 * unveränderten Objektliste hier landet. Das bisherige Objektdetail bleibt
 * als Verwaltungsansicht unter `/objekte/:id/verwaltung` erreichbar, über
 * „Objekt bearbeiten" und für alle Aufrufe mit Kundenkontext (siehe
 * `willVerwaltungsansicht`). Sehen darf sie nur, wer den Reiter „Objekte"
 * in der Seitenleiste sieht; alle anderen landen in der Verwaltungsansicht.
 */
export default function ObjektSeite() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const verwaltung = `/objekte/${id}/verwaltung`;
  if (willVerwaltungsansicht(location.search)) {
    return <Navigate to={`${verwaltung}${location.search}`} replace />;
  }
  return (
    <ObjektseiteZugang verwaltungPfad={verwaltung} mitVertriebsleitung>
      <ObjektSeiteInhalt id={id} />
    </ObjektseiteZugang>
  );
}

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";
/** Wie die Reiter der Einheitsseite: Die Beschriftung bricht in ihrer Zelle um, statt überzustehen. */
const REITER_KLASSE = "whitespace-normal rounded-lg py-2 text-center leading-tight [overflow-wrap:anywhere]";

function formatDatum(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/*
 * Das Exposé eines ganzen Objekts.
 *
 * Absprache mit dem Exposé-Umbau vom 23.09.2026: Die Route
 * `/objekte/:id/expose` legt der Exposé-Bereich an, hier wird nur dorthin
 * verlinkt, immer in einem eigenen Tab ohne CRM-Rahmen. Gebraucht wird sie beim Globalobjekt, denn es wird als Ganzes
 * verkauft und hat keine Einheitsseite, auf der sonst das Exposé steht.
 *
 * Bis zum 23.09.2026 stand hier für jedes Objekt „Exposé je Einheit erzeugen"
 * samt Zeitstempel `meta.exposeZuletztErzeugt`. Der Knopf ist entfallen, weil
 * jede Einheitsseite das Exposé ohnehin enthält. Der Zeitstempel bleibt an
 * bestehenden Objekten liegen, gelesen wird er nicht mehr.
 */
function objektExposeZiel(objektId: string): string {
  return `/objekte/${objektId}/expose`;
}

function ObjektSeiteInhalt({ id }: { id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authUser } = useUser();
  // Objektangaben ändert nur der Admin, siehe `siehtAdminOnlyNavigation`.
  const istAdmin = siehtAdminOnlyNavigation(user.role);
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "objekt_dokumente", "profiles"]);
  const bereit = useCacheReady(["objekte", "wohnungen"]);
  const [pflegeOffen, setPflegeOffen] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekt = useMemo(() => getObjektById(id), [id, liveVersion]);

  if (!objekt) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          {bereit ? (
            <>
              <p className="text-muted-foreground">Objekt nicht gefunden.</p>
              <Button variant="outline" onClick={() => navigate("/objekte")}>Zur Objektliste</Button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Objekt wird geladen…</p>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Ein Einzelobjekt hat keine eigene Objektseite: Die Einheiten-Seite zeigt
  // alles. Replace, damit „Zurück" nicht hierher und gleich wieder weiter
  // springt. Ein Globalobjekt springt nie, dort ist die Objektseite die
  // Verkaufsseite; entschieden wird das in `springtInDieEinheit`.
  //
  // Die Suche reist mit, vor allem `?empfehlung=`: Ohne sie verlöre ein Klick
  // aus der Objektauswahl eines Kunden auf dem Weg in die Einheit den
  // Kundenbezug.
  if (springtInDieEinheit(objekt)) {
    return <Navigate to={`${zielRouteFuerObjekt(objekt)}${location.search}`} replace />;
  }

  return (
    <DashboardLayout>
      <ObjektAnsicht objekt={objekt} onPflege={istAdmin ? () => setPflegeOffen(true) : undefined} eigeneId={authUser?.id} />
      {istAdmin && <ObjektseiteFelderDialog objekt={objekt} offen={pflegeOffen} onOpenChange={setPflegeOffen} />}
    </DashboardLayout>
  );
}

function ObjektAnsicht({ objekt, onPflege, eigeneId }: {
  /** Öffnet die Pflege der Objektangaben. Fehlt er, gibt es an den Objektdetails keinen Stift. */
  objekt: ObjektData; onPflege?: () => void; eigeneId?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  // Nur die Rollen, die Objekte pflegen duerfen, koennen das Titelbild setzen.
  const darfTitelbild = ["admin", "inhaber", "objektpartner"].includes(user.role);

  // Objekte aus Investagon werden dort gepflegt, hier ist nichts zu ändern.
  const pflegbar = darfGepflegtWerden(objekt);
  // Seit dem 04.10.2026 sieht auch die Vertriebsleitung die Seite, pflegen darf sie nicht.
  const darfPflegen = pflegbar && darfObjektBearbeiten(user.role, objekt, eigeneId);
  /*
    Wer Beschreibung, Standortargumente und Objektangaben ändern darf.

    Seit dem 23.09.2026 nur noch der Admin, also Admin und Inhaber wie bei
    `siehtAdminOnlyNavigation` (Christians Vorgabe). Vorher durfte auch der
    Objektpartner. Bewusst NICHT `darfPflegen`: Das ist bei jedem Objekt aus
    Investagon falsch, weil der Abgleich die Spalten des Objekts zurückholt.
    Texte und Objektangaben liegen aber in `meta`, und das führt der Abgleich
    zusammen, statt es zu ersetzen.

    Der Stift ist keine Zugriffskontrolle. Die leistet allein die
    Zeilensicherheit auf `objekte`, und die lässt heute jede interne Rolle
    schreiben.
  */
  const istAdmin = siehtAdminOnlyNavigation(user.role);
  // Kundenlink, Kundenansicht und Exposé seit dem 05.10.2026 auch für Vertriebsleitung und Vertriebspartner, siehe EinheitSeite.
  const kundenaktionen = darfKundenaktionen(user.role);
  const globalobjekt = istGlobalobjekt(objekt);

  const felder = objektseiteFelder(objekt);
  /*
    Die Einheitenliste zeigt nur, was im Angebot steht: Verkaufte und in
    Investagon nicht angebotene Einheiten fehlen (Christians Regel vom
    23.09.2026). Kennzahlen und Verkaufsstand rechnen bewusst weiter mit
    allen Einheiten, sonst verschwaenden die Verkaeufe aus dem Verkaufsstand.
  */
  const imAngebot = objektImAngebot(objekt);
  const k = objektKennzahlen(objekt.wohnungen);
  const v = verkaufsstand(objekt.wohnungen);
  const artGepflegt = objektartInfo(felder.objektart);
  const artVorschlag = artGepflegt ? undefined : objektartInfo(objektartAbleiten(objekt));
  const anlageklasse = objektAnlageklasse(objekt);
  const bauzustand = objektBauzustand(objekt);
  const bundesland = detectBundesland(objekt.plz, objekt.ort);
  const investagon = investagonStand(objekt);
  const baujahr = objekt.globalDaten?.baujahr || undefined;
  // Verwaltung, Gemeinschaftseigentum und Sanierungen: dieselbe Auslegung wie
  // auf der Einheitsseite und im Exposé, siehe `objektdetailsAnzeige`.
  const details = objektdetailsAnzeige(objekt);
  const sanierungsjahre = details.sanierungen.jahre;
  const sanierungSpanne = sanierungsjahre.length ? (Math.min(...sanierungsjahre) === Math.max(...sanierungsjahre) ? String(sanierungsjahre[0]) : `${Math.min(...sanierungsjahre)} bis ${Math.max(...sanierungsjahre)}`) : undefined;
  // Beträge gibt es nur an gepflegten Maßnahmen.
  const sanierungSumme = felder.sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
  const adresse = [objekt.adresse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  // Fuer die Reihenfolge der Einheiten: Wer selbst an einer belegten Einheit
  // haengt, soll sie oben im grauen Block wiederfinden.
  const rechteKontext = useMemo(
    () => ({ rolle: user.role as string, benutzerId: eigeneId, name: user.name }),
    [user.role, user.name, eigeneId],
  );

  /*
    Auswahl für einen Kunden, seit dem 23.09.2026.

    Kommt jemand aus der Objektauswahl eines Kunden (`?empfehlung=<Investment>`),
    steht oben die Leiste mit Vorname und Kaufpreisrahmen, die Tabelle
    kennzeichnet die passenden Einheiten, und beim Öffnen einer Einheit reist
    der Parameter mit. Dort wählt die Reservierung Kunde und Investment vor.
    Kunde und Rahmen kommen aus dem Zwischenspeicher; wer den Kunden nicht
    sehen darf, bekommt keine Leiste.
  */
  const empfehlung = empfehlungAusSuche(location.search);
  const kundenVersion = useLiveVersion(["investments", "kontakte"]);
  const auswahl = useMemo(
    () => (empfehlung ? empfehlungsAuswahlFuerObjekt(empfehlung, objekt, rechteKontext) : null),
    // `kundenVersion` zählt mit: Kommen Investment oder Kontakt erst nach dem
    // ersten Zeichnen in den Zwischenspeicher, erscheint die Leiste danach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empfehlung, objekt, rechteKontext, kundenVersion],
  );
  // Die Tabelle erwartet eine Menge (Vertrag mit `EinheitenTabelle`).
  const empfohleneIds = useMemo(() => (auswahl ? new Set(auswahl.empfohleneIds) : undefined), [auswahl]);

  /*
    Objektscore, seit dem 04.10.2026, nur intern.

    Aus der Objektauswahl eines Kunden steht in der Spalte „Kunde / VP“ sein
    Score je freier Einheit (dieselbe Rechnung wie dort). Sonst sehen Admin,
    Inhaber und Vertriebsleitung bei freien Einheiten, welche suchenden Kunden
    passen, der Vertriebspartner nur seine eigenen (`usePassendeKunden`). Gerechnet wird im Browser aus dem Zwischenspeicher, also nur über
    Kunden, die der Nutzer ohnehin sieht, und neu nur, wenn sich Objekt,
    Einheiten, Investments oder Kontakte ändern. Beim Globalobjekt gibt es
    keine einzelne Einheit zu verkaufen, dort bleibt die Spalte wie bisher.
  */
  const kundenScores = useMemo(() => {
    if (!auswahl?.rahmen || globalobjekt || !siehtEmpfehlungen(user.role)) return undefined;
    const daten = kundenScoreDaten(auswahl.investmentId, auswahl.kontaktId);
    const m = new Map<string, ObjektScore>();
    for (const k of empfehlungsKandidaten([objekt], {
      nutzer: rechteKontext, kundeId: auswahl.kontaktId, rahmen: daten.kunde.rahmen, wohnort: daten.wohnort, objektKoordinate: gespeicherteObjektKoordinate,
    })) {
      if (k.wohnungId) m.set(k.wohnungId, scoreFuerKandidat(objekt, k, daten));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auswahl, objekt, globalobjekt, user.role, rechteKontext, kundenVersion]);
  const passendeKunden = usePassendeKunden(objekt, !auswahl);
  // Der Rückweg ins Kundenprofil reist beim Öffnen einer Einheit mit, damit
  // auch dort „Zurück zu <Kunde>" steht.
  const kundenRueck = kundenRueckwegAusSuche(location.search);
  const oeffneEinheit = (w: ObjektWohnung) =>
    navigate(mitRueckweg(mitEmpfehlung(`/objekte/${objekt.id}/einheiten/${w.id}`, empfehlung), kundenRueck));
  const auswahlBeenden = () => navigate({ pathname: location.pathname, search: ohneEmpfehlung(location.search) }, { replace: true });

  /*
    „Haus für Kunden reservieren“, nur beim Globalobjekt (seit dem 23.09.2026).

    Ein Globalobjekt wird nur als Ganzes verkauft, reserviert wird deshalb das
    Haus und nie eine Einheit daraus (Entscheidung vom 10.09.2026). Der Knopf
    steht nur, wenn das Haus frei ist und nicht für einen anderen Kunden
    vorgemerkt; eine Vormerkung für den Kunden aus `?empfehlung=` versperrt
    ihn nicht. Ohne die Migration ist er gesperrt, und Admin und Inhaber lesen
    den Grund. Die Rollen prüft zusätzlich die Datenbank (`vormerke_objekt`),
    der Knopf ist nur die Anzeige.

    Kunde, Partner und Datum einer Belegung zeigt `hausBelegungsAnzeige` nach
    denselben Sichtbarkeitsregeln wie bei einer Einheit.
  */
  const [hausDialogOffen, setHausDialogOffen] = useState(false);
  const [kundenlinkOffen, setKundenlinkOffen] = useState(false);
  const [reiter, setReiter] = useState("uebersicht");
  /*
   * „Als Kunde ansehen“ beim Globalobjekt: die Kundenansicht des ganzen Hauses
   * in einem neuen Tab. Aus der Objektauswahl eines Kunden reist das
   * Investment mit, dann steht dessen Partner im Kasten.
   */
  const kundenansichtPfad = `/objekte/${objekt.id}/kundenansicht${empfehlung ? `?investmentId=${encodeURIComponent(empfehlung)}` : ""}`;
  const empfehlungKundeId = empfehlung ? getInvestmentById(empfehlung)?.kontaktId : undefined;
  const hausKnopf = hausKnopfStand(objekt, { darfReservieren: darfReservieren(user.role), kundeId: empfehlungKundeId });
  const hausAnzeige = globalobjekt ? hausBelegungsAnzeige(objekt, rechteKontext) : null;
  // Haus frei, aber schon Einheiten vergeben: „teilweise reserviert, nicht verfügbar“ (05.10.2026).
  const hausTeilweise = hausTeilweiseHinweis(objekt);
  /*
    Die Vormerkung endet von selbst, ohne dass sich an den Daten etwas
    ändert. Damit „vorgemerkt bis“ dann verschwindet und der Knopf
    zurückkommt, zeichnet sich die Seite zum Ende einmal neu.
  */
  const [, setHausTakt] = useState(0);
  useEffect(() => {
    if (!objekt.vorgemerktBis) return;
    const rest = new Date(objekt.vorgemerktBis).getTime() - Date.now();
    if (!Number.isFinite(rest) || rest <= 0) return;
    const zeitgeber = setTimeout(() => setHausTakt((n) => n + 1), Math.min(rest + 1000, 2 ** 31 - 1));
    return () => clearTimeout(zeitgeber);
  }, [objekt.vorgemerktBis]);

  const partnerProfil = objekt.erstellt_von
    ? (cacheGet("profiles") as Array<{ id: string; name?: string; email?: string | null; telefon?: string | null }>).find((p) => p.id === objekt.erstellt_von)
    : undefined;

  const spanneText = (s: { von: number; bis: number } | null, f: (n: number) => string) =>
    s ? (s.von === s.bis ? f(s.von) : `${f(s.von)} bis ${f(s.bis)}`) : "Keine Angabe";

  // Die Objektseite zeigt ausschließlich die Unterlagen des Objekts. Die
  // Unterlagen einer Einheit stehen auf deren Einheitsseite. Dieselben
  // Objektunterlagen zeigt auch jede Einheitsseite, deshalb kommen beide aus
  // derselben Funktion, samt Einordnung und Investagon-Kategorie.
  const dokumente = objektUnterlagenEintraege(objekt);
  const unterlagenLink = objektUnterlagenLink(objekt);
  const dokumenteMitDatei = dokumente.filter((d) => d.url);

  /*
    Die frühere rechte Seitenleiste ist seit dem 24.09.2026 in einzelne
    Karten zerlegt (Christians Vorgabe): Der Verkaufsstand steht neben den
    Kennzahlen, Objektpartner und Aktionen darunter. Die „Datenherkunft“ ist
    entfallen, die Herkunft zeigen der Hinweis unter dem Titel und das
    Etikett „Investagon, Stand …“ oben rechts.
  */
  const partnerKarte = (
    <>
      {/*
        Der Objektpartner, und nur wenn es einen gibt.

        Christian am 22.09.2026: Bei einem Objekt aus dem Import oder von Hand
        stand hier ein Kasten, der nichts sagte als "Kein Objektpartner
        hinterlegt". Das ist der Normalfall, also stand er fast immer da.

        Der Teil "Ansprechpartner im Vertrieb" darunter ist ganz entfallen. Er
        zeigte dem Betrachter sich selbst, samt dem Hinweis, dass er im
        Kundenlink erscheint. Dieselbe Karte wurde am 16.09.2026 schon einmal
        von der Einheitenseite entfernt, aus genau diesem Grund.
      */}
      {partnerProfil && (
        <div className={KARTE}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Objektpartner</div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {(partnerProfil.name || "?").split(" ").map((t) => t[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{partnerProfil.name}</div>
              {partnerProfil.email && <div className="truncate text-xs text-muted-foreground">{partnerProfil.email}</div>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {partnerProfil.telefon ? (
              <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 max-md:min-h-[40px]"><a href={`tel:${partnerProfil.telefon}`}><Phone className="h-3.5 w-3.5" /> Anrufen</a></Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled><Phone className="h-3.5 w-3.5" /> Anrufen</Button>
            )}
            {partnerProfil.email ? (
              <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 max-md:min-h-[40px]"><a href={`mailto:${partnerProfil.email}`}><Mail className="h-3.5 w-3.5" /> E-Mail</a></Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled><Mail className="h-3.5 w-3.5" /> E-Mail</Button>
            )}
          </div>
        </div>
      )}
    </>
  );

  /*
    Der Verkaufsstand füllt neben den Kennzahlen die Höhe der beiden
    Kachelreihen. Deshalb eine Spalte mit verteiltem Inhalt: Titel und Balken
    oben, die Aufstellung in der Mitte, der Hinweis unten.
  */
  const verkaufsstandKarte = (
    <div className={`${KARTE} flex h-full flex-col justify-between gap-3`} data-testid="karte-verkaufsstand">
      <div>
        <KartenTitel rechts={<span className="text-xs text-muted-foreground">{v.verkauft.anzahl + v.reserviert.anzahl} von {v.gesamt.anzahl} vergeben</span>}>Verkaufsstand</KartenTitel>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-foreground" style={{ width: `${v.gesamt.anzahl ? (v.verkauft.anzahl / v.gesamt.anzahl) * 100 : 0}%` }} />
          <div className="bg-[hsl(var(--warning))]" style={{ width: `${v.gesamt.anzahl ? (v.reserviert.anzahl / v.gesamt.anzahl) * 100 : 0}%` }} />
          <div className="bg-[hsl(var(--success))]" style={{ width: `${v.gesamt.anzahl ? (v.frei.anzahl / v.gesamt.anzahl) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        {([["Verkauft", v.verkauft, "bg-foreground"], ["Reserviert", v.reserviert, "bg-[hsl(var(--warning))]"], ["Frei", v.frei, "bg-[hsl(var(--success))]"]] as const).map(([label, t, farbe]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted-foreground"><span className={`h-2.5 w-2.5 rounded-full ${farbe}`} />{label}</span>
            <span className="font-semibold tabular-nums">{t.anzahl} · {eur0(t.volumen)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <span className="text-muted-foreground">Gesamtvolumen</span>
          <span className="font-semibold tabular-nums">{eur0(v.gesamt.volumen)}</span>
        </div>
      </div>
      <Hinweis className="mt-0">
        {dez(v.verkauft.anteilProzent, 0)} % verkauft, {dez(v.reserviert.anteilProzent, 0)} % reserviert, nach Kaufpreis. Reservierungen laufen über die Pipeline und ändern den Status hier automatisch.
      </Hinweis>
    </div>
  );

  const aktionenKarte = (
    <>
      {/*
        * Die Karte „Aktionen“ gibt es seit dem 23.09.2026 nur noch beim
        * Globalobjekt (Bauplan Kundenansicht, Teil 3): Dort wird das ganze
        * Haus verkauft, und hier liegen Exposé, Hausreservierung,
        * Kundenansicht und Kundenlink. Bei einem Haus mit mehreren Wohnungen
        * steht „Objekt bearbeiten“ im Kopf, Kundenansicht und Kundenlink auf
        * jeder Einheitsseite.
        */}
      {globalobjekt && (
      <div className={KARTE} data-testid="karte-aktionen">
        <KartenTitel>Aktionen</KartenTitel>
        <div className="flex flex-col gap-2">
          {/*
            * „Objekt bearbeiten" schreibt in echte Spalten, also Titel,
            * Adresse, Preise, Größen, Rendite. Genau die holt sich der
            * Abgleich alle 15 Minuten zurück. Bei einem Investagon-Objekt war
            * dieser Knopf ein Blindgänger, deshalb ist er dort weg
            * (Christians Entscheidung vom 16.09.2026).
            *
            * „Objektangaben pflegen" und „Exposé je Einheit erzeugen" sind am
            * 23.09.2026 entfallen. Die Objektangaben öffnet der Admin jetzt
            * über den Stift an den Objektdetails, Beschreibung und Standort
            * über den Stift an ihrer Karte. Das Exposé steht auf jeder
            * Einheitsseite. Nur das Globalobjekt hat keine Einheitsseite, es
            * bekommt deshalb hier „Exposé anzeigen".
            */}
          {darfPflegen && (
            <Button className="justify-start gap-2" onClick={() => navigate(`/objekte/${objekt.id}/verwaltung`)}><Pencil className="h-4 w-4" /> Objekt bearbeiten</Button>
          )}
          {globalobjekt && kundenaktionen && (
            <Button asChild variant="outline" className="justify-start gap-2 max-md:min-h-[40px]">
              <a href={objektExposeZiel(objekt.id)} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /> Exposé anzeigen</a>
            </Button>
          )}
          {/* Marken-Orange wie „Für Kunden reservieren“ an der Einheit (Christian, 24.09.2026). */}
          {hausKnopf === "reservierbar" && (
            <Button variant="brand" className="justify-start gap-2" onClick={() => setHausDialogOffen(true)}>
              <CalendarCheck className="h-4 w-4" /> Haus für Kunden reservieren
            </Button>
          )}
          {hausKnopf === "ohne_migration" && (
            <>
              <Button variant="brand" className="justify-start gap-2" disabled
                title={istAdmin ? OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS : "Die Reservierung des ganzen Hauses ist noch nicht freigeschaltet."}>
                <CalendarCheck className="h-4 w-4" /> Haus für Kunden reservieren
              </Button>
              {istAdmin && <p className="text-[11px] text-muted-foreground">{OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS}</p>}
            </>
          )}
          {hausKnopf === "teilweise" && (
            <Button variant="brand" className="justify-start gap-2" disabled title={hausTeilweise ?? undefined}>
              <CalendarCheck className="h-4 w-4" /> Haus für Kunden reservieren
            </Button>
          )}
          {hausTeilweise && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2" data-testid="haus-teilweise">
              <p className="text-sm font-semibold">Haus teilweise reserviert, nicht verfügbar</p>
              <p className="text-xs text-muted-foreground">{hausTeilweise}</p>
            </div>
          )}
          {/*
            Belegung und Vormerkung des Hauses. Jeder sieht, dass es vergeben
            oder vorgemerkt ist; Kunde und Partner nur, wer sie sehen darf.
          */}
          {hausAnzeige && hausAnzeige.art !== "frei" && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2" data-testid="haus-belegung">
              <p className="text-sm font-semibold">
                {hausAnzeige.art === "vorgemerkt" ? "Haus vorgemerkt" : hausAnzeige.art === "verkauft" ? "Haus verkauft" : "Haus reserviert"}
              </p>
              <BelegungsAngaben anzeige={hausAnzeige} onKundeOeffnen={(kundeId) => navigate(`/kunden/${kundeId}`)} />
              {/* Platzt die Reservierung, gibt der Admin das Haus hier wieder
                  frei (Christian, 23.09.2026). Gegenstück zum „Aufheben“ an
                  einer Einheit. */}
              {hausAnzeige.art === "reserviert" && istAdmin && (
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs text-destructive" data-testid="haus-aufheben"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Hausreservierung wirklich aufheben?",
                      description: "Das ganze Haus wird wieder als frei geführt und kann neu reserviert werden. Das Investment im Kundenprofil bleibt unverändert; dort bei Bedarf nachziehen.",
                      confirmText: "Reservierung aufheben",
                      cancelText: "Bestehen lassen",
                      variant: "destructive",
                    });
                    if (!ok) return;
                    const ergebnis = await hebeHausReservierungAuf(objekt.id);
                    if (!ergebnis.ok) {
                      await hinweisDialog({
                        title: "Aufheben hat nicht geklappt",
                        description: ergebnis.fehlerText || "Die Reservierung konnte nicht aufgehoben werden.",
                      });
                    }
                  }}>
                  Hausreservierung aufheben
                </Button>
              )}
            </div>
          )}
          {/* Kundenansicht und Kundenlink für das ganze Haus, für dieselben Rollen wie auf dem Server. */}
          {kundenaktionen && (
            <>
              <Button asChild variant="outline" className="justify-start gap-2 max-md:min-h-[40px]">
                <a href={kundenansichtPfad} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Als Kunde ansehen</a>
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => setKundenlinkOffen(true)}><Link2 className="h-4 w-4" /> Kundenlink senden</Button>
            </>
          )}
        </div>
        {kundenaktionen && <Hinweis>
          {'„Exposé anzeigen" öffnet das Exposé des ganzen Objekts in einem neuen Tab. „Als Kunde ansehen" zeigt in einem neuen Tab die Seite, die der Kunde über seinen Link bekommt, „Kundenlink senden" schickt sie ihm.'}
          {/* Der Teil zur Pflege nur für Admin und Inhaber, die als Einzige pflegen. */}
          {istAdmin && (darfPflegen
            ? ' „Objekt bearbeiten" öffnet die bisherige Verwaltungsansicht mit Wohnungsliste, Zuweisung und Dokumenten.'
            : ` ${PFLEGE_GESPERRT_HINWEIS} Objektdetails, Beschreibung und Standort änderst du über den Stift an der jeweiligen Karte. Das fasst der Abgleich nicht an.`)}
        </Hinweis>}
      </div>
      )}

    </>
  );

  return (
    // Keine eigene Maximalbreite: Die Seite füllt den Inhaltsbereich wie die Objektübersicht.
    <div className="min-w-0">
      {auswahl && (
        <EmpfehlungsLeiste
          auswahl={auswahl}
          global={globalobjekt}
          onBeenden={auswahlBeenden}
          onZurKundenakte={() => navigate(
            kundenRueck && kundeIdAusRueckweg(kundenRueck) === auswahl.kontaktId
              ? kundenRueck
              : `/kunden/${auswahl.kontaktId}#objektauswahl`,
          )}
        />
      )}
      <Brotkrumen stufen={[{ label: "Objekte", to: "/objekte" }, { label: objekt.titel || "Objekt" }]} />

      {/*
        Der Rückweg steht oben links, über der Überschrift.

        Christian am 22.09.2026: Rechts in der Knopfgruppe wird er schlecht
        gefunden. Der Rückweg liegt im ganzen System an derselben Stelle,
        Vorbild ist die `ZurueckLeiste` in `EinheitSeite`. Der Brotkrumen
        darüber führt zwar auch zurück, wird aber nicht als Rückweg gelesen.
      */}
      <div className="mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/objekte")}
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zur Objektliste
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{objekt.titel || "Objekt"}</h1>
            {artGepflegt && <ArtChip>{artGepflegt.label}</ArtChip>}
            {/* Die Objektart steht in `meta` und lässt sich deshalb auch bei
                einem Investagon-Objekt festlegen, aber nur vom Admin. Allen
                anderen wäre der Verweis auf den Stift einer auf etwas, das
                sie nicht sehen. */}
            {artVorschlag && <ArtChip className="border-dashed">{artVorschlag.label} <InfoSymbol className="ml-1" text={istAdmin
              ? "Abgeleitet aus Bauzustand, Titel und Anlageklasse. Festlegen über den Stift an den Objektdetails."
              : "Abgeleitet aus Bauzustand, Titel und Anlageklasse."} /></ArtChip>}
            <ObjektStatusChip status={objekt.status} />
            {/* Das reservierte oder verkaufte Haus, nur beim Globalobjekt. */}
            {globalobjekt && objekt.belegung && objekt.belegung !== "frei" && <EinheitStatusChip status={objekt.belegung} />}
            {!objekt.sichtbar && <Badge variant="outline" className="text-muted-foreground">Ausgeblendet</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{[adresse, bundesland].filter(Boolean).join(", ")}{anlageklasse ? ` · ${anlageklasse}` : ""}{bauzustand ? ` · ${bauzustand}` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Zap className="h-3 w-3" />
            {investagon.ausInvestagon ? `Investagon${investagon.stand ? `, Stand ${formatDatum(investagon.stand)}` : ""}` : "Handanlage im CRM"}
          </Badge>
          {/* „Objekt bearbeiten“ schreibt in Spalten, die der Abgleich zurückholt: nur bei Handanlage. */}
          {!globalobjekt && darfPflegen && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/objekte/${objekt.id}/verwaltung`)}><Pencil className="h-3.5 w-3.5" /> Objekt bearbeiten</Button>
          )}
        </div>
      </div>
      {/* Ohne Aktionskarte steht hier, warum „Objekt bearbeiten“ fehlt. */}
      {!globalobjekt && !pflegbar && (
        <Hinweis className="-mt-2 mb-4">
          {PFLEGE_GESPERRT_HINWEIS}{istAdmin ? " Objektdetails, Beschreibung und Standort änderst du über den Stift an der jeweiligen Karte. Das fasst der Abgleich nicht an." : ""}
        </Hinweis>
      )}

      {/*
        * Anordnung seit dem 24.09.2026 (Christians Vorgabe): alles
        * untereinander über die ganze Breite, nur die Kennzahlen teilen sich
        * ihre Zeile mit dem Verkaufsstand.
        *
        * Die Seitenleiste von 320 beziehungsweise 360 Pixeln ist damit
        * entfallen. Der Verkaufsstand steht ab `xl` rechts neben den acht
        * Kacheln, dort liegen sie 4 × 2. Das Raster streckt beide Spalten auf
        * dieselbe Höhe, gleiche Ober- und Unterkante ergeben sich also von
        * selbst. Darunter liegen die Kacheln 2 × 4, dann steht der
        * Verkaufsstand unter ihnen, sonst würde er auf dem Tablet vier
        * Kachelreihen hoch.
        *
        * Objektpartner und Aktionen gibt es nur in manchen Fällen. Sie folgen
        * direkt unter den Kennzahlen, damit die Knöpfe des Globalobjekts
        * nicht unter der Einheitenliste verschwinden.
        */}
      {/*
        Reiterleiste seit dem 01.10.2026 (Christians Vorgabe), im Stil der
        Einheitsseite. Dokumente und Karte standen vorher als Reiter unter
        der Galerie, ein Reiter „Fotos“ entfällt: Die Galerie steht in der
        Übersicht immer oben. Die Übersicht wird nur ausgeblendet, nicht
        ausgehängt, damit Galerie und Bilder beim Zurückwechseln stehen.
      */}
      <Tabs value={reiter} onValueChange={setReiter}>
        {/* Immer links, wie auf der Einheitsseite (Christian, 05.10.2026). */}
        <TabsList className="mb-4 grid h-auto w-full max-w-lg grid-cols-3 justify-start gap-1 rounded-xl p-1">
          <TabsTrigger value="uebersicht" className={REITER_KLASSE}>Übersicht</TabsTrigger>
          <TabsTrigger value="dokumente" className={REITER_KLASSE}>Dokumente{dokumenteMitDatei.length > 0 ? ` (${dokumenteMitDatei.length})` : ""}</TabsTrigger>
          <TabsTrigger value="karte" className={REITER_KLASSE}>Karte</TabsTrigger>
        </TabsList>

        <TabsContent value="dokumente">
          {dokumenteMitDatei.length === 0 && !unterlagenLink ? (
            <EmptyState
              icon={FileText}
              title="Noch keine Dateien hinterlegt"
              description={darfPflegen ? 'Hochladen geht über „Objekt bearbeiten" im Schritt „Unterlagen".' : undefined}
            />
          ) : (
            // Dieselbe Ansicht wie im Reiter „Dokumente“ der Einheitsseite; hier nur der eine Bereich zum Objekt.
            <div className={KARTE}>
              <DokumenteAnsicht
                grundrissUebernahme={grundrissUebernahmeFuer(objekt)}
                zip={{ objektTitel: objekt.titel }}
                bereiche={[{
                  schluessel: "objekt",
                  titel: "Dokumente zum Objekt",
                  eintraege: dokumenteMitDatei,
                  link: unterlagenLink,
                  linkLabel: "Objektunterlagen öffnen",
                }]}
              />
            </div>
          )}
          <Hinweis>
            Hier stehen nur Unterlagen, die für das ganze Objekt gelten. Grundriss, Mietvertrag und Hausgeld einer Wohnung liegen auf der Einheiten-Seite. „Für Kunden freigegeben“ heißt: erscheint im Kundenlink und im Exposé.
          </Hinweis>
        </TabsContent>

        <TabsContent value="karte">
          <UmgebungsKarte adresse={adresse} titel={objekt.titel} hoehe={400} meta={objekt.meta} />
        </TabsContent>
      </Tabs>

      <div className={cn("space-y-4", reiter !== "uebersicht" && "hidden")}>
        <Galerie bilder={objekt.bilder} adresse={adresse} titel={objekt.titel} hoehe="aspect-[4/3] sm:aspect-auto sm:h-80 lg:h-96 2xl:h-[30rem]"
          titelbildObjektId={darfTitelbild ? objekt.id : undefined} titelbildUrl={objekt.bildUrl}
          hinweis={`${investagon.ausInvestagon ? "Objektfotos aus Investagon." : "Objektfotos aus der Objektanlage."} Ein Klick auf ein Bild öffnet die Vollbildansicht${darfTitelbild ? ", dort lässt sich auch das Titelbild setzen" : ""}.`} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]" data-testid="zeile-kennzahlen">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kachel label="Wohnfläche" wert={spanneText(k.wohnflaeche, (n) => `${dez(n, 1)} m²`)} unter={k.wohnflaecheGesamt > 0 ? `${dez(k.wohnflaecheGesamt, 1)} m² gesamt` : undefined} />
            <Kachel label="Zimmer" wert={spanneText(k.zimmer, (n) => String(n))} />
            <Kachel label="Kaufpreis" wert={spanneText(k.kaufpreis, eur0)} unter={k.volumen > 0 ? `Volumen ${eur0(k.volumen)}` : undefined} />
            <Kachel label="Einheiten" wert={`${k.einheiten.gesamt} gesamt`} unter={<><b className="whitespace-nowrap text-[hsl(var(--success))]">{k.einheiten.frei} frei</b> · <b className="whitespace-nowrap text-[hsl(var(--warning))]">{k.einheiten.reserviert} reserviert</b> · <span className="whitespace-nowrap">{k.einheiten.verkauft} verkauft</span></>} />
            <Kachel label="Baujahr" wert={baujahr ? String(baujahr) : "Keine Angabe"} unter={sanierungSpanne ? `Sanierung ${sanierungSpanne}` : undefined} />
            <Kachel label="Kaltmiete je Monat" wert={spanneText(k.kaltmiete, eur0)} unter={k.kaltmieteJeQm ? `${dez(k.kaltmieteJeQm.von, 2)} bis ${dez(k.kaltmieteJeQm.bis, 2)} € je m²` : undefined} />
            <Kachel label="Rendite" wert={spanneText(k.rendite, (n) => prozent(n, 2))} unter="Jahreskaltmiete durch Kaufpreis" info="Die eine Rendite im CRM: zwölf Kaltmieten geteilt durch den Kaufpreis, ohne Nebenkosten, Hausgeld und Rücklage." />
            <Kachel label="Preis je m²" wert={spanneText(k.preisJeQm, eur0)} unter="Kaufpreis durch Wohnfläche" />
          </div>
          {verkaufsstandKarte}
        </div>

        {(partnerProfil || globalobjekt) && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {partnerKarte}
            {aktionenKarte}
          </div>
        )}

        {/*
          Kurzbeschreibung und Standortargumente, seit dem 22.09.2026 in
          einer eigenen Karte.

          Vorher standen hier zwei Freitextfelder aus der Objektpflege. Jetzt
          entstehen beide von selbst aus Objektangaben, Standortanalyse und
          Unterlagen, und die Karte sagt, woher der gezeigte Text stammt.
          Ändern kann sie nur der Admin, über den Stift an der Karte. Ein
          von Hand gepflegter Text gewinnt immer.
        */}
        {/*
          Beschreibung links, Objektdetails rechts, seit dem 24.09.2026.

          Der Text der Beschreibung ist ohnehin auf max-w-3xl begrenzt, über
          die volle Breite blieb rechts nur leerer Raum. 7 zu 4 macht die
          Beschreibung bei 1440 px so breit wie ihren Text (rund 63 Prozent),
          schmaler würde er umbrechen. Die Spalten der Kennzahlenzeile
          (1fr und 320 px) passten nicht: links blieben rund 100 px leer,
          rechts wurde es für die Objektdetails eng. Oben bündig statt gleich
          hoch: Die Beschreibung ist mit Standort- und Marktargumenten meist
          doppelt so hoch, gestreckt bliebe rechts eine leere Fläche.
          Unter xl stehen beide Karten wie bisher untereinander.
        */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] xl:items-start" data-testid="zeile-beschreibung-details">
          <ObjektTexteKarte objekt={objekt} darfBearbeiten={istAdmin} className="min-w-0" />

          {/* Rechte Spalte: Objektdetails, darunter die internen Highlights (01.10.2026). */}
          <div className="min-w-0 space-y-4">
          <div className={KARTE} data-testid="karte-objektdetails">
            <KartenTitel rechts={onPflege && (
              <Button variant="ghost" size="icon" className="h-[40px] w-[40px] sm:h-7 sm:w-7" aria-label="Objektdetails bearbeiten" title="Objektdetails bearbeiten" onClick={onPflege}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}>Objektdetails</KartenTitel>
            {/* In der rechten Spalte untereinander, darunter volle Breite im Raster. */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1" data-testid="objektdetails-raster">
              <Detail icon={<Zap className="h-3.5 w-3.5" />} label="Energieausweis"
                wert={felder.energieausweis.klasse ? `Klasse ${felder.energieausweis.klasse}` : "Keine Angabe"}
                unter={[felder.energieausweis.art, felder.energieausweis.kennwert ? `${dez(felder.energieausweis.kennwert, 0)} kWh/(m²·a)` : "", felder.energieausweis.energietraeger, felder.energieausweis.gueltigBis ? `gültig bis ${felder.energieausweis.gueltigBis}` : ""].filter(Boolean).join(", ") || undefined} />
              <Detail icon={<Building2 className="h-3.5 w-3.5" />} label="Gemeinschaftseigentum"
                wert={details.gemeinschaftseigentum.wert}
                unter={details.gemeinschaftseigentum.unter} />
              <Detail icon={<Hammer className="h-3.5 w-3.5" />} label="Sanierungen"
                wert={details.sanierungen.wert}
                unter={[details.sanierungen.unter, details.sanierungen.art === "gepflegt" && sanierungSumme > 0 ? `${eur0(sanierungSumme)} gesamt, Anteil je WE nach MEA` : ""].filter(Boolean).join(", ") || undefined} />
              <Detail icon={<KeyRound className="h-3.5 w-3.5" />} label="Verwaltung"
                wert={details.verwaltung.wert}
                unter={details.verwaltung.unter} />
            </div>
          </div>
          <InterneHighlightsKarte objekt={objekt} />
          </div>
        </div>
      </div>

      {/* min-w-0 statt overflow-x: Die Tabelle scrollt in ihrer eigenen
          Karte, der Seitenrahmen bleibt stehen. */}
      <div className={cn("mt-4 min-w-0", reiter !== "uebersicht" && "hidden")}>
        {!globalobjekt && kundenaktionen && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="hinweis-kundenansicht">Kundenansicht und Kundenlink findest du auf jeder Einheitsseite.</p>
        )}
        <EinheitenTabelle wohnungen={imAngebot.wohnungen} onOeffnen={oeffneEinheit} kontext={rechteKontext} empfohleneIds={empfohleneIds}
          passendeKunden={passendeKunden} kundenScores={kundenScores} />
      </div>

      {/* Nur beim Globalobjekt, ohne Einheit: Der Dialog führt ins Formular für das ganze Haus. */}
      {hausKnopf === "reservierbar" && (
        <KundeZuordnenDialog objekt={objekt} offen={hausDialogOffen} onOpenChange={setHausDialogOffen}
          vorgewaehltesInvestmentId={empfehlung} bearbeiterName={user.name} />
      )}
      {/* „Kundenlink senden“ beim Globalobjekt: derselbe Dialog wie auf der Einheitsseite, für das ganze Haus. */}
      {/* Aus der Objektauswahl eines Kunden mit Kunde und Investment vorbelegt, weiterhin änderbar. */}
      {kundenlinkOffen && (
        <ExposeErzeugenDialog objekt={objekt} ganzesObjekt offen={kundenlinkOffen} onOpenChange={setKundenlinkOffen}
          vorgewaehlterKundeId={empfehlungKundeId ?? null} vorgewaehltesInvestmentId={empfehlung} />
      )}
    </div>
  );
}
