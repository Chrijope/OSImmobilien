import { useState, useMemo, useEffect, useRef } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NaechsterSchritt } from "@/components/kunden/NaechsterSchritt";
import { NeuerTabLink } from "@/components/kunden/NeuerTabLink";
import { zeilenKlick } from "@/lib/zeilenNavigation";
import { starteAnrufFuerKontakt } from "@/lib/anrufStarten";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronUp, ChevronDown, UserCog, Target, Clock, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { istProvisionsrelevant } from "@/lib/abschlussDefinition";
import { formatDatum } from "@/lib/utils";
import { kontaktQuellen } from "@/lib/kontaktTermine";
import { kontaktQuelleAnzeige } from "@/lib/kontaktQuelle";
import { hatGeplantenTermin } from "@/lib/naechsterKontakt";
import { PageHeader } from "@/components/PageHeader";
import { NeuerKontaktDialog } from "@/components/kunden/NeuerKontaktDialog";
import { KundenspracheKuerzel } from "@/components/kunden/KundenspracheHinweis";
import { englischsprachigeKontaktIds } from "@/lib/kundenSprache";
import { getKontakte, type KundeData } from "@/lib/kundenStore";
import { getCurrentUserId } from "@/lib/currentUser";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { useUser } from "@/contexts/UserContext";
import { ImportExportButton } from "@/components/kunden/ImportExportButton";
import { DuplikatBanner } from "@/components/kunden/DuplikatBanner";
import { cacheRefreshTable } from "@/lib/dataCache";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { getEffectivePipelineStufe, PIPELINE_STUFEN, getProzessBereich, type ProzessBereich } from "@/lib/kontaktPipeline";
import { stufenFilterLabel } from "@/lib/pipelineStufen";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { reassignBeraterBulk, leadsAnZentraleZurueckgeben } from "@/lib/beraterHistorie";
import { istRuecklaeufer } from "@/lib/leadRueckgabe";
import {
  darfLeadsZuweisen,
  darfAnZentraleZurueckgeben,
  darfLeadUebernehmen,
  darfUebergabeSehen,
  NUR_AN_VERTRIEBSPARTNER_MELDUNG,
  NUR_EIGENE_MELDUNG,
  teileNachWeitergabeRecht,
  uebergabeBestaetigbar,
} from "@/lib/leadZuweisungRechte";
import { istInWartezeit, wartezeitEndeText } from "@/lib/kontaktversuchSchedule";
import { grundVollstaendig, type UebergabeGrund } from "@/lib/uebergabeGrund";
import { UebergabeGrundFeld } from "@/components/kunden/UebergabeGrundFeld";
import { tarnEmail, tarnName, tarnNachname, tarnTelefon, tarnVerweis, tarnVorname } from "@/lib/vorfuehrmodus";
import { useToast } from "@/hooks/use-toast";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { isTeamWideKontaktRole, kontaktBelongsToUser, darfKontaktBearbeiten, resolveKontaktBerater } from "@/lib/kontaktOwnership";
import { useVertretungen } from "@/hooks/useVertretungen";
import { getKontaktTyp, kontaktTypFilterWert, type KontaktTyp } from "@/lib/kontaktTypHelper";
import { KontaktTypBadge } from "@/components/kunden/KontaktTypBadge";
import { getFollowUps } from "@/lib/followUpStore";
import { useUserSettings } from "@/hooks/useUserSettings";
import { startCallSession } from "@/lib/callSessionStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  KONTAKTE_FILTER_STANDARD,
  KontakteFilterLeiste,
  type KontakteFilterWerte,
} from "@/components/kunden/KontakteFilterLeiste";

// Chips-Auswahl: legacy/interne Stufen ausblenden. Das Label kommt über
// stufenFilterLabel, damit die beiden Follow-Up-Stufen unterscheidbar sind.
const CHIP_HIDDEN_STUFEN = new Set(["bestandsimport", "archiviert", "zugewiesen", "kontaktversuche", "vermoegensaufbau"]);
const alleChipStufen = (mitAbgelegten: boolean) =>
  PIPELINE_STUFEN
    .filter((s) => !CHIP_HIDDEN_STUFEN.has(s.key))
    // "Verloren" nur anbieten, wenn abgelegte Kontakte überhaupt angezeigt
    // werden. Sonst wäre es ein Filter, der garantiert nichts findet.
    .filter((s) => mitAbgelegten || s.key !== "verloren")
    .map((s) => ({ key: s.key, label: stufenFilterLabel(s.key) }));

const FILTER_SETTINGS_KEY = "alle_kontakte_filter";

interface AlleKontakteFilter {
  stufen: string[];
  nurMeine: boolean;
  ohneFollowUp: boolean;
  ohneTermin: boolean;
  beraterFilter?: string;
  typFilter?: string;
  filterKategorie?: string;
  showArchived?: boolean;
}

const QUELLE_COLORS: Record<string, string> = {
  "Website": "bg-emerald-500/10 text-emerald-600",
  "Instagram": "bg-pink-500/10 text-pink-600",
  "Facebook": "bg-blue-500/10 text-blue-600",
  "LinkedIn": "bg-sky-500/10 text-sky-600",
  "TikTok": "bg-violet-500/10 text-violet-600",
  "Empfehlung": "bg-amber-500/10 text-amber-600",
  "Veranstaltung": "bg-orange-500/10 text-orange-600",
  "Netzwerk": "bg-teal-500/10 text-teal-600",
  "Meta Kampagne": "bg-blue-500/10 text-blue-600",
  "Google Ads": "bg-amber-500/10 text-amber-600",
  "Flyer": "bg-lime-500/10 text-lime-600",
  "Kaltakquise": "bg-slate-500/10 text-slate-600",
  "Sonstige": "bg-muted text-muted-foreground",
  "Foto-Upload": "bg-indigo-500/10 text-indigo-600",
  // Handbuch-Seite: Konfigurator und offene Selbstauskunft, seit 26.09.2026.
  // Ältere Leads tragen noch „Handbuch-Seite“.
  "Konfigurator": "bg-orange-500/10 text-orange-700",
  "Handbuch-Seite": "bg-orange-500/10 text-orange-700",
  "meta": "bg-blue-500/10 text-blue-600",
  "google": "bg-amber-500/10 text-amber-600",
  "website": "bg-emerald-500/10 text-emerald-600",
};

// Kategorie folgt strikt der zentralen Bereichs-Logik aus kontaktPipeline.ts:
// - Kontakt: Lead-/Kontakt-Phase (SA noch nicht unterschrieben)
// - Neukunde: SA unterschrieben, Reservierung noch nicht
// - Abwicklung: Reservierung unterschrieben, Notartermin noch nicht vorbei
// - Bestandskunde: Notartermin in der Vergangenheit
const kategorieLabel = (k: KundeData): string => {
  const bereich: ProzessBereich = getProzessBereich(k);
  switch (bereich) {
    case "bestandsimport": return "Bestand";
    case "bestandskunden": return "Bestandskunde";
    case "abwicklung": return "Abwicklung";
    case "neukunden": return "Neukunde";
    case "leadverwaltung":
    case "kontakte":
    case "verloren":
    default: return "Kontakt";
  }
};

const kategorieColor = (cat: string) => {
  switch (cat) {
    case "Bestand": return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    case "Bestandskunde": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "Abwicklung": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Neukunde": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function AlleKontakte() {
  const cacheReady = useCacheReady(["kontakte"]);
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const { settings, saveSettings, loaded: settingsLoaded } = useUserSettings();
  const isAdmin = isTeamWideKontaktRole(user.role);
  // Wer die Uebergabe angeboten bekommt, steht in leadZuweisungRechte.ts.
  // Die Leitung darf jeden Lead jedem geben, der Vertriebspartner nur die,
  // fuer die er selbst zustaendig ist. Welcher Lead das ist, entscheidet
  // darfKontaktWeitergeben je Zeile, nicht diese Zeile hier.
  const canReassign = darfUebergabeSehen(user.role);
  const darfAlleZuweisen = darfLeadsZuweisen(user.role);
  // Zurück in den offenen Pool: Vertriebspartner und, seit 28.09.2026, der
  // Vertriebsleiter. Beide nach aktiver Rolle.
  const darfZentrale = darfAnZentraleZurueckgeben(user.role);
  // Welcher Weg im Dialog offen ist. Ohne Zuweisungsrecht immer die Zentrale.
  const [zielModus, setZielModus] = useState<"partner" | "zentrale">("partner");
  const partnerModus = darfAlleZuweisen && zielModus === "partner";
  // Duplikat-Erkennung wird für alle Rollen angezeigt, die diese Seite überhaupt
  // öffnen dürfen – analog zur Lead-Verwaltung (kein zusätzliches Role-Gate).
  const showDuplikate = true;

  const liveVersion = useLiveVersion(["kontakte", "follow_ups"]);
  const myUserId = getCurrentUserId();
  const vertreteneIds = useVertretungen(authUser?.id || myUserId);
  const allKontakte = useMemo(() => {
    // Rueckläufer haben keinen Zuständigen mehr. Wer zuweisen darf (nach
    // aktiver Rolle), findet sie trotzdem hier, unter „Ohne Vertriebspartner“.
    const all = getKontakte().filter(k =>
      !!(k.berater && k.berater.trim()) || !!k.zustaendig_id || (darfAlleZuweisen && istRuecklaeufer(k)));
    if (isAdmin) return all;
    // Sichtbar sind nur:
    // - eigene Kontakte (berater = aktueller Nutzername)
    // - per zustaendig_id zugewiesene Leads (z. B. aus Analysetool /analyse/<slug>)
    // - selbst angelegte Leads (erstelltVonId = aktuelle UUID)
    // - Leads von Personen, die man gerade vertritt (Abwesenheit). Die
    //   Zuständigkeit bleibt bei der abwesenden Person, hier geht es nur
    //   darum, dass die Vertretung die Leads überhaupt findet.
    return all.filter(k => darfKontaktBearbeiten(k, {
      userName: user.name,
      userId: authUser?.id || myUserId,
      vertretungFuer: vertreteneIds,
    }));
  }, [isAdmin, darfAlleZuweisen, user.name, authUser?.id, myUserId, liveVersion, vertreteneIds]);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("erstellt_am");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterKategorie, setFilterKategorie] = useState<string>("alle");
  const [stufenFilter, setStufenFilter] = useState<string[]>([]);
  const [nurMeine, setNurMeine] = useState(false);
  const [ohneFollowUp, setOhneFollowUp] = useState(false);
  const [ohneTermin, setOhneTermin] = useState(false);
  // Zusätzliche Preset-Filter (nicht persistiert, per URL/Chip steuerbar)
  const [nurWartezeitAbgelaufen, setNurWartezeitAbgelaufen] = useState(false);
  const [nurInWartezeit, setNurInWartezeit] = useState(false);
  const [nurNieKontaktiert, setNurNieKontaktiert] = useState(false);
  const [nurMitTermin, setNurMitTermin] = useState(false);
  const [beraterFilter, setBeraterFilter] = useState<string>("-");
  const [showArchived, setShowArchived] = useState(false);
  const CHIP_STUFEN = useMemo(() => alleChipStufen(showArchived), [showArchived]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTyp = kontaktTypFilterWert(searchParams.get("typ"));
  const [typFilter, setTypFilter] = useState<KontaktTyp | "-">(initialTyp);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassigning, setReassigning] = useState(false);
  // Ein Grund fuer die ganze Auswahl, dazu abweichende je Kontakt. So ist der
  // haeufige Fall ein Klick und der seltene trotzdem moeglich.
  const [uebergabeGrund, setUebergabeGrund] = useState<UebergabeGrund>({});
  const [einzelGruende, setEinzelGruende] = useState<Record<string, UebergabeGrund>>({});
  const [zeigeEinzelGruende, setZeigeEinzelGruende] = useState(false);
  // Namen der Kontakte, deren Rueckgabe die Datenbank abgelehnt hat. Sie
  // stehen im Dialog, bis er geschlossen wird. Ein Toast war zu schnell weg,
  // um den Grund zu lesen (Meldung eines Partners vom 28.09.2026).
  const [abgelehnteRueckgaben, setAbgelehnteRueckgaben] = useState<string[]>([]);

  // ── Filter-Persistenz (user_settings.einstellungen.alle_kontakte_filter) ──
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = (settings || {})[FILTER_SETTINGS_KEY] as AlleKontakteFilter | undefined;
    if (stored && typeof stored === "object") {
      if (Array.isArray(stored.stufen)) setStufenFilter(stored.stufen);
      if (typeof stored.nurMeine === "boolean") setNurMeine(stored.nurMeine);
      if (typeof stored.ohneFollowUp === "boolean") setOhneFollowUp(stored.ohneFollowUp);
      if (typeof stored.ohneTermin === "boolean") setOhneTermin(stored.ohneTermin);
      if (typeof stored.beraterFilter === "string") setBeraterFilter(stored.beraterFilter);
      if (typeof stored.typFilter === "string") setTypFilter(kontaktTypFilterWert(stored.typFilter));
      if (typeof stored.filterKategorie === "string") setFilterKategorie(stored.filterKategorie);
      if (typeof stored.showArchived === "boolean") setShowArchived(stored.showArchived);
    }
    const stufeParam = searchParams.get("stufen") || searchParams.get("stufe");
    if (stufeParam) {
      setStufenFilter(stufeParam.split(",").map((s) => s.trim()).filter(Boolean));
    }
    const preset = searchParams.get("preset");
    if (preset) applyPreset(preset);
  }, [settingsLoaded, settings, searchParams]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!settingsLoaded || !hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const patch = {
        ...(settings || {}),
        [FILTER_SETTINGS_KEY]: {
          stufen: stufenFilter,
          nurMeine,
          ohneFollowUp,
          ohneTermin,
          beraterFilter,
          typFilter,
          filterKategorie,
          showArchived,
        } as AlleKontakteFilter,
      };
      void saveSettings(patch);
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stufenFilter, nurMeine, ohneFollowUp, ohneTermin, beraterFilter, typFilter, filterKategorie, showArchived, settingsLoaded]);

  const toggleStufe = (key: string) => {
    setStufenFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  function clearPresetFlags() {
    setNurNieKontaktiert(false);
    setNurInWartezeit(false);
    setNurWartezeitAbgelaufen(false);
    setNurMitTermin(false);
  }

  function applyPreset(preset: string) {
    clearPresetFlags();
    setStufenFilter([]);
    setOhneFollowUp(false);
    setOhneTermin(false);
    if (preset === "neu") setNurNieKontaktiert(true);
    else if (preset === "wartezeit") setNurInWartezeit(true);
    else if (preset === "anrufbar") setNurWartezeitAbgelaufen(true);
    else if (preset === "termin") setNurMitTermin(true);
  }

  const nowIso = new Date().toISOString();
  const heute = nowIso.slice(0, 10);
  // Kontakte mit Kundensprache Englisch, einmal je Stand statt je Zeile.
  const englischIds = useMemo(() => englischsprachigeKontaktIds(), [liveVersion]);

  const futureFuKundeIds = useMemo(() => {
    return new Set<string>(
      getFollowUps()
        .filter((f) => f.status === "offen" && !!f.faelligAm && f.faelligAm >= heute)
        .map((f) => f.kundeId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion, heute]);

  const isInWaitingPeriod = (k: KundeData): boolean => istInWartezeit(k.verstecktBis);

  const allSystemUsers = useMemo(() => {
    try {
      return loadAllUsers()
        .filter(u => u.name && u.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }, [liveVersion]);

  const resolveBerater = (k: KundeData): string => resolveKontaktBerater(k, allSystemUsers);

  // Liste aller Vertriebspartner-Namen für den Filter:
  // Vereinigt aufgelöste Namen aus Kontakten + alle aktiven VP-Profile
  // (damit auch VPs ohne Kontakte erscheinen).
  const beraterListe = useMemo(() => {
    const set = new Set<string>();
    for (const k of allKontakte) {
      const name = resolveBerater(k);
      if (name) set.add(name);
    }
    for (const u of allSystemUsers) {
      const rollen = u.rollen || (u.rolle ? [u.rolle] : []);
      if (rollen.some(r => ["vertriebspartner", "vertriebsleiter", "juniorpartner"].includes(r))) {
        if (u.name?.trim()) set.add(u.name.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allKontakte, allSystemUsers]);

  // Basis-Filter (VP / Typ / Nur meine / Archiviert) — bestimmen die Zahlen in den
  // Kategorie- und Pipeline-Chips, damit sich diese beim Filtern nach VP anpassen.
  const baseKontakte = useMemo(() => {
    let result = allKontakte;
    // Verlorene und archivierte Kontakte gehören nicht in die Arbeitsliste.
    // Sie stehen unter "Verloren / Archiviert" und hier nur, wenn der Haken
    // gesetzt ist. Maßgeblich ist dieselbe Stufe, die auch die Verloren-Seite
    // auswertet, damit beide Ansichten nicht auseinanderlaufen: Ein Kontakt
    // gilt als verloren, wenn sein Status "verloren" oder "inaktiv" ist.
    const istAbgelegt = (k: KundeData) => {
      if (k.archiviert) return true;
      const stufe = getEffectivePipelineStufe(k);
      return stufe === "verloren" || stufe === "archiviert";
    };
    if (!showArchived) result = result.filter(k => !istAbgelegt(k));
    else result = result.filter(k => istAbgelegt(k));
    if (nurMeine) {
      result = result.filter((k) => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id || myUserId }));
    }
    if (typFilter !== "-") {
      result = result.filter(k => getKontaktTyp(k) === typFilter);
    }
    if (beraterFilter !== "-") {
      if (beraterFilter === "__none__") result = result.filter(k => !resolveBerater(k));
      else result = result.filter(k => resolveBerater(k) === beraterFilter);
    }
    return result;
  }, [allKontakte, showArchived, nurMeine, typFilter, beraterFilter, user.name, authUser?.id, myUserId, liveVersion]);

  /*
   * Wer hat etwas in der Zukunft stehen?
   *
   * Vorher wurden genau zwei Felder geprueft: der Settertermin und das
   * Beratungsgespraech. Eine Aufgabe naechste Woche, ein Follow-Up, ein
   * Notartermin oder ein Meeting aus der Aktivitaetsliste zaehlten nicht.
   * Damit stand jemand mit einer Aufgabe am Freitag unter "Jetzt anrufbar",
   * und unter "Termin geplant" fehlte er.
   *
   * `kontaktQuellen` sammelt alle Terminfelder eines Kontakts, und
   * `hatGeplantenTermin` sagt, ob davon etwas in der Zukunft liegt. Die
   * Wartephase zaehlt dort bewusst nicht mit, die wird hier ohnehin getrennt
   * geprueft.
   *
   * Einmal fuer alle Kontakte in ein Set, nicht je Zeile: Die Sammlung liest
   * bei jedem Aufruf die Aufgaben- und Aktivitaetslisten, und das je Kontakt
   * einzeln waere bei 250 Kontakten spuerbar.
   */
  const mitZukunftstermin = useMemo(() => {
    const menge = new Set<string>();
    const jetzt = Date.now();
    for (const k of baseKontakte) {
      try {
        if (hatGeplantenTermin(kontaktQuellen(k), jetzt)) menge.add(k.id);
      } catch { /* Store noch nicht bereit, dann eben nicht */ }
    }
    return menge;
  }, [baseKontakte, liveVersion]);

  const hasFutureTermin = (k: KundeData): boolean => mitZukunftstermin.has(k.id);

  const filtered = useMemo(() => {
    let result = baseKontakte;
    if (filterKategorie !== "alle") {
      result = result.filter(k => kategorieLabel(k) === filterKategorie);
    }
    if (stufenFilter.length > 0) {
      const set = new Set(stufenFilter);
      result = result.filter((k) => set.has(getEffectivePipelineStufe(k)));
    }
    if (ohneFollowUp) {
      result = result.filter((k) => !futureFuKundeIds.has(k.id));
    }
    if (ohneTermin) {
      result = result.filter((k) => !hasFutureTermin(k));
    }
    if (nurNieKontaktiert) {
      result = result.filter((k) => {
        const meta: any = (k as any).meta || {};
        const attempts = Number(meta.nichtErreichtCount || (k as any).nichtErreichtCount || 0);
        return (
          attempts === 0 &&
          !hasFutureTermin(k) &&
          !isInWaitingPeriod(k) &&
          getEffectivePipelineStufe(k) === "neuer_lead"
        );
      });
    }
    if (nurInWartezeit) {
      result = result.filter((k) => isInWaitingPeriod(k));
    }
    if (nurWartezeitAbgelaufen) {
      result = result.filter((k) => {
        const meta: any = (k as any).meta || {};
        const attempts = Number(meta.nichtErreichtCount || (k as any).nichtErreichtCount || 0);
        return attempts > 0 && !isInWaitingPeriod(k) && !hasFutureTermin(k);
      });
    }
    if (nurMitTermin) {
      result = result.filter((k) => hasFutureTermin(k));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(k =>
        k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
        k.email.toLowerCase().includes(q) || k.telefon.includes(q) ||
        k.firma.toLowerCase().includes(q) || k.ort.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      if (sortField === "pipelineStufe") {
        const aIdx = PIPELINE_STUFEN.findIndex(s => s.key === getEffectivePipelineStufe(a));
        const bIdx = PIPELINE_STUFEN.findIndex(s => s.key === getEffectivePipelineStufe(b));
        return sortDir === "asc" ? aIdx - bIdx : bIdx - aIdx;
      }
      // Sortiert nach dem, was in der Spalte steht, nicht nur nach `quelle`.
      const wert = (k: KundeData) => sortField === "quelle" ? kontaktQuelleAnzeige(k) : String((k as any)[sortField] ?? "");
      const aVal = wert(a);
      const bVal = wert(b);
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [baseKontakte, search, sortField, sortDir, filterKategorie, stufenFilter, ohneFollowUp, ohneTermin, futureFuKundeIds, heute, nurNieKontaktiert, nurInWartezeit, nurWartezeitAbgelaufen, nurMitTermin, mitZukunftstermin]);

  const stufenCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const k of baseKontakte) {
      const s = getEffectivePipelineStufe(k);
      map[s] = (map[s] || 0) + 1;
    }
    return map;
  }, [baseKontakte]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const pagination = usePagination("alle-kontakte", filtered.length);
  const paged = pagination.slice(filtered);

  const counts = {
    alle: baseKontakte.length,
    Kontakt: baseKontakte.filter(k => kategorieLabel(k) === "Kontakt").length,
    Neukunde: baseKontakte.filter(k => kategorieLabel(k) === "Neukunde").length,
    Abwicklung: baseKontakte.filter(k => kategorieLabel(k) === "Abwicklung").length,
    Bestandskunde: baseKontakte.filter(k => kategorieLabel(k) === "Bestandskunde").length,
  };

  /*
   * Die Leiste kennt einen Wert je Filter, die Seite hält die Ansicht dagegen
   * in vier einzelnen Schaltern. Hier wird daraus ein Schlüssel und zurück.
   */
  const aktivesPreset = nurNieKontaktiert
    ? "neu"
    : nurInWartezeit
      ? "wartezeit"
      : nurWartezeitAbgelaufen
        ? "anrufbar"
        : nurMitTermin
          ? "termin"
          : "alle";

  /** Ansicht und Typ stehen zusätzlich in der Adresse, damit ein Link sie mitnimmt. */
  const setzeUrlParameter = (aenderungen: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [schluessel, wert] of Object.entries(aenderungen)) {
      if (wert === null) next.delete(schluessel);
      else next.set(schluessel, wert);
    }
    setSearchParams(next, { replace: true });
  };

  const filterWerte: KontakteFilterWerte = {
    preset: aktivesPreset,
    kategorie: filterKategorie,
    stufen: stufenFilter,
    typ: typFilter,
    nurMeine,
    ohneFollowUp,
    ohneTermin,
    suche: search,
    berater: beraterFilter,
    abgelegte: showArchived,
  };

  const setzeFilter = (teil: Partial<KontakteFilterWerte>) => {
    if (teil.preset !== undefined) {
      if (teil.preset === "alle") clearPresetFlags();
      else applyPreset(teil.preset);
      setzeUrlParameter({ preset: teil.preset === "alle" ? null : teil.preset });
    }
    if (teil.kategorie !== undefined) setFilterKategorie(teil.kategorie);
    if (teil.stufen !== undefined) setStufenFilter(teil.stufen);
    if (teil.typ !== undefined) {
      setTypFilter(kontaktTypFilterWert(teil.typ));
      setzeUrlParameter({ typ: teil.typ === "-" ? null : teil.typ });
    }
    if (teil.nurMeine !== undefined) setNurMeine(teil.nurMeine);
    if (teil.ohneFollowUp !== undefined) setOhneFollowUp(teil.ohneFollowUp);
    if (teil.ohneTermin !== undefined) setOhneTermin(teil.ohneTermin);
    if (teil.suche !== undefined) setSearch(teil.suche);
    if (teil.berater !== undefined) setBeraterFilter(teil.berater);
    if (teil.abgelegte !== undefined) setShowArchived(teil.abgelegte);
  };

  /*
   * Zurücksetzen nimmt alles mit, auch die sichtbaren Einschränkungen Suche,
   * Partner und Abgelegtes. Ein Knopf, der "alle Filter" verspricht und drei
   * davon stehen lässt, erklärt eine kurze Liste nicht.
   */
  const setzeFilterZurueck = () => {
    clearPresetFlags();
    setFilterKategorie(KONTAKTE_FILTER_STANDARD.kategorie);
    setStufenFilter([]);
    setTypFilter("-");
    setNurMeine(false);
    setOhneFollowUp(false);
    setOhneTermin(false);
    setSearch("");
    setBeraterFilter("-");
    setShowArchived(false);
    setzeUrlParameter({ preset: null, typ: null, stufen: null, stufe: null });
  };

  /*
   * Jede Zeile ist auswählbar, auch in der Wartezeit.
   *
   * Bis zum 28.09.2026 war das Kästchen in der Wartezeit gesperrt. Die Sperre
   * stammt aus der Zeit, als die Auswahl nur die Anruf-Session fütterte, und
   * dort ist sie richtig: Einen Lead, der gerade nicht erreicht wurde, ruft
   * man nicht gleich wieder an. Seit dem 21.09.2026 hängt an derselben
   * Auswahl aber auch „An die Zentrale zurückgeben“, und damit sperrte sie
   * genau die Leads, die am häufigsten zurückgehen („Kein Kontakt zustande
   * gekommen“). Die Datenbank kennt diese Sperre für die Rückgabe nicht.
   * Jetzt filtert die Anruf-Session selbst und sagt, wen sie auslässt.
   */
  const allPagedSelected = paged.length > 0 && paged.every(k => selectedIds.has(k.id));
  const someSelected = selectedIds.size > 0;
  const togglePagedSelection = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) paged.forEach(k => next.add(k.id));
      else paged.forEach(k => next.delete(k.id));
      return next;
    });
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleStartCallSession = () => {
    if (selectedIds.size === 0) return;
    const ausgewaehlt = filtered.filter((k) => selectedIds.has(k.id));
    // Die Wartezeit nach „Nicht erreicht“ gilt fürs Anrufen: Diese Leads
    // bleiben in der Auswahl, kommen aber nicht in die Anrufliste.
    const wartend = ausgewaehlt.filter(isInWaitingPeriod);
    const session = startCallSession(ausgewaehlt.filter((k) => !isInWaitingPeriod(k)).map((k) => k.id));
    if (!session) {
      toast({
        title: "Niemand anrufbar",
        description: wartend.length > 0
          ? "Bei allen ausgewählten Kontakten läuft noch die Wartezeit nach „Nicht erreicht“. Das Datum steht jeweils unter der Telefonnummer."
          : "Bitte mindestens einen Kontakt auswählen.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Anruf-Session gestartet",
      description: `${session.ids.length} Leads in der Queue`
        + (wartend.length > 0 ? `. ${wartend.length} in der Wartezeit ausgelassen.` : ""),
    });
    clearSelection();
    navigate(`/kunden/${session.ids[0]}`);
  };

  /** Die ausgewählten Kontakte in der Reihenfolge der Liste. */
  const ausgewaehlteKontakte = useMemo(
    () => filtered.filter((k) => selectedIds.has(k.id)),
    [filtered, selectedIds],
  );

  /**
   * Darf der angemeldete Nutzer genau diesen Lead weitergeben?
   *
   * Die Leitung darf jeden, ein Vertriebspartner nur die, für die er selbst
   * zuständig ist. Die Regel hängt am bisherigen Zuständigen, nicht an der
   * Rolle des Aufrufers, sonst könnte sich jeder fremde Leads zuschieben.
   * Dieselbe Regel steht als Trigger in der Datenbank.
   */
  /**
   * Die Auswahl, getrennt in weitergebbare Leads und den Rest. Fremde Leads
   * werden übersprungen statt die ganze Rückgabe zu sperren.
   */
  const { eigene: weitergebbar, fremde: nichtEigeneAuswahl } = useMemo(
    () => teileNachWeitergabeRecht(ausgewaehlteKontakte, { rolle: user.role, benutzerId: authUser?.id || myUserId }),
    [ausgewaehlteKontakte, user.role, authUser?.id, myUserId],
  );

  /**
   * Wer steht in der Auswahl "Neuer Vertriebspartner"?
   *
   * Für einen Vertriebspartner nur Kollegen mit derselben Rolle. Die
   * Datenbank lässt seit dem 18.09.2026 nichts anderes zu, und eine Auswahl,
   * die Namen anbietet, an denen die Übergabe hinterher scheitert, ist keine
   * Hilfe. Für die Leitung bleibt die Liste vollständig, sie verteilt
   * weiterhin an jeden, etwa an eine Setterin.
   */
  const uebergabeZiele = useMemo(
    () => (darfAlleZuweisen ? allSystemUsers : allSystemUsers.filter(darfLeadUebernehmen)),
    [allSystemUsers, darfAlleZuweisen],
  );

  /**
   * Der Grund, der für diesen Kontakt zählt: sein eigener, sonst der
   * gemeinsame.
   */
  const grundFuerKontakt = (id: string): UebergabeGrund => einzelGruende[id] ?? uebergabeGrund;

  /**
   * Fehlt irgendwo noch ein Grund?
   *
   * Auf dieser Seite stehen nur Kontakte, die bereits einem Partner gehören
   * (siehe Filter in `allKontakte`). Jede Zuweisung von hier aus ist also eine
   * Übergabe, und damit ist der Grund immer Pflicht. Ausnahme seit 28.09.2026:
   * Rückläufer, die die Leitung hier findet. Auch für sie bleibt die Angabe
   * Pflicht, gespeichert wird sie wie bei der Erstverteilung nicht. Die
   * Erstverteilung aus dem offenen Pool läuft über die Lead-Verwaltung und
   * bleibt unberührt.
   */
  const gruendeVollstaendig =
    weitergebbar.length > 0 &&
    weitergebbar.every((k) => grundVollstaendig(grundFuerKontakt(k.id)));
  const bestaetigbar = uebergabeBestaetigbar({
    darfAlleZuweisen: partnerModus,
    ziel: reassignTarget,
    gruendeVollstaendig,
    laeuft: reassigning,
  });
  const anzahlText = (n: number) => `${n} Kontakt${n === 1 ? "" : "e"}`;
  // Kunden ab Reservierung im Pool-Weg: kein Hindernis, aber ein deutlicher
  // Hinweis vorab, und die Zentrale bekommt danach eine Glocke.
  const abReservierung = partnerModus
    ? []
    : weitergebbar.filter((k) => istProvisionsrelevant(getEffectivePipelineStufe(k)));

  const oeffneUebergabe = (modus: "partner" | "zentrale") => {
    setZielModus(modus);
    setReassignTarget("");
    setUebergabeGrund({});
    setEinzelGruende({});
    setZeigeEinzelGruende(false);
    setAbgelehnteRueckgaben([]);
    setReassignDialogOpen(true);
  };

  const schliesseReassignDialog = () => {
    setReassignDialogOpen(false);
    setReassignTarget("");
    setUebergabeGrund({});
    setEinzelGruende({});
    setZeigeEinzelGruende(false);
    setAbgelehnteRueckgaben([]);
  };

  const handleConfirmReassign = async () => {
    if (!bestaetigbar) return;
    // Fremde Leads gehen nicht mit. Maßgeblich bleibt der Trigger in der
    // Datenbank; hier werden sie gar nicht erst geschickt.
    const ids = weitergebbar.map((k) => k.id);
    const uebersprungen = nichtEigeneAuswahl.length;
    setReassigning(true);
    try {

      /*
       * Zwei Wege, seit dem 21.09.2026.
       *
       * Die Leitung verteilt weiter an einen Partner. Ein Vertriebspartner
       * gibt an uns zurueck: Zustaendigkeit weg, Lead steht in der
       * Lead-Verwaltung, wir entscheiden, wer ihn als Naechstes bekommt.
       *
       * Der Grund geht in beiden Faellen mit. Beim Zurueckgeben ist er das
       * Einzige, was der Naechste ueber den bisherigen Verlauf erfaehrt,
       * deshalb bleibt er Pflicht.
       */
      if (partnerModus) {
        // Die Auswahl haelt die Kennung. Zwei Partner koennen gleich heissen.
        const ziel = uebergabeZiele.find(u => u.id === reassignTarget);
        const changed = reassignBeraterBulk(ids, ziel?.name || "", {
          changedById: myUserId || undefined,
          changedByName: user.name,
          changedByRole: user.role,
          grund: uebergabeGrund,
          grundJeKontakt: einzelGruende,
          zielId: ziel?.id,
        });
        toast({
          title: `${changed} Kontakt${changed === 1 ? "" : "e"} umverteilt`,
          description: `Neuer Vertriebspartner: ${ziel?.name || ""}`,
        });
      } else {
        // Abwarten, was die Datenbank sagt. Vorher meldete die Seite
        // „zurückgegeben“, auch wenn die Zeilensicherheit abgelehnt hatte.
        // Eine Glocke an die Zentrale je Rueckgabe, nicht je Kontakt.
        const ergebnisse = await leadsAnZentraleZurueckgeben(
          weitergebbar.map((k) => ({
            kontaktId: k.id,
            grund: einzelGruende[k.id] ?? uebergabeGrund,
            stufe: getEffectivePipelineStufe(k),
          })),
          { changedById: myUserId || undefined, changedByName: user.name },
        );
        const changed = ergebnisse.filter(Boolean).length;
        if (changed > 0) {
          toast({
            title: `${changed} Lead${changed === 1 ? "" : "s"} zurückgegeben`,
            description: [
              "Wir prüfen und geben sie neu heraus.",
              uebersprungen > 0 ? `${anzahlText(uebersprungen)} übersprungen, weil du für sie nicht zuständig bist.` : "",
            ].filter(Boolean).join(" "),
          });
        }
        // Abgelehnte bleiben ausgewählt, der Dialog bleibt offen und nennt sie.
        const abgelehnteKontakte = weitergebbar.filter((_, i) => !ergebnisse[i]);
        if (abgelehnteKontakte.length > 0) {
          setSelectedIds(new Set(abgelehnteKontakte.map((k) => k.id)));
          setAbgelehnteRueckgaben(abgelehnteKontakte.map((k) => `${tarnVorname(k.vorname)} ${tarnNachname(k.nachname)}`.trim()));
          cacheRefreshTable("kontakte");
          return;
        }
      }

      clearSelection();
      schliesseReassignDialog();
      cacheRefreshTable("kontakte");
    } catch (e: any) {
      toast({ title: "Fehler beim Umverteilen", description: e?.message || "", variant: "destructive" });
    } finally {
      setReassigning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PageHeader title="Alle Kontakte" subtitle={`${filtered.length} Kontakte`} />
          {/*
            Import und Export stehen rechts neben "Kontakt anlegen" und nicht
            mehr unter der Ueberschrift. Beides sind Handlungen an der Seite
            als Ganzes, sie gehoeren deshalb zusammen an denselben Platz. In
            der Filterzeile hatten sie ohnehin nichts verloren, dort geht es um
            die eingestellte Sicht.
          */}
          <div className="flex items-center gap-2">
            <ImportExportButton kontakte={filtered} onImportDone={() => cacheRefreshTable("kontakte")} exportFilename="alle-kontakte" />
            <NeuerKontaktDialog />
          </div>
        </div>

        <KontakteFilterLeiste
          werte={filterWerte}
          onChange={setzeFilter}
          onZuruecksetzen={setzeFilterZurueck}
          stufenOptionen={CHIP_STUFEN}
          stufenCounts={stufenCounts}
          kategorieCounts={counts}
          beraterListe={beraterListe}
          zeigeBeraterFilter={darfAlleZuweisen}
          gezeigt={filtered.length}
          gesamt={allKontakte.length}
        />

        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {someSelected && (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-primary/5 px-4 py-2">
              <div className="text-sm">
                <span className="font-semibold">{selectedIds.size}</span> Kontakt{selectedIds.size === 1 ? "" : "e"} ausgewählt
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={clearSelection}>Auswahl aufheben</Button>
                <Button size="sm" onClick={handleStartCallSession} className="gap-1">
                  <Target className="h-3.5 w-3.5" />
                  Anruf-Session starten ({selectedIds.size})
                </Button>
                {canReassign && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={weitergebbar.length === 0}
                            onClick={() => oeffneUebergabe(darfAlleZuweisen ? "partner" : "zentrale")}
                          >
                            <UserCog className="h-3.5 w-3.5 mr-1.5" />
                            {darfAlleZuweisen ? "Vertriebspartner zuweisen" : "An die Zentrale zurückgeben"}
                            {nichtEigeneAuswahl.length > 0 && weitergebbar.length > 0 && ` (${weitergebbar.length})`}
                          </Button>
                          {/* Der Vertriebsleiter hat beide Wege, seit 28.09.2026. */}
                          {darfAlleZuweisen && darfZentrale && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2"
                              disabled={weitergebbar.length === 0}
                              onClick={() => oeffneUebergabe("zentrale")}
                            >
                              An die Zentrale zurückgeben
                            </Button>
                          )}
                        </span>
                      </TooltipTrigger>
                      {nichtEigeneAuswahl.length > 0 && (
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          {weitergebbar.length === 0
                            ? NUR_EIGENE_MELDUNG
                            : `${anzahlText(nichtEigeneAuswahl.length)} in deiner Auswahl gehören nicht dir und bleiben, wo sie sind. Die übrigen ${weitergebbar.length} kannst du zurückgeben.`}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )}

          {showDuplikate && (
            <DuplikatBanner kontakte={allKontakte} onMerged={() => cacheRefreshTable("kontakte")} />
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPagedSelected}
                    onCheckedChange={v => togglePagedSelection(!!v)}
                    aria-label="Alle auswählen"
                    disabled={paged.length === 0}
                  />
                </TableHead>
                {[
                  { key: "erstellt_am", label: "Angelegt am" },
                  { key: "vorname", label: "Vorname" },
                  { key: "nachname", label: "Nachname" },
                  { key: "telefon", label: "Telefon" },
                  { key: "email", label: "E-Mail" },
                  { key: "pipelineStufe", label: "Pipeline-Status" },
                  { key: "quelle", label: "Quelle" },
                  { key: "kontaktTyp", label: "Typ" },
                  { key: "kategorie", label: "Kategorie" },
                  { key: "berater", label: "Vertriebspartner" },
                ].map(col => (
                  <TableHead key={col.key} className="cursor-pointer select-none" onClick={() => toggleSort(col.key)}>
                    <span className="flex items-center gap-1 text-xs">{col.label} <SortIcon field={col.key} /></span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const colSpan = 11;
                if (!cacheReady) return <TableRow><TableCell colSpan={colSpan}><TableSkeleton columns={colSpan} rows={6} /></TableCell></TableRow>;
                if (filtered.length === 0) return <TableRow><TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">Keine Kontakte gefunden.</TableCell></TableRow>;
                return paged.map(k => {
                  const kat = kategorieLabel(k);
                  const stufe = getEffectivePipelineStufe(k);
                  const stufeLabel = PIPELINE_STUFEN.find(s => s.key === stufe)?.label || stufe;
                  const checked = selectedIds.has(k.id);
                  const waitUntil = isInWaitingPeriod(k) ? k.verstecktBis ?? null : null;
                  const profilUrl = `/kunden/${k.id}`;
                  return (
                    <TableRow
                      key={k.id}
                      className="group cursor-pointer hover:bg-muted/50"
                      onClick={e => zeilenKlick(e, profilUrl, navigate)}
                      onAuxClick={e => zeilenKlick(e, profilUrl, navigate)}
                    >
                      <TableCell onClick={e => e.stopPropagation()} className="w-10">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={v => toggleOne(k.id, !!v)}
                          aria-label={`${k.vorname} ${k.nachname} auswählen`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">{formatDatum(k.erstellt_am)}</div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {/* Echter Link: Kontextmenü, Mittelklick und Strg/Cmd+Klick öffnen einen neuen Tab. */}
                        <span className="inline-flex items-center gap-1">
                          <Link to={profilUrl} className="hover:underline">{tarnVorname(k.vorname)}</Link>
                          <NeuerTabLink href={profilUrl} />
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>
                            <Link to={profilUrl} className="hover:underline" tabIndex={-1}>{tarnNachname(k.nachname)}</Link>
                            {englischIds.has(k.id) && <KundenspracheKuerzel sprache="en" className="ml-1.5" />}
                          </span>
                          {/*
                            Der naechste geplante Schritt, sonst sieht die Zeile
                            aus, als staende bei diesem Kontakt nichts an.
                          */}
                          <NaechsterSchritt kunde={k} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {k.telefon ? (
                            <a
                              href={tarnVerweis(`tel:${k.telefon.replace(/\s/g, "")}`)}
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                // Erst das Kundenprofil mit dem Anruf-Protokoll
                                // öffnen, dann wählen. So geht kein Anruf unter.
                                e.preventDefault();
                                e.stopPropagation();
                                navigate(`/kunden/${k.id}?anruf=1`);
                                starteAnrufFuerKontakt(k.id, k.telefon, "Alle Kontakte", user.name);
                              }}
                            >
                              {tarnTelefon(normalizeTelefon(k.telefon))}
                            </a>
                          ) : (
                            <span>–</span>
                          )}
                          {waitUntil && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-amber-600 flex items-center gap-0.5 w-fit" tabIndex={0}>
                                    <Clock className="h-2.5 w-2.5" /> Nicht erreicht, nächster Anruf ab {wartezeitEndeText(waitUntil)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                  Nach „Nicht erreicht“ ruht der Lead bis {wartezeitEndeText(waitUntil)}, damit er nicht zu oft hintereinander angerufen wird. In eine Anruf-Session kommt er erst danach. {darfZentrale ? "Auswählen und an die Zentrale zurückgeben kannst du ihn jederzeit." : "Auswählen kannst du ihn jederzeit."}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{tarnEmail(k.email)}</TableCell>
                      <TableCell><Badge className="text-[10px] bg-primary/10 text-primary">{stufeLabel}</Badge></TableCell>
                      <TableCell>
                        {kontaktQuelleAnzeige(k) ? (
                          <div className="flex flex-col gap-1">
                            <Badge className={`text-[10px] w-fit ${QUELLE_COLORS[kontaktQuelleAnzeige(k)] || "bg-muted text-muted-foreground"}`}>
                              {kontaktQuelleAnzeige(k)}
                            </Badge>
                            {(k as any).meta?.tippgeberName && (
                              <span className="text-[10px] text-muted-foreground italic">
                                Empfehlung: {tarnName((k as any).meta.tippgeberName, "person")}
                              </span>
                            )}
                          </div>
                        ) : "–"}
                      </TableCell>
                      <TableCell><KontaktTypBadge kunde={k} size="xs" /></TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${kategorieColor(kat)}`}>{kat === "Bestand" ? "📇 Bestand" : kat}</span></TableCell>
                      <TableCell>{tarnName(resolveBerater(k), "partner") || <span className="text-muted-foreground">–</span>}</TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>

        <StickyPagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          showAll={pagination.showAll}
          total={filtered.length}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          onToggleShowAll={pagination.setShowAll}
        />
      </div>

      <Dialog open={reassignDialogOpen} onOpenChange={(open) => { if (!reassigning && !open) schliesseReassignDialog(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{partnerModus ? "Vertriebspartner zuweisen" : "An die Zentrale zurückgeben"}</DialogTitle>
            <DialogDescription>
              {partnerModus ? (
                <>
                  {anzahlText(weitergebbar.length)} gehen an den ausgewählten Vertriebspartner. Der bisherige Vertriebspartner bleibt in der Vertriebspartner-Historie stehen, und der neue bekommt eine Benachrichtigung mit dem Grund.
                </>
              ) : (
                <>
                  {darfAlleZuweisen ? (
                    <>
                      {anzahlText(weitergebbar.length)} gehen zurück in den offenen Pool der Lead-Verwaltung und haben danach keinen Vertriebspartner mehr.
                      Der bisherige Vertriebspartner bleibt in der Vertriebspartner-Historie stehen.
                    </>
                  ) : (
                    <>
                      {anzahlText(weitergebbar.length)} gehen zurück an uns und verschwinden aus deiner Liste.
                      Wir prüfen sie und geben sie neu heraus. Zurückgeben kannst du nur Leads, für die du selbst zuständig bist.
                    </>
                  )}
                  {nichtEigeneAuswahl.length > 0 && ` ${anzahlText(nichtEigeneAuswahl.length)} aus deiner Auswahl gehören nicht dir und bleiben, wo sie sind.`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/*
            Die Auswahl anderer Partner sieht nur noch die Leitung.
            
            Christian hat den Ablauf am 21.09.2026 umgestellt: Ein
            Vertriebspartner gibt nicht mehr an einen Kollegen weiter, sondern
            an uns zurueck. Damit entscheidet die Zentrale, wer einen
            schwierigen Lead als Naechstes anruft, und ein Lead wandert nicht
            mehr unbemerkt im Kreis.
          */}
          {partnerModus && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Neuer Vertriebspartner</label>
            <Select value={reassignTarget} onValueChange={setReassignTarget}>
              <SelectTrigger><SelectValue placeholder="Vertriebspartner auswählen..." /></SelectTrigger>
              <SelectContent>
                {uebergabeZiele.length === 0 ? (
                  <SelectItem value="__empty__" disabled>Keine Vertriebspartner gefunden</SelectItem>
                ) : (
                  uebergabeZiele.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.rolle ? ` · ${u.rolle}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          )}

          {/*
            Der Grund. Ein Klick reicht, das Textfeld ist die Ausnahme. Die
            Formulierung bittet um eine Übergabe an einen Kollegen, nicht um
            eine Bewertung des bisherigen Partners.
          */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {weitergebbar.length === 1 ? "Grund der Übergabe" : "Gemeinsamer Grund für alle"}
            </label>
            <p className="text-xs text-muted-foreground">
              Kurz und sachlich. Der neue Vertriebspartner liest das als Erstes und weiß dann, wo er ansetzt.
            </p>
            <UebergabeGrundFeld grund={uebergabeGrund} onChange={setUebergabeGrund} />
          </div>

          {weitergebbar.length > 1 && (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setZeigeEinzelGruende((v) => !v)}
              >
                {zeigeEinzelGruende ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
                Einzelne abweichend begründen
                {Object.keys(einzelGruende).length > 0 && ` (${Object.keys(einzelGruende).length})`}
              </Button>

              {zeigeEinzelGruende && (
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                  {weitergebbar.map((k) => {
                    const eigener = einzelGruende[k.id];
                    return (
                      <div key={k.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">
                            {tarnVorname(k.vorname)} {tarnNachname(k.nachname)}
                          </span>
                          {eigener ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setEinzelGruende((prev) => {
                                const next = { ...prev };
                                delete next[k.id];
                                return next;
                              })}
                            >
                              Gemeinsamen Grund nehmen
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setEinzelGruende((prev) => ({ ...prev, [k.id]: { ...uebergabeGrund } }))}
                            >
                              Eigenen Grund angeben
                            </Button>
                          )}
                        </div>
                        {eigener ? (
                          <UebergabeGrundFeld
                            kompakt
                            grund={eigener}
                            bezeichnung={`Grund für ${k.vorname} ${k.nachname}`}
                            onChange={(g) => setEinzelGruende((prev) => ({ ...prev, [k.id]: g }))}
                          />
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Nimmt den gemeinsamen Grund.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {abReservierung.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {abReservierung.length === 1
                  ? "1 der ausgewählten Kunden hat bereits reserviert."
                  : `${abReservierung.length} der ausgewählten Kunden haben bereits reserviert.`}
                {" "}Nach der Rückgabe betreut {abReservierung.length === 1 ? "ihn" : "sie"} die Zentrale. Admin, Inhaber und Backoffice bekommen dazu eine Glocke und weisen neu zu.
              </AlertDescription>
            </Alert>
          )}

          {abgelehnteRueckgaben.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {abgelehnteRueckgaben.length === 1 ? "Noch bei dir: " : `${abgelehnteRueckgaben.length} Kontakte noch bei dir: `}
                {abgelehnteRueckgaben.join(", ")}. Die Datenbank hat die Rückgabe nicht angenommen. Lade die Seite neu
                und versuche es noch einmal. Bleibt es dabei, schick der Zentrale die Namen, sie gibt die Kontakte für
                dich zurück.
              </AlertDescription>
            </Alert>
          )}

          {!gruendeVollstaendig && (
            <p className="text-xs text-muted-foreground">
              Ohne Grund geht die Zuweisung nicht weiter.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={schliesseReassignDialog} disabled={reassigning}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirmReassign} disabled={!bestaetigbar}>
              {partnerModus
                ? (reassigning ? "Wird zugewiesen..." : `${anzahlText(weitergebbar.length)} zuweisen`)
                : (reassigning ? "Wird zurückgegeben..." : `${anzahlText(weitergebbar.length)} zurückgeben`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
