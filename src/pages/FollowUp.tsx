import React, { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { getKontakte } from "@/lib/kundenStore";
import { getCurrentUserId } from "@/lib/currentUser";
import { useColumnConfig, ColumnSelector } from "@/components/kunden/KundenColumnConfig";
import { ImportExportButton } from "@/components/kunden/ImportExportButton";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { useUser } from "@/contexts/UserContext";
import { buildBucketEntries, type KundeBucketEntry } from "@/lib/kontaktPipeline";
import { isTeamWideKontaktRole, kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { BucketEntryDealCell, bucketEntryKey, bucketEntryHref } from "@/components/kunden/BucketEntryCells";
import { KontaktTypFilter } from "@/components/kunden/KontaktTypFilter";
import { getKontaktTyp, type KontaktTyp } from "@/lib/kontaktTypHelper";
import { BeraterFilter, matchesBeraterFilter } from "@/components/kunden/BeraterFilter";
import { markItemSeen, isItemSeen, getSeenAt, SEEN_KEYS } from "@/lib/seenBadges";
import { InactivityAmpel } from "@/components/kunden/InactivityAmpel";

function dedupeKontakte(entries: KundeBucketEntry[]) {
  const seen = new Set<string>();
  const out: KundeBucketEntry["kunde"][] = [];
  for (const e of entries) {
    if (seen.has(e.kunde.id)) continue;
    seen.add(e.kunde.id);
    out.push(e.kunde);
  }
  return out;
}

const FIXED_COLUMNS = ["vorname", "nachname", "telefon", "email", "followUpAm", "berater", "status", "erstellt_am", "quelle", "leadTyp"];
const DEAL_AFTER = "email";

export default function FollowUp() {
  const cacheReady = useCacheReady(["kontakte"]);
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const liveVersion = useLiveVersion(["kontakte", "investments"]);
  const myUserId = getCurrentUserId();

  const entries = useMemo<KundeBucketEntry[]>(() => {
    const base = getKontakte().filter(k =>
      !k.archiviert &&
      (!!(k.berater && k.berater.trim()) || !!(k as any).zustaendig_id)
    );
    const scoped = isTeamWide
      ? base
      : base.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id || myUserId }));
    return buildBucketEntries(scoped, "followup");
  }, [liveVersion, isTeamWide, user.name, authUser?.id, myUserId]);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = usePersistedState<boolean>("mi_filter_followup_archived", false);
  const [typFilter, setTypFilter] = usePersistedState<KontaktTyp | "-">("mi_filter_followup_typ", "-");
  const [beraterFilter, setBeraterFilter] = usePersistedState<string>("mi_filter_followup_berater", "-");
  const [sortField, setSortField] = usePersistedState<string>("mi_filter_followup_sortField", "followUpAm");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("mi_filter_followup_sortDir", "asc");

  const { columns, extraKeys, toggleExtra, optionalKeys, fixedKeys } = useColumnConfig("followup", FIXED_COLUMNS);

  const filtered = useMemo(() => {
    let result = entries;
    if (!showArchived) result = result.filter(e => !e.kunde.archiviert);
    if (typFilter !== "-") {
      result = result.filter((e) => getKontaktTyp(e.kunde) === typFilter);
    }
    if (beraterFilter !== "-") {
      result = result.filter((e) => matchesBeraterFilter(e.kunde, beraterFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => {
        const k = e.kunde;
        return (
          k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
          k.email.toLowerCase().includes(q) || k.telefon.includes(q) ||
          k.firma.toLowerCase().includes(q) || k.ort.toLowerCase().includes(q) ||
          (e.objektLabel || "").toLowerCase().includes(q)
        );
      });
    }
    return [...result].sort((a, b) => {
      if (sortField === "followUpAm") {
        const aMeta: any = (a.kunde as any)?.meta || {};
        const bMeta: any = (b.kunde as any)?.meta || {};
        const aVal = `${aMeta.followUpAm || ""} ${aMeta.followUpUhrzeit || ""}`;
        const bVal = `${bMeta.followUpAm || ""} ${bMeta.followUpUhrzeit || ""}`;
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aVal = String((a.kunde as any)[sortField] ?? "");
      const bVal = String((b.kunde as any)[sortField] ?? "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [entries, search, sortField, sortDir, showArchived, typFilter, beraterFilter, user.name, authUser?.id]);

  const pagination = usePagination("followup", filtered.length);
  const paged = pagination.slice(filtered);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Follow-Up" subtitle={`${entries.length} Leads im Follow-Up`} />
        </div>

        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Follow-Up suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="archiviert" checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />
              <label htmlFor="archiviert" className="text-sm">Archivierte anzeigen</label>
            </div>
            <KontaktTypFilter value={typFilter} onChange={setTypFilter} />
            {isTeamWide && (
              <BeraterFilter value={beraterFilter} onChange={setBeraterFilter} kontakte={entries.map(e => e.kunde)} liveVersion={liveVersion} />
            )}
            <ColumnSelector fixedKeys={fixedKeys} extraKeys={extraKeys} optionalKeys={optionalKeys} toggleExtra={toggleExtra} />
            <div className="ml-auto">
              <ImportExportButton kontakte={dedupeKontakte(filtered)} onImportDone={() => {}} exportFilename="follow-up" />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-xs">SLA</TableHead>
                {columns.map((col) => (
                  <React.Fragment key={col.key}>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(col.key)}>
                      <span className="flex items-center gap-1 text-xs">{col.label} <SortIcon field={col.key} /></span>
                    </TableHead>
                    {col.key === DEAL_AFTER && <TableHead className="text-xs">Deal</TableHead>}
                  </React.Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cacheReady ? (
                <TableRow><TableCell colSpan={columns.length + 2}><TableSkeleton columns={columns.length + 2} rows={6} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 2} className="text-center py-8 text-muted-foreground">Keine Follow-Ups gefunden.</TableCell></TableRow>
              ) : (
                paged.map((entry) => {
                  const k = entry.kunde;
                  const seenCutoff = getSeenAt(SEEN_KEYS.followUp);
                  const isNew =
                    !isItemSeen(SEEN_KEYS.followUp, k.id) &&
                    (seenCutoff ? String(k.erstellt_am || "") > seenCutoff : true);
                  return (
                    <TableRow
                      key={bucketEntryKey(entry)}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        markItemSeen(SEEN_KEYS.followUp, k.id);
                        navigate(bucketEntryHref(entry));
                      }}
                    >
                      <TableCell><InactivityAmpel kunde={entry.kunde} stufeOverride={entry.stufe} /></TableCell>
                      {columns.map((col, idx) => (
                        <React.Fragment key={col.key}>
                          <TableCell>
                            {idx === 0 && isNew && (
                              <Badge className="mr-2 align-middle text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">
                                Neu
                              </Badge>
                            )}
                            {col.render(entry.kunde)}
                          </TableCell>
                          {col.key === DEAL_AFTER && <TableCell><BucketEntryDealCell entry={entry} /></TableCell>}
                        </React.Fragment>
                      ))}
                    </TableRow>
                  );
                })
              )}
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
    </DashboardLayout>
  );
}