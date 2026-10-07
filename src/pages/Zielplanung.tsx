import "@/styles/zielplanung.css";
import { useState, useMemo, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Info, Target, Euro, Hash, Users, Save, Check, Lock, Unlock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadZielplanung, saveZielplanung, loadZielplanungForUser, saveZielplanungForUser, DURCHSCHNITTSKAUFPREIS, type ZielplanungConfig } from "@/lib/zielplanungStore";
import { Slider } from "@/components/ui/slider";
import { SatzartBadge } from "@/components/abrechnung/SatzartBadge";
import { getKarriereOverrideForUser, getKarriereStufe, getKarriereStufeById, getEffectiveRate, getCustomProvisionRateEigen, getCustomProvisionRateSetter, KARRIERE_STUFEN } from "@/lib/karriereStufeHelper";
import { useLiveVersion } from "@/hooks/useLiveData";
import { loadBeraterUsers, type SystemUser } from "@/lib/loadAllUsers";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];


const isAdmin = (role: string) => ["admin", "inhaber"].includes(role);

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtFull = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const DEFAULT_CONFIG: ZielplanungConfig = {
  modus: "volumen",
  karrierestufe: "tippgeber",
  durchschnittskaufpreis: DURCHSCHNITTSKAUFPREIS,
  verkaufsvolumen: Array(12).fill(0),
  verkaufsAnzahl: Array(12).fill(0),
  lockedByAdmin: false,
};

/** Obergrenze des Schnellrechners. Darüber wird die Skala unbrauchbar fein. */
const MAX_ABSCHLUESSE = 60;

/** Der feste Durchschnittskaufpreis, sauber formatiert für die Anzeige. */
const KAUFPREIS_TEXT = fmt(DURCHSCHNITTSKAUFPREIS);

/**
 * Welches der drei verbundenen Rechnerfelder gerade getippt wird.
 *
 * Achtung: Das ist reiner Anzeigezustand und hat nichts mit `config.modus` zu
 * tun. `config.modus` steuert die Monatstabelle und wird gespeichert, der
 * Rechner speichert von sich aus nichts.
 */
type RechnerFeld = "abschluesse" | "volumen" | "provision";

/**
 * Verteilt eine Jahressumme auf zwölf Monate.
 *
 * Ist noch nichts geplant, wird gleichmäßig verteilt. Der Rest aus der
 * Division landet auf den ersten Monaten, damit die Summe exakt aufgeht.
 *
 * Steht schon etwas in der Planung, bleibt deren Form erhalten und wird nur
 * auf die neue Summe skaliert. Wer im Sommer weniger geplant hat, behält
 * diese Delle. Die Rundungsreste gehen dabei an die Monate mit dem größten
 * Nachkommaanteil, sonst läge die Summe um ein paar Einheiten daneben.
 *
 * Gerechnet wird durchweg in ganzen Zahlen, weil sowohl die Anzahl Verkäufe
 * als auch das Verkaufsvolumen in der Tabelle ganzzahlig eingegeben werden.
 */
function verteileAufMonate(gesamt: number, bisher: number[]): number[] {
  const ziel = Math.max(0, Math.round(gesamt));
  const summeBisher = bisher.reduce((a, b) => a + Math.max(0, b), 0);

  if (summeBisher <= 0) {
    const basis = Math.floor(ziel / 12);
    const rest = ziel - basis * 12;
    return Array.from({ length: 12 }, (_, i) => basis + (i < rest ? 1 : 0));
  }

  const roh = bisher.map(v => (Math.max(0, v) * ziel) / summeBisher);
  const werte = roh.map(v => Math.floor(v));
  let rest = ziel - werte.reduce((a, b) => a + b, 0);

  const reihenfolge = roh
    .map((v, i) => ({ i, nachkomma: v - Math.floor(v) }))
    .sort((a, b) => b.nachkomma - a.nachkomma || a.i - b.i);

  for (const { i } of reihenfolge) {
    if (rest <= 0) break;
    werte[i] += 1;
    rest -= 1;
  }

  return werte;
}

const Zielplanung = () => {
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const admin = isAdmin(user.role);
  const settingsVersion = useLiveVersion(["user_settings"]);

  // VP list for admin selector
  const vpUsers = useMemo<(SystemUser & { rate: number })[]>(() => admin ? loadBeraterUsers().map(u => ({ ...u, rate: getEffectiveRate(u.id) })) : [], [admin, settingsVersion]);

  // Selected VP id (admin only) – "__self__" means "own"
  const [selectedVpId, setSelectedVpId] = useState<string>("__self__");
  const [vpConfig, setVpConfig] = useState<ZielplanungConfig>({ ...DEFAULT_CONFIG });
  const [vpLoading, setVpLoading] = useState(false);
  const [vpSaving, setVpSaving] = useState(false);
  const [vpSaved, setVpSaved] = useState(false);

  // Own config (for VP view or admin viewing own)
  const [ownConfig, setOwnConfig] = useState<ZielplanungConfig>(loadZielplanung);
  const [ownDirty, setOwnDirty] = useState(false);
  const [ownSaving, setOwnSaving] = useState(false);
  const [ownSaved, setOwnSaved] = useState(false);

  // Determine which config to show
  const isViewingVp = admin && selectedVpId !== "__self__";
  const config = isViewingVp ? vpConfig : ownConfig;

  // Locking logic
  // - Admin: kann immer alles editieren (auch eigene + fremde Planung)
  // - VP: darf eigene Planung editieren, AUSSER lockedByAdmin === true
  const ownLocked = !admin && !!ownConfig.lockedByAdmin;
  const isEditor = admin || (!isViewingVp && !ownLocked);

  // Load VP config when selection changes
  useEffect(() => {
    if (!admin || selectedVpId === "__self__") return;
    let cancelled = false;
    setVpLoading(true);
    setVpSaved(false);
    loadZielplanungForUser(selectedVpId).then(cfg => {
      if (!cancelled) {
        setVpConfig(cfg);
        setVpLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [admin, selectedVpId]);

  // Load own VP config from DB (for non-admin users) once on mount/auth change
  useEffect(() => {
    if (admin || !authUser?.id) return;
    let cancelled = false;
    loadZielplanungForUser(authUser.id).then(cfg => {
      if (!cancelled) {
        setOwnConfig(cfg);
        setOwnDirty(false);
      }
    });
    return () => { cancelled = true; };
  }, [admin, authUser?.id, settingsVersion]);

  // Eine einzige Auflösung: der Override direkt zur Stufe, sonst die in der
  // Planung gespeicherte Kennung. Vorher lief der Wert doppelt durch die
  // Auflösung (Stufe -> id -> Stufe).
  const stufe = useMemo(() => {
    const targetUserId = isViewingVp ? selectedVpId : authUser?.id;
    if (targetUserId) {
      const override = getKarriereOverrideForUser(targetUserId);
      if (override) {
        return getKarriereStufe(0, override);
      }
    }
    return getKarriereStufeById(config.karrierestufe);
  }, [isViewingVp, selectedVpId, authUser?.id, config.karrierestufe, settingsVersion]);
  const effectiveKarriereId = stufe.id;
  const targetUserId = isViewingVp ? selectedVpId : authUser?.id;
  const stufenRate = getEffectiveRate(targetUserId, stufe);

  // Die beiden gepflegten Sätze. Fehlt einer, gilt dort der Stufensatz.
  const eigenRate = getCustomProvisionRateEigen(targetUserId) ?? stufenRate;
  const leadRate = getCustomProvisionRateSetter(targetUserId) ?? stufenRate;
  const hatSplit = Math.abs(eigenRate - leadRate) > 0.001;

  const anteilEigen = Math.max(0, Math.min(100, config.anteilEigenPct ?? 50));

  /**
   * Mischsatz aus den beiden Sätzen, gewichtet mit dem geplanten Anteil
   * eigener Kontakte. Sind beide Sätze gleich, ist es schlicht dieser Satz.
   */
  const effectiveRate = hatSplit
    ? (eigenRate * anteilEigen + leadRate * (100 - anteilEigen)) / 100
    : eigenRate;

  const satzText = `${effectiveRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
  const isAnzahl = config.modus === "anzahl";

  const calculations = useMemo(() => {
    return MONATE.map((_, i) => {
      const volumen = isAnzahl
        ? config.verkaufsAnzahl[i] * DURCHSCHNITTSKAUFPREIS
        : config.verkaufsvolumen[i];
      const volumenEigen = volumen * (anteilEigen / 100);
      const volumenLead = volumen - volumenEigen;
      const provision = hatSplit
        ? volumenEigen * (eigenRate / 100) + volumenLead * (leadRate / 100)
        : volumen * (eigenRate / 100);
      return {
        volumen,
        provision,
        anzahl: isAnzahl ? config.verkaufsAnzahl[i] : 0,
        provisionEigen: hatSplit ? volumenEigen * (eigenRate / 100) : 0,
        provisionLead: hatSplit ? volumenLead * (leadRate / 100) : 0,
      };
    });
  }, [config, eigenRate, leadRate, hatSplit, anteilEigen, isAnzahl]);

  const totals = useMemo(() => ({
    volumen: calculations.reduce((a, c) => a + c.volumen, 0),
    provision: calculations.reduce((a, c) => a + c.provision, 0),
    provisionEigen: calculations.reduce((a, c) => a + c.provisionEigen, 0),
    provisionLead: calculations.reduce((a, c) => a + c.provisionLead, 0),
    anzahl: config.verkaufsAnzahl.reduce((a, b) => a + b, 0),
  }), [calculations, config.verkaufsAnzahl]);

  const update = (patch: Partial<ZielplanungConfig>) => {
    if (isViewingVp) {
      setVpConfig(prev => ({ ...prev, ...patch }));
      setVpSaved(false);
    } else {
      setOwnConfig(prev => ({ ...prev, ...patch }));
      setOwnDirty(true);
      setOwnSaved(false);
    }
  };

  const updateVolumen = (i: number, v: number) => {
    const arr = [...(isViewingVp ? vpConfig.verkaufsvolumen : ownConfig.verkaufsvolumen)];
    arr[i] = v;
    update({ verkaufsvolumen: arr });
  };

  const updateAnzahl = (i: number, v: number) => {
    const arr = [...(isViewingVp ? vpConfig.verkaufsAnzahl : ownConfig.verkaufsAnzahl)];
    arr[i] = v;
    update({ verkaufsAnzahl: arr });
  };

  // Admin saves for a VP – this LOCKS the planning (festgeschrieben)
  const handleSaveForVp = useCallback(async () => {
    if (!selectedVpId) return;
    setVpSaving(true);
    const lockedConfig: ZielplanungConfig = {
      ...vpConfig,
      lockedByAdmin: true,
      lockedAt: new Date().toISOString(),
      lockedBy: authUser?.id,
    };
    await saveZielplanungForUser(selectedVpId, lockedConfig);
    setVpConfig(lockedConfig);
    setVpSaving(false);
    setVpSaved(true);
    toast({
      title: "Zielplanung festgeschrieben",
      description: "Die Zielplanung wurde gespeichert und für den Partner gesperrt. Er kann sie nicht mehr selbst ändern.",
    });
  }, [selectedVpId, vpConfig, authUser?.id, toast]);

  // Admin removes the lock so the VP can edit again
  const handleUnlockForVp = useCallback(async () => {
    if (!selectedVpId) return;
    setVpSaving(true);
    const unlockedConfig: ZielplanungConfig = {
      ...vpConfig,
      lockedByAdmin: false,
      lockedAt: undefined,
      lockedBy: undefined,
    };
    await saveZielplanungForUser(selectedVpId, unlockedConfig);
    setVpConfig(unlockedConfig);
    setVpSaving(false);
    setVpSaved(true);
    toast({
      title: "Sperre aufgehoben",
      description: "Der Partner kann seine Zielplanung jetzt wieder selbst bearbeiten.",
    });
  }, [selectedVpId, vpConfig, toast]);

  /**
   * Speichert die eigene Planung. Der Aufrufer übergibt die Konfiguration
   * ausdrücklich, damit auch frisch berechnete Werte gespeichert werden
   * können, ohne auf den nächsten Render zu warten.
   */
  const speichereEigene = useCallback(async (cfg: ZielplanungConfig): Promise<boolean> => {
    if (!authUser?.id) return false;
    setOwnSaving(true);
    // Ein VP kann sich nicht selbst sperren, Admins bleiben unberührt.
    const zuSpeichern: ZielplanungConfig = admin ? cfg : { ...cfg, lockedByAdmin: false };
    await saveZielplanungForUser(authUser.id, zuSpeichern);
    saveZielplanung(zuSpeichern);
    setOwnConfig(zuSpeichern);
    setOwnSaving(false);
    setOwnSaved(true);
    setOwnDirty(false);
    return true;
  }, [admin, authUser?.id]);

  // VP saves their own planning
  const handleSaveOwn = useCallback(async () => {
    if (!(await speichereEigene(ownConfig))) return;
    toast({ title: "Zielplanung gespeichert", description: "Deine Planung wurde aktualisiert." });
  }, [speichereEigene, ownConfig, toast]);

  // Admin saves their own planning (no lock applies to admin)
  const handleSaveAdminOwn = useCallback(async () => {
    if (!(await speichereEigene(ownConfig))) return;
    toast({ title: "Zielplanung gespeichert", description: "Deine eigene Planung wurde gespeichert." });
  }, [speichereEigene, ownConfig, toast]);

  // Nur fuer die Anzeige. Im Vorfuehrmodus steht hier das gleichbleibende
  // Kuerzel des Partners, der echte Name kommt gar nicht erst auf den Schirm.
  const selectedVpName = tarnName(vpUsers.find(u => u.id === selectedVpId)?.name || "", "partner");
  const vpIsLocked = isViewingVp && !!vpConfig.lockedByAdmin;

  /* ----------------------------------------------------------------------
     Der Rechner. Er rechnet nur und speichert von sich aus nichts, deshalb
     liegt sein Zustand ausschliesslich lokal in dieser Komponente. Erst der
     Knopf "Als Jahresziel uebernehmen" traegt das Ergebnis in die
     Monatsplanung, und die ist die einzige gespeicherte Wahrheit.
     ---------------------------------------------------------------------- */

  // Was ein einzelner Abschluss zum eigenen Satz bringt.
  const provisionProAbschluss = DURCHSCHNITTSKAUFPREIS * (effectiveRate / 100);

  // Einen Stufenaufstieg gibt es im vereinheitlichten Modell nicht mehr:
  // alle neuen Partner haben dieselbe 4-%-Stufe, die höheren Stufen sind
  // reiner Bestand (nurBestand) und werden nicht mehr als Ziel angeboten.
  // Der frühere Stufenvergleich und der Aufstiegskasten sind deshalb durch
  // eine schlichte Zielkarte ersetzt.

  // Die Abschlüsse sind der einzige Zustand des Rechners. Volumen und
  // Provision werden immer aus ihnen abgeleitet, damit die drei Felder nicht
  // auseinanderlaufen können.
  const [schnellManuell, setSchnellManuell] = useState<number | null>(null);

  /**
   * Das Feld, in dem gerade getippt wird, mit seinem rohen Text.
   *
   * Ohne diesen Entwurf würde jeder Tastendruck den Feldinhalt sofort durch
   * den gerundeten Wert ersetzen, der Cursor würde springen und
   * Zwischenstände wie "12" auf dem Weg zu "1250000" wären nicht eintippbar.
   * Das getippte Feld zeigt deshalb den Rohtext, die beiden anderen ziehen mit.
   * Beim Verlassen des Feldes fällt der Entwurf weg und alle drei zeigen
   * wieder den kanonischen Wert.
   */
  const [entwurf, setEntwurf] = useState<{ feld: RechnerFeld; text: string } | null>(null);

  // Solange niemand etwas eingegeben hat, startet der Rechner auf dem
  // gespeicherten Jahr. So sieht man beim Öffnen den eigenen Stand.
  const abschluesseAusPlan = isAnzahl
    ? totals.anzahl
    : Math.round(totals.volumen / DURCHSCHNITTSKAUFPREIS);
  const begrenzeAbschluesse = (n: number) =>
    Math.max(1, Math.min(MAX_ABSCHLUESSE, Math.round(n) || 1));
  const schnellAbschluesse = begrenzeAbschluesse(
    schnellManuell ?? (abschluesseAusPlan > 0 ? abschluesseAusPlan : 12),
  );

  const schnellVolumen = schnellAbschluesse * DURCHSCHNITTSKAUFPREIS;
  const schnellProvision = schnellVolumen * (effectiveRate / 100);

  /** Anzeigewert eines Feldes: der Entwurf, sonst der abgeleitete Wert. */
  const feldWert = (feld: RechnerFeld, abgeleitet: number) =>
    entwurf?.feld === feld ? entwurf.text : String(Math.round(abgeleitet));

  /**
   * Eingabe in einem der drei Felder. Alles wird auf ganze Abschlüsse
   * zurückgerechnet und gerundet, die beiden anderen Felder ergeben sich
   * daraus neu. Eine Provision, die nicht auf eine ganze Zahl aufgeht, wird
   * deshalb beim Verlassen des Feldes auf den passenden Betrag korrigiert.
   */
  const eingabeImFeld = (feld: RechnerFeld, text: string) => {
    setEntwurf({ feld, text });
    if (text.trim() === "") return;
    const zahl = Number(text);
    if (!Number.isFinite(zahl)) return;
    const alsAbschluesse =
      feld === "abschluesse"
        ? zahl
        : feld === "volumen"
          ? zahl / DURCHSCHNITTSKAUFPREIS
          : provisionProAbschluss > 0
            ? zahl / provisionProAbschluss
            : 0;
    setSchnellManuell(begrenzeAbschluesse(alsAbschluesse));
  };

  /* ----------------------------------------------------------------------
     Die Brücke vom Rechner in die Planung.

     Bewusst ein Knopf und keine Automatik: Würde der Regler direkt in die
     Tabelle schreiben, überschriebe jedes Ziehen die von Hand gepflegte
     Monatsverteilung.
     ---------------------------------------------------------------------- */

  const [uebernehmeLaeuft, setUebernehmeLaeuft] = useState(false);

  const bisherigeMonate = isAnzahl ? config.verkaufsAnzahl : config.verkaufsvolumen;
  const planungGefuellt = bisherigeMonate.some(v => v > 0);

  const handleUebernehmen = useCallback(async () => {
    const bisher = isAnzahl ? config.verkaufsAnzahl : config.verkaufsvolumen;
    const zielSumme = isAnzahl ? schnellAbschluesse : schnellVolumen;

    // Nur nachfragen, wenn tatsächlich eine gepflegte Planung überschrieben wird.
    if (bisher.some(v => v > 0)) {
      const ok = await confirmDialog({
        title: "Bestehende Monatsplanung überschreiben?",
        description: isAnzahl
          ? `Die zwölf Monate werden auf ${schnellAbschluesse} Verkäufe im Jahr skaliert. Die vorhandene Verteilung über das Jahr bleibt dabei in ihrer Form erhalten.`
          : `Die zwölf Monate werden auf ${fmt(schnellVolumen)} Verkaufsvolumen im Jahr skaliert. Die vorhandene Verteilung über das Jahr bleibt dabei in ihrer Form erhalten.`,
        confirmText: "Übernehmen",
      });
      if (!ok) return;
    }

    const verteilt = verteileAufMonate(zielSumme, bisher);
    const patch: Partial<ZielplanungConfig> = isAnzahl
      ? { verkaufsAnzahl: verteilt }
      : { verkaufsvolumen: verteilt };

    if (isViewingVp) {
      // Für einen Partner speichert der Admin nur über "Speichern & sperren".
      // Ein stilles Speichern hier würde die Planung ungefragt festschreiben.
      setVpConfig(prev => ({ ...prev, ...patch }));
      setVpSaved(false);
      toast({
        title: "In die Monatsplanung übernommen",
        description: "Zum Festschreiben unten auf Speichern & für Partner sperren klicken.",
      });
      return;
    }

    setUebernehmeLaeuft(true);
    const gespeichert = await speichereEigene({ ...ownConfig, ...patch });
    setUebernehmeLaeuft(false);
    if (!gespeichert) return;
    toast({
      title: "Jahresziel übernommen",
      description: isAnzahl
        ? `${schnellAbschluesse} Verkäufe auf zwölf Monate verteilt und gespeichert.`
        : `${fmt(schnellVolumen)} auf zwölf Monate verteilt und gespeichert.`,
    });
  }, [isAnzahl, config.verkaufsAnzahl, config.verkaufsvolumen, schnellAbschluesse, schnellVolumen, isViewingVp, ownConfig, speichereEigene, toast]);

  return (
    <DashboardLayout>
      <div className="zielplanung space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <PageHeader
            title="Zielplanung"
            subtitle={isViewingVp
              ? vpIsLocked
                ? `Zielplanung für ${selectedVpName} – aktuell festgeschrieben (gesperrt)`
                : `Zielplanung für ${selectedVpName} bearbeiten`
              : ownLocked
                ? "Deine Zielplanung wurde vom Admin festgeschrieben (nur Ansicht)"
                : "Plane deine monatlichen Immobilienverkäufe & Jahresprovision"
            }
          />
          {/* Die Umschaltung Verkaufsvolumen / Anzahl Verkäufe stand früher
              hier. Sie steuert aber allein die Monatstabelle und sitzt
              deshalb jetzt in deren Kopfzeile. Die fruehere Karrierestufen-
              Auswahl an dieser Stelle ist entfernt: Sie war nur noch ein
              Notfall-Rueckgriff ohne hinterlegte Stufe und zeigte sonst
              einen irrefuehrenden Standardwert. Die echte Stufe kommt aus
              der Nutzerverwaltung und steht mehrfach auf der Seite. */}
        </div>

        {/* Admin: VP Selector */}
        {admin && (
          <Card className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Vertriebspartner auswählen:</span>
              <Select value={selectedVpId} onValueChange={setSelectedVpId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Eigene Planung anzeigen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Eigene Planung</SelectItem>
                  {vpUsers.map(vp => (
                    <SelectItem key={vp.id} value={vp.id}>
                      {tarnName(vp.name, "partner")} (<span className={unscharfKlasse()}>{vp.rate} %</span>)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isViewingVp && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSaveForVp}
                  disabled={vpSaving}
                >
                  {vpSaved && !vpSaving ? (
                    <><Check className="h-3.5 w-3.5" /> Gespeichert & gesperrt</>
                  ) : vpSaving ? (
                    "Speichert..."
                  ) : (
                    <><Lock className="h-3.5 w-3.5" /> Speichern & für Partner sperren</>
                  )}
                </Button>
              )}
              {isViewingVp && vpIsLocked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleUnlockForVp}
                  disabled={vpSaving}
                >
                  <Unlock className="h-3.5 w-3.5" /> Sperre aufheben
                </Button>
              )}
              {isViewingVp && (
                <Badge variant={vpIsLocked ? "default" : "outline"} className="text-xs gap-1">
                  {vpIsLocked && <Lock className="h-3 w-3" />}
                  {vpIsLocked ? `Festgeschrieben für ${selectedVpName}` : `Bearbeitung für ${selectedVpName}`}
                </Badge>
              )}
            </div>
            {vpLoading && <p className="text-xs text-muted-foreground mt-2">Lade Zielplanung…</p>}
          </Card>
        )}

        <section data-ui="card" aria-labelledby="plan-overview" className="rounded-xl border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 id="plan-overview" className="text-lg font-semibold">Dein Jahresplan auf einen Blick</h2>
              <p className="text-sm text-muted-foreground mt-1">Diese Werte ergeben sich aus deiner Monatsplanung. Alle Beträge sind Planwerte.</p>
            </div>
            <Badge variant="outline">{ownLocked || vpIsLocked ? "Festgeschrieben" : ownDirty ? "Ungespeicherte Änderungen" : "Monatsplanung"}</Badge>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="border-l-4 border-primary pl-4">
              <p className="text-sm text-muted-foreground">Geplante Jahresprovision</p>
              <p className={unscharfKlasse("text-2xl sm:text-3xl font-semibold tracking-tight text-primary mt-2")}>{fmtFull(totals.provision)}</p>
              <p className="text-xs text-muted-foreground mt-2">Ø <span className={unscharfKlasse()}>{fmtFull(totals.provision / 12)}</span> pro Monat</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Geplantes Verkaufsvolumen</p>
              <p className={unscharfKlasse("text-2xl font-semibold tracking-tight mt-2")}>{fmt(totals.volumen)}</p>
              <p className="text-xs text-muted-foreground mt-2">{isAnzahl ? <><span className={unscharfKlasse()}>{totals.anzahl}</span> Verkäufe im Jahr</> : <>Ø <span className={unscharfKlasse()}>{fmt(totals.volumen / 12)}</span> pro Monat</>}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{hatSplit ? "Gewichteter Provisionssatz" : "Dein Provisionssatz"}</p>
              <p className={unscharfKlasse("text-2xl font-semibold tracking-tight mt-2")}>{satzText}</p>
              <p className="text-xs text-muted-foreground mt-2">{stufe.titel} · auf das Verkaufsvolumen</p>
            </div>
          </div>
          {!planungGefuellt && <p className="mt-5 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Noch kein Monatsziel eingetragen. Berechne zuerst ein Jahresziel oder trage unten deine Monatsziele direkt ein.</p>}
        </section>

        {/* Der Rechner. Drei Felder, dieselbe Gleichung, nur von verschiedenen
            Seiten betrachtet. Er schreibt nichts in die gespeicherte
            Konfiguration und ist deshalb auch bei gesperrter Planung
            bedienbar. Erst der Knopf ganz unten überträgt das Ergebnis. */}
        <details data-ui="card" className="rounded-xl border bg-card p-5" open={planungGefuellt ? undefined : true}>
          <summary className="cursor-pointer font-semibold focus-visible:outline-primary">Jahresziel berechnen <span className="ml-2 text-xs font-normal text-muted-foreground">Optional · Rechenvorschau</span></summary>
          <div className="space-y-5 pt-5">
          <div>
            <h2 className="font-semibold">Was möchtest du im Jahr erreichen?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gib Verkäufe, Verkaufsvolumen oder Wunschprovision ein. Die anderen Werte werden passend berechnet.
              Grundlage sind <span className={unscharfKlasse()}>{KAUFPREIS_TEXT}</span>{" "}
              Durchschnittskaufpreis und <span className={unscharfKlasse()}>{satzText}</span> Provision.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <label htmlFor="rechnerAbschluesse" className="text-xs text-muted-foreground">
                Abschlüsse im Jahr
              </label>
              <Input
                id="rechnerAbschluesse"
                type="number"
                min={1}
                max={MAX_ABSCHLUESSE}
                step={1}
                value={feldWert("abschluesse", schnellAbschluesse)}
                onChange={e => eingabeImFeld("abschluesse", e.target.value)}
                onBlur={() => setEntwurf(null)}
                className={unscharfKlasse("h-9 text-right tabular-nums")}
              />
              <p className={unscharfKlasse("text-[11px] text-muted-foreground")}>
                {(schnellAbschluesse / 12).toLocaleString("de-DE", { maximumFractionDigits: 1 })} pro Monat
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <label htmlFor="rechnerVolumen" className="text-xs text-muted-foreground">
                Verkaufsvolumen (€)
              </label>
              <Input
                id="rechnerVolumen"
                type="number"
                min={0}
                step={DURCHSCHNITTSKAUFPREIS}
                value={feldWert("volumen", schnellVolumen)}
                onChange={e => eingabeImFeld("volumen", e.target.value)}
                onBlur={() => setEntwurf(null)}
                className={unscharfKlasse("h-9 text-right tabular-nums")}
              />
              <p className={unscharfKlasse("text-[11px] text-muted-foreground")}>{fmt(schnellVolumen)}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <label htmlFor="rechnerProvision" className="text-xs text-muted-foreground">
                Jahresprovision (€)
              </label>
              <Input
                id="rechnerProvision"
                type="number"
                min={0}
                step={provisionProAbschluss > 0 ? provisionProAbschluss : 1000}
                value={feldWert("provision", schnellProvision)}
                onChange={e => eingabeImFeld("provision", e.target.value)}
                onBlur={() => setEntwurf(null)}
                className={unscharfKlasse("h-9 text-right tabular-nums")}
              />
              <p className={unscharfKlasse("text-[11px] text-muted-foreground")}>
                {fmt(schnellProvision / 12)} pro Monat
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Slider
              min={1}
              max={MAX_ABSCHLUESSE}
              step={1}
              value={[schnellAbschluesse]}
              onValueChange={([v]) => { setEntwurf(null); setSchnellManuell(begrenzeAbschluesse(v)); }}
              aria-label="Abschlüsse im Jahr"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>1</span>
              <span>{MAX_ABSCHLUESSE}</span>
            </div>
          </div>

          {/* Schlichte Zielkarte statt Stufenvergleich: seit dem
              vereinheitlichten Modell gibt es für neue Partner nur noch die
              eine 4-%-Stufe, ein Vergleich über Stufen sagt nichts mehr aus. */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-semibold">Rechenvorschau · noch nicht übernommen</p>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Abschlüsse im Jahr</p>
                <p className={unscharfKlasse("text-lg font-semibold tabular-nums")}>{schnellAbschluesse}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Provision pro Abschluss</p>
                <p className={unscharfKlasse("text-lg font-semibold tabular-nums")}>{fmt(provisionProAbschluss)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jahresprovision</p>
                <p className={unscharfKlasse("text-lg font-semibold tabular-nums text-primary")}>{fmt(schnellProvision)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dein Satz</p>
                <p className={unscharfKlasse("text-lg font-semibold tabular-nums")}>{satzText}</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground border-t pt-3">
            Ein zusätzlicher Abschluss bringt dir{" "}
            <span className={unscharfKlasse("font-semibold text-foreground tabular-nums")}>{fmt(provisionProAbschluss)}</span>.
          </p>

          {/* Die Brücke in die Planung. Nur für Bearbeiter, eine gesperrte
              Planung bleibt unangetastet. */}
          {isEditor && (
            <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground max-w-md">
                {planungGefuellt
                  ? (isViewingVp ? "Passt die Monatsziele proportional an. Anschließend mit „Speichern & sperren“ festschreiben." : "Passt die Monatsziele proportional an und speichert deine Planung.")
                  : (isViewingVp ? "Verteilt das Ziel auf zwölf Monate. Anschließend mit „Speichern & sperren“ festschreiben." : "Verteilt das Ziel auf zwölf Monate und speichert deine Planung.")}
              </p>
              <Button onClick={handleUebernehmen} disabled={uebernehmeLaeuft} className="gap-1.5">
                <Target className="h-4 w-4" />
                {uebernehmeLaeuft ? "Übernimmt..." : (isViewingVp ? "In Monatsplanung übernehmen" : "Übernehmen & speichern")}
              </Button>
            </div>
          )}
          </div>
        </details>

        {/* Aufteilung nach Satzart. Nur sinnvoll, wenn die beiden Sätze
            überhaupt auseinandergehen. */}
        {hatSplit && (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Aufteilung des Ziels</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Für selbst gewonnene Kontakte und für zugewiesene Leads gelten unterschiedliche
                  Sätze. Wie viel des Ziels willst du selbst gewinnen?
                </p>
              </div>
              <p className="text-sm tabular-nums">
                <span className={unscharfKlasse("font-semibold text-primary")}>{anteilEigen} %</span> eigen ·{" "}
                <span className={unscharfKlasse("font-semibold")}>{100 - anteilEigen} %</span> zugewiesen
              </p>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={anteilEigen}
              disabled={ownLocked}
              onChange={(e) => update({ anteilEigenPct: Number(e.target.value) })}
              className="w-full accent-primary disabled:opacity-50"
              aria-label="Anteil eigener Kontakte"
            />

            <div className="grid sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg border bg-muted/30 p-3">
                {/* Der Satz steckt im Abzeichen selbst, deshalb wird hier das
                    ganze Abzeichen weichgezeichnet. Die Erklaerung darunter
                    bleibt scharf und traegt die Bedeutung. */}
                <div className={unscharfKlasse("flex items-center gap-2")}>
                  <SatzartBadge art="eigen" satz={eigenRate} />
                </div>
                <p className={unscharfKlasse("text-sm font-semibold tabular-nums mt-2")}>
                  {fmtFull(totals.provisionEigen)}
                </p>
                <p className="text-[11px] text-muted-foreground">aus selbst gewonnenen Kontakten</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className={unscharfKlasse("flex items-center gap-2")}>
                  <SatzartBadge art="zugewiesen" satz={leadRate} />
                </div>
                <p className={unscharfKlasse("text-sm font-semibold tabular-nums mt-2")}>
                  {fmtFull(totals.provisionLead)}
                </p>
                <p className="text-[11px] text-muted-foreground">aus zugewiesenen Leads</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Mischsatz
                </p>
                <p className={unscharfKlasse("text-sm font-semibold tabular-nums mt-2")}>{satzText}</p>
                <p className="text-[11px] text-muted-foreground">
                  gewichtet nach der Aufteilung oben
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Table */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Monatsziele festlegen</h2>
            <Tooltip>
              <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {isAnzahl ? (
                  <>
                    Trage die geplante Anzahl Verkäufe pro Monat ein. Volumen = Anzahl × Ø Kaufpreis
                    (<span className={unscharfKlasse()}>{KAUFPREIS_TEXT}</span>). Provision:{" "}
                    <span className={unscharfKlasse()}>{satzText}</span>.
                  </>
                ) : (
                  <>
                    Trage das geplante Verkaufsvolumen pro Monat ein. Provision:{" "}
                    <span className={unscharfKlasse()}>{satzText}</span>.
                  </>
                )}
              </TooltipContent>
            </Tooltip>
            {/* Die Umschaltung sitzt hier, weil sie allein diese Tabelle
                steuert: Sie entscheidet, ob Anzahl oder Volumen eingegeben
                wird. Sie steckt als `modus` in den gespeicherten Daten und
                wird auch von der Dashboard-Karte gelesen, deshalb bleibt sie
                erhalten und wurde nur verschoben. */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {isEditor && (
                <Tabs value={config.modus} onValueChange={(v) => update({ modus: v as "volumen" | "anzahl" })}>
                  <TabsList className="h-8">
                    <TabsTrigger value="volumen" className="text-xs gap-1.5"><Euro className="h-3.5 w-3.5" />Verkaufsvolumen</TabsTrigger>
                    <TabsTrigger value="anzahl" className="text-xs gap-1.5"><Hash className="h-3.5 w-3.5" />Anzahl Verkäufe</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {ownLocked && !isViewingVp && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Lock className="h-3 w-3" /> Vom Admin festgeschrieben
                </Badge>
              )}
              {!admin && !ownLocked && (
                <Badge variant="outline" className="text-[10px]">Selbst bearbeitbar</Badge>
              )}
              {isViewingVp && (
                <Badge className="text-[10px] gap-1">
                  {vpIsLocked && <Lock className="h-3 w-3" />}
                  Bearbeitung: {selectedVpName}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{isAnzahl ? "Trage die geplanten Verkäufe je Monat ein." : "Trage das geplante Verkaufsvolumen je Monat ein."} Die Provision wird daraus berechnet. {isAnzahl && <>Grundlage je Immobilie: <span className={unscharfKlasse()}>{KAUFPREIS_TEXT}</span>.</>}</p>
          <div className="overflow-x-auto">
            <table className="zielplanung-monate w-full text-sm">
              <caption className="sr-only">Monatliche Verkaufsziele und daraus berechnete Provision</caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2 pr-4 w-32">Monat</th>
                  {isAnzahl && <th className="text-right py-2 px-2">Anzahl</th>}
                  <th className="text-right py-2 px-2">Volumen (€)</th>
                  <th className="text-center py-2 px-2 w-20">Satz</th>
                  <th className="text-right py-2 px-2 font-semibold">Provision (€)</th>
                </tr>
              </thead>
              <tbody>
                {MONATE.map((_, i) => {
                  const isQuartalStart = i % 3 === 0;
                  const quartalLabel = isQuartalStart ? `Q${Math.floor(i / 3) + 1}` : null;
                  const isQuartalEnd = i % 3 === 2;

                  return (
                    <tr key={i} className={`border-b border-border/50 hover:bg-muted/30 ${isQuartalEnd ? "border-b-2 border-border" : ""}`}>
                      <td className="py-3 pr-4 font-medium flex items-center gap-2">
                        {MONATE[i]}
                        {quartalLabel && <Badge variant="outline" className="text-[10px] px-1.5">{quartalLabel}</Badge>}
                      </td>
                      {isAnzahl && (
                        <td data-label="Verkäufe" className="text-right px-2">
                          {isEditor ? (
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`Geplante Verkäufe im ${MONATE[i]}`}
                              value={config.verkaufsAnzahl[i] || ""}
                              placeholder="0"
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === "") { updateAnzahl(i, 0); return; }
                                const parsed = parseInt(raw);
                                if (!isNaN(parsed)) updateAnzahl(i, parsed);
                              }}
                              className={unscharfKlasse("w-20 ml-auto text-right h-8")}
                            />
                          ) : (
                            <span className={unscharfKlasse("font-medium")}>{config.verkaufsAnzahl[i]}</span>
                          )}
                        </td>
                      )}
                      <td data-label="Verkaufsvolumen" className="text-right px-2">
                        {isAnzahl ? (
                          <span className={unscharfKlasse("text-muted-foreground")}>{fmt(calculations[i].volumen)}</span>
                        ) : isEditor ? (
                          <Input
                            type="number"
                            min={0}
                            step={10000}
                            aria-label={`Verkaufsvolumen im ${MONATE[i]} in Euro`}
                            value={config.verkaufsvolumen[i] || ""}
                            placeholder="0"
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === "") { updateVolumen(i, 0); return; }
                              const parsed = parseInt(raw);
                              if (!isNaN(parsed)) updateVolumen(i, parsed);
                            }}
                            className={unscharfKlasse("w-36 ml-auto text-right h-8")}
                          />
                        ) : (
                          <span className={unscharfKlasse("font-medium")}>{fmt(config.verkaufsvolumen[i])}</span>
                        )}
                      </td>
                      <td data-label="Provisionssatz" className={unscharfKlasse("text-center px-2 text-muted-foreground")}>{satzText}</td>
                      <td data-label="Geplante Provision" className={unscharfKlasse("text-right px-2 font-semibold")}>{fmtFull(calculations[i].provision)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2">
                  <td className="py-3 pr-4">Jahresgesamt</td>
                  {isAnzahl && <td className={unscharfKlasse("text-right px-2")}>{totals.anzahl}</td>}
                  <td className={unscharfKlasse("text-right px-2")}>{fmt(totals.volumen)}</td>
                  <td className={unscharfKlasse("text-center px-2")}>{satzText}</td>
                  <td className={unscharfKlasse("text-right px-2 text-primary")}>{fmtFull(totals.provision)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Save buttons at bottom */}
          {isViewingVp && (
            <div className="flex flex-wrap justify-end items-center gap-3 mt-4 pt-4 border-t">
              {vpIsLocked && (
                <span className="text-xs text-muted-foreground">
                  Diese Planung ist aktuell für den Partner gesperrt.
                </span>
              )}
              {vpIsLocked && (
                <Button variant="outline" onClick={handleUnlockForVp} disabled={vpSaving} className="gap-1.5">
                  <Unlock className="h-4 w-4" /> Sperre aufheben
                </Button>
              )}
              <Button onClick={handleSaveForVp} disabled={vpSaving} className="gap-1.5">
                {vpSaved && !vpSaving ? (
                  <><Check className="h-4 w-4" /> Gespeichert & gesperrt</>
                ) : vpSaving ? (
                  "Speichert..."
                ) : (
                  <><Lock className="h-4 w-4" /> Speichern & für {selectedVpName} sperren</>
                )}
              </Button>
            </div>
          )}

          {/* Save button for own planning (admin own OR VP self-edit when not locked) */}
          {!isViewingVp && isEditor && (
            <div className="flex flex-wrap justify-end items-center gap-3 mt-4 pt-4 border-t">
              {ownDirty && (
                <span className="text-xs text-warning">
                  Ungespeicherte Änderungen
                </span>
              )}
              <Button
                variant="brand"
                onClick={admin ? handleSaveAdminOwn : handleSaveOwn}
                disabled={ownSaving || (!ownDirty && ownSaved)}
                className="gap-1.5"
              >
                {ownSaved && !ownDirty && !ownSaving ? (
                  <><Check className="h-4 w-4" /> Gespeichert</>
                ) : ownSaving ? (
                  "Speichert..."
                ) : (
                  <><Save className="h-4 w-4" /> Zielplanung speichern</>
                )}
              </Button>
            </div>
          )}

          {/* Hint when own planning is locked by admin */}
          {!isViewingVp && ownLocked && (
            <div className="mt-4 pt-4 border-t flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Deine Zielplanung wurde von einem Administrator festgeschrieben und kann von dir
                nicht selbst geändert werden. Bitte wende dich an deinen Vertriebsleiter, falls
                Anpassungen nötig sind.
              </p>
            </div>
          )}
        </Card>

        {/* Karrierestufen */}
        <details data-ui="card" className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer font-semibold mb-3">Berechnungsgrundlagen & Provisionsstufen</summary>
          <div className="space-y-2 text-sm">
            {/* Gezeigt wird das aktuelle Modell (einheitliche 4-%-Stufe) plus
                die eigene Stufe, falls sie eine Bestandsstufe ist. */}
            {KARRIERE_STUFEN.filter((k) => !k.nurBestand || k.id === effectiveKarriereId).map((k) => (
              <div key={k.id} className={`flex justify-between items-center py-1.5 px-3 rounded-md ${k.id === effectiveKarriereId ? "bg-primary/10 border border-primary/20" : ""}`}>
                <span className={k.id === effectiveKarriereId ? "font-semibold" : ""}>{k.titel}</span>
                <Badge variant={k.id === effectiveKarriereId ? "default" : "outline"} className={unscharfKlasse("text-xs")}>{k.rate} %</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Die Provision berechnet sich prozentual auf das Verkaufsvolumen der vermittelten Kapitalanlage-Immobilien.
          </p>
        </details>
      </div>
    </DashboardLayout>
  );
};

export default Zielplanung;
