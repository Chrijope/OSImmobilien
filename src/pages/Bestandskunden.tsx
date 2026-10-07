import React, { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getKontakte } from "@/lib/kundenStore";
import { useColumnConfig, ColumnSelector } from "@/components/kunden/KundenColumnConfig";
import { cacheRefreshTable } from "@/lib/dataCache";
import { ImportExportButton } from "@/components/kunden/ImportExportButton";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { useUser } from "@/contexts/UserContext";
import { buildBucketEntries, type KundeBucketEntry } from "@/lib/kontaktPipeline";
import { isTeamWideKontaktRole, kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { BucketEntryDealCell, bucketEntryKey, bucketEntryHref } from "@/components/kunden/BucketEntryCells";
import { KontaktTypFilter } from "@/components/kunden/KontaktTypFilter";
import { getKontaktTyp, type KontaktTyp } from "@/lib/kontaktTypHelper";
import { BeraterFilter, matchesBeraterFilter } from "@/components/kunden/BeraterFilter";

const FIXED_COLUMNS = ["vorname", "nachname", "investments", "objekt", "kaufpreis", "berater", "erstellt_am"];
const DEAL_AFTER = "investments";

export default function Bestandskunden() {
  const cacheReady = useCacheReady(["kontakte"]);
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const liveVersion = useLiveVersion(["kontakte"]);
  const entries = useMemo<KundeBucketEntry[]>(() => {
    const baseList = getKontakte().filter(k => !k.archiviert);
    const scoped = isTeamWide ? baseList : baseList.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id }));
    return buildBucketEntries(scoped, "bestandskunden");
  }, [liveVersion, isTeamWide, user.name, authUser?.id]);
  const [search, setSearch] = useState("");
  const [typFilter, setTypFilter] = usePersistedState<KontaktTyp | "-">("mi_filter_bestand_typ", "-");
  const [beraterFilter, setBeraterFilter] = usePersistedState<string>("mi_filter_bestand_berater", "-");
  const [sortField, setSortField] = usePersistedState<string>("mi_filter_bestand_sortField", "nachname");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("mi_filter_bestand_sortDir", "asc");

  const { columns, extraKeys, toggleExtra, optionalKeys, fixedKeys } = useColumnConfig("bestandskunden", FIXED_COLUMNS);

  const filtered = useMemo(() => {
    let result = entries;
    if (typFilter !== "-") {
      result = result.filter(e => getKontaktTyp(e.kunde) === typFilter);
    }
    if (beraterFilter !== "-") {
      result = result.filter(e => matchesBeraterFilter(e.kunde, beraterFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e => {
        const k = e.kunde;
        return k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
          k.objekt.toLowerCase().includes(q) || k.email.toLowerCase().includes(q) ||
          (e.objektLabel || "").toLowerCase().includes(q);
      });
    }
    return [...result].sort((a, b) => {
      const aV = String((a.kunde as any)[sortField] ?? "");
      const bV = String((b.kunde as any)[sortField] ?? "");
      return sortDir === "asc" ? aV.localeCompare(bV) : bV.localeCompare(aV);
    });
  }, [entries, search, typFilter, beraterFilter, sortField, sortDir, user.name, authUser?.id]);

  const pagination = usePagination("bestandskunden", filtered.length);
  const paged = pagination.slice(filtered);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Bestandskunden" subtitle={`${filtered.length} Deals im Bestand`} />
        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Bestandskunden suchen..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <KontaktTypFilter value={typFilter} onChange={setTypFilter} />
            {isTeamWide && (
              <BeraterFilter value={beraterFilter} onChange={setBeraterFilter} kontakte={entries.map(e => e.kunde)} liveVersion={liveVersion} />
            )}
            <ColumnSelector fixedKeys={fixedKeys} extraKeys={extraKeys} optionalKeys={optionalKeys} toggleExtra={toggleExtra} />
            <div className="ml-auto">
              <ImportExportButton kontakte={filtered.map(e => e.kunde)} onImportDone={() => cacheRefreshTable("kontakte")} exportFilename="bestandskunden" hideImport />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => (
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
                <TableRow><TableCell colSpan={columns.length + 1}><TableSkeleton columns={columns.length + 1} rows={6} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">Keine Bestandskunden gefunden.</TableCell></TableRow>
              ) : (
                paged.map(entry => (
                  <TableRow key={bucketEntryKey(entry)} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(bucketEntryHref(entry))}>
                    {columns.map(col => (
                      <React.Fragment key={col.key}>
                        <TableCell>{col.render(entry.kunde)}</TableCell>
                        {col.key === DEAL_AFTER && <TableCell><BucketEntryDealCell entry={entry} /></TableCell>}
                      </React.Fragment>
                    ))}
                  </TableRow>
                ))
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
