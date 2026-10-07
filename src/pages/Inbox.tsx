import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Monitor, Clock, User, CheckCircle2, CalendarDays, Target, Eye } from "lucide-react";
import { AlertTriangle, Play } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { addAktivitaet, getAlleTermine } from "@/lib/aktivitaetenStore";
import { getInboxTasks, removeInboxTask, type InboxTask } from "@/lib/aktivitaetenStore";
import { sammleInboxTermine, type InboxTermin } from "@/lib/inboxTermine";
import { erledigeAufgabe, getAufgaben, getMeineAufgaben, oeffneAufgabe } from "@/lib/aufgabenStore";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { markInboxTaskDone, unmarkInboxTaskDone, getDoneInboxIds, isTaskOverdue, toDateString, getTodayDateString } from "@/lib/inboxCountStore";
import { getFollowUps, completeFollowUp, uncompleteFollowUp } from "@/lib/followUpStore";
import { getBewerber, updateBewerber } from "@/lib/bewerbungStore";
import { bewerberErinnerungen, istBewerberErinnerungId } from "@/lib/bewerberErinnerungen";
import { siehtBewerberMeldungen } from "@/lib/bewerberRechte";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { format, isToday, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { supabase } from "@/integrations/supabase/client";
import { onCacheChange } from "@/lib/dataCache";
import {
  getFocusEligibleTasks,
  startFocusQueue,
  loadFocusQueue,
  resumeFocusQueue,
  exitFocusQueue,
  currentFocusTask,
  isFocusQueueFinished,
  focusQueueEvent,
  fokusLeerGrund,
} from "@/lib/focusQueueStore";
import { hinweisDialog } from "@/lib/confirm";
import { tarnName } from "@/lib/vorfuehrmodus";
import { ART_ZU_FILTER, FILTER_MAP, InboxFilterAuswahl } from "@/components/inbox/InboxFilterAuswahl";

type DemoAufgabe = {
  id: string;
  titel: string;
  beschreibung: string;
  prioritaet: "niedrig" | "mittel" | "hoch" | "dringend";
  typ: "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";
  faellig_am: string;
  uhrzeit: string;
  kundeId: string;
  kundeName: string;
  /** Gesetzt, wenn jemand anderes die Aufgabe gestellt hat. */
  vonWem?: string;
  /** Die Aufgabe hängt an einem Bewerber, kundeId ist dann die Bewerbungs-ID. */
  bewerber?: boolean;
};

const now = new Date();

const TYP_ICONS: Record<string, typeof Phone> = {
  anruf: Phone, meeting: Monitor, follow_up: Clock, aufgabe: Target, deadline: CalendarDays,
};

const TYP_LABELS: Record<string, string> = {
  anruf: "Anruf", meeting: "Meeting", follow_up: "Follow-Up", aufgabe: "Aufgabe", deadline: "Deadline",
};

// Parst TT.MM.JJJJ → ISO String (oder gibt Input zurück, wenn schon ISO)
function parseGermanDateToISO(d: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    return new Date(+yyyy, +mm - 1, +dd).toISOString();
  }
  return d;
}

// Manuelle Follow-Ups (bw-) und Rückrufe aus der Bedenkzeit (bz-), beide aus
// derselben Ableitung in bewerberErinnerungen.ts.
function getBewerberFollowUps(): DemoAufgabe[] {
  try {
    return getBewerber()
      .flatMap(bewerberErinnerungen)
      .map(e => ({
        id: e.id,
        titel: e.titel,
        beschreibung: e.beschreibung,
        prioritaet: "mittel" as const,
        typ: "follow_up" as const,
        faellig_am: parseGermanDateToISO(e.faelligAm),
        uhrzeit: e.uhrzeit || "—",
        kundeId: e.bewerberId,
        kundeName: e.name,
      }));
  } catch {
    return [];
  }
}

/**
 * Aufgaben aus der Tabelle `aufgaben` in das Anzeigeformat der Inbox bringen.
 *
 * Diese Aufgaben hängen am Kunden und tragen einen Empfänger. Sie sind damit
 * die einzige Quelle, die eine Zuweisung überhaupt abbilden kann. Die alte
 * persönliche Liste bleibt vorerst daneben bestehen, damit nichts verschwindet.
 *
 * Eine Aufgabe kann statt am Kunden auch an einem Bewerber hängen, etwa die
 * HR-Aufgabe nach der Vertragsunterschrift. Dann zeigt die Karte den
 * Bewerbernamen und führt in die Bewerberakte statt zu "Ohne Kunde".
 */
function mappeAufgaben(
  rohe: ReturnType<typeof getMeineAufgaben>,
  namenJeKunde: Map<string, string>,
  namenJeBewerber: Map<string, string>,
  eigeneId?: string,
): DemoAufgabe[] {
  return rohe.map((a) => {
    const basis = {
      id: `ag-${a.id}`,
      titel: a.titel,
      beschreibung: a.beschreibung || "",
      prioritaet: a.prioritaet,
      typ: a.typ,
      faellig_am: a.faelligAm || "",
      uhrzeit: a.uhrzeit || "—",
      vonWem: a.benutzerId && eigeneId && a.benutzerId !== eigeneId ? (a as any).erstelltVonName || "einem Kollegen" : undefined,
    };
    if (a.bewerbungId) {
      return {
        ...basis,
        kundeId: a.bewerbungId,
        kundeName: namenJeBewerber.get(a.bewerbungId) || "Bewerber",
        bewerber: true,
      };
    }
    return {
      ...basis,
      kundeId: a.kontaktId || "",
      kundeName: (a.kontaktId && namenJeKunde.get(a.kontaktId)) || "Ohne Kunde",
    };
  });
}

/** Bewerbungs-ID zu Anzeigename, aus dem Zwischenspeicher. */
function namenDerBewerber(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    getBewerber().forEach((b) => {
      m.set(b.id, [b.vorname, b.nachname].filter(Boolean).join(" ").trim() || "Bewerber");
    });
  } catch { /* ignore */ }
  return m;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 10) return "Guten Morgen";
  if (h < 12) return "Guten Vormittag";
  if (h < 14) return "Guten Mittag";
  if (h < 17) return "Guten Nachmittag";
  return "Guten Abend";
}

const Inbox = () => {
  const { user, authUser } = useUser();
  const firstName = user.name.split(" ")[0];
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  // Bewerbersachen sieht nur HR. Bewusst getrennt von isAdmin: Der
  // Admin-Filter unten (fremde Inbox ansehen) bleibt davon unberührt.
  const darfBewerberSehen = siehtBewerberMeldungen(user.role);
  // Der Vertriebsleiter darf in die Inboxen seines Teams schauen. Er sieht
  // dort die Aufgaben am Kunden, nicht die persönlichen Notizen des Kollegen.
  const istVertriebsleiter = user.role === "vertriebsleiter";
  const darfFremdeInboxSehen = isAdmin || istVertriebsleiter;

  // Admin-Filter: ausgewählter Nutzer (default = eigener Account)
  const [viewUserId, setViewUserId] = useState<string>(authUser?.id || "self");
  const [allUsers, setAllUsers] = useState<SystemUser[]>([]);
  const [remoteTasks, setRemoteTasks] = useState<InboxTask[] | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    if (!darfFremdeInboxSehen) return;
    try {
      const alle = loadAllUsers();
      if (isAdmin) {
        setAllUsers(alle);
        return;
      }
      // Vertriebsleiter: nur die eigene Downline.
      const meineIds = new Set(getJuniorsForRecruiter(authUser?.id || "").map(j => j.userId));
      setAllUsers(alle.filter(u => meineIds.has(u.id)));
    } catch { /* ignore */ }
  }, [darfFremdeInboxSehen, isAdmin, authUser?.id]);

  const isViewingOther = darfFremdeInboxSehen && viewUserId !== "self" && viewUserId !== authUser?.id;

  // Wer aus dem Dashboard hierher kommt, soll dieselbe Auswahl vorfinden, die
  // dort galt: derselbe Umfang und dieselbe Art. Sonst steht auf der einen
  // Seite eine Zahl und auf der anderen eine andere Liste.
  const [suchParameter] = useSearchParams();
  const parameterUmfang = suchParameter.get("umfang");
  const parameterArt = suchParameter.get("art");
  // Eine einzelne Aufgabe, auf die eine Glocke zeigt, etwa die Anfrage zum
  // Empfehlungsprogramm aus dem Kundenportal. Sie wird hervorgehoben.
  const parameterAufgabe = suchParameter.get("aufgabe");
  const zielKarte = parameterAufgabe ? `ag-${parameterAufgabe}` : null;
  useEffect(() => {
    if (!zielKarte) return;
    const z = window.setTimeout(() => {
      document.getElementById(`inbox-${zielKarte}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => window.clearTimeout(z);
  }, [zielKarte]);

  // Wenn Admin Aufgaben eines anderen Users ansieht: aus user_settings laden
  useEffect(() => {
    if (!isViewingOther) { setRemoteTasks(null); return; }
    setLoadingRemote(true);
    (async () => {
      try {
        if (viewUserId === "all" || viewUserId === "team") {
          const downline = new Set(
            getJuniorsForRecruiter(authUser?.id || "").map(j => j.userId),
          );
          const eligibleIds = allUsers
            .filter(u => (viewUserId === "team" ? downline.has(u.id) : true))
            .filter(u => {
              const r = (u.rolle || "").toLowerCase();
              return r !== "kunde" && r !== "tippgeber";
            })
            .map(u => u.id);
          if (eligibleIds.length === 0) { setRemoteTasks([]); return; }
          const { data } = await (supabase as any)
            .from("user_settings")
            .select("user_id, einstellungen")
            .in("user_id", eligibleIds);
          const merged: InboxTask[] = [];
          (data || []).forEach((row: any) => {
            const tasks = (row?.einstellungen?.inbox_tasks || []) as InboxTask[];
            tasks.forEach(t => merged.push({ ...t, id: `${row.user_id}:${t.id}` }));
          });
          setRemoteTasks(merged);
        } else {
          const { data } = await (supabase as any)
            .from("user_settings")
            .select("einstellungen")
            .eq("user_id", viewUserId)
            .maybeSingle();
          const tasks = ((data?.einstellungen as any)?.inbox_tasks || []) as InboxTask[];
          setRemoteTasks(tasks);
        }
      } catch {
        setRemoteTasks([]);
      } finally {
        setLoadingRemote(false);
      }
    })();
  }, [viewUserId, isViewingOther, allUsers]);

  // Gerade abgehakte Aufgaben. Der Erledigt-Zustand liegt in den
  // Einstellungen, die aber ueber Realtime nachgeladen werden und dabei kurz
  // wieder den alten Stand zeigen koennen. Ausserdem haelt der Listenaufbau
  // sonst die Liste von dem Rendern fest, bei dem er registriert wurde.
  // Deshalb merkt sich die Seite die abgehakten IDs zusaetzlich selbst.
  const lokalErledigt = useRef<Set<string>>(new Set());

  // Nur Follow-Ups und Aufgaben zu Kunden, die dem aktuellen Nutzer gehören.
  const ownedKundeIds = useMemo(() => {
    const ids = new Set<string>();
    try {
      getKontakte().forEach((k: any) => {
        if (kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id })) {
          ids.add(k.id);
        }
      });
    } catch { /* ignore */ }
    return ids;
  }, [user.name, authUser?.id, remoteTasks]);

  const namenJeKunde = useMemo(() => {
    const m = new Map<string, string>();
    try {
      getKontakte().forEach((k: any) => {
        m.set(k.id, [k.vorname, k.nachname].filter(Boolean).join(" ").trim() || k.name || "Kunde");
      });
    } catch { /* ignore */ }
    return m;
  }, [remoteTasks]);

  /**
   * Stellt die offene Liste aus allen Quellen zusammen. Wird sowohl beim
   * ersten Rendern als auch bei jeder Änderung benutzt, damit Seite und
   * Sidebar nicht auseinanderlaufen.
   */
  const sammleOffene = (): {
    offen: DemoAufgabe[];
    erledigt: (DemoAufgabe & { erledigtAm: string })[];
    termine: InboxTermin[];
  } => {
    // Bewusst hier gelesen und nicht ausserhalb: Diese Funktion laeuft auch aus
    // einem aelteren Rendern heraus, eine Liste von damals waere veraltet.
    const doneIds = [...getDoneInboxIds(), ...lokalErledigt.current];
    // Namen der Bewerber für Aufgaben, die an einer Bewerbung hängen. Aus
    // demselben Grund frisch gelesen wie doneIds.
    const namenJeBewerber = namenDerBewerber();
    const sourceTasks: InboxTask[] = isViewingOther ? (remoteTasks || []) : getInboxTasks();
    const storedTasks: DemoAufgabe[] = sourceTasks.map(t => ({
      id: t.id,
      titel: t.titel,
      beschreibung: t.beschreibung,
      prioritaet: t.prioritaet,
      typ: t.typ,
      faellig_am: t.faellig_am,
      uhrzeit: t.uhrzeit,
      kundeId: t.kundeId,
      kundeName: t.kundeName,
    }));

    // Aufgaben aus der Tabelle: eigene und die, die mir jemand zugewiesen hat.
    // In der fremden Ansicht die des betrachteten Nutzers.
    const sammelSicht = viewUserId === "all" || viewUserId === "team";
    const zielId = isViewingOther && !sammelSicht ? viewUserId : authUser?.id;

    // In der Teamsicht zählen nur Aufgaben, die jemand aus der eigenen
    // Downline abarbeiten soll.
    const downlineIds = new Set(
      getJuniorsForRecruiter(authUser?.id || "").map(j => j.userId),
    );

    const aufgabenTasks: DemoAufgabe[] = sammelSicht && isViewingOther
      ? mappeAufgaben(
          getAufgaben().filter(a => {
            if (a.status === "erledigt" || a.status === "abgesagt") return false;
            if (viewUserId === "all") return true;
            const zustaendig = a.zugewiesenAn || a.benutzerId;
            return !!zustaendig && downlineIds.has(zustaendig);
          }),
          namenJeKunde,
          namenJeBewerber,
          authUser?.id,
        )
      : mappeAufgaben(getMeineAufgaben(zielId), namenJeKunde, namenJeBewerber, authUser?.id);

    // Follow-Ups: in der eigenen Sicht die eigenen Kunden, in der Sammelsicht
    // je nach Umfang das Team oder alle.
    const followUpTasks: DemoAufgabe[] = isViewingOther && !sammelSicht
      ? []
      : getFollowUps()
          .filter(f => {
            if (f.status === "erledigt") return false;
            if (!sammelSicht) return ownedKundeIds.has(f.kundeId);
            if (viewUserId === "all") return true;
            const kunde = getKontakte().find(k => k.id === f.kundeId);
            const z = kunde ? (kunde.zustaendig_id || (kunde as any).zustaendigId) : undefined;
            return !!z && downlineIds.has(z);
          })
          .map(f => ({
            id: `fu-${f.id}`,
            titel: f.titel,
            beschreibung: f.beschreibung,
            prioritaet: f.prioritaet === "hoch" ? "hoch" : f.prioritaet === "niedrig" ? "niedrig" : "mittel",
            typ: "follow_up" as const,
            faellig_am: f.faelligAm,
            uhrzeit: "—",
            kundeId: f.kundeId,
            kundeName: f.kundeName,
          }));

    // Bewerber-Follow-Ups gehören HR. Alle anderen Rollen, auch Admin und
    // Inhaber, sehen sie nicht mehr, siehe siehtBewerberMeldungen().
    const bewerberFollowUps: DemoAufgabe[] = (isViewingOther || !darfBewerberSehen) ? [] : getBewerberFollowUps();
    let allOpen = [...storedTasks, ...aufgabenTasks, ...followUpTasks, ...bewerberFollowUps];

    // Finanzierungspartner: nur Aufgaben zu Kunden, die ihn betreffen.
    if (!isViewingOther && (user.role || "").toLowerCase() === "finanzierungspartner") {
      const FIN_STAGES = new Set(["reservierung", "finanzierung"]);
      const stageByKunde = new Map<string, string>();
      try {
        getKontakte().forEach((k: any) => {
          stageByKunde.set(k.id, String(k.pipelineStufe || "").toLowerCase());
        });
      } catch { /* ignore */ }
      allOpen = allOpen.filter(t => FIN_STAGES.has(stageByKunde.get(t.kundeId) || ""));
    }

    const offen = isViewingOther ? allOpen : allOpen.filter(t => !doneIds.includes(t.id));

    // Erledigte: die abgehakten aus der alten Liste plus die geschlossenen
    // Aufgaben aus der Tabelle.
    const erledigteAusTabelle = isViewingOther
      ? []
      : mappeAufgaben(
          getAufgaben().filter(
            a =>
              a.status === "erledigt" &&
              (a.zugewiesenAn ? a.zugewiesenAn === authUser?.id : a.benutzerId === authUser?.id),
          ),
          namenJeKunde,
          namenJeBewerber,
          authUser?.id,
        ).map(t => ({ ...t, erledigtAm: new Date().toISOString() }));

    const erledigt = isViewingOther
      ? []
      : [
          ...storedTasks.filter(t => doneIds.includes(t.id)).map(t => ({ ...t, erledigtAm: new Date().toISOString() })),
          ...erledigteAusTabelle,
        ];

    // Termine kommen direkt aus den Aktivitäten. Sie hängen nicht an einer
    // Aufgabe und erscheinen deshalb auch dann, wenn sie über den
    // Buchungslink entstanden sind. Die fremde Ansicht bleibt aussen vor: Sie
    // zeigt die Aufgaben eines Kollegen, und welche Kontakte der sehen darf,
    // rechnet diese Seite nicht aus.
    const termine = isViewingOther
      ? []
      : sammleInboxTermine({
          aktivitaeten: getAlleTermine(),
          erlaubteKundeIds: ownedKundeIds,
          namenJeKunde,
          // Die Aufgaben aller Status, damit ein abgehaktes Meeting nicht als
          // Termin zurückkommt.
          aufgaben: getAufgaben(),
        });

    return { offen, erledigt, termine };
  };

  const { offen: initialOpen, erledigt: initialDone, termine: initialTermine } = sammleOffene();

  const [aufgaben, setAufgaben] = useState<DemoAufgabe[]>(initialOpen);
  const [erledigteAufgaben, setErledigteAufgaben] = useState<(DemoAufgabe & { erledigtAm: string })[]>(initialDone);
  const [termine, setTermine] = useState<InboxTermin[]>(initialTermine);
  const [activeFilter, setActiveFilter] = useState("Alle");
  const [viewMode, setViewMode] = useState<"heute" | "woche" | "alle" | "erledigt">("heute");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (parameterUmfang && darfFremdeInboxSehen) {
      if (parameterUmfang === "firma") setViewUserId("all");
      else if (parameterUmfang === "team") setViewUserId("team");
      else setViewUserId(authUser?.id || "self");
    }
    if (parameterArt && ART_ZU_FILTER[parameterArt]) {
      setActiveFilter(ART_ZU_FILTER[parameterArt]);
      // Die Kachel auf dem Dashboard zählt alle offenen Punkte, nicht nur die
      // von heute. Bliebe die Inbox auf "Heute" stehen, käme man aus einer
      // Kachel mit sechs Einträgen in eine leere Liste.
      setViewMode("alle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameterUmfang, parameterArt, darfFremdeInboxSehen]);

  // Re-sync wenn Quelle wechselt (Admin-Filter)
  useEffect(() => {
    setAufgaben(initialOpen);
    setErledigteAufgaben(initialDone);
    setTermine(initialTermine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewUserId, remoteTasks]);

  // Auf Änderungen reagieren: neue Aufgaben, Follow-Ups, Realtime.
  // Es wird bewusst dieselbe Funktion benutzt wie beim ersten Rendern, damit
  // die Liste nach einer Änderung nicht anders aussieht als vorher.
  useEffect(() => {
    if (isViewingOther) return;
    const handler = () => {
      const { offen, erledigt, termine: neueTermine } = sammleOffene();
      setAufgaben(offen);
      setErledigteAufgaben(erledigt);
      setTermine(neueTermine);
    };
    window.addEventListener("inbox-updated", handler);
    const unsubCache = onCacheChange((table) => {
      if (
        table === "follow_ups" ||
        table === "aufgaben" ||
        table === "aktivitaeten" ||
        table === "user_settings" ||
        table === "benachrichtigungen"
      ) {
        handler();
      }
    });
    return () => {
      window.removeEventListener("inbox-updated", handler);
      unsubCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewingOther, ownedKundeIds, namenJeKunde]);

  // Die Sidebar rechnet ihre Zahl selbst aus denselben Quellen. Der frühere
  // Schreibweg über `inbox_open_count` wurde von niemandem gelesen und kostete
  // bei jedem Rendern einen Schreibzugriff auf die Einstellungen.

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const heuteAufgaben = useMemo(
    () => aufgaben.filter((a) => isToday(new Date(a.faellig_am))),
    [aufgaben]
  );

  const wocheAufgaben = useMemo(
    () => aufgaben.filter((a) => isWithinInterval(new Date(a.faellig_am), { start: weekStart, end: weekEnd })),
    [aufgaben]
  );

  const meetingsHeute = useMemo(() => heuteAufgaben.filter((a) => a.typ === "meeting"), [heuteAufgaben]);
  const hohePrio = useMemo(() => aufgaben.filter((a) => a.prioritaet === "hoch" || a.prioritaet === "dringend"), [aufgaben]);

  const alleUpcoming = useMemo(
    () => aufgaben.sort((a, b) => new Date(a.faellig_am).getTime() - new Date(b.faellig_am).getTime()),
    [aufgaben]
  );

  // Überfällige Aufgaben (immer prominent oben anzeigen, unabhängig vom viewMode)
  const overdueAufgaben = useMemo(
    () => aufgaben
      .filter(a => isTaskOverdue(a.faellig_am, a.uhrzeit))
      .sort((a, b) => new Date(a.faellig_am).getTime() - new Date(b.faellig_am).getTime()),
    [aufgaben]
  );

  const stats = [
    { label: "Heute offen", value: String(heuteAufgaben.length), color: "text-foreground" },
    { label: "Diese Woche", value: String(wocheAufgaben.length), color: "text-foreground" },
    { label: "Alle offen", value: String(aufgaben.length), color: "text-foreground" },
    { label: "Hohe Priorität", value: String(hohePrio.length), color: "text-destructive" },
  ];

  const applyFilter = (list: DemoAufgabe[]) => {
    const typen = FILTER_MAP[activeFilter];
    return typen ? list.filter((a) => typen.includes(a.typ)) : list;
  };

  const activeList = viewMode === "heute" ? heuteAufgaben : viewMode === "woche" ? wocheAufgaben : viewMode === "alle" ? alleUpcoming : [];
  // Überfällige sind separat oben — aus den normalen Listen entfernen, um Duplikate zu vermeiden
  const overdueIds = useMemo(() => new Set(overdueAufgaben.map(a => a.id)), [overdueAufgaben]);
  const filteredOpen = useMemo(
    () => applyFilter(activeList).filter(a => !overdueIds.has(a.id)),
    [activeList, activeFilter, overdueIds]
  );
  // Wie viele Einträge der aktive Filter insgesamt hat, ohne Zeitraumgrenze.
  const anzahlInsgesamtOffen = useMemo(
    () => applyFilter(aufgaben).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aufgaben, activeFilter],
  );

  // Termine folgen demselben Zeitraum und demselben Filter wie die Aufgaben.
  // Ein Filter, der Meetings ausschliesst, blendet die Gruppe ganz aus.
  const sichtbareTermine = useMemo(() => {
    const typen = FILTER_MAP[activeFilter];
    if (typen && !typen.includes("meeting")) return [];
    return termine.filter((t) => {
      const d = new Date(t.zeitpunkt);
      if (viewMode === "heute") return isToday(d);
      if (viewMode === "woche") return isWithinInterval(d, { start: weekStart, end: weekEnd });
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termine, activeFilter, viewMode]);

  const filteredOverdue = useMemo(() => applyFilter(overdueAufgaben), [overdueAufgaben, activeFilter]);
  const filteredErledigt = useMemo(() => applyFilter(erledigteAufgaben), [erledigteAufgaben, activeFilter]);

  const handleComplete = async (task: DemoAufgabe) => {
    if (isViewingOther) {
      toast({
        title: "Nur Ansicht",
        description: "Du siehst die Aufgaben eines anderen Nutzers. Erledigen ist nicht möglich.",
        variant: "destructive",
      });
      return;
    }
    // Aufgaben aus der Datenbank erst nach der Antwort abhaken: Lehnt die
    // Datenbank ab, meldet der Zwischenspeicher das, und die Aufgabe bleibt
    // offen stehen statt „Erledigt ✓“ zu zeigen.
    if (task.id.startsWith("ag-")) {
      try {
        await erledigeAufgabe(task.id.slice(3));
      } catch {
        return;
      }
    }
    setAufgaben((prev) => prev.filter((a) => a.id !== task.id));
    setErledigteAufgaben((prev) => [...prev, { ...task, erledigtAm: new Date().toISOString() }]);

    // Persist done state so it survives reload
    if (task.id.startsWith("ag-")) {
      // oben schon gespeichert
    } else if (task.id.startsWith("fu-")) {
      completeFollowUp(task.id.slice(3));
    } else if (task.id.startsWith("bw-")) {
      // Bewerber-Follow-Up erledigt → Termin im Bewerber-Profil zurücksetzen
      const bewerberId = task.id.slice(3);
      updateBewerber(bewerberId, { followUpDatum: "", followUpUhrzeit: "", followUpNotiz: "" });
      markInboxTaskDone(task.id);
      lokalErledigt.current.add(task.id);
    } else {
      markInboxTaskDone(task.id);
      lokalErledigt.current.add(task.id);
    }

    addAktivitaet({
      kundeId: task.kundeId,
      art: task.typ === "meeting" ? "meeting" : task.typ === "anruf" ? "anruf" : "aufgabe",
      beschreibung: `✅ Erledigt: ${task.titel}`,
      details: task.beschreibung,
      erledigtAm: new Date().toISOString(),
    });

    toast({
      title: "Erledigt ✓",
      description: `${task.titel} wurde als erledigt markiert und im Kundenprofil von ${task.kundeName} protokolliert.`,
    });
  };

  const handleUndoComplete = async (task: DemoAufgabe & { erledigtAm?: string }) => {
    if (isViewingOther) {
      toast({
        title: "Nur Ansicht",
        description: "Du siehst die Aufgaben eines anderen Nutzers. Ändern ist nicht möglich.",
        variant: "destructive",
      });
      return;
    }
    if (task.id.startsWith("ag-")) {
      try {
        await oeffneAufgabe(task.id.slice(3));
      } catch {
        return;
      }
    }
    setErledigteAufgaben((prev) => prev.filter((a) => a.id !== task.id));
    setAufgaben((prev) => [...prev, task as DemoAufgabe]);

    if (task.id.startsWith("ag-")) {
      // oben schon gespeichert
    } else if (task.id.startsWith("fu-")) {
      uncompleteFollowUp(task.id.slice(3));
    } else {
      unmarkInboxTaskDone(task.id);
      lokalErledigt.current.delete(task.id);
    }

    toast({
      title: "Wieder offen",
      description: `${task.titel} wurde als ausstehend markiert.`,
    });
  };

  const renderAufgabe = (a: DemoAufgabe) => {
    const Icon = TYP_ICONS[a.typ] || Clock;
    const isUrgent = a.prioritaet === "dringend" || a.prioritaet === "hoch";
    const prioLabel = a.prioritaet.charAt(0).toUpperCase() + a.prioritaet.slice(1);
    const isBewerber = a.bewerber || istBewerberErinnerungId(a.id);
    const overdue = isTaskOverdue(a.faellig_am, a.uhrzeit);

    return (
      <Card
        key={a.id}
        id={`inbox-${a.id}`}
        className={`p-4 flex items-center gap-4 ${overdue ? "border-destructive/60 bg-destructive/5" : ""} ${a.id === zielKarte ? "ring-2 ring-primary" : ""}`}
      >
        <Checkbox className="mt-0.5" onCheckedChange={() => handleComplete(a)} />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => navigate(isBewerber ? `/bewerberprozess?openBewerber=${a.kundeId}` : `/kunden/${a.kundeId}`)}
        >
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${overdue ? "text-destructive" : "text-foreground"}`}>{a.titel}</p>
            <Badge variant={isUrgent ? "destructive" : "secondary"} className="text-[10px]">
              {prioLabel}
            </Badge>
            {overdue && (
              <Badge variant="destructive" className="text-[10px]">Überfällig</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{a.beschreibung}</p>
          <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
            <User className="h-3 w-3" /> {tarnName(a.kundeName)}
            {a.vonWem && (
              <span className="text-muted-foreground">· gestellt von {a.vonWem}</span>
            )}
          </p>
        </div>
        <div className={`flex items-center gap-3 text-xs flex-shrink-0 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          <span className="flex items-center gap-1">
            <Icon className="h-3 w-3" /> {TYP_LABELS[a.typ]}
          </span>
          <span>🕐 {a.uhrzeit}</span>
          {!isToday(new Date(a.faellig_am)) && (
            <span>{format(new Date(a.faellig_am), "dd.MM.", { locale: de })}</span>
          )}
        </div>
      </Card>
    );
  };

  /**
   * Karte für einen Termin.
   *
   * Bewusst ohne Kästchen zum Abhaken: Ein Termin ist kein Auftrag, den man
   * wegarbeitet, er findet statt. Sonst wie die Aufgabenkarte, damit die Seite
   * ein Bild bleibt.
   */
  const renderTermin = (t: InboxTermin) => {
    const Icon = t.video ? Monitor : CalendarDays;
    const heute = isToday(new Date(t.zeitpunkt));

    return (
      <Card key={t.id} className="p-4 flex items-center gap-4">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/kunden/${t.kundeId}`)}>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t.titel}</p>
            <Badge variant="secondary" className="text-[10px]">
              {t.video ? "Videomeeting" : "Termin"}
            </Badge>
          </div>
          <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
            <User className="h-3 w-3" /> {tarnName(t.kundeName)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
          <span>🕐 {t.uhrzeit}</span>
          {!heute && <span>{format(new Date(t.zeitpunkt), "dd.MM.", { locale: de })}</span>}
          {t.zoomLink && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Der eigene Videoraum steht als Pfad in der Aktivität, ein
                // fremder Dienst als vollständige Adresse.
                if (t.zoomLink!.startsWith("/")) navigate(t.zoomLink!);
                else window.open(t.zoomLink!, "_blank", "noopener,noreferrer");
              }}
            >
              Beitreten
            </Button>
          )}
        </div>
      </Card>
    );
  };

  const viewedUser = isViewingOther ? allUsers.find(u => u.id === viewUserId) : null;
  const viewedLabel =
    viewUserId === "all" ? "allen Inboxen"
    : viewUserId === "team" ? "meinem Team"
    : (viewedUser?.name || "Nutzer");

  // ── Fokus-Modus: heute fällige Aufgaben ohne Uhrzeit ohne Umwege abarbeiten
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const h = () => setFocusTick((t) => t + 1);
    window.addEventListener(focusQueueEvent(), h);
    return () => window.removeEventListener(focusQueueEvent(), h);
  }, []);
  const focusQueue = useMemo(() => (isViewingOther ? null : loadFocusQueue()), [focusTick, isViewingOther, aufgaben.length]);
  const focusEligible = useMemo(
    () => (isViewingOther ? [] : getFocusEligibleTasks(user.name, authUser?.id, { includeBewerber: darfBewerberSehen })),
    [isViewingOther, user.name, authUser?.id, aufgaben.length, focusTick, darfBewerberSehen]
  );
  const focusRemaining = focusQueue
    ? Math.max(0, focusQueue.tasks.length - focusQueue.currentIndex)
    : 0;
  const focusFinished = isFocusQueueFinished(focusQueue);

  const startFocus = () => {
    if (focusEligible.length === 0) {
      // Der Knopf bleibt klickbar, damit niemand vor einem grauen Knopf und
      // einer vollen Liste steht, ohne den Grund zu erfahren.
      void hinweisDialog({
        title: "Der Fokus-Modus hat gerade nichts zu tun",
        description: fokusLeerGrund(aufgaben),
      });
      return;
    }
    const state = startFocusQueue(focusEligible);
    const first = currentFocusTask(state);
    if (first) {
      toast({ title: `🎯 Fokus-Modus gestartet`, description: `${focusEligible.length} Aufgabe(n) – los geht's mit ${first.kundeName}.` });
      const path = first.source === "bewerber" || istBewerberErinnerungId(first.id)
        ? `/bewerberprozess?openBewerber=${first.kundeId}&focus=1`
        : `/kunden/${first.kundeId}?focus=1`;
      navigate(path);
    }
  };

  const resumeFocus = () => {
    resumeFocusQueue();
    const state = loadFocusQueue();
    const cur = currentFocusTask(state);
    if (cur) {
      const path = cur.source === "bewerber" || istBewerberErinnerungId(cur.id)
        ? `/bewerberprozess?openBewerber=${cur.kundeId}&focus=1`
        : `/kunden/${cur.kundeId}?focus=1`;
      navigate(path);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isViewingOther ? `Inbox von ${viewedLabel}` : "Inbox"}
          subtitle={isViewingOther ? "Schreibgeschützte Ansicht – nur Einsicht möglich" : "Deine tagesrelevanten Aufgaben, Meetings & Wochenübersicht"}
        />

        {!isViewingOther && (
          <Card className="p-4 flex items-center gap-3 flex-wrap border-primary/40 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
            <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Play className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold">Fokus-Modus</div>
              <div className="text-xs text-muted-foreground">
                Arbeitet <strong>alle überfälligen</strong> Einträge (inkl. Termine mit fester Uhrzeit, die nachgeholt werden müssen) sowie <strong>heute fällige</strong> Anrufe, Meetings, Follow-Ups, Aufgaben und Deadlines <strong>ohne feste Uhrzeit</strong> nacheinander im jeweiligen Profil ab. Heutige Termine mit fester Uhrzeit stehen im Kalender.
              </div>
            </div>
            {focusQueue && !focusFinished ? (
              <>
                <Badge variant="secondary">Läuft · noch {focusRemaining}</Badge>
                {/* Dieselbe Hauptaktion, nur fortgesetzt. */}
                <Button size="sm" variant="brand" onClick={resumeFocus}>
                  <Play className="h-4 w-4 mr-1.5" />
                  Fortsetzen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { exitFocusQueue(); }}>
                  Beenden
                </Button>
              </>
            ) : (
              // Hauptaktion der Inbox, deshalb Marken-Orange.
              <Button size="sm" variant="brand" onClick={startFocus}>
                <Play className="h-4 w-4 mr-1.5" />
                Starten ({focusEligible.length})
              </Button>
            )}
          </Card>
        )}

        {darfFremdeInboxSehen && (
          <Card className="p-3 flex items-center gap-3 flex-wrap">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Inbox ansehen von:</span>
            <Select value={viewUserId} onValueChange={setViewUserId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Nutzer wählen" />
              </SelectTrigger>
            <SelectContent>
                <SelectItem value={authUser?.id || "self"}>Eigene Inbox ({user.name})</SelectItem>
                <SelectItem value="team">Mein Team</SelectItem>
                <SelectItem value="all">Alle anzeigen (alle Inboxen)</SelectItem>
                {allUsers
                  .filter(u => u.id !== authUser?.id)
                  .filter(u => {
                    const r = (u.rolle || "").toLowerCase();
                    return r !== "kunde" && r !== "tippgeber";
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}{u.rolle ? ` – ${u.rolle}` : ""}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {isViewingOther && (
              <Badge variant="secondary" className="ml-auto">Schreibgeschützt</Badge>
            )}
            {loadingRemote && <span className="text-xs text-muted-foreground">Lade…</span>}
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 text-center">
              <p className={`text-[28px] font-semibold tracking-tight tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase mt-2">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* View mode + Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-1">
             <Button variant={viewMode === "heute" ? "default" : "outline"} size="sm" onClick={() => setViewMode("heute")}>
              ☀️ Heute
            </Button>
            <Button variant={viewMode === "woche" ? "default" : "outline"} size="sm" onClick={() => setViewMode("woche")}>
              📅 Woche
            </Button>
            <Button variant={viewMode === "alle" ? "default" : "outline"} size="sm" onClick={() => setViewMode("alle")}>
              📋 Alle
            </Button>
            <Button variant={viewMode === "erledigt" ? "default" : "outline"} size="sm" onClick={() => setViewMode("erledigt")}>
              ✅ Erledigt ({erledigteAufgaben.length})
            </Button>
          </div>
          <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <InboxFilterAuswahl wert={activeFilter} onWert={setActiveFilter} />
        </div>

        {/* Open tasks (nicht im Erledigt-Modus) */}
        {viewMode !== "erledigt" && (
          <>
            {filteredOverdue.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-semibold text-destructive">
                    Überfällig ({filteredOverdue.length}) – sofort erledigen
                  </p>
                </div>
                <div className="space-y-2 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-2">
                  {filteredOverdue.map(renderAufgabe)}
                </div>
              </div>
            )}
            {sichtbareTermine.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3">
                  📅 Termine ({sichtbareTermine.length})
                </p>
                <div className="space-y-2">{sichtbareTermine.map(renderTermin)}</div>
              </div>
            )}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              {viewMode === "heute" ? (
                <>☀️ Heute – {format(now, "EEEE, dd.MM.", { locale: de })} ({filteredOpen.length} offen)</>
              ) : viewMode === "woche" ? (
                <>📅 Woche {format(weekStart, "dd.MM.", { locale: de })} – {format(weekEnd, "dd.MM.", { locale: de })} ({filteredOpen.length} offen)</>
              ) : (
                <>📋 Alle offenen Aufgaben ({filteredOpen.length})</>
              )}
            </p>
            {filteredOpen.length === 0 ? (
              <Card className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {viewMode === "heute" ? "Keine offenen Aufgaben für heute 🎉" : viewMode === "woche" ? "Keine offenen Aufgaben diese Woche 🎉" : "Keine offenen Aufgaben 🎉"}
                </p>
                {/* Eine leere Liste, während anderswo etwas offen ist, wirkt
                    wie ein Fehler. Deshalb steht hier, wo die Einträge sind. */}
                {viewMode !== "alle" && anzahlInsgesamtOffen > 0 && (
                  <button
                    onClick={() => setViewMode("alle")}
                    className="mt-3 text-sm text-primary hover:underline"
                  >
                    {anzahlInsgesamtOffen} offen insgesamt, alle anzeigen
                  </button>
                )}
              </Card>
            ) : (
              <div className="space-y-2">{filteredOpen.map(renderAufgabe)}</div>
            )}
          </div>
          </>
        )}

        {/* Erledigt-Ansicht */}
        {viewMode === "erledigt" && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              ✅ Erledigte Aufgaben ({filteredErledigt.length})
            </p>
            {filteredErledigt.length === 0 ? (
              <Card className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Noch keine erledigten Aufgaben</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredErledigt.map(a => {
                  const Icon = TYP_ICONS[a.typ] || Clock;
                  return (
                    <Card key={a.id} className="p-4 flex items-center gap-4 opacity-60 hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded-full hover:bg-white/20 transition-colors"
                        title="Als ausstehend markieren"
                        onClick={() => handleUndoComplete(a)}
                      >
                        <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
                      </button>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/kunden/${a.kundeId}`)}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground line-through">{a.titel}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.beschreibung}</p>
                        <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3" /> {tarnName(a.kundeName)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span className="flex items-center gap-1"><Icon className="h-3 w-3" /> {TYP_LABELS[a.typ]}</span>
                        <span>Erledigt {format(new Date((a as any).erledigtAm), "HH:mm", { locale: de })}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Inbox;
