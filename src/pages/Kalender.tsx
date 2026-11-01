import { useState, useEffect, useMemo, useCallback } from "react";
import { SaisonEi } from "@/components/saison/Saisonfiguren";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { useBisUntenBuendig } from "@/hooks/useBisUntenBuendig";
import { TagesZeitleiste } from "@/components/kalender/TagesZeitleiste";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Settings, RefreshCw, Loader2, Clock, MapPin, User, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ladeKalenderVerbindungen, type KalenderVerbindung } from "@/lib/kalenderSync";
import { useUser } from "@/contexts/UserContext";
import { KalenderKonten } from "@/components/kalender/KalenderKonten";
import { gleicheKalenderAb } from "@/lib/kalenderRueckrichtung";
import {
  sammleEigeneTermine,
  sammleBuchungsTermine,
  sammleWeeklyCallTermine,
  zuFremdEintrag,
  fuegeTermineZusammen,
  gruppiereNachTag,
  tagSchluessel,
  type KalenderEintrag,
  type FremdQuelle,
} from "@/lib/kalenderTermine";
import { trageOffeneTermineNach } from "@/lib/kalenderNachtrag";
import { getAlleTermine } from "@/lib/aktivitaetenStore";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { onCacheChange } from "@/lib/dataCache";
import { ladeBuchungen, type Buchung } from "@/lib/buchungStore";
import { toast } from "sonner";
import { callRundenFuer } from "@/lib/weeklyCallZeit";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(eintrag: KalenderEintrag) {
  if (eintrag.ganztags) return "Ganztägig";
  return new Date(eintrag.zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Die Farbe trennt die Ebenen: Eigene CRM-Termine in Markenblau, ueber den
 * Buchungslink gebuchte Videocalls in Gruen, alles aus einem fremden Kalender
 * in Grau. Wer den Kalender aufschlaegt, soll ohne Legende erkennen, was
 * seine Arbeit ist und was nur die Zeit belegt.
 */
function farbeFuer(eintrag: KalenderEintrag): string {
  if (eintrag.quelle === "crm") return "bg-primary/15 text-primary border border-primary/30";
  if (eintrag.quelle === "buchung") return "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30";
  return "bg-muted text-muted-foreground border border-border";
}

const QUELLE_LABEL: Record<KalenderEintrag["quelle"], string> = {
  crm: "CRM",
  google: "Google",
  apple: "Apple",
  microsoft: "Outlook",
  caldav: "CalDAV",
  abo: "Abo",
  buchung: "Videocall",
};

const Kalender = () => {
  const navigate = useNavigate();
  const [verbindungen, setVerbindungen] = useState<KalenderVerbindung[]>([]);
  const { user, authUser } = useUser();
  const [fremdTermine, setFremdTermine] = useState<KalenderEintrag[]>([]);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [view, setView] = useState<"month" | "week" | "tag">("month");
  const { ref: flaeche, mass } = useBisUntenBuendig<HTMLDivElement>();
  // Zaehler statt Datenliste: Die Termine kommen aus dem Zwischenspeicher,
  // hier wird nur ein neues Rechnen ausgeloest.
  const [datenStand, setDatenStand] = useState(0);

  const hasAnyCalendar = verbindungen.length > 0;
  const verbindungenLaden = useCallback(async () => setVerbindungen(await ladeKalenderVerbindungen(true)), []);
  useEffect(() => {
    void verbindungenLaden();
  }, [verbindungenLaden]);

  /** Kontakte, die dem angemeldeten Nutzer gehoeren, wie in der Inbox. */
  const ownedKundeIds = useMemo(() => {
    const ids = new Set<string>();
    try {
      getKontakte().forEach((k) => {
        if (kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id })) ids.add(k.id);
      });
    } catch { /* ignore */ }
    return ids;
  }, [user.name, authUser?.id, datenStand]);

  const namenJeKunde = useMemo(() => {
    const m = new Map<string, string>();
    try {
      getKontakte().forEach((k) => {
        m.set(k.id, [k.vorname, k.nachname].filter(Boolean).join(" ").trim() || (k as { name?: string }).name || "Kunde");
      });
    } catch { /* ignore */ }
    return m;
  }, [datenStand]);

  /** Die eigenen Termine. Sie brauchen keinen verbundenen Kalender. */
  const eigeneTermine = useMemo(
    () =>
      sammleEigeneTermine({
        aktivitaeten: getAlleTermine(),
        benutzerId: authUser?.id,
        erlaubteKundeIds: ownedKundeIds,
        namenJeKunde,
      }),
    [authUser?.id, ownedKundeIds, namenJeKunde, datenStand],
  );

  /**
   * Gebuchte Videocalls des angemeldeten Nutzers.
   *
   * Sie kommen aus `buchungen` und nicht aus den Aktivitaeten, deshalb die
   * eigene Ladung. Der Zeitraum entspricht dem der Fremdkalender: zwei Monate
   * vor und vier Monate nach der gezeigten Ansicht.
   */
  useEffect(() => {
    let abgebrochen = false;
    const von = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
    const bis = new Date(currentDate.getFullYear(), currentDate.getMonth() + 4, 0);
    void (async () => {
      try {
        const rohe = await ladeBuchungen({
          nurEigene: true,
          vonISO: von.toISOString(),
          bisISO: bis.toISOString(),
        });
        if (abgebrochen) return;
        setBuchungen(rohe);
      } catch {
        if (!abgebrochen) setBuchungen([]);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [currentDate, authUser?.id]);

  const buchungsTermine = useMemo(
    () =>
      sammleBuchungsTermine({
        buchungen,
        // Buchungen, deren Aktivitaet schon im Raster steht, fallen heraus.
        vorhandeneAktivitaetIds: new Set(
          eigeneTermine.map((e) => e.id.replace(/^crm-/, "")),
        ),
      }),
    [buchungen, eigeneTermine],
  );

  /** Der Weekly Sales Call, jeden Montag, nur der eigene Call (Leitung beide). */
  const weeklyCallTermine = useMemo(
    () =>
      sammleWeeklyCallTermine({
        runden: callRundenFuer(user.role, user.rollenVariante),
        von: new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1),
        bis: new Date(currentDate.getFullYear(), currentDate.getMonth() + 4, 0),
      }),
    [user.role, user.rollenVariante, currentDate],
  );

  const alleTermine = useMemo(
    () => fuegeTermineZusammen([...eigeneTermine, ...buchungsTermine, ...weeklyCallTermine], fremdTermine),
    [eigeneTermine, buchungsTermine, weeklyCallTermine, fremdTermine],
  );

  const termineJeTag = useMemo(() => gruppiereNachTag(alleTermine), [alleTermine]);

  // Neu geladene Aktivitaeten oder Kontakte sollen sofort im Raster stehen.
  useEffect(() => {
    const abmelden = onCacheChange((tabelle) => {
      if (tabelle === "aktivitaeten" || tabelle === "kontakte") setDatenStand((n) => n + 1);
    });
    return abmelden;
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!hasAnyCalendar) {
      setFremdTermine([]);
      return;
    }
    setLoading(true);
    const geladen: KalenderEintrag[] = [];

    // Zeitraum: zwei Monate vor und drei Monate nach der gezeigten Ansicht.
    const rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
    const rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 4, 0);
    const rohFuerAbgleich: Array<{ id: string; start: string; summary?: string }> = [];

    try {
      // Alle verbundenen Kalender auf einmal; ein gestörter hält die anderen nicht auf.
      const { data, error } = await supabase.functions.invoke("kalender", {
        body: { aktion: "termine", von: rangeStart.toISOString(), bis: rangeEnd.toISOString() },
      });
      if (error) throw error;
      for (const e of (data?.termine ?? []) as Array<{ id: string; uid?: string; art: FremdQuelle; titel: string; start: string; ende?: string; ort?: string }>) {
        rohFuerAbgleich.push({ id: e.id, start: e.start, summary: e.titel });
        // Ältere iCloud-Termine im CRM kennen nur die UID, neue die volle Adresse.
        if (e.uid && e.uid !== e.id) rohFuerAbgleich.push({ id: e.uid, start: e.start, summary: e.titel });
        const eintrag = zuFremdEintrag({ id: e.id, summary: e.titel, start: e.start, end: e.ende, location: e.ort }, e.art);
        if (eintrag) geladen.push(eintrag);
      }
      for (const f of (data?.fehler ?? []) as Array<{ konto: string; fehler: string }>) {
        toast.error(`Kalender ${f.konto}: ${f.fehler}`);
      }
    } catch (e) {
      console.error("Kalender fetch error:", e);
      toast.error("Fehler beim Laden der Termine");
    }

    setFremdTermine(geladen);
    setLoading(false);

    /*
     * Gegenrichtung: Wer einen CRM-Termin im eigenen Kalender verschiebt,
     * soll ihn im CRM nicht doppelt pflegen muessen. Laeuft nur, wenn der
     * Schalter in den Einstellungen an ist, und ruehrt ausschliesslich
     * Termine an, die das CRM selbst angelegt hat.
     */
    try {
      const abgleich = await gleicheKalenderAb(rohFuerAbgleich, {
        vonISO: rangeStart.toISOString(),
        bisISO: rangeEnd.toISOString(),
      });
      if (abgleich.verschoben.length > 0) {
        setDatenStand((n) => n + 1);
        toast.success(
          abgleich.verschoben.length === 1
            ? `„${abgleich.verschoben[0].titel}" wurde aus dem Kalender übernommen.`
            : `${abgleich.verschoben.length} Termine wurden aus dem Kalender übernommen.`,
        );
      }
      if (abgleich.verschwunden.length > 0) {
        // Bewusst nur ein Hinweis: Im CRM wird nichts geloescht, was hier
        // niemand bestaetigt hat.
        toast.warning(
          abgleich.verschwunden.length === 1
            ? `„${abgleich.verschwunden[0].titel}" fehlt im Kalender. Im CRM steht der Termin noch.`
            : `${abgleich.verschwunden.length} Termine fehlen im Kalender. Im CRM stehen sie noch.`,
        );
      }
    } catch (e) {
      console.warn("Kalenderabgleich fehlgeschlagen:", e);
    }
  }, [hasAnyCalendar, verbindungen, currentDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  /*
   * Ueber den Buchungslink gebuchte Termine entstehen in der Datenbank und
   * haben deshalb keine Kennung im Fremdkalender. Beim Oeffnen des Kalenders
   * werden sie nachgetragen, siehe kalenderNachtrag.
   */
  useEffect(() => {
    if (!hasAnyCalendar) return;
    let abgebrochen = false;
    void (async () => {
      const anzahl = await trageOffeneTermineNach({
        aktivitaeten: getAlleTermine(),
        benutzerId: authUser?.id,
        erlaubteKundeIds: ownedKundeIds,
      });
      if (abgebrochen || anzahl === 0) return;
      setDatenStand((n) => n + 1);
      toast.success(
        anzahl === 1
          ? "Ein gebuchter Termin wurde in deinen Kalender eingetragen."
          : `${anzahl} gebuchte Termine wurden in deinen Kalender eingetragen.`,
      );
    })();
    return () => {
      abgebrochen = true;
    };
  }, [hasAnyCalendar, authUser?.id, ownedKundeIds]);

  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mo = 0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [currentDate]);

  const eventsForDate = useCallback(
    (date: Date) => termineJeTag.get(tagSchluessel(date)) ?? [],
    [termineJeTag],
  );

  const selectedEvents = useMemo(() => eventsForDate(selectedDate), [selectedDate, eventsForDate]);

  const today = new Date();

  const navigateMonth = (delta: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
  };

  const navigateWeek = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta * 7);
    setCurrentDate(d);
  };

  const navigateTag = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    setCurrentDate(d);
    setSelectedDate(d);
  };
  const blaettern = (delta: number) => (view === "month" ? navigateMonth(delta) : view === "week" ? navigateWeek(delta) : navigateTag(delta));

  return (
    <DashboardLayout>
      <PageHeader
        title="Kalender"
        subtitle="Deine CRM-Termine, deine gebuchten Videocalls und die Termine aus verbundenen Kalendern."
      >
        <div className="flex items-center gap-2">
          <SaisonEi ort="kalender" />
          <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading} aria-label="Neu laden">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/einstellungen?tab=kalender")}>
            <Settings className="h-4 w-4 mr-1" /> Einstellungen
          </Button>
        </div>
      </PageHeader>

      {/* Bis unten bündig mit der Seitenleiste (01.11.2026). */}
      <div
        ref={flaeche}
        className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6"
        style={mass ? { height: mass.hoehe, marginBottom: mass.abstandUnten } : undefined}
      >
        {/* Raster */}
        <Card className="p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => blaettern(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center">
                {view === "month"
                  ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                  : view === "week"
                    ? `KW ${getWeekNumber(currentDate)} · ${currentDate.getFullYear()}`
                    : currentDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}
              </h2>
              <Button variant="ghost" size="icon" aria-label="Weiter" onClick={() => blaettern(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant={view === "month" ? "default" : "outline"} size="sm" onClick={() => setView("month")} className="text-xs">
                Monat
              </Button>
              <Button variant={view === "week" ? "default" : "outline"} size="sm" onClick={() => setView("week")} className="text-xs">
                Woche
              </Button>
              <Button variant={view === "tag" ? "default" : "outline"} size="sm" onClick={() => { setCurrentDate(selectedDate); setView("tag"); }} className="text-xs">
                Tag
              </Button>
              {/* Heute: nur der heutige Tag mit Zeitleiste (Christian, 01.11.2026). */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentDate(new Date());
                  setSelectedDate(new Date());
                  setView("tag");
                }}
                className="text-xs ml-1"
              >
                Heute
              </Button>
            </div>
          </div>

          {view !== "tag" && <div className="grid grid-cols-7 gap-px mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>}

          {view === "tag" ? (
            <TagesZeitleiste tag={currentDate} termine={eventsForDate(currentDate)} farbeFuer={farbeFuer} />
          ) : view === "month" ? (
            <div className="grid flex-1 min-h-0 grid-cols-7 gap-px auto-rows-fr">
              {monthGrid.map((date, i) => {
                if (!date) return <div key={`empty-${i}`} className="min-h-20 bg-muted/30 rounded" />;
                const dayEvents = eventsForDate(date);
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`min-h-20 p-1 rounded text-left transition-colors relative overflow-hidden
                      ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}
                      ${!isCurrentMonth ? "opacity-40" : ""}
                    `}
                  >
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                        ${isToday ? "bg-primary text-primary-foreground" : ""}
                      `}
                    >
                      {date.getDate()}
                    </span>
                    <div className="space-y-0.5 mt-0.5 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div key={ev.id} className={`text-bildunterschrift leading-tight truncate rounded px-1 py-px ${farbeFuer(ev)}`}>
                          {ev.titel}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="text-bildunterschrift text-muted-foreground">+{dayEvents.length - 2}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid flex-1 min-h-0 grid-cols-7 gap-px">
              {weekDays.map((date) => {
                const dayEvents = eventsForDate(date);
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`min-h-[200px] p-2 rounded text-left transition-colors overflow-y-auto
                      ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}
                    `}
                  >
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                        ${isToday ? "bg-primary text-primary-foreground" : ""}
                      `}
                    >
                      {date.getDate()}
                    </span>
                    <div className="space-y-1 mt-1">
                      {dayEvents.map((ev) => (
                        <div key={ev.id} className={`text-[11px] leading-tight rounded px-1.5 py-1 ${farbeFuer(ev)}`}>
                          <div className="font-medium truncate">{ev.titel}</div>
                          <div className="text-bildunterschrift opacity-70">{formatTime(ev)}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Termine werden geladen…
            </div>
          )}

          {/* Legende: Ohne sie ist Blau gegen Grau nur eine Farbe. */}
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary/40 border border-primary/40" />
              CRM-Termin
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/40" />
              Über den Buchungslink gebuchter Videocall
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted border border-border" />
              Aus einem verbundenen Kalender
            </span>
          </div>
        </Card>

        {/* Tagesliste */}
        {/* Tagesliste wächst, damit die Spalte unten bündig mit dem Raster endet. */}
        <div className="flex flex-col gap-4 min-h-0">
          <Card className="p-4 lg:flex-1 lg:min-h-[160px] lg:overflow-y-auto">
            <h3 className="text-sm font-semibold mb-3">
              {selectedDate.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Termine an diesem Tag.</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`rounded-lg p-3 space-y-1.5 border ${
                      ev.quelle === "crm"
                        ? "border-primary/30 bg-primary/5"
                        : ev.quelle === "buchung"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{ev.titel}</p>
                      <span
                        className={`text-bildunterschrift px-1.5 py-0.5 rounded-full shrink-0 ${
                          ev.quelle === "crm"
                            ? "bg-primary/15 text-primary"
                            : ev.quelle === "buchung"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {QUELLE_LABEL[ev.quelle]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(ev)}</span>
                    </div>
                    {ev.kundeName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">{ev.kundeName}</span>
                      </div>
                    )}
                    {ev.ort && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{ev.ort}</span>
                      </div>
                    )}
                    {(ev.quelle === "crm" || ev.quelle === "buchung") && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {ev.kundeId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => navigate(`/kunden/${ev.kundeId}`)}
                          >
                            Zum Kundenprofil
                          </Button>
                        )}
                        {ev.zoomLink?.startsWith("http") && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => window.open(ev.zoomLink, "_blank", "noopener")}
                          >
                            <Video className="h-3 w-3 mr-1" /> Einwählen
                          </Button>
                        )}
                        {ev.videoraumPfad && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => navigate(ev.videoraumPfad!)}
                          >
                            <Video className="h-3 w-3 mr-1" />
                            {ev.quelle === "buchung" ? "Betreten" : "Videoraum öffnen"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Verbundene Kalender: hier auch das zweite Konto nachtragen oder trennen. */}
          <Card className="p-4 shrink-0 lg:max-h-[55%] lg:overflow-y-auto">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Verbundene Kalender</h3>
            <KalenderKonten kompakt aufAenderung={() => void verbindungenLaden()} />
            {hasAnyCalendar ? (
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
                Termine, die du im CRM anlegst, werden in den verbundenen Kalender eingetragen.
                Steuern lässt sich das unter Einstellungen, Kalender, Synchronisation.
              </p>
            ) : (
              <p className="mt-2 px-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 mt-px shrink-0" />
                <span>
                  Deine CRM-Termine stehen auch ohne verbundenen Kalender oben im Raster.
                  Wer Google oder iCloud verbindet, sieht zusätzlich seine privaten Termine
                  und bekommt jeden CRM-Termin automatisch dorthin eingetragen.
                </span>
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default Kalender;
