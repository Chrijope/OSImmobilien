import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, Search, AlertTriangle, Users, TrendingDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerloreneListe } from "./Verloren";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ladeGeloeschteKontakte,
  restoreKontakt,
  purgeKontakt,
  type KundeData,
} from "@/lib/kundenStore";
import { onCacheChange, cacheGet } from "@/lib/dataCache";
import { loadAllUsers } from "@/lib/loadAllUsers";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";
import { Navigate } from "react-router-dom";
import { DsgvoHardDeleteDialog } from "@/components/dsgvo/DsgvoHardDeleteDialog";
import { getCurrentUserId } from "@/lib/currentUser";
import { darfEndgueltigLoeschen, darfWiederherstellen, siehtAlleGeloeschten, startRegister, zuweisbare } from "@/lib/papierkorbRegeln";

const RETENTION_DAYS = 90;

function formatDatum(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysSince(iso?: string) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

type Register = "verloren" | "geloescht";

export default function Papierkorb() {
  const { user } = useUser();
  const { toast } = useToast();
  const [kontakte, setKontakte] = useState<KundeData[]>([]);
  const [search, setSearch] = useState("");
  const [confirmPurge, setConfirmPurge] = useState<KundeData | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<KundeData | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [partnerFilter, setPartnerFilter] = useState<string>("");
  // Wer wiederherstellen darf, landet gleich im Register „Gelöscht“; im
  // Register „Verloren“ gibt es keinen Wiederherstellen-Knopf, und genau dort
  // suchten Partner ihn vergeblich.
  const [register, setRegister] = useState<Register>(() => startRegister(user.role));

  // Die Regeln stehen in papierkorbRegeln.ts: Wer den Menüpunkt sieht, darf
  // wiederherstellen. Admin, Inhaber und Vertriebsleitung sehen alle
  // gelöschten Kontakte, alle anderen nur eigene (Zuständigkeit, Ersteller
  // oder Empfehlungs-VP).
  const broadAccess = siehtAlleGeloeschten(user.role);
  const allowed = darfWiederherstellen(user.role);
  // Endgültig löschen nur Admin, Inhaber, Vertriebsleitung; der Server prüft dasselbe.
  const darfPurge = darfEndgueltigLoeschen(user.role);
  const meId = getCurrentUserId();

  const isOwnDeleted = (k: KundeData): boolean => {
    if (!meId) return false;
    const m = (k as any).meta || {};
    return (
      (k as any).zustaendig_id === meId ||
      (k as any).zustaendigId === meId ||
      m.erstelltVonId === meId ||
      m.empfehlungsgeberVpId === meId ||
      m.setterId === meId
    );
  };

  const allUsers = useMemo(() => loadAllUsers(), []);

  const userRoles = useMemo(() => {
    return cacheGet("user_roles") as Array<{ user_id: string; role: string }> | undefined;
  }, []);

  const rolesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of userRoles || []) {
      if (!map.has(r.user_id)) map.set(r.user_id, new Set());
      map.get(r.user_id)!.add(r.role);
    }
    return map;
  }, [userRoles]);

  function hasAnyRole(userId: string, roles: Set<string>): boolean {
    const userRoles = rolesByUser.get(userId);
    if (!userRoles || userRoles.size === 0) {
      const u = allUsers.find(x => x.id === userId);
      return u ? roles.has((u.rolle || "").toLowerCase()) : false;
    }
    for (const r of userRoles) if (roles.has(r)) return true;
    return false;
  }

  // Nur VPs + Admins/Inhaber als Zuweisungs-Kandidaten; wer nur eigene
  // Kontakte sieht, kann nur sich selbst wählen (siehe papierkorbRegeln.ts).
  const assignableUsers = useMemo(() => {
    const rollen = new Set(["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);
    const kandidaten = allUsers
      .filter(u => hasAnyRole(u.id, rollen))
      .filter(u => u.name && u.name.trim().length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    return zuweisbare(user.role, meId, kandidaten);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, rolesByUser, user.role, meId]);

  // Partner für Filter-Dropdown (broadAccess only)
  const partnerUsers = useMemo(() => {
    const partnerRoles = new Set(["vertriebspartner", "setterin", "finanzierungspartner", "versicherungsexperte"]);
    return allUsers
      .filter(u => hasAnyRole(u.id, partnerRoles))
      .filter(u => u.name && u.name.trim().length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, rolesByUser]);

  useEffect(() => {
    if (!allowed) return;
    let abgemeldet = false;
    const refresh = () => {
      // Der Papierkorb liest direkt aus der Datenbank, der Cache haelt nur
      // aktive Kontakte.
      void ladeGeloeschteKontakte().then((all) => {
        if (abgemeldet) return;
        setKontakte(broadAccess ? all : all.filter(isOwnDeleted));
      });
    };
    refresh();
    const ab = onCacheChange((table) => {
      if (table === "kontakte") refresh();
    });
    return () => { abgemeldet = true; ab(); };
  }, [allowed, broadAccess, meId]);

  const filtered = useMemo(() => {
    let result = kontakte;
    if (broadAccess && partnerFilter && partnerFilter !== "__all__") {
      result = result.filter(k =>
        (k as any).zustaendig_id === partnerFilter ||
        (k as any).zustaendigId === partnerFilter ||
        (k as any).meta?.erstelltVonId === partnerFilter ||
        (k as any).meta?.empfehlungsgeberVpId === partnerFilter ||
        (k as any).meta?.setterId === partnerFilter
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(k =>
        `${k.vorname} ${k.nachname} ${k.email || ""} ${k.telefon || ""} ${k.geloeschtVonName || ""} ${(k as any).berater || ""}`
          .toLowerCase().includes(q)
      );
    }
    return result;
  }, [kontakte, search, partnerFilter, broadAccess]);

  // KPIs
  const kpis = useMemo(() => {
    const total = kontakte.length;
    const last30 = kontakte.filter(k => daysSince(k.geloeschtAm) <= 30).length;
    const auslaufend = kontakte.filter(k => {
      const d = daysSince(k.geloeschtAm);
      return d >= RETENTION_DAYS - 7 && d < RETENTION_DAYS;
    }).length;
    const byUser = new Map<string, number>();
    kontakte.forEach(k => {
      const name = k.geloeschtVonName || "Unbekannt";
      byUser.set(name, (byUser.get(name) || 0) + 1);
    });
    const topUser = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total, last30, auslaufend, topUser };
  }, [kontakte]);

  const openRestoreDialog = (k: KundeData) => {
    setRestoreTarget(k);
    // Vorbelegung: aktuell zugewiesener Vertriebspartner (falls in Liste), sonst leer
    // Kennung zuerst, der Name nur ohne Kennung und nur bei genau einem Treffer.
    const zid = k.zustaendig_id || (k as any).zustaendigId;
    const namensTreffer = assignableUsers.filter(u => u.name === (k as any).berater);
    const existing = zid
      ? assignableUsers.find(u => u.id === zid)
      : namensTreffer.length === 1 ? namensTreffer[0] : undefined;
    // Wer nur sich selbst wählen kann, bekommt sich vorbelegt.
    const einziger = assignableUsers.length === 1 ? assignableUsers[0] : undefined;
    setAssignUserId(existing?.id || einziger?.id || "");
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    const target = assignableUsers.find(u => u.id === assignUserId);
    if (!target) {
      toast({ title: "Bitte Nutzer wählen", description: "Ohne Zuweisung kann der Lead nicht wiederhergestellt werden.", variant: "destructive" });
      return;
    }
    try {
      await restoreKontakt(restoreTarget.id, { userId: target.id, name: target.name });
      toast({
        title: "Kunde wiederhergestellt ✓",
        description: `${restoreTarget.vorname} ${restoreTarget.nachname} ist wieder aktiv und ${target.name} zugewiesen.`,
      });
      setRestoreTarget(null);
      setAssignUserId("");
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Wiederherstellung fehlgeschlagen", variant: "destructive" });
    }
  };


  // Bewusst KEINE Sperre der ganzen Seite mehr. Sie trägt jetzt zwei Register,
  // und die verlorenen Kontakte darf jeder sehen, der sie auch vorher unter
  // "Verloren / Archiviert" gesehen hat. Nur das Register mit den gelöschten
  // Datensätzen bleibt den berechtigten Rollen vorbehalten.
  return (
    <div className="w-full px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Trash2 className="h-7 w-7 text-muted-foreground" />
            Papierkorb
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alles Abgelegte an einer Stelle: verlorene und archivierte Kontakte bleiben dauerhaft
            erhalten, gelöschte werden nach <strong>{RETENTION_DAYS} Tagen</strong> endgültig entfernt.
          </p>
        </div>
      </div>

      <Tabs value={register} onValueChange={(v) => setRegister(v as Register)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="verloren" className="gap-1.5">
            <TrendingDown className="h-4 w-4" />
            Verloren &amp; Archiviert
          </TabsTrigger>
          {allowed && (
            <TabsTrigger value="geloescht" className="gap-1.5">
              <Trash2 className="h-4 w-4" />
              Gelöscht
              {kontakte.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{kontakte.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="verloren">
          <VerloreneListe />
        </TabsContent>

        <TabsContent value="geloescht" className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Im Papierkorb</p>
                <p className="text-3xl font-bold mt-1">{kpis.total}</p>
              </div>
              <Trash2 className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Letzte 30 Tage</p>
                <p className="text-3xl font-bold mt-1">{kpis.last30}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>
        <Card className={kpis.auslaufend > 0 ? "border-orange-500/40" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Bald Auto-Purge</p>
                <p className="text-3xl font-bold mt-1 text-orange-500">{kpis.auslaufend}</p>
                <p className="text-[10px] text-muted-foreground">Letzte 7 Tage vor Ablauf</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500/40" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Top Löschende</p>
            {kpis.topUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Daten</p>
            ) : (
              <div className="space-y-1">
                {kpis.topUser.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="truncate">{name}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Suche */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Gelöschte Kunden ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Suche nach Name, E-Mail, Telefon oder Löschender..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            {broadAccess && (
              <Select value={partnerFilter || "__all__"} onValueChange={(v) => setPartnerFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Alle Partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle Partner</SelectItem>
                  {partnerUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.rolle ? ` · ${u.rolle}` : ""}
                    </SelectItem>
                  ))}
                  {partnerUsers.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground">Keine Partner verfügbar</div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{kontakte.length === 0 ? "Papierkorb ist leer." : "Keine Treffer."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Kontakt</th>
                    <th className="px-2 py-2">VP / Partner</th>
                    <th className="px-2 py-2">Gelöscht am</th>
                    <th className="px-2 py-2">Durch</th>
                    <th className="px-2 py-2">Grund</th>
                    <th className="px-2 py-2">Verbleibend</th>
                    <th className="sticky right-0 bg-background px-2 py-2 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((k) => {
                    const days = daysSince(k.geloeschtAm);
                    const remaining = Math.max(0, RETENTION_DAYS - days);
                    const isCritical = remaining <= 7;
                    const vpName = (k as any).berater || "—";
                    return (
                      <tr key={k.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-2 py-2 font-medium">
                          {k.vorname} {k.nachname}
                          {k.moreId && (
                            <span className="text-xs text-muted-foreground ml-2">#{k.moreId}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {k.email && <div>{k.email}</div>}
                          {k.telefon && <div>{k.telefon}</div>}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {vpName !== "—" ? (
                            <Badge variant="outline" className="font-normal">{vpName}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">{formatDatum(k.geloeschtAm)}</td>
                        <td className="px-2 py-2">{k.geloeschtVonName || "—"}</td>
                        <td className="px-2 py-2 text-xs max-w-[200px] truncate" title={k.geloeschtGrund}>
                          {k.geloeschtGrund || "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={isCritical ? "destructive" : "secondary"}>
                            {remaining} Tage
                          </Badge>
                        </td>
                        <td className="sticky right-0 bg-background px-2 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openRestoreDialog(k)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Wiederherstellen
                            </Button>
                            {darfPurge && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmPurge(k)}
                                title="Endgültig löschen"
                                aria-label="Endgültig löschen"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {confirmPurge && darfPurge && (
        <DsgvoHardDeleteDialog
          open={!!confirmPurge}
          onOpenChange={(o) => !o && setConfirmPurge(null)}
          kontaktId={confirmPurge.id}
          vorname={confirmPurge.vorname}
          nachname={confirmPurge.nachname}
          email={confirmPurge.email}
          onSuccess={() => setConfirmPurge(null)}
        />
      )}

      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setAssignUserId(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lead wiederherstellen & zuweisen</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{restoreTarget?.vorname} {restoreTarget?.nachname}</strong> wird wiederhergestellt.
              {broadAccess
                ? "Bitte wähle einen Nutzer (VP, Vertriebsleiter oder Admin), dem der Lead zugewiesen werden soll."
                : "Der Lead wird dir zugewiesen."}
              Ohne Zuweisung erscheint der Lead in keiner Kontaktliste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-2 block">Zuweisen an</label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Nutzer wählen…" />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.rolle ? ` · ${u.rolle}` : ""}
                  </SelectItem>
                ))}
                {assignableUsers.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Keine Nutzer verfügbar</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRestoreConfirm(); }}
              disabled={!assignUserId}
            >
              Wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
