import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadZielplanung, DURCHSCHNITTSKAUFPREIS } from "@/lib/zielplanungStore";
import { getKarriereOverrideForUser, getKarriereStufe, getKarriereStufeById, getEffectiveRate, getCustomProvisionRateSetter, getCustomProvisionRateEigen } from "@/lib/karriereStufeHelper";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { Badge } from "@/components/ui/badge";
import { getKontakte } from "@/lib/kundenStore";
import { getInvestments } from "@/lib/investmentsStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { leseDatum } from "@/lib/dashboardKpis";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function ZielplanungCard() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const _settingsVersion = useLiveVersion(["user_settings", "kontakte", "investments"]);
  const config = loadZielplanung();
  // Eine einzige Auflösung: der Override direkt zur Stufe, sonst die in der
  // Planung gespeicherte Kennung (vorher doppelt: Stufe -> id -> Stufe).
  const stufe = useMemo(() => {
    const override = getKarriereOverrideForUser(authUser?.id);
    if (override) return getKarriereStufe(0, override);
    return getKarriereStufeById(config.karrierestufe);
  }, [authUser?.id, config.karrierestufe, _settingsVersion]);
  const stufenRate = getEffectiveRate(authUser?.id, stufe);
  const setterRate = getCustomProvisionRateSetter(authUser?.id);
  const eigenRate = getCustomProvisionRateEigen(authUser?.id);
  const hasSplitRates = setterRate != null || eigenRate != null;
  /**
   * Derselbe Mischsatz wie in der Zielplanung selbst: die beiden gepflegten
   * Saetze, gewichtet mit dem geplanten Anteil eigener Kontakte.
   *
   * Vorher rechnete diese Karte mit dem flachen Stufensatz. Bei Partnern, fuer
   * die Eigen- und Lead-Satz getrennt gepflegt sind und auseinandergehen, zeigte
   * die Karte deshalb eine andere Jahresprovision als die Seite, obwohl beide
   * dieselbe gespeicherte Planung lesen.
   */
  const anteilEigen = Math.max(0, Math.min(100, config.anteilEigenPct ?? 50));
  const effectiveRate = hasSplitRates
    ? ((eigenRate ?? stufenRate) * anteilEigen + (setterRate ?? stufenRate) * (100 - anteilEigen)) / 100
    : stufenRate;
  const isAnzahl = config.modus === "anzahl";

  const now = new Date();
  const currentMonth = now.getMonth(); // 0-based

  const monthLabel = MONATE[currentMonth];

  // Ist-Werte: beurkundete Notartermine des eigenen Bestands. Vorher zeigte
  // die Karte ausschließlich Plan, ohne jeden Abgleich mit der Wirklichkeit.
  const ist = useMemo(() => {
    const jetzt = new Date();
    const jahr = jetzt.getFullYear();
    let monat = 0;
    let jahresIst = 0;
    let monatAnzahl = 0;
    let jahresAnzahl = 0;
    try {
      const kontakteById = new Map(getKontakte().map((k) => [k.id, k]));
      for (const inv of getInvestments()) {
        const k = kontakteById.get(inv.kontaktId);
        if (!k) continue;
        if (!kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id })) continue;
        const termin = leseDatum(inv.notarTermin);
        if (!termin || termin > jetzt || termin.getFullYear() !== jahr) continue;
        const preis = Number(k.kaufpreis) || 0;
        jahresIst += preis;
        jahresAnzahl += 1;
        if (termin.getMonth() === jetzt.getMonth()) {
          monat += preis;
          monatAnzahl += 1;
        }
      }
    } catch { /* ignore */ }
    return { monat, jahresIst, monatAnzahl, jahresAnzahl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.name, authUser?.id, _settingsVersion]);

  const stats = useMemo(() => {
    const monatAnzahl = config.verkaufsAnzahl[currentMonth] || 0;
    const monatVolumen = isAnzahl
      ? monatAnzahl * DURCHSCHNITTSKAUFPREIS
      : config.verkaufsvolumen[currentMonth] || 0;

    const jahresAnzahl = config.verkaufsAnzahl.reduce((a, b) => a + b, 0);
    const jahresVolumen = isAnzahl
      ? jahresAnzahl * DURCHSCHNITTSKAUFPREIS
      : config.verkaufsvolumen.reduce((a, b) => a + b, 0);

    const jahresProvision = jahresVolumen * (effectiveRate / 100);

    // Fortschritt ist jetzt Zielerreichung, nicht mehr die Anzahl der
    // ausgefüllten Planfelder. Vorher stand dort 100 Prozent, sobald alle
    // zwölf Monate geplant waren, ganz gleich was tatsächlich verkauft wurde.
    const monatIst = isAnzahl ? ist.monatAnzahl : ist.monat;
    const monatZiel = isAnzahl ? monatAnzahl : monatVolumen;
    const monthProgress = monatZiel > 0 ? Math.round((monatIst / monatZiel) * 100) : 0;

    const jahresIst = isAnzahl ? ist.jahresAnzahl : ist.jahresIst;
    const yearProgress = jahresVolumen > 0
      ? Math.round(((isAnzahl ? ist.jahresAnzahl * DURCHSCHNITTSKAUFPREIS : ist.jahresIst) / jahresVolumen) * 100)
      : 0;

    return { monatAnzahl, monatVolumen, jahresAnzahl, jahresVolumen, jahresProvision, monthProgress, yearProgress, monatIst, jahresIst };
  }, [config, stufe, isAnzahl, currentMonth, ist]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">Zielplanung</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Monthly target.
            Im Vorfuehrmodus bleiben alle Beschriftungen scharf und nur die
            Werte werden weichgezeichnet: Ziele, Ist-Werte, Provisionssaetze
            und die Prozentwerte an den Fortschrittsbalken. */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Ziel {monthLabel}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className={unscharfKlasse("text-2xl font-bold")}>
                {isAnzahl ? stats.monatAnzahl : fmt(stats.monatVolumen)}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAnzahl ? "Verkäufe" : "Volumen"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              {hasSplitRates ? (
                <div className="space-y-1">
                  {setterRate != null && (
                    <div className="flex items-center justify-center gap-1 text-xs">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Setter</Badge>
                      <span className={unscharfKlasse("font-bold")}>{setterRate} %</span>
                    </div>
                  )}
                  {eigenRate != null && (
                    <div className="flex items-center justify-center gap-1 text-xs">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Eigen</Badge>
                      <span className={unscharfKlasse("font-bold")}>{eigenRate} %</span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground pt-0.5">Provisionssätze</p>
                </div>
              ) : (
                <>
                  <p className={unscharfKlasse("text-2xl font-bold")}>{effectiveRate} %</p>
                  <p className="text-xs text-muted-foreground">Provisionssatz</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Month progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Zielerreichung {monthLabel}</span>
            <span className={unscharfKlasse("font-medium")}>{stats.monthProgress} %</span>
          </div>
          <Progress value={Math.min(100, stats.monthProgress)} className="h-2" />
          <p className={unscharfKlasse("text-[10px] text-muted-foreground mt-1")}>
            {isAnzahl
              ? `${stats.monatIst} von ${stats.monatAnzahl} Verkäufen beurkundet`
              : `${fmt(stats.monatIst)} von ${fmt(stats.monatVolumen)} beurkundet`}
          </p>
        </div>

        {/* Yearly goal */}
        <div className="border-t pt-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Jahresziel Provision</p>
              <p className={unscharfKlasse("text-xs text-muted-foreground mt-0.5")}>
                {isAnzahl ? `${stats.jahresAnzahl} Verkäufe` : fmt(stats.jahresVolumen)}
              </p>
            </div>
            <p className={unscharfKlasse("text-lg font-bold")}>{fmt(stats.jahresProvision)}</p>
          </div>
          <Progress value={Math.min(100, stats.yearProgress)} className="h-2 mt-2" />
          <p className={unscharfKlasse("text-[10px] text-muted-foreground mt-1")}>
            {stats.yearProgress} % erreicht, {isAnzahl
              ? `${stats.jahresIst} von ${stats.jahresAnzahl} Verkäufen`
              : `${fmt(stats.jahresIst)} von ${fmt(stats.jahresVolumen)}`}
          </p>
        </div>

        <div className="mt-auto pt-1">
          <button
            onClick={() => navigate("/zielplanung")}
            className="text-xs text-primary font-medium hover:underline text-left"
          >
            Details ansehen →
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
