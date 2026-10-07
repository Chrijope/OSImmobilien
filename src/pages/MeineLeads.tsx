import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NeuerTabLink } from "@/components/kunden/NeuerTabLink";
import { zeilenKlick } from "@/lib/zeilenNavigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { LeadPaketKarte } from "@/components/leadpakete/LeadPaketKarte";
import { useCacheReady } from "@/hooks/useCacheReady";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Phone, Calendar, User, ArrowRight, RefreshCw, Clock, Info, ChevronUp, ChevronDown } from "lucide-react";
import { getKontakte, type KundeData } from "@/lib/kundenStore";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { cacheRefreshTable } from "@/lib/dataCache";
import { getEffectivePipelineStufe, PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { stufenFilterLabel } from "@/lib/pipelineStufen";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { istPerson } from "@/lib/beraterNamensabgleich";
import { datumSortierwert } from "@/lib/datumsformate";
import { formatDatum } from "@/lib/utils";

const NEUKUNDE_STUFEN = ["neuer_lead", "kontaktversuche", "follow_up", "erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt"];
const ABWICKLUNG_STUFEN = ["reservierung", "finanzierung", "notar"];
const BESTANDSKUNDE_STUFEN = ["faelligkeit", "abrechnung", "abgeschlossen"];

const kategorieLabel = (k: KundeData): string => {
  const stufe = getEffectivePipelineStufe(k);
  if (BESTANDSKUNDE_STUFEN.includes(stufe)) return "Bestandskunde";
  if (ABWICKLUNG_STUFEN.includes(stufe)) return "Abwicklung";
  if (stufe === "neuer_lead" || stufe === "kontaktversuche") return "Kontakt";
  if (NEUKUNDE_STUFEN.includes(stufe)) return "Neukunde";
  if (stufe === "verloren") return "Verloren";
  return "Kontakt";
};

const kategorieColor = (cat: string) => {
  switch (cat) {
    case "Bestandskunde": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "Abwicklung": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "Neukunde": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "Kontakt": return "bg-primary/10 text-primary border-primary/20";
    case "Verloren": return "bg-destructive/10 text-destructive border-destructive/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

function isHidden(k: KundeData): boolean {
  return !!k.verstecktBis && k.verstecktBis > new Date().toISOString();
}

let _userCache: { id: string; name: string }[] | null = null;
function vpName(k: KundeData): string {
  if (k.berater && k.berater.trim()) return k.berater.trim();
  const zid = (k as any).zustaendig_id || (k as any).zustaendigId;
  if (!zid) return "";
  if (!_userCache) _userCache = loadAllUsers().map(u => ({ id: u.id, name: u.name }));
  return _userCache.find(u => u.id === zid)?.name || "";
}

export default function MeineLeads() {
  const navigate = useNavigate();
  const { user: _user } = useUser();
  const isSetterin = _user.role === "setterin";
  const cacheReady = useCacheReady(["kontakte"]);
  const [search, setSearch] = useState("");
  const [filterKategorie, setFilterKategorie] = useState("-");
  const [kontakte, setKontakte] = useState<KundeData[]>([]);
  const [sortField, setSortField] = useState("zugewiesenAm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPipeline, setFilterPipeline] = useState("-");
  const [filterBereich, setFilterBereich] = useState("-");
  const [filterBerater, setFilterBerater] = useState("-");

  const loadLeads = () => {
    const all = getKontakte();
    let myUserId: string | null = null;
    try { myUserId = localStorage.getItem("mi_current_user_id"); } catch { /* ignore */ }
    const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const myNameNorm = norm(_user.name);
    const setterLeads = all.filter(k => {
      // Für Setter-Rolle: STRIKT nur Leads, in denen sie als „Setter" eingetragen sind.
      // Die setterId zaehlt nur, wenn der Name dahinter zum eingetragenen
      // Setter passt. Sonst wurde nur der Name geaendert (die Kennung zieht
      // bei Nicht-Admins nicht mit), dann zaehlt der eindeutige Name.
      const alsSetter = !!myNameNorm
        && istPerson(k.setterId, k.setter, { userId: myUserId, userName: _user.name });
      if (isSetterin) return alsSetter;
      // Andere Rollen: eigene Leads (erstelltVonId) ODER als Setter eingetragen.
      const ownerById = !!myUserId && k.erstelltVonId === myUserId;
      return ownerById || alsSetter;
    });
    setKontakte(setterLeads);
  };

  useEffect(() => {
    loadLeads();
    const channel = supabase
      .channel('meine-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kontakte' }, () => {
        void cacheRefreshTable("kontakte").then(loadLeads);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleRefresh = async () => {
    await cacheRefreshTable("kontakte");
    loadLeads();
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const beraterList = useMemo(() => {
    const names = new Set(kontakte.map(k => vpName(k)).filter(Boolean));
    return Array.from(names).sort();
  }, [kontakte]);

  const pipelineList = useMemo(() => {
    const keys = new Set(kontakte.map(k => getEffectivePipelineStufe(k)));
    return PIPELINE_STUFEN.filter(s => keys.has(s.key));
  }, [kontakte]);

  const filtered = useMemo(() => {
    let list = kontakte;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(k =>
        `${k.vorname} ${k.nachname}`.toLowerCase().includes(s) ||
        k.email?.toLowerCase().includes(s) ||
        k.telefon?.includes(s) ||
        vpName(k).toLowerCase().includes(s)
      );
    }
    if (filterKategorie !== "-") {
      if (filterKategorie === "versteckt") {
        list = list.filter(k => isHidden(k));
      } else {
        list = list.filter(k => kategorieLabel(k) === filterKategorie);
      }
    }
    if (filterPipeline !== "-") {
      list = list.filter(k => getEffectivePipelineStufe(k) === filterPipeline);
    }
    if (filterBereich !== "-") {
      list = list.filter(k => kategorieLabel(k) === filterBereich);
    }
    if (filterBerater !== "-") {
      list = list.filter(k => vpName(k) === filterBerater);
    }
    return [...list].sort((a, b) => {
      // Datumsfelder liegen im Bestand teils als ISO, teils als deutsches
      // Datum vor. Ein reines localeCompare sortiert die beiden Formate
      // gegeneinander nach dem ersten Zeichen und damit falsch.
      const istDatum = sortField === "zugewiesenAm" || sortField === "erstellt_am";
      const aV = istDatum
        ? datumSortierwert((a as any)[sortField])
        : String((a as any)[sortField] ?? "");
      const bV = istDatum
        ? datumSortierwert((b as any)[sortField])
        : String((b as any)[sortField] ?? "");
      return sortDir === "asc" ? aV.localeCompare(bV) : bV.localeCompare(aV);
    });
  }, [kontakte, search, filterKategorie, filterPipeline, filterBereich, filterBerater, sortField, sortDir]);

  const hiddenCount = kontakte.filter(k => isHidden(k)).length;

  // Category counts for chips
  const counts = useMemo(() => ({
    alle: kontakte.length,
    Kontakt: kontakte.filter(k => kategorieLabel(k) === "Kontakt").length,
    Neukunde: kontakte.filter(k => kategorieLabel(k) === "Neukunde").length,
    Abwicklung: kontakte.filter(k => kategorieLabel(k) === "Abwicklung").length,
    Bestandskunde: kontakte.filter(k => kategorieLabel(k) === "Bestandskunde").length,
    Verloren: kontakte.filter(k => kategorieLabel(k) === "Verloren").length,
  }), [kontakte]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Meine Leads" subtitle={`${filtered.length} Leads`} />

        {!isSetterin && <LeadPaketKarte />}

        {/* Kategorie Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {(["-", "Kontakt", "Neukunde", "Abwicklung", "Bestandskunde", "Verloren"] as const).map(cat => {
            const label = cat === "-" ? "Alle" : cat;
            const count = cat === "-" ? counts.alle : counts[cat] || 0;
            if (cat !== "-" && count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setFilterKategorie(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  filterKategorie === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <button
              onClick={() => setFilterKategorie("versteckt")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                filterKategorie === "versteckt"
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20"
              }`}
            >
              ⏳ In Wartezeit ({hiddenCount})
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, E-Mail, Telefon..."
              className="pl-9 h-9"
            />
          </div>
          <Select value={filterPipeline} onValueChange={setFilterPipeline}>
            <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Pipeline-Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="-">Alle Status</SelectItem>
              {pipelineList.map(s => <SelectItem key={s.key} value={s.key}>{stufenFilterLabel(s.key)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBereich} onValueChange={setFilterBereich}>
            <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Bereich" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="-">Alle Bereiche</SelectItem>
              {["Kontakt", "Neukunde", "Abwicklung", "Bestandskunde", "Verloren"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBerater} onValueChange={setFilterBerater}>
            <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Vertriebspartner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="-">Alle Vertriebspartner</SelectItem>
              {beraterList.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
        </div>

        <div data-ui="card" className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nachname")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Name <SortIcon field="nachname" /></span>
                </TableHead>
                <TableHead className="font-semibold">Telefon</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("pipelineStufe")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Pipeline-Status <SortIcon field="pipelineStufe" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("bereich")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Bereich <SortIcon field="bereich" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("berater")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Vertriebspartner <SortIcon field="berater" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("zugewiesenAm")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Zugewiesen am <SortIcon field="zugewiesenAm" /></span>
                </TableHead>
                <TableHead className="font-semibold">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          Wartezeit
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
                        Wenn ein Lead nicht erreicht wurde, wird er für 24–62 Stunden pausiert, damit er nicht sofort erneut angerufen wird.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cacheReady ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <TableSkeleton columns={8} rows={6} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Noch keine bearbeiteten Leads vorhanden.
                  </TableCell>
                </TableRow>
              ) : null}
              {filtered.map(k => {
                const stufe = getEffectivePipelineStufe(k);
                const stufeLabel = PIPELINE_STUFEN.find(s => s.key === stufe)?.label || stufe;
                const kat = kategorieLabel(k);
                const hidden = isHidden(k);
                const hiddenUntil = hidden && k.verstecktBis
                  ? new Date(k.verstecktBis).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : null;

                const profilUrl = `/kunden/${k.id}`;
                return (
                  <TableRow
                    key={k.id}
                    className="group cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={e => zeilenKlick(e, profilUrl, navigate)}
                    onAuxClick={e => zeilenKlick(e, profilUrl, navigate)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm inline-flex items-center gap-1">
                            <Link to={profilUrl} className="hover:underline">{k.vorname} {k.nachname}</Link>
                            <NeuerTabLink href={profilUrl} />
                          </p>
                          {k.email && <p className="text-xs text-muted-foreground">{k.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {k.telefon ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {k.telefon}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className="text-[10px] bg-primary/10 text-primary">
                        {stufeLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${kategorieColor(kat)}`}>
                        {kat}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {vpName(k) ? (
                        <span className="text-sm font-medium">{vpName(k)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nicht zugewiesen</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {k.zugewiesenAm ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDatum(k.zugewiesenAm)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hidden ? (
                        <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20 gap-1">
                          <Clock className="h-3 w-3" />
                          bis {hiddenUntil}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
