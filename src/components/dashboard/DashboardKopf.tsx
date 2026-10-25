import { HeuteZuTun } from "./HeuteZuTun";
/**
 * Filterleiste und Kennzahlen ganz oben auf dem Dashboard.
 *
 * Vorher gab es keinen einzigen Filter. Umsatz, Provision und Notartermine
 * standen fest auf dem laufenden Kalenderjahr, und wer eine Zahl für den
 * letzten Monat brauchte, musste auf die Statistiken-Seite wechseln.
 *
 * Die Auswahl wird gespeichert, damit sie den nächsten Besuch überlebt.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Kennzahl } from "@/components/ui/kennzahl";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Users, Inbox, BellRing, ListChecks, PhoneCall, Euro, CircleAlert, UserPlus, Bookmark, Stamp, Hourglass, TrendingUp, type LucideIcon } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { formatDatumFlexibel } from "@/lib/datumsformate";
import { getInvestments } from "@/lib/investmentsStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { istFuehrungskraft, teamMitgliederIds } from "@/lib/datenSicht";
import { loadZielplanung } from "@/lib/zielplanungStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useDashboardFilter } from "@/lib/dashboardSicht";
import { kontaktKaufpreis, investmentKaufpreis } from "@/lib/objektDatenPflicht";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
import { istNieKontaktiert, istOhneNaechstenSchritt, type LiegengebliebenPruefung } from "@/lib/liegengeblieben";
import { kontaktQuellen } from "@/lib/kontaktTermine";
import { hatGeplantenTermin } from "@/lib/naechsterKontakt";
import { getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { istInWartezeit } from "@/lib/kontaktversuchSchedule";
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

/** Farbakzent je Kennzahl: Icon-Kästchen im Titel und Linie oben an der Kachel. */
const KACHEL_AKZENT: Record<string, { icon: LucideIcon; chip: string; linie: string }> = {
  "Offene Follow-Ups": { icon: BellRing, chip: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300", linie: "border-t-blue-500" },
  "Offene Aufgaben": { icon: ListChecks, chip: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300", linie: "border-t-orange-500" },
  "Ohne nächsten Schritt": { icon: CircleAlert, chip: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300", linie: "border-t-red-500" },
  "Neu, noch kein Kontakt": { icon: UserPlus, chip: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300", linie: "border-t-sky-500" },
  "Anrufe und Termine": { icon: PhoneCall, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300", linie: "border-t-emerald-500" },
  "Umsatz beurkundet": { icon: Euro, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300", linie: "border-t-emerald-500" },
  "Offene Reservierungen": { icon: Bookmark, chip: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300", linie: "border-t-blue-500" },
  "Notartermine": { icon: Stamp, chip: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300", linie: "border-t-violet-500" },
  "In Bearbeitung": { icon: Hourglass, chip: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300", linie: "border-t-amber-500" },
  "Conversion": { icon: TrendingUp, chip: "bg-pink-100 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300", linie: "border-t-pink-500" },
};

export function DashboardKopf() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const liveVersion = useLiveVersion(["kontakte", "investments", "aufgaben", "follow_ups", "bewerbungen", "aktivitaeten", "user_settings"]);

  // Wer über die eigenen Zahlen hinaussehen darf, steht in `datenSicht`. Hier
  // stand dieselbe Liste noch einmal als Aufzählung.
  const weiteSicht = istFuehrungskraft(user.role);

  const { zeitraum, sicht, setzeZeitraum: waehleZeitraum, setzeSicht: waehleSicht } =
    useDashboardFilter(weiteSicht);
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
        // Der Kaufpreis steht in den Objektdaten des Investments, nicht als
        // Feld am Investment. Vorher stand hier ein Feld, das es nicht gibt,
        // und Umsatz und Beträge blieben bei null (11.10.2026).
        kaufpreis: investmentKaufpreis(i.id),
        notarTermin: i.notarTermin,
        pipelineStufe: i.pipelineStufe,
        erstellt_am: i.erstellt_am,
      })),
      aufgaben: [],
      von,
      bis,
      ziel: sicht === "eigen" ? ziel : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zeitraum, sicht, user.name, authUser?.id, liveVersion]);

  /*
   * Was hinter einer Zahl steckt.
   *
   * Eine Kachel wie "14 aktive Leads" ist ohne Nachweis eine Behauptung: Man
   * sieht die Zahl, kann sie aber nicht pruefen und nicht handeln. Ein Klick
   * oeffnet deshalb die Liste der Kunden dahinter, jede Zeile fuehrt in die
   * Kundenakte.
   */
  /*
   * Liegengebliebenes (24.10.2026): Kontakte ohne geplanten nächsten Schritt
   * und neue Leads ohne ersten Kontakt, im gewählten Umfang. Dieselbe Regel
   * wie die Ansichten in „Alle Kontakte“ (liegengeblieben.ts). Der Klick zeigt
   * die Kunden dahinter, damit Zahl und Liste immer übereinstimmen.
   */
  const liegen = useMemo(() => {
    const teamIds = teamMitgliederIds(authUser?.id);
    const kontakte = getKontakte().filter((k) => {
      if (sicht === "firma") return true;
      const eigen = kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id });
      if (sicht === "eigen") return eigen;
      const zustaendig = k.zustaendig_id || (k as { zustaendigId?: string }).zustaendigId;
      return eigen || (!!zustaendig && teamIds.has(zustaendig));
    });
    const jetzt = Date.now();
    const pruefung: LiegengebliebenPruefung = {
      hatTermin: (k) => { try { return hatGeplantenTermin(kontaktQuellen(k), jetzt); } catch { return true; } },
      inWartezeit: (k) => istInWartezeit(k.verstecktBis),
      stufe: getEffectivePipelineStufe,
    };
    const ohneSchritt: KpiEintrag[] = [];
    const neu: KpiEintrag[] = [];
    for (const k of kontakte) {
      if (istNieKontaktiert(k, pruefung)) neu.push({ kontaktId: k.id });
      else if (istOhneNaechstenSchritt(k, pruefung)) ohneSchritt.push({ kontaktId: k.id });
    }
    return { ohneSchritt, neu };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sicht, user.name, authUser?.id, liveVersion]);

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
        // Der Kaufpreis steht in den Objektdaten des Investments, nicht als
        // Feld am Investment. Vorher stand hier ein Feld, das es nicht gibt,
        // und Umsatz und Beträge blieben bei null (11.10.2026).
        kaufpreis: investmentKaufpreis(i.id),
        notarTermin: i.notarTermin,
        pipelineStufe: i.pipelineStufe,
        erstellt_am: i.erstellt_am,
      })),
      aufgaben: [],
      von,
      bis,
    }).conversionProzent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sicht, zeitraum, liveVersion]);

  const kacheln: Array<{
    bereich: "heute" | "fortschritt" | "hinweise";
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
      detailZusatz: "Unterschrieben, noch nicht beim Notar. Zählt die Stufen Reservierung, Finanzierung, Termin Bankgutachter UND Besichtigung.",
      zusatz: "unterschrieben, noch nicht beim Notar",
      erklaerung:
        "Zählt vier Pipelinestufen zusammen: Reservierung, Finanzierung, Termin Bankgutachter und Besichtigung. " +
        "Deshalb ist die Zahl höher als die Stufe Reservierung allein. " +
        "Wer bereits bei Finanzierung, Bankgutachter oder Besichtigung steht, hat die Reservierung unterschrieben, " +
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
        "Alle nicht archivierten Kontakte in diesen 18 Stufen: Nicht erreicht, Erreicht, Follow-Up, " +
        "Kontaktversuche, Vermögensaufbau, Erstgespräch geplant, Qualifizierungsgespräch, QG NoShow, Beratungspräsentation, " +
        "BP NoShow, Selbstauskunft & Unterlagen, Bonitätsunterlagen (alte Stufe), Objektpräsentation / Closing, Follow-Up Objekt, " +
        "Reservierung, Finanzierung, Termin Bankgutachter, Besichtigung. " +
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
      bereich: "hinweise",
      label: "Ohne nächsten Schritt",
      wert: String(liegen.ohneSchritt.length),
      zusatz: liegen.ohneSchritt.length > 0 ? "kein Termin, keine Aufgabe, kein Follow-Up" : "alle haben einen nächsten Schritt",
      ton: liegen.ohneSchritt.length > 0 ? "warn" : "gut",
      eintraege: liegen.ohneSchritt,
      detailZusatz: "Kontakte ohne geplanten nächsten Schritt. Im Profil einen Termin, eine Aufgabe oder ein Follow-Up anlegen.",
      erklaerung:
        "Zählt Kontakte, bei denen in der Zukunft weder ein Termin noch eine Aufgabe noch ein Follow-Up geplant ist " +
        "und die auch nicht in der Wartezeit nach „nicht erreicht“ stehen. Verlorene und archivierte zählen nicht, " +
        "neue Leads ohne ersten Kontakt stehen in der Kachel daneben. In „Alle Kontakte“ als Ansicht „Ohne nächsten Schritt“.",
    },
    {
      bereich: "hinweise",
      label: "Neu, noch kein Kontakt",
      wert: String(liegen.neu.length),
      zusatz: liegen.neu.length > 0 ? "noch nie angerufen" : "alle neuen Leads sind kontaktiert",
      ton: liegen.neu.length > 0 ? "warn" : "gut",
      eintraege: liegen.neu,
      detailZusatz: "Neue Leads ohne Kontaktversuch und ohne Termin.",
      erklaerung:
        "Zählt Kontakte in der Stufe Neuer Lead ohne Kontaktversuch, ohne Termin und ohne Wartezeit. " +
        "Dieselbe Regel wie die Ansicht „Neu / kein Kontakt“ in „Alle Kontakte“.",
    },
  ];

  const renderKachel = (k: typeof kacheln[number]) => {
    const akzent = KACHEL_AKZENT[k.label];
    const anklickbar = !!k.eintraege?.length;
    // Der Vorfuehrmodus zeichnet Betraege weich. Die Klasse kommt deshalb von
    // hier und nicht aus dem Baustein: Nur das Dashboard weiss, dass seine
    // Zahlen getarnt werden muessen.
    const inhalt = (
      <Kennzahl
        label={akzent ? (
          <span className="flex items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${akzent.chip}`}>
              <akzent.icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {k.label}
          </span>
        ) : k.label}
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
      <Card key={k.label} className={`min-w-0 overflow-hidden border-t-[3px] ${akzent?.linie ?? ""} ${k.bereich === "heute" ? "border-primary/15 shadow-none" : "shadow-none"}`}>
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
    <div data-studio="dashboard-kopf" className="space-y-6">
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

      <HeuteZuTun sicht={sicht} />

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

      <section aria-label="Kontakte im Blick behalten" className="grid gap-3 sm:grid-cols-2 col-span-full">
        {kacheln.filter(k => k.bereich === "hinweise").map(renderKachel)}
      </section>

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
