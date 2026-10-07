import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { getInvestments } from "@/lib/investmentsStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { kennungZuName } from "@/lib/beraterNamensabgleich";
import { getKarriereOverrideForUser, getKarriereStufe, getEffectiveRate, getEffectiveRateForKontakt, getCustomProvisionRateSetter, getCustomProvisionRateEigen } from "@/lib/karriereStufeHelper";
import { cacheGet } from "@/lib/dataCache";
import { calculateJuniorOverride, getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { investmentKaufpreis } from "@/lib/objektDatenPflicht";
import { istKaufphaseVorNotar, istProvisionsrelevant, istStorniert } from "@/lib/abschlussDefinition";
import { investmentsJeKontakt, kaufpreisMitRueckfall, provisionCent } from "@/lib/abrechnungRechnung";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function ProvisionChart() {
  const { user, authUser } = useUser();
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  const _cv = useLiveVersion(["kontakte", "investments", "user_settings", "profiles"]);
  const allUsers = useMemo(() => loadAllUsers(), [_cv]);

  const juniors = useMemo(() => {
    if (isAdmin || !authUser?.id) return [] as Array<{ userId: string; name: string }>;
    return getJuniorsForRecruiter(authUser.id);
  }, [isAdmin, authUser?.id, _cv]);
  // Kennung des Juniors zum Kontakt: zustaendig_id zuerst, der Name nur ohne
  // Kennung und nur eindeutig. Vorher entschied allein der Name.
  const juniorKennung = useMemo(() => {
    const juniorIds = new Set(juniors.map((j) => j.userId));
    return (k: any): string | undefined => {
      const id = k?.zustaendig_id || kennungZuName(k?.berater, allUsers);
      return id && juniorIds.has(id) ? id : undefined;
    };
  }, [juniors, allUsers]);
  const hasTeam = juniors.length > 0;
  // Die Differenzprovision erscheint nur, solange die Overhead-Provision aktiv ist.
  const zeigeDifferenz = hasTeam && OVERHEAD_AKTIV;

  // Anzeige der individuellen Sätze (Setter-Lead vs. Eigen) für den eingeloggten User
  const setterRate = !isAdmin ? getCustomProvisionRateSetter(authUser?.id) : null;
  const eigenRate = !isAdmin ? getCustomProvisionRateEigen(authUser?.id) : null;
  const fallbackEffective = useMemo(() => {
    if (isAdmin) return null;
    const override = getKarriereOverrideForUser(authUser?.id);
    const stufe = getKarriereStufe(0, override);
    return getEffectiveRate(authUser?.id, stufe);
  }, [authUser?.id, isAdmin, allUsers]);

  // Lookup-Helfer: für jeden Kontakt+Investment den festgeschriebenen Satz oder den effektiven berechneten ermitteln
  const getRateForRow = useMemo(() => {
    return (kontakt: any, invMeta: any): number => {
      // Kennung zuerst. Vorher gewann der erste Namenstreffer vor der Kennung.
      const beraterId = kontakt?.zustaendig_id || kennungZuName(kontakt?.berater, allUsers);
      const lockedRate = invMeta?.lockedProvisionRate;
      return getEffectiveRateForKontakt(beraterId, kontakt, lockedRate);
    };
  }, [allUsers]);

  const { data, ohneKaufpreis } = useMemo(() => {
    const now = new Date();
    // Eigene Investments ab Reservierung ohne Kaufpreis. Sie fehlen in der
    // Kurve und werden deshalb im Kopf genannt statt still uebergangen.
    let ohneKaufpreis = 0;
    const kontakteById = new Map(excludeStatsKontakte(getKontakte()).filter(k => !k.archiviert).map(k => [k.id, k]));
    const investments = getInvestments();
    const jeKontakt = investmentsJeKontakt(investments);
    const investmentsRawById = new Map<string, any>();
    cacheGet<any>("investments").forEach((r: any) => investmentsRawById.set(r.id, r));
    const currentYear = now.getFullYear();

    const monthMap: Record<string, { festgeschrieben: number; prognose: number; differenz: number }> = {};
    MONTHS.forEach(m => { monthMap[m] = { festgeschrieben: 0, prognose: 0, differenz: 0 }; });

    investments.forEach(inv => {
      const k: any = kontakteById.get(inv.kontaktId);
      if (!k) return;
      // Verlorene und stornierte Geschaefte zaehlen nicht, auch nicht mit
      // eingetragenem Notartermin.
      if (istStorniert(inv) || istStorniert(k)) return;
      // Vorher reiner Namensvergleich. Kontakte, die nur über die Zuständigkeit
      // zugeordnet sind, fielen dadurch systematisch heraus.
      const isOwn = kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id });
      const juniorId = !isOwn ? juniorKennung(k) : undefined;
      if (!isOwn && !juniorId) return;

      // Der Kaufpreis kommt vom Investment, der Kontaktwert ist nur Rueckfall.
      // Vorher stand hier `k.kaufpreis`: zwei Investments eines Kunden zaehlten
      // doppelt mit demselben Wert, ein Preis nur am Investment gar nicht.
      // Der Kontaktwert nur bei genau einem Investment des Kontakts.
      const kaufpreis = kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0);
      if (kaufpreis <= 0) {
        if (isOwn && istProvisionsrelevant(inv.pipelineStufe)) ohneKaufpreis++;
        return;
      }

      const rawInv = investmentsRawById.get(inv.id) || {};
      const rate = getRateForRow(k, rawInv.meta || {});
      const provisionBetrag = provisionCent(kaufpreis, rate) / 100;
      const override = juniorId ? calculateJuniorOverride(juniorId, kaufpreis) : null;
      const differenzBetrag = override?.betrag ?? 0;

      if (inv.notarTermin) {
        const notarDate = new Date(inv.notarTermin);
        if (!isNaN(notarDate.getTime()) && notarDate.getFullYear() === currentYear) {
          const mk = MONTHS[notarDate.getMonth()];
          if (notarDate < now) {
            if (isOwn) monthMap[mk].festgeschrieben += provisionBetrag;
            monthMap[mk].differenz += differenzBetrag;
            return;
          }
          if (isOwn) monthMap[mk].prognose += provisionBetrag;
          monthMap[mk].differenz += differenzBetrag;
          return;
        }
      }

      // Reservierung bis Notar. Vorher ein Teilwortvergleich mit dem
      // Schluessel "notartermin", den es nie gab; "bonitaetsunterlagen" fehlte.
      if (istKaufphaseVorNotar(inv.pipelineStufe)) {
        const mk = MONTHS[now.getMonth()];
        if (isOwn) monthMap[mk].prognose += provisionBetrag;
        monthMap[mk].differenz += differenzBetrag;
      }
    });

    return {
      ohneKaufpreis,
      data: MONTHS.map(m => ({
        month: m,
        festgeschrieben: Math.round(monthMap[m].festgeschrieben),
        prognose: Math.round(monthMap[m].prognose),
        differenz: Math.round(monthMap[m].differenz),
      })),
    };
  }, [isAdmin, user.name, _cv, getRateForRow, juniorKennung]);

  const totalFest = data.reduce((s, d) => s + d.festgeschrieben, 0);
  const totalPrognose = data.reduce((s, d) => s + d.prognose, 0);
  const totalDifferenz = data.reduce((s, d) => s + d.differenz, 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
              {/* Der Titel versprach beim Admin Teamzahlen, gezählt wurde aber
                  nur, wo er selbst als Berater eingetragen ist, also meist
                  null Euro. Jetzt heißt die Karte, was sie zeigt. */}
              Eigenprovision
            </CardTitle>
            {!isAdmin && (setterRate != null || eigenRate != null) ? (
              <>
                {setterRate != null && (
                  <Badge variant="outline" className="text-[10px]">Setter-Lead: {setterRate} %</Badge>
                )}
                {eigenRate != null && (
                  <Badge variant="outline" className="text-[10px]">Eigen-Kontakt: {eigenRate} %</Badge>
                )}
              </>
            ) : !isAdmin && fallbackEffective != null ? (
              <Badge variant="outline" className="text-[10px]">{fallbackEffective} % Satz</Badge>
            ) : null}
            {ohneKaufpreis > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] border-warning text-warning"
                title="Investments ab Reservierung ohne eingetragenen Kaufpreis fehlen in der Kurve."
              >
                Kaufpreis fehlt: {ohneKaufpreis}
              </Badge>
            )}
          </div>
          <div className={unscharfKlasse("flex items-center gap-3 text-xs")}>
            <span className="text-muted-foreground">
              Festgeschrieben: <span className="font-semibold text-foreground">{totalFest.toLocaleString("de-DE")} €</span>
            </span>
            <span className="text-muted-foreground">
              Prognose: <span className="font-semibold text-primary">{totalPrognose.toLocaleString("de-DE")} €</span>
            </span>
            {zeigeDifferenz && (
              <span className="text-muted-foreground">
                Differenzprovision: <span className="font-semibold text-foreground">{totalDifferenz.toLocaleString("de-DE")} €</span>
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      {/* Vorfuehrmodus: die Flaeche wird weichgezeichnet, die Ueberschrift
            bleibt lesbar. Der Zuschauer sieht, dass es die Auswertung gibt,
            aber nicht ihre Werte. */}
      <CardContent className={unscharfKlasse()}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="provFestFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-provision))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--chart-provision))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="provPrognoseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(204 100% 70%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(204 100% 70%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="provDiffFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-b2b))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-b2b))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(v: number, name: string) => [
                `${Number(v).toLocaleString("de-DE")} €`,
                name === "festgeschrieben" ? "Festgeschrieben (Notartermin abgeschlossen)" : "Prognose (in Abwicklung)",
              ]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(v) =>
                v === "festgeschrieben"
                  ? "Festgeschrieben"
                  : v === "prognose"
                  ? "Prognose"
                  : "Differenzprovision"
              }
            />
            <Area type="monotone" dataKey="festgeschrieben" stackId="a" stroke="hsl(var(--chart-provision))" strokeWidth={2.5} fill="url(#provFestFill)" dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="prognose" stackId="a" stroke="hsl(204 100% 70%)" strokeWidth={2} fill="url(#provPrognoseFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            {zeigeDifferenz && (
              <Area type="monotone" dataKey="differenz" stackId="a" stroke="hsl(var(--chart-b2b))" strokeWidth={2} fill="url(#provDiffFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
