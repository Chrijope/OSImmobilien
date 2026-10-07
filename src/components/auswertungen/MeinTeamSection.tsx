import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Coins, TrendingUp, GraduationCap } from "lucide-react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getKontakte } from "@/lib/kundenStore";
import { calculateJuniorOverride, getUserPaket, getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { getLizenzPaket, OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { istFuehrungskraft } from "@/lib/datenSicht";
import { getKarriereOverrideForUser } from "@/lib/karriereStufeHelper";
import { PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { istAbschluss, istStorniert } from "@/lib/abschlussDefinition";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);


function pipelineLabel(stufe?: string) {
  return PIPELINE_STUFEN.find((s) => s.key === stufe)?.label ?? stufe ?? "—";
}

interface Props {
  /** Aktiver Recruiter/Teamleiter (User-ID), für den die Junior-Übersicht angezeigt wird. */
  recruiterUserId: string | null | undefined;
  /** Anzeigename des Recruiters (für Header) */
  recruiterName?: string;
}

/**
 * „Mein Team"-Sektion innerhalb der Auswertungen.
 * Zeigt alle Juniors, die dem aktiven Recruiter zugeordnet sind (über
 * Teamleiter-Zuweisung in der Nutzerverwaltung oder via Bewerbungsmanagement),
 * mit Pipeline-Schwerpunkt, Volumen, Abschlüssen und kumulierter
 * Differenzprovision (Junior-Override).
 *
 * Wird nur eingeblendet, wenn der Recruiter Karrierestufe Team Lead
 * (`manager`) oder Lizenzpartner (`vertriebsfirma`) hat — oder wenn ein
 * Admin/Inhaber/Vertriebsleiter die Sicht auf einen anderen Recruiter
 * filtert.
 */
export function MeinTeamSection({ recruiterUserId, recruiterName }: Props) {
  useLiveVersion(["kontakte", "user_settings", "profiles", "bewerbungen"]);

  const recruiterPaket = recruiterUserId ? getUserPaket(recruiterUserId) : null;
  const paketInfo = getLizenzPaket(recruiterPaket);

  const juniors = useMemo(() => {
    if (!recruiterUserId) return [];
    const list = getJuniorsForRecruiter(recruiterUserId);
    const kontakte = getKontakte();
    return list.map((j) => {
      const meineKontakte = kontakte.filter(
        (k) =>
          (k as any).zustaendig_id === j.userId ||
          (k.berater && k.berater.toLowerCase() === j.name.toLowerCase()),
      );
      const pipelineCounts: Record<string, number> = {};
      let volumen = 0;
      let dealsAbgeschlossen = 0;
      let letzteAktivitaet: string | undefined;
      for (const k of meineKontakte) {
        if (istStorniert(k as any)) continue;
        const stufe = (k as any).pipelineStufe || "neuer_lead";
        pipelineCounts[stufe] = (pipelineCounts[stufe] || 0) + 1;
        if (istAbschluss(stufe)) {
          dealsAbgeschlossen += 1;
          const kp = Number((k as any).meta?.kaufpreis ?? (k as any).kaufpreis ?? 0) || 0;
          volumen += kp;
        }
        const upd = (k as any).aktualisiert_am || (k as any).erstellt_am;
        if (upd && (!letzteAktivitaet || upd > letzteAktivitaet)) letzteAktivitaet = upd;
      }
      let overrideEUR = 0;
      if (volumen > 0) {
        const ovr = calculateJuniorOverride(j.userId, volumen);
        if (ovr?.recruiterUserId === recruiterUserId) overrideEUR = ovr.betrag;
      }
      return {
        userId: j.userId,
        name: j.name,
        dealsGesamt: meineKontakte.length,
        dealsAbgeschlossen,
        volumen,
        overrideEUR,
        pipelineCounts,
        letzteAktivitaet,
      };
    });
  }, [recruiterUserId]);

  const sumJuniors = juniors.length;
  const sumAktiv = juniors.filter((j) => j.dealsAbgeschlossen > 0).length;
  const sumDeals = juniors.reduce((s, j) => s + j.dealsAbgeschlossen, 0);
  const sumVolumen = juniors.reduce((s, j) => s + j.volumen, 0);
  const sumOverride = juniors.reduce((s, j) => s + j.overrideEUR, 0);

  if (!recruiterUserId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              Mein Team {recruiterName ? `· ${recruiterName}` : ""}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Juniors über Teamleiter-Zuweisung (Nutzerverwaltung) oder Bewerberprozess.
              {OVERHEAD_AKTIV ? " Differenzprovision wird zusätzlich in der Provisionsabrechnung ausgewiesen." : ""}
            </p>
          </div>
          {paketInfo?.juniorOverride ? (
            <Badge variant="secondary" className="h-8 px-3 text-xs">
              Grundgebühr-Paket {paketInfo.titel} · Override {paketInfo.juniorOverride} %
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`grid gap-3 grid-cols-2 ${OVERHEAD_AKTIV ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          <Kpi icon={Users} label="Juniors im Team" value={String(sumJuniors)} />
          <Kpi icon={GraduationCap} label="Mit Abschluss" value={`${sumAktiv} / ${sumJuniors}`} />
          <Kpi icon={TrendingUp} label="Abschlüsse gesamt" value={String(sumDeals)} />
          <Kpi icon={TrendingUp} label="Volumen" value={fmtEUR(sumVolumen)} />
          {OVERHEAD_AKTIV && <Kpi icon={Coins} label="Differenzprovision" value={fmtEUR(sumOverride)} accent />}
        </div>

        {juniors.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Noch keine Vertriebspartner zugeordnet. Zuweisung erfolgt in der Nutzerverwaltung
            (Feld „Teamleiter“) oder im Bewerberprozess (Feld „Geworben von“).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Junior</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Abschlüsse</TableHead>
                  <TableHead className="text-right">Volumen</TableHead>
                  {OVERHEAD_AKTIV && <TableHead className="text-right">Differenz</TableHead>}
                  <TableHead>Pipeline-Schwerpunkt</TableHead>
                  <TableHead>Letzte Aktivität</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {juniors.map((j) => {
                  const topStufe = Object.entries(j.pipelineCounts).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <TableRow key={j.userId}>
                      <TableCell className="font-medium">{j.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.dealsGesamt}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.dealsAbgeschlossen}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEUR(j.volumen)}</TableCell>
                      {OVERHEAD_AKTIV && (
                        <TableCell className="text-right tabular-nums font-semibold text-primary">
                          {fmtEUR(j.overrideEUR)}
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        {topStufe ? (
                          <Badge variant="outline">
                            {pipelineLabel(topStufe[0])} · {topStufe[1]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {j.letzteAktivitaet
                          ? new Date(j.letzteAktivitaet).toLocaleDateString("de-DE")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Helper-Hook: liefert recruiterUserId, falls aktueller User TB/Senior ist, sonst null. */
export function useShowMeinTeam(userId: string | null | undefined, role: string): boolean {
  if (!userId) return false;
  // Fuehrungskraefte immer, das entscheidet `datenSicht` fuer alle Seiten.
  if (istFuehrungskraft(role)) return true;
  const karriere = getKarriereOverrideForUser(userId);
  if (karriere === "manager" || karriere === "vertriebsfirma") return true;
  const paket = getUserPaket(userId);
  return paket === "team_builder" || paket === "enterprise";
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 text-center ${accent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}