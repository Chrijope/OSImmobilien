import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Search, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCacheReady } from "@/hooks/useCacheReady";
import { confirmDialog } from "@/lib/confirm";
import { onCacheChange } from "@/lib/dataCache";
import { getInvestmentById, getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { investmentBeschriftung } from "@/lib/investmentAuswahl";
import { kundenZurAuswahl } from "@/lib/objektExposeStore";
import {
  istAnderesObjekt, objektBereitsEingetragen, objektBezeichnung, objektInVerlaufVerschieben, vorhandeneObjektDaten,
} from "@/lib/objektDatenPflicht";
import { AMPEL_ERKLAERUNG, AMPEL_TEXT, investmentAmpel, type InvestmentAmpel } from "@/lib/reservierungStart";
import { VORMERKUNG_MINUTEN } from "@/lib/einheitVormerkung";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";

/**
 * „Für Kunden reservieren“ auf der Einheitsseite.
 *
 * Ablauf nach Christians Plan vom 23.09.2026: Kunde suchen, Investment wählen,
 * weiter ins vorausgefüllte Formular für genau diese Einheit. Hier wird noch
 * nichts vorgemerkt und nichts reserviert. Vorgemerkt wird beim Absenden der
 * Vereinbarung, reserviert mit der Unterschrift.
 *
 * Die Kunden kommen aus dem Zwischenspeicher (`kundenZurAuswahl`, dieselbe
 * Quelle wie im Exposé und im Investmentrechner). Er ist durch die
 * Zeilensicherheit schon auf die Kunden beschränkt, die der Nutzer sehen darf.
 * Die eigentliche Prüfung macht ohnehin die Datenbank beim Vormerken.
 *
 * Kommt die Seite mit `?empfehlung=<investmentId>`, sind Kunde und Investment
 * vorgewählt (Absprache mit der Empfehlungsliste). Neue Kunden werden hier
 * bewusst nicht angelegt.
 *
 * Seit dem 23.09.2026 gibt es denselben Dialog für ein ganzes Haus
 * (Globalobjekt), aufgerufen von der Objektseite ohne `wohnung`. Dann führt
 * „Weiter“ ins Formular im Modus „gesamtes Objekt“, und beim Absenden wird
 * das Haus vorgemerkt. Seine Einheiten werden nie einzeln reserviert
 * (Entscheidung vom 10.09.2026).
 */
export interface KundeZuordnenDialogProps {
  objekt: ObjektData;
  /** Die Einheit. Fehlt sie, geht es um das ganze Haus (nur beim Globalobjekt). */
  wohnung?: ObjektWohnung;
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  /** Aus `?empfehlung=`: Kunde und Investment sind dann vorgewählt. */
  vorgewaehltesInvestmentId?: string | null;
  /** Wer gerade wählt, für den Verlauf des Investments beim Ersetzen. */
  bearbeiterName?: string;
}

/** Punkt und Schrift je Ampel, aus den Farben des Projekts. */
const AMPEL_FARBE: Record<InvestmentAmpel, { punkt: string; text: string }> = {
  bereit: { punkt: "bg-[hsl(var(--success))]", text: "text-[hsl(var(--success))]" },
  selbstauskunft_fehlt: { punkt: "bg-[hsl(var(--warning))]", text: "text-[hsl(var(--warning))]" },
  hat_reservierung: { punkt: "bg-destructive", text: "text-destructive" },
  beendet: { punkt: "bg-muted-foreground", text: "text-muted-foreground" },
};

/** „WE 6“ und „6“ meinen dieselbe Wohnung, gespeichert wird die reine Zahl. */
function weZiffern(weNr: string): string {
  return weNr.replace(/^we[\s.:_-]*/i, "").trim();
}

export function KundeZuordnenDialog({
  objekt, wohnung, offen, onOpenChange, vorgewaehltesInvestmentId, bearbeiterName,
}: KundeZuordnenDialogProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const bereit = useCacheReady(["kontakte", "investments"]);
  const [suche, setSuche] = useState("");
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [investmentId, setInvestmentId] = useState<string | null>(null);

  // Der Zwischenspeicher füllt sich nach und nach; ohne Mitzählen bliebe die Liste leer.
  const [stand, setStand] = useState(0);
  useEffect(() => onCacheChange((tabelle) => {
    if (tabelle === "kontakte" || tabelle === "investments") setStand((n) => n + 1);
  }), []);

  /*
   * Die Vorwahl aus `?empfehlung=`. Sie greift beim Öffnen, sobald das
   * Investment im Zwischenspeicher steht. Ein unbekanntes Investment wählt
   * nichts vor, dann sucht man den Kunden wie sonst.
   */
  useEffect(() => {
    if (!offen || !vorgewaehltesInvestmentId || !bereit) return;
    const inv = getInvestmentById(vorgewaehltesInvestmentId);
    if (!inv) return;
    setKundeId(inv.kontaktId);
    setInvestmentId(inv.id);
  }, [offen, vorgewaehltesInvestmentId, bereit, stand]);

  const kunden = useMemo(() => {
    try {
      return kundenZurAuswahl();
    } catch {
      return [];
    }
  }, [stand, bereit]); // eslint-disable-line react-hooks/exhaustive-deps
  const gewaehlterKunde = kunden.find((k) => k.id === kundeId) || null;

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (s ? kunden.filter((k) => k.name.toLowerCase().includes(s)) : kunden).slice(0, 12);
  }, [kunden, suche]);

  const investments = useMemo(() => {
    if (!kundeId) return [];
    try {
      return getInvestmentsByKontakt(kundeId).map((inv) => ({ inv, ampel: investmentAmpel(inv.id) }));
    } catch {
      return [];
    }
  }, [kundeId, stand]); // eslint-disable-line react-hooks/exhaustive-deps

  const gewaehlt = investments.find((e) => e.inv.id === investmentId) || null;
  const weiterMoeglich = !!kundeId && gewaehlt?.ampel === "bereit";

  const kundeWaehlen = (id: string | null) => {
    setKundeId(id);
    setInvestmentId(null);
    setSuche("");
  };

  /** Das ganze Haus statt einer Einheit. */
  const hausModus = !wohnung;

  const weiter = async () => {
    if (!kundeId || !gewaehlt || gewaehlt.ampel !== "bereit") return;
    const invId = gewaehlt.inv.id;
    /*
     * Steht am Investment schon ein anderes, von Hand eingetragenes Objekt,
     * wird gefragt. Mit „Ersetzen“ wandert es in den Verlauf des Investments,
     * sonst stünde im Formular dessen Verkäufer oder Kaufpreis.
     *
     * Beim ganzen Haus zählt auch eine eingetragene Wohnung im selben Haus
     * als anderes Objekt: Das Investment gilt danach dem Haus und nicht mehr
     * einer Wohnung darin.
     */
    const neu = { strasse: objekt.adresse, plz: objekt.plz, ort: objekt.ort, weNr: wohnung ? weZiffern(wohnung.weNr) : "" };
    const vorher = vorhandeneObjektDaten(invId);
    const anderes = istAnderesObjekt(vorher, neu) || (hausModus && !!String(vorher?.weNr ?? "").trim());
    if (objektBereitsEingetragen(invId) && anderes) {
      const ersetzen = await confirmDialog({
        title: "Anderes Objekt am Investment ersetzen?",
        description:
          `An diesem Investment steht schon ${objektBezeichnung(vorher)}. `
          + `Es wird durch ${objektBezeichnung(neu)} ersetzt. Das bisherige Objekt wandert in den Verlauf des Investments.`,
        confirmText: "Ersetzen",
        cancelText: "Behalten",
      });
      if (!ersetzen) return;
      objektInVerlaufVerschieben(invId, { gewechseltVon: bearbeiterName });
    }

    const params = new URLSearchParams({
      kunde: kundeId,
      investmentId: invId,
      objektId: objekt.id,
      ...(wohnung ? { wohnungId: wohnung.id } : { gesamtobjekt: "1" }),
    });
    // Der Zurückknopf im Formular führt wieder auf diese Einheit beziehungsweise dieses Haus.
    params.set("zurueck", location.pathname + location.search);
    onOpenChange(false);
    navigate(`/reservierung?${params.toString()}`);
  };

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      {/* Über der Kopfleiste (`z-[60]`), wie die Objektauswahl und die Galerie. Die
          Rückfrage „Ersetzen?" liegt deshalb in `confirm.tsx` noch eine Ebene höher. */}
      <DialogContent className="z-[80] max-h-[86dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{hausModus ? "Haus für Kunden reservieren" : "Für Kunden reservieren"}</DialogTitle>
          {wohnung ? (
            <DialogDescription>
              Wohnung {weZiffern(wohnung.weNr)}, {objekt.adresse}. Wähle Kunde und Investment, danach öffnet sich die
              Reservierungsvereinbarung für genau diese Einheit. Beim Absenden wird die Einheit {VORMERKUNG_MINUTEN} Minuten
              für den Kunden vorgemerkt, reserviert ist sie erst mit seiner Unterschrift.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Das ganze Haus, {objekt.adresse}. Wähle Kunde und Investment, danach öffnet sich die
              Reservierungsvereinbarung für das gesamte Objekt. Beim Absenden wird das Haus {VORMERKUNG_MINUTEN} Minuten
              für den Kunden vorgemerkt, reserviert ist es erst mit seiner Unterschrift. Einzelne Einheiten daraus werden nicht reserviert.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="zuordnen-kunde">Kunde</Label>
            {gewaehlterKunde ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-accent px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /> <b>{gewaehlterKunde.name}</b></span>
                <Button type="button" variant="ghost" size="sm" onClick={() => kundeWaehlen(null)}>Anderer Kunde</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="zuordnen-kunde" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name suchen…" className="pl-8" autoComplete="off" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60">
                  {!bereit ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Kontakte werden geladen…</p>
                  ) : treffer.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{kunden.length === 0 ? "Keine Kontakte geladen." : "Kein Treffer."}</p>
                  ) : treffer.map((k) => (
                    <button key={k.id} type="button" onClick={() => kundeWaehlen(k.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span>{k.name}</span>
                    </button>
                  ))}
                </div>
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" /> Neue Kunden legst du hier nicht an, sondern unter
                  <Link to="/alle-kontakte?neu=1" className="font-medium text-primary hover:underline">„Neuen Kontakt anlegen“</Link>.
                </p>
              </>
            )}
          </div>

          {kundeId && (
            <div className="space-y-1.5">
              <Label>Investment</Label>
              {investments.length === 0 ? (
                <p className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                  Für diesen Kunden gibt es noch kein Investment. Lege es im{" "}
                  <Link to={`/kunden/${kundeId}`} className="font-medium text-primary hover:underline">Kundenprofil</Link> an.
                </p>
              ) : (
                <div role="radiogroup" aria-label="Investment" className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {investments.map(({ inv, ampel }) => {
                    const aktiv = inv.id === investmentId;
                    const farbe = AMPEL_FARBE[ampel];
                    return (
                      <button key={inv.id} type="button" role="radio" aria-checked={aktiv}
                        disabled={ampel !== "bereit"}
                        onClick={() => setInvestmentId(inv.id)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                          ampel === "bereit" ? "hover:bg-muted" : "cursor-not-allowed opacity-80",
                          aktiv && "bg-accent",
                        )}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium">{investmentBeschriftung(inv)}</span>
                          <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", farbe.text)}>
                            <span className={cn("h-2 w-2 rounded-full", farbe.punkt)} aria-hidden="true" />
                            {AMPEL_TEXT[ampel]}
                          </span>
                        </span>
                        {ampel !== "bereit" && <span className="text-xs text-muted-foreground">{AMPEL_ERKLAERUNG[ampel]}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/*
          Die Knöpfe kleben unten im Fenster (Befund vom 24.09.2026: auf dem
          Handy war „Weiter“ erst nach dem Wischen zu sehen). Das Fenster
          scrollt als Ganzes, siehe `DialogContent`; `sticky` hält die Leiste
          dabei am unteren Rand. Die negativen Ränder decken den Innenabstand
          des Fensters ab, damit darunter kein Inhalt durchscheint.
        */}
        <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 gap-2 border-t border-border/60 bg-card px-6 py-3 sm:gap-0" data-testid="zuordnen-knopfleiste">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button type="button" className="h-auto min-h-[44px] gap-1.5 whitespace-normal sm:min-h-0" onClick={() => void weiter()} disabled={!weiterMoeglich}>
            Weiter zur Reservierungsvereinbarung <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
