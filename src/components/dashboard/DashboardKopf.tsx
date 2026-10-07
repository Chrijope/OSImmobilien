/**
 * Filterleiste und Kennzahlen ganz oben auf dem Dashboard.
 *
 * Vorher gab es keinen einzigen Filter. Umsatz, Provision und Notartermine
 * standen fest auf dem laufenden Kalenderjahr, und wer eine Zahl für den
 * letzten Monat brauchte, musste auf die Statistiken-Seite wechseln.
 *
 * Die Auswahl wird gespeichert, damit sie den nächsten Besuch überlebt.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Kennzahl } from "@/components/ui/kennzahl";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Users, Inbox } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { formatDatumFlexibel } from "@/lib/datumsformate";
import { getInvestments } from "@/lib/investmentsStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { istFuehrungskraft, teamMitgliederIds } from "@/lib/datenSicht";
import { loadZielplanung } from "@/lib/zielplanungStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useDashboardFilter } from "@/lib/dashboardSicht";
import { zaehleEigeneInboxKacheln } from "@/lib/inboxKpiCounts";
import { sammleOffenePunkte, zaehleOffenePunkte } from "@/lib/offenePunkte";
import { getFollowUps } from "@/lib/followUpStore";
import { getAufgaben } from "@/lib/aufgabenStore";
import { liegtInZukunft } from "@/lib/faelligkeit";
import { kontaktKaufpreis } from "@/lib/objektDatenPflicht";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
import {
  berechneDashboardKpis,
  zeitraumGrenzen,
  zielFuerZeitraum,
  type Sicht,
  type Zeitraum,
  type KpiEintrag,
} from "@/lib/dashboardKpis";

const ZEITRAUM_LABEL: Record<Zeitraum, string> = {
  monat: "Monat",
  quartal: "Quartal",
  jahr: "Jahr",
};

const SICHT_LABEL: Record<Sicht, string> = {
  eigen: "Meine",
  team: "Mein Team",
  firma: "Ganze Firma",
};

const euro = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio €`
    : `${Math.round(v / 1000).toLocaleString("de-DE")} T€`;

export function DashboardKopf() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const liveVersion = useLiveVersion(["kontakte", "investments", "aufgaben", "follow_ups", "bewerbungen", "aktivitaeten", "user_settings"]);

  // Wer über die eigenen Zahlen hinaussehen darf, steht in `datenSicht`. Hier
  // stand dieselbe Liste noch einmal als Aufzählung.
  const weiteSicht = istFuehrungskraft(user.role);

  const { zeitraum, sicht, setzeZeitraum: waehleZeitraum, setzeSicht: waehleSicht } =
    useDashboardFilter(weiteSicht);
  const [inboxTick, setInboxTick] = useState(0);

  useEffect(() => {
    const refresh = () => setInboxTick((v) => v + 1);
    window.addEventListener("inbox-updated", refresh);
    window.addEventListener("inbox-count-updated", refresh);
    window.addEventListener("followups-updated", refresh);
    return () => {
      window.removeEventListener("inbox-updated", refresh);
      window.removeEventListener("inbox-count-updated", refresh);
      window.removeEventListener("followups-updated", refresh);
    };
  }, []);

  const kpis = useMemo(() => {
    const { von, bis } = zeitraumGrenzen(zeitraum);

    const alleKontakte = getKontakte();
    const teamIds = teamMitgliederIds(authUser?.id);

    const passt = (k: Parameters<typeof kontaktBelongsToUser>[0]) => {
      if (sicht === "firma") return true;
      const eigen = kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id });
      if (sicht === "eigen") return eigen;
      const zustaendig = k.zustaendig_id || (k as { zustaendigId?: string }).zustaendigId;
      return eigen || (!!zustaendig && teamIds.has(zustaendig));
    };

    const kontakte = alleKontakte.filter(passt);
    const erlaubteIds = new Set(kontakte.map((k) => k.id));
    const investments = getInvestments().filter(
      (i) => sicht === "firma" || erlaubteIds.has(i.kontaktId),
    );

    // Ziel aus der eigenen Monatsplanung, genau über die betroffenen Monate.
    let ziel = 0;
    try {
      ziel = zielFuerZeitraum(loadZielplanung()?.verkaufsvolumen, zeitraum);
    } catch { /* ignore */ }

    return berechneDashboardKpis({
      kontakte: kontakte.map((k) => ({
        id: k.id,
        pipelineStufe: k.pipelineStufe,
        // Immer vom Investment, der Kontaktwert ist nur Rueckfall.
        kaufpreis: kontaktKaufpreis(k.id, k.kaufpreis),
        erstellt_am: k.erstellt_am,
        archiviert: k.archiviert,
      })),
      investments: investments.map((i) => ({
        id: i.id,
        kontaktId: i.kontaktId,
        kaufpreis: (i as { kaufpreis?: number }).kaufpreis,
        notarTermin: i.notarTermin,
        pipelineStufe: i.pipelineStufe,
      })),
      aufgaben: [],
      von,
      bis,
      ziel: sicht === "eigen" ? ziel : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zeitraum, sicht, user.name, authUser?.id, liveVersion]);

  // In der eigenen Sicht wird exakt die eigene Inbox gezählt, mit derselben
  // Funktion und denselben Kästchen wie dort. Nur so stimmen die Zahlen auf
  // beiden Seiten überein.
  //
  // Team- und Firmensicht kann die Inbox nicht abbilden, sie kennt nur die
  // eigene Liste. Dafür greift die gemeinsame Auswertung über alle Kunden im
  // gewählten Umfang.
  const punkte = useMemo(() => {
    if (sicht === "eigen") {
      return zaehleEigeneInboxKacheln({
        userName: user.name,
        userId: authUser?.id,
        role: user.role,
        // Auf dem Dashboard zählt nur, was heute ansteht oder überfällig ist.
        nurFaellig: true,
      });
    }

    const alleKontakte = getKontakte();
    const meineKundenIds = new Set(
      alleKontakte
        .filter((k) => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id }))
        .map((k) => k.id),
    );
    const teamIds = teamMitgliederIds(authUser?.id);
    const teamKundenIds = new Set(
      alleKontakte
        .filter((k) => {
          const z = k.zustaendig_id || (k as { zustaendigId?: string }).zustaendigId;
          return !!z && teamIds.has(z);
        })
        .map((k) => k.id),
    );

    return zaehleOffenePunkte(
      sammleOffenePunkte({
        followUps: getFollowUps().map((f) => ({
          id: f.id,
          kundeId: f.kundeId,
          kundeName: f.kundeName,
          titel: f.titel,
          faelligAm: f.faelligAm,
          status: f.status,
        })),
        aufgaben: getAufgaben().map((a) => ({
          id: a.id,
          kontaktId: a.kontaktId,
          typ: a.typ,
          titel: a.titel,
          faelligAm: a.faelligAm,
          uhrzeit: a.uhrzeit,
          status: a.status,
          zugewiesenAn: a.zugewiesenAn,
          benutzerId: a.benutzerId,
        })),
        meineKundenIds,
        teamKundenIds,
        sicht,
        userId: authUser?.id,
      }).filter((p) => !liegtInZukunft(p.faelligAm)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sicht, user.name, user.role, authUser?.id, liveVersion, inboxTick]);

  /*
   * Was hinter einer Zahl steckt.
   *
   * Eine Kachel wie "14 aktive Leads" ist ohne Nachweis eine Behauptung: Man
   * sieht die Zahl, kann sie aber nicht pruefen und nicht handeln. Ein Klick
   * oeffnet deshalb die Liste der Kunden dahinter, jede Zeile fuehrt in die
   * Kundenakte.
   */
  const [detail, setDetail] = useState<{ titel: string; zusatz?: string; eintraege: KpiEintrag[]; erklaerung?: string } | null>(null);

  /** Notartermine liegen als ISO oder als TT.MM.JJJJ vor, beides soll lesbar sein. */
  const alsDatum = (wert?: string): string => {
    // Kalendertage aus ihren Datumsteilen, Zeitpunkte in deutscher Zeit.
    return wert ? formatDatumFlexibel(wert) : "";
  };

  const kundeName = (kontaktId: string): string => {
    const k = getKontakte().find((x) => x.id === kontaktId);
    if (!k) return "Unbekannter Kontakt";
    // Im Vorfuehrmodus steht hier ein gleichbleibendes Kuerzel statt des Namens.
    return tarnName(`${k.vorname || ""} ${k.nachname || ""}`.trim()) || "Ohne Namen";
  };
  /*
   * Der Vergleichswert des ganzen Hauses.
   *
   * "Deine Conversion: 12 Prozent" ist ohne Bezug schwer zu deuten. Ist das
   * gut? Erst der Schnitt daneben macht daraus eine Aussage. Berechnet wird er
   * mit derselben Funktion ueber alle Kontakte, damit beide Zahlen wirklich
   * vergleichbar sind.
   *
   * Nur fuer die eigene Sicht: Wer ohnehin das ganze Haus ansieht, vergleicht
   * sich mit sich selbst.
   */
  const hausSchnitt = useMemo(() => {
    if (sicht !== "eigen") return null;
    const { von, bis } = zeitraumGrenzen(zeitraum);
    const alle = getKontakte();
    return berechneDashboardKpis({
      kontakte: alle.map((k) => ({
        id: k.id,
        pipelineStufe: k.pipelineStufe,
        // Immer vom Investment, der Kontaktwert ist nur Rueckfall.
        kaufpreis: kontaktKaufpreis(k.id, k.kaufpreis),
        erstellt_am: k.erstellt_am,
        archiviert: k.archiviert,
      })),
      investments: getInvestments().map((i) => ({
        id: i.id,
        kontaktId: i.kontaktId,
        kaufpreis: (i as { kaufpreis?: number }).kaufpreis,
        notarTermin: i.notarTermin,
        pipelineStufe: i.pipelineStufe,
      })),
      aufgaben: [],
      von,
      bis,
    }).conversionProzent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sicht, zeitraum, liveVersion]);

  const kacheln: Array<{
    bereich: "heute" | "fortschritt";
    label: string;
    wert: string;
    zusatz?: string;
    ton?: "gut" | "warn";
    ziel?: string;
    zielText?: string;
    /** Datensaetze hinter der Zahl. Vorhanden heisst: die Kachel ist anklickbar. */
    eintraege?: KpiEintrag[];
    detailZusatz?: string;
    /**
     * Wie die Zahl zustande kommt, im Klartext und mit den Pipelinestufen, die
     * hineinzaehlen. Erscheint beim Ueberfahren und noch einmal im Dialog.
     *
     * Der Anlass war eine Rueckfrage, die sich ohne diese Angabe nicht
     * beantworten liess: Warum zeigt "Offene Reservierungen" sieben, wenn in
     * der Pipelinestufe Reservierung nur drei stehen? Die Antwort ist, dass
     * die Kachel zwei Stufen zaehlt. Das steht jetzt dort, wo die Frage
     * entsteht, und nicht nur im Quelltext.
     */
    erklaerung?: string;
  }> = [
    {
      bereich: "fortschritt",
      label: "Umsatz beurkundet",
      wert: euro(kpis.umsatz),
      eintraege: kpis.umsatzEintraege,
      detailZusatz: "Beurkundete Notartermine im gewählten Zeitraum",
      erklaerung:
        "Summe der Kaufpreise aller Investments, deren Notartermin im gewählten Zeitraum liegt und beurkundet ist. " +
        "Maßgeblich ist das Datum der Beurkundung, nicht das der Reservierung. " +
        "Ein geplanter, noch nicht beurkundeter Termin zählt nicht mit. " +
        "Das ist Kaufpreisvolumen, nicht Provisionserlös.",
      zusatz:
        kpis.zielProzent !== null
          ? `${kpis.zielProzent} % vom Ziel (${euro(kpis.ziel)})`
          : "Kein Ziel hinterlegt",
      ton: kpis.zielProzent !== null && kpis.zielProzent >= 100 ? "gut" : undefined,
    },
    {
      bereich: "fortschritt",
      label: "Offene Reservierungen",
      wert: String(kpis.offeneReservierungen),
      eintraege: kpis.reservierungEintraege,
      detailZusatz: "Unterschrieben, noch nicht beim Notar. Zählt die Stufen Reservierung UND Finanzierung.",
      zusatz: "unterschrieben, noch nicht beim Notar",
      erklaerung:
        "Zählt zwei Pipelinestufen zusammen: Reservierung und Finanzierung. " +
        "Deshalb ist die Zahl höher als die Stufe Reservierung allein. " +
        "Wer bereits in der Finanzierung steht, hat die Reservierung unterschrieben, " +
        "ist aber noch nicht beim Notar, und genau das ist hier gemeint. " +
        "Nicht mitgezählt werden archivierte Kontakte und alles ab dem Notartermin.",
    },
    {
      bereich: "fortschritt",
      label: "Notartermine",
      wert: `${kpis.notarBeurkundet} / ${kpis.notarBeurkundet + kpis.notarGeplant}`,
      eintraege: kpis.notarEintraege,
      detailZusatz: "Alle Notartermine im gewählten Zeitraum, beurkundet und geplant",
      zusatz: "beurkundet von gesamt im Zeitraum",
    },
    {
      /*
       * Frueher "Aktive Leads" und alles, was weder gewonnen noch verloren war.
       * Darin steckten der unbearbeitete Lead von vorgestern und der
       * importierte Bestandskunde neben dem Kunden, der morgen reserviert.
       * Jetzt zaehlt die Zahl nur, woran gerade gearbeitet wird, und die
       * unbearbeiteten stehen als eigene Angabe darunter.
       */
      bereich: "fortschritt",
      label: "In Bearbeitung",
      wert: String(kpis.aktiveLeads),
      erklaerung:
        "Alle nicht archivierten Kontakte in diesen sechzehn Stufen: Nicht erreicht, Erreicht, Follow-Up, " +
        "Kontaktversuche, Vermögensaufbau, Erstgespräch geplant, Erstgespräch, EG NoShow, Beratungsgespräch, " +
        "BG NoShow, Selbstauskunft, Bonitätsunterlagen, Objektauswahl, Follow-Up Objekt, Reservierung, Finanzierung. " +
        "Die offenen Reservierungen sind darin also enthalten. " +
        "Nicht mitgezählt: Neuer Lead und Zugewiesen (die stehen als unbearbeitete Leads darunter), " +
        "alles ab dem Notartermin, Verloren und Archiviert.",
      zusatz:
        kpis.unbearbeiteteLeads > 0
          ? `dazu ${kpis.unbearbeiteteLeads.toLocaleString("de-DE")} unbearbeitete Leads`
          : "keine unbearbeiteten Leads",
      eintraege: kpis.leadEintraege,
      detailZusatz: "Vorgänge zwischen erstem Kontakt und Finanzierung",
    },
    {
      bereich: "fortschritt",
      label: "Conversion",
      wert: kpis.conversionProzent !== null ? `${kpis.conversionProzent} %` : "–",
      zusatz:
        hausSchnitt !== null && kpis.conversionProzent !== null
          ? `Erstgespräch bis Reservierung · Haus: ${hausSchnitt} %`
          : "Erstgespräch bis Reservierung",
      ton:
        hausSchnitt !== null && kpis.conversionProzent !== null
          ? (kpis.conversionProzent >= hausSchnitt ? "gut" : "warn")
          : undefined,
    },
    {
      bereich: "heute",
      label: "Offene Follow-Ups",
      wert: String(punkte.followUpsOffen),
      zusatz:
        punkte.followUpsUeberfaellig > 0
          ? `davon ${punkte.followUpsUeberfaellig} überfällig`
          : "keiner überfällig",
      ton: punkte.followUpsUeberfaellig > 0 ? "warn" : "gut",
      ziel: punkte.followUpsOffen > 0 ? `/inbox?umfang=${sicht}&art=follow_up` : undefined,
      zielText: "In der Inbox erledigen",
    },
    {
      bereich: "heute",
      label: "Offene Aufgaben",
      wert: String(punkte.aufgabenOffen),
      zusatz:
        punkte.aufgabenUeberfaellig > 0
          ? `davon ${punkte.aufgabenUeberfaellig} überfällig`
          : "keine überfällig",
      ton: punkte.aufgabenUeberfaellig > 0 ? "warn" : "gut",
      ziel: punkte.aufgabenOffen > 0 ? `/inbox?umfang=${sicht}&art=aufgabe` : undefined,
      zielText: "In der Inbox erledigen",
    },
    {
      // Anrufe, Meetings und Deadlines sind in der Inbox eigene Filter. Sie
      // gehören weder zu den Follow-Ups noch zu den Aufgaben, dürfen aber auch
      // nicht unter den Tisch fallen.
      bereich: "heute",
      label: "Anrufe und Termine",
      wert: String(punkte.sonstigeOffen),
      zusatz:
        punkte.sonstigeUeberfaellig > 0
          ? `davon ${punkte.sonstigeUeberfaellig} überfällig`
          : "keine überfällig",
      ton: punkte.sonstigeUeberfaellig > 0 ? "warn" : "gut",
      ziel: punkte.sonstigeOffen > 0 ? `/inbox?umfang=${sicht}&art=termine` : undefined,
      zielText: "In der Inbox erledigen",
    },
  ];

  const renderKachel = (k: typeof kacheln[number]) => {
    const anklickbar = !!k.eintraege?.length;
    // Der Vorfuehrmodus zeichnet Betraege weich. Die Klasse kommt deshalb von
    // hier und nicht aus dem Baustein: Nur das Dashboard weiss, dass seine
    // Zahlen getarnt werden muessen.
    const inhalt = (
      <Kennzahl
        label={k.label}
        wert={k.wert}
        zusatz={k.zusatz}
        ton={k.ton === "warn" ? "warn" : k.ton === "gut" ? "gut" : "neutral"}
        wertClassName={unscharfKlasse("")}
        zusatzClassName={unscharfKlasse("")}
        zusatzIcon={
          k.ton === "gut" ? <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          : k.ton === "warn" ? <ArrowDownRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          : undefined
        }
      />
    );
    /*
     * Die Erklaerung sitzt auf der ganzen Kachel und nicht auf einem eigenen
     * Fragezeichen daneben. Ein Knopf im Knopf waere ungueltiges Markup, und
     * die Kachel ist bereits anklickbar. Sie ersetzt dabei das frueher
     * gesetzte title-Attribut: Das zeigte der Browser in seiner eigenen Optik
     * und erst nach gut einer Sekunde.
     */
    const kachelKarte = (
      <Card key={k.label} className={`min-w-0 overflow-hidden ${k.bereich === "heute" ? "border-primary/15 shadow-none" : "shadow-none"}`}>
        {anklickbar ? (
          <button type="button" onClick={() => setDetail({ titel: k.label, zusatz: k.detailZusatz, eintraege: k.eintraege!, erklaerung: k.erklaerung })}
            className="block h-full w-full p-5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            {inhalt}
          </button>
        ) : <div className="p-5">{inhalt}
          {k.ziel && <button type="button" onClick={() => navigate(k.ziel!)}
            className="mt-4 flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {k.zielText || "Öffnen"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>}
        </div>}
      </Card>
    );

    if (!k.erklaerung) return kachelKarte;
    /*
     * Eigener Provider je Kachel, wie in SetterKpiCard. In der App haengt
     * zwar einer in App.tsx, aber die Komponente soll auch dort noch
     * funktionieren, wo keiner darueber steht, etwa im Test. Radix laesst
     * verschachtelte Provider ausdruecklich zu.
     */
    return (
      <TooltipProvider key={k.label} delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{kachelKarte}</TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[22rem] text-xs leading-relaxed">
          {k.erklaerung}
          {anklickbar && <span className="mt-1.5 block text-muted-foreground">Klicken zeigt die Liste dahinter.</span>}
        </TooltipContent>
      </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Dein Überblick</p>
        {/*
          Die Sichtwahl erscheint nur, wenn es wirklich etwas zu waehlen gibt.
          Wer keine weite Sicht hat, sah bisher einen einzigen Knopf "Meine",
          der nichts umschaltet: Er zeigt an, was ohnehin das Einzige ist.
          Das ist keine Bedienung, sondern eine Behauptung von Auswahl.
        */}
        {weiteSicht && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Datensicht">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {(Object.keys(SICHT_LABEL) as Sicht[]).map((s) => (
            <button key={s} type="button" aria-pressed={sicht === s} onClick={() => waehleSicht(s)}
              className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sicht === s ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-muted"}`}>
              {SICHT_LABEL[s]}
            </button>
          ))}
        </div>
        )}
      </div>

      <section aria-labelledby="dashboard-heute-title" className="rounded-2xl border border-primary/20 border-l-4 border-l-primary bg-accent/30 p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="dashboard-heute-title" className="text-xl font-semibold tracking-tight">Heute im Fokus</h2>
            <p className="mt-1 text-sm text-muted-foreground">Heute fällig und überfällig · {SICHT_LABEL[sicht]}</p>
          </div>
          {/* Hauptaktion des Dashboards, deshalb Marken-Orange. */}
          <Link to={`/inbox?umfang=${sicht}`} className="btn-brand inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2">
            <Inbox className="h-4 w-4" aria-hidden="true" />Inbox öffnen<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {kacheln.filter((k) => k.bereich === "heute").map(renderKachel)}
        </div>
      </section>

      {/*
        Fortschritt und Kennzahlen zeigen Vertriebszahlen: Abschluesse,
        Umsatz, Pipeline. Die Rolle `hr` fuehrt Bewerber und keine Verkaeufe.
        Ihr Zuschnitt sagt ausdruecklich: keine Kunden, keine Objekte, keine
        Umsaetze. Der ganze Abschnitt ist fuer sie deshalb Beiwerk, das vom
        Wesentlichen ablenkt. Ihre eigenen Zahlen stehen in der Bewerberkarte
        darunter und im Reiter Recruiting der Statistiken.
      */}
      {user.role !== "hr" && (
      <section aria-labelledby="dashboard-fortschritt-title">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="dashboard-fortschritt-title" className="text-xl font-semibold tracking-tight">Fortschritt & Kennzahlen</h2>
            <p className="mt-1 text-sm text-muted-foreground">{SICHT_LABEL[sicht]} · {zeitraum === "monat" ? "Aktueller Monat" : zeitraum === "quartal" ? "Aktuelles Quartal" : "Aktuelles Jahr"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zeitraum der Kennzahlen">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {(Object.keys(ZEITRAUM_LABEL) as Zeitraum[]).map((z) => (
              <button key={z} type="button" aria-pressed={zeitraum === z} onClick={() => waehleZeitraum(z)}
                className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${zeitraum === z ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                {ZEITRAUM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {kacheln.filter((k) => k.bereich === "fortschritt").map(renderKachel)}
        </div>
      </section>
      )}

      {/*
        Die Liste hinter einer Kennzahl.

        Jede Zeile fuehrt in die Kundenakte, denn eine Liste, aus der man nicht
        weiterkommt, beantwortet nur die halbe Frage. Betrag und Datum stehen
        rechts, damit die Summe der Kachel nachvollziehbar bleibt.
      */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.titel}</DialogTitle>
            {detail?.zusatz && <DialogDescription>{detail.zusatz}</DialogDescription>}
          </DialogHeader>

          {/* Dieselbe Erklaerung wie am Tooltip. Wer den Dialog ueber die
              Tastatur oeffnet, hat den Tooltip nie gesehen. */}
          {detail?.erklaerung && (
            <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {detail.erklaerung}
            </p>
          )}

          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {detail?.eintraege.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Keine Einträge im gewählten Zeitraum.
              </p>
            ) : (
              <ul className="divide-y">
                {detail?.eintraege.map((e, i) => (
                  <li key={`${e.kontaktId}-${e.investmentId || i}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/50 rounded-sm px-2"
                      onClick={() => {
                        setDetail(null);
                        navigate(`/kunden/${e.kontaktId}`);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {kundeName(e.kontaktId)}
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {e.datum && <span className="mr-2">{alsDatum(e.datum)}</span>}
                        {e.betrag != null && e.betrag > 0 && (
                          <span className={unscharfKlasse("font-medium text-foreground tabular-nums")}>{euro(e.betrag)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {detail?.eintraege.length ?? 0}{" "}
            {(detail?.eintraege.length ?? 0) === 1 ? "Eintrag" : "Einträge"} · Ein Klick öffnet die Kundenakte
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
