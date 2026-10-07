import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useNavigate, Navigate } from "react-router-dom";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, Search, User, Phone, Mail, ArrowRight, Archive, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getKontakte, updateKontakt, type KundeData } from "@/lib/kundenStore";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { getCurrentUserId } from "@/lib/currentUser";
import { useUser } from "@/contexts/UserContext";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { isTeamWideKontaktRole, kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { istPerson } from "@/lib/beraterNamensabgleich";
import { verlustGrundLabel, verlustGruppeVon, wiederAnsprechbarAm } from "@/lib/verlustgruende";

/**
 * Die Liste der verlorenen und archivierten Kontakte.
 *
 * Bewusst ohne eigenen Seitenrahmen: Sie sitzt jetzt als Register im
 * Papierkorb, damit alles Abgelegte an einer Stelle liegt. Fachlich sind es
 * trotzdem zwei verschiedene Dinge, siehe Kommentar in Papierkorb.tsx.
 */
export function VerloreneListe() {
  const cacheReady = useCacheReady(["kontakte"]);
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const isAdmin = isTeamWideKontaktRole(user.role);
  const isVersicherungsexperte = user.role === "versicherungsexperte";
  const liveVersion = useLiveVersion(["kontakte"]);

  const kontakte = useMemo(() => {
    const all = getKontakte().filter(k => {
      const stufe = getEffectivePipelineStufe(k);
      if (isVersicherungsexperte) {
        // Versicherungsexperte sieht nur als "Vermögensaufbau geeignet" markierte Leads
        return (stufe === "verloren" || stufe === "vermoegensaufbau") && k.versicherungGeeignet === true;
      }
      return stufe === "verloren" || stufe === "archiviert";
    });
    if (isAdmin) return all;
    if (isVersicherungsexperte) return all; // sieht alle geeigneten Leads
    if (user.role === "setterin") {
      // Setterin sieht eigene verlorene Leads (als Setter, Ersteller oder Namensmatch)
      const myId = getCurrentUserId();
      return all.filter(k => {
        const istErsteller = !!k.erstelltVonId && k.erstelltVonId === myId;
        // setterId nur, wenn der Name dahinter zum Setter passt, sonst der
        // eindeutige Name (siehe istPerson).
        const istSetter = istPerson(k.setterId, k.setter, { userId: myId, userName: user.name });
        return istSetter || istErsteller;
      });
    }
    return all.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id || getCurrentUserId() }));
  }, [liveVersion, isAdmin, isVersicherungsexperte, user.name, authUser?.id]);

  const { toast } = useToast();
  const [wiederaufnahmeKandidat, setWiederaufnahmeKandidat] = useState<KundeData | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | "verloren" | "archiviert">("alle");
  const [sortField, setSortField] = useState("nachname");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let result = kontakte;
    if (statusFilter !== "alle") {
      result = result.filter(k => {
        const stufe = getEffectivePipelineStufe(k);
        return stufe === statusFilter;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(k =>
        k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
        k.email?.toLowerCase().includes(q) || k.telefon?.includes(q) ||
        verlustGrundLabel(k.verlorenGrund).toLowerCase().includes(q) ||
        verlustGruppeVon(k.verlorenGrund).label.toLowerCase().includes(q) ||
        k.archivGrund?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      // Der Grund liegt als Katalog-ID im Datensatz, sortiert wird nach dem,
      // was in der Spalte steht.
      const wert = (k: KundeData) =>
        sortField === "verlorenGrund"
          ? verlustGrundLabel(k.verlorenGrund)
          : String((k as any)[sortField] ?? "");
      const aV = wert(a);
      const bV = wert(b);
      return sortDir === "asc" ? aV.localeCompare(bV) : bV.localeCompare(aV);
    });
  }, [kontakte, search, statusFilter, sortField, sortDir]);

  const pagination = usePagination("verloren", filtered.length);
  const paged = pagination.slice(filtered);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  // Wiederaufnahme direkt aus der Liste, dieselbe Logik wie im Kundenprofil:
  // Verlust- und Archivmarken werden entfernt und die Stufe von vor dem
  // Verlust kommt zurück (Altfälle ohne diese Angabe landen auf "Erreicht").
  const wiederAufnehmen = (k: KundeData) => {
    const zielStufe = (k.stufeVorVerlust && k.stufeVorVerlust !== "verloren"
      && k.stufeVorVerlust !== "archiviert")
      ? k.stufeVorVerlust
      : "erreicht";
    updateKontakt(k.id, {
      pipelineStufe: zielStufe as any,
      status: "kontaktiert" as any,
      archiviert: false,
      archivGrund: undefined,
      verlorenGrund: undefined,
      verlorenAm: undefined,
      stufeVorVerlust: undefined,
      reaktiviertAm: new Date().toISOString(),
    });
    addAktivitaet({
      kundeId: k.id,
      art: "notiz",
      beschreibung: `Kunde wieder aufgenommen (Stufe „${PIPELINE_STUFEN.find(s => s.key === zielStufe)?.label || zielStufe}")`,
      von: user.name,
    });
    toast({
      title: "Wieder aufgenommen",
      description: `${k.vorname} ${k.nachname} ist zurück in der laufenden Arbeit.`,
    });
    setWiederaufnahmeKandidat(null);
  };

  return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, E-Mail, Telefon, Grund..."
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-1.5">
            {(["alle", "verloren", "archiviert"] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {f === "alle" ? "Alle" : f === "verloren" ? "Verloren" : "Archiviert"}
              </button>
            ))}
          </div>
        </div>

        <div data-ui="card" className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("vorname")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Vorname <SortIcon field="vorname" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nachname")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Nachname <SortIcon field="nachname" /></span>
                </TableHead>
                <TableHead className="font-semibold text-xs">Telefon</TableHead>
                <TableHead className="font-semibold text-xs">E-Mail</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("verlorenGrund")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Grund <SortIcon field="verlorenGrund" /></span>
                </TableHead>
                <TableHead className="font-semibold text-xs">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cacheReady ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <TableSkeleton columns={7} rows={6} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Keine verlorenen oder archivierten Kontakte vorhanden.
                  </TableCell>
                </TableRow>
              ) : null}
              {paged.map(k => (
                <TableRow
                  key={k.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/kunden/${k.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <span className="text-sm font-medium">{k.vorname}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{k.nachname}</TableCell>
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
                    {k.email ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {k.email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-destructive font-medium">
                      {k.verlorenGrund
                        ? verlustGrundLabel(k.verlorenGrund)
                        : k.archivGrund || "ohne Angabe"}
                    </span>
                    {k.verlorenGrund && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {verlustGruppeVon(k.verlorenGrund).label}
                        {(() => {
                          const ab = wiederAnsprechbarAm(k.verlorenGrund, k.verlorenAm);
                          return ab ? ` · wieder ab ${ab.toLocaleDateString("de-DE")}` : "";
                        })()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {k.archiviert ? (
                      <Badge variant="outline" className="text-xs gap-1 border-dashed">
                        <Archive className="h-3 w-3" /> Archiviert
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Verloren</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          // Zeilenklick ins Profil darf nicht mit auslösen
                          e.stopPropagation();
                          setWiederaufnahmeKandidat(k);
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Wieder aufnehmen
                      </Button>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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

        {/* Rückfrage vor der Wiederaufnahme direkt aus der Liste */}
        <AlertDialog open={!!wiederaufnahmeKandidat} onOpenChange={(o) => !o && setWiederaufnahmeKandidat(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde wieder aufnehmen</AlertDialogTitle>
              <AlertDialogDescription>
                {wiederaufnahmeKandidat?.vorname} {wiederaufnahmeKandidat?.nachname} kommt zurück in die
                laufende Arbeit und steht danach wieder in „Alle Kontakte" und in der Pipeline.
                Der bisherige Verlustgrund wird entfernt, die Stufe
                „{PIPELINE_STUFEN.find(s => s.key === (wiederaufnahmeKandidat?.stufeVorVerlust || "erreicht"))?.label || "Erreicht"}"
                wird wiederhergestellt. Alle Daten bleiben erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => wiederaufnahmeKandidat && wiederAufnehmen(wiederaufnahmeKandidat)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Wieder aufnehmen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}

/**
 * Alte Route /verloren. Sie bleibt bestehen, damit Lesezeichen und Links aus
 * Mails nicht ins Leere laufen, und führt jetzt in den Papierkorb.
 */
export default function Verloren() {
  return <Navigate to="/papierkorb" replace />;
}
