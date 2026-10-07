import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Copy, ExternalLink, Loader2, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { cn, formatDatum, formatDatumZeit } from "@/lib/utils";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { kopiereText } from "@/lib/textKopieren";
import { useOptionalUser } from "@/contexts/UserContext";
import { siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import {
  auftragZumErneutSenden,
  EXPOSE_VERSAND_MIGRATION_HINWEIS,
  exposeBezeichnungAusCache,
  exposeLinkStatus,
  kundenlinkArtName,
  kundenlinkDesEintrags,
  kundenlinkVorschauDesEintrags,
  ladeGesendeteExposes,
  sendeKundenExpose,
  wohnungDesLinks,
  zieheExposeZurueck,
  type GesendetesExpose,
} from "@/lib/objektExposeStore";

/*
 * „Gesendete Links“ eines Investments, in der Karte „Objektauswahl“.
 *
 * Seit dem 23.09.2026 landet jeder Kundenlink, der per Mail hinausgeht oder
 * kopiert wird, hier: Art (Objektübersicht oder Exposé), Wohnung, gesendet
 * am und von, gültig bis, Aufrufe und wann der Kunde ihn zuletzt geöffnet
 * hat. Gezählt wird ohne Cookie und ohne IP (siehe `get-expose` und
 * `get-kundenansicht`). Bei der Objektübersicht ist die Wohnung der
 * Einstieg, also die Wohnung, aus der zuletzt gesendet wurde.
 *
 * „Öffnen“ zeigt den Link so, wie der Kunde ihn sieht, zählt aber nicht mit
 * (`vorschau=1`), sonst meldete die Glocke den Partner selbst als Kunden.
 * „Erneut senden“ schickt denselben Link noch einmal, die Frist beginnt neu.
 * „Zurückziehen“ ist endgültig: Der Link zeigt danach nur noch einen Hinweis
 * mit den Kontaktdaten des Partners. Wer danach sendet, bekommt einen neuen.
 *
 * Eine Objektübersicht senden bis zu Christians Freigabe nur Admin und
 * Inhaber (die Function prüft das selbst). Alle anderen sehen an solchen
 * Zeilen deshalb nur Öffnen, Kopieren eines gültigen Links und Zurückziehen.
 *
 * Solange die Migration 20260923151000 fehlt oder noch nichts gesendet wurde,
 * zeichnet die Komponente nichts. Den Hinweis auf die Migration gibt dann der
 * Versand selbst.
 *
 * Seit dem 05.10.2026 kein eigener Kasten mehr, sondern ein einklappbarer
 * Link „Gesendete Links (N)“ direkt unter „Objektvorstellungsgespräch
 * vereinbaren“, standardmäßig zu. Die Objektauswahl war sonst schon vor dem
 * ersten Treffer sehr lang.
 */

interface GesendeteExposesProps {
  kontaktId: string;
  investmentId: string;
  /** Für die Rückfrage vor dem erneuten Senden. */
  kundeName?: string;
  /** Aufgeklappt beginnen. Im Profil zu, die Tests prüfen damit den Inhalt. */
  anfangsOffen?: boolean;
}

/*
 * Knopfgröße: auf dem Handy 40px hoch (Touchziel), ab sm wieder kompakt.
 */
const KNOPF = "h-10 gap-1 px-2 text-xs sm:h-8";

function ArtMarke({ e }: { e: GesendetesExpose }) {
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="kundenlink-art-marke">
      {kundenlinkArtName(e.art)}
    </Badge>
  );
}

function StatusMarke({ e }: { e: GesendetesExpose }) {
  const status = exposeLinkStatus(e);
  if (status === "zurueckgezogen") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Zurückgezogen</Badge>;
  if (status === "abgelaufen") return <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">Abgelaufen</Badge>;
  return <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">Aktiv</Badge>;
}

export function GesendeteExposes({ kontaktId, investmentId, kundeName, anfangsOffen = false }: GesendeteExposesProps) {
  const [offen, setOffen] = useState(anfangsOffen);
  const [eintraege, setEintraege] = useState<GesendetesExpose[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);
  const rolle = useOptionalUser()?.user?.role;
  const darfUebersichtSenden = siehtAdminOnlyNavigation(rolle);

  const laden = useCallback(async () => {
    const erg = await ladeGesendeteExposes(kontaktId, investmentId);
    setEintraege(erg.eintraege);
    // Ohne Migration bleibt es still, siehe Kopf.
    setFehler(erg.migrationFehlt ? "" : erg.fehler || "");
    setLaedt(false);
  }, [kontaktId, investmentId]);

  useEffect(() => {
    setLaedt(true);
    void laden();
  }, [laden]);

  const nutzer = loadAllUsers();
  const nameVon = (id: string | null) => (id ? nutzer.find((n) => n.id === id)?.name || "" : "");

  const oeffnen = (e: GesendetesExpose) => {
    window.open(kundenlinkVorschauDesEintrags(e), "_blank", "noopener");
  };

  /** Darf dieser Nutzer den Link über die Function neu hinausschicken? */
  const darfSenden = (e: GesendetesExpose) => e.art !== "objektuebersicht" || darfUebersichtSenden;

  /** Kopieren; klappt die Zwischenablage nicht, steht der Link zum Markieren da. */
  const inZwischenablage = async (link: string, bis?: string | null) => {
    const ergebnis = await kopiereText(link);
    if (ergebnis === "kopiert") {
      toast({ title: "Link kopiert", description: bis ? `Gültig bis ${formatDatum(bis)}.` : undefined });
      return;
    }
    await hinweisDialog({
      title: "Link zum Kopieren",
      description: <span className="select-all break-all font-mono text-xs">{link}</span>,
    });
  };

  const erneuern = async (e: GesendetesExpose, modus: "mail" | "link") => {
    setBeschaeftigt(e.id);
    // Dieselbe Art und dieselbe Wohnung: Die Function nimmt dieselbe Zeile und verlängert die Frist.
    const erg = await sendeKundenExpose(auftragZumErneutSenden(e, kontaktId, investmentId, modus));
    setBeschaeftigt(null);
    if (!erg.ok || !erg.link) {
      toast({
        title: modus === "mail" ? "Nicht gesendet" : "Kein Link erzeugt",
        // Bei fehlender Migration nennt `fehler` genau die, die fehlt.
        description: erg.fehler || "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return;
    }
    await laden();
    if (modus === "mail") {
      toast({ title: `${kundenlinkArtName(e.art)} erneut gesendet`, description: erg.gueltigBis ? `Der Link gilt bis ${formatDatum(erg.gueltigBis)}.` : undefined });
    } else {
      await inZwischenablage(erg.link, erg.gueltigBis);
    }
  };

  const linkKopieren = async (e: GesendetesExpose) => {
    // Ein gültiger Link wird einfach kopiert. Ein abgelaufener bekommt
    // vorher eine neue Frist, sonst kopierte man einen toten Link.
    if (exposeLinkStatus(e) === "aktiv") {
      await inZwischenablage(kundenlinkDesEintrags(e), e.gueltig_bis);
      return;
    }
    await erneuern(e, "link");
  };

  const erneutSenden = async (e: GesendetesExpose) => {
    const ja = await confirmDialog({
      title: `${kundenlinkArtName(e.art)} erneut senden?`,
      description: `${kundeName || "Der Kunde"} bekommt die Mail mit demselben Link noch einmal. Der Link gilt danach wieder 60 Tage.`,
      confirmText: "Erneut senden",
      cancelText: "Nicht senden",
    });
    if (!ja) return;
    await erneuern(e, "mail");
  };

  const zurueckziehen = async (e: GesendetesExpose) => {
    const ja = await confirmDialog({
      title: "Link zurückziehen?",
      description: `Der Kunde sieht über diesen Link danach nur noch einen Hinweis mit deinen Kontaktdaten, nicht mehr ${e.art === "objektuebersicht" ? "die Objektübersicht" : "das Exposé"}. Das lässt sich nicht rückgängig machen; wer danach sendet, bekommt einen neuen Link.`,
      confirmText: "Zurückziehen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ja) return;
    setBeschaeftigt(e.id);
    const erg = await zieheExposeZurueck(e.id);
    setBeschaeftigt(null);
    if (!erg.erfolg) {
      toast({
        title: "Nicht zurückgezogen",
        description: erg.migrationFehlt ? EXPOSE_VERSAND_MIGRATION_HINWEIS : erg.fehler || "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Link zurückgezogen" });
    await laden();
  };

  // Der Abbruch steht nach allen Hooks, React verlangt in jedem Durchlauf dieselben.
  if (laedt || (eintraege.length === 0 && !fehler)) return null;

  return (
    <div className="space-y-2" data-testid="gesendete-exposes">
      <button
        type="button"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", offen && "rotate-90")} />
        {/* Ohne geladene Einträge gibt es keine Zahl, dann nur der Name. */}
        Gesendete Links{fehler ? "" : ` (${eintraege.length})`}
      </button>
      {!offen ? null : fehler ? (
        <p className="text-xs text-muted-foreground">Die gesendeten Links konnten nicht geladen werden: {fehler}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {eintraege.map((e) => {
            const status = exposeLinkStatus(e);
            const von = nameVon(e.gesendet_von);
            const laeuft = beschaeftigt === e.id;
            const senden = darfSenden(e);
            // Kopieren eines abgelaufenen Links erneuert ihn über die Function, dafür braucht es das Senderecht.
            const kopieren = senden || status === "aktiv";
            return (
              // Umbrechende Reihe statt „sm:flex-row“: Die Karte steht oft in einer
              // schmalen Spalte, dort drückten die Knöpfe den Text sonst auf null.
              // Der Text will mindestens 16rem, sonst rutschen die Knöpfe darunter.
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-testid="gesendetes-expose">
                <div className="min-w-0 flex-[1_1_16rem]" data-testid="gesendetes-expose-text">
                  <span className="flex flex-wrap items-center gap-2">
                    <ArtMarke e={e} />
                    <span className="min-w-0 break-words text-sm font-semibold">{exposeBezeichnungAusCache(e.objekt_id, wohnungDesLinks(e))}</span>
                    <StatusMarke e={e} />
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {e.versandweg === "link" ? "Link erzeugt" : "Per Mail gesendet"} am {formatDatum(e.gesendet_am)}{von ? ` von ${von}` : ""}
                    {status !== "zurueckgezogen" && e.gueltig_bis ? ` · gültig bis ${formatDatum(e.gueltig_bis)}` : ""}
                    {status === "zurueckgezogen" && e.zurueckgezogen_am ? ` · zurückgezogen am ${formatDatum(e.zurueckgezogen_am)}` : ""}
                  </span>
                  <span className="block text-[11px] text-muted-foreground" data-testid="expose-aufrufe">
                    {e.aufrufe === 1 ? "1 Aufruf" : `${e.aufrufe} Aufrufe`}
                    {" · "}
                    {e.zuletzt_aufgerufen_am ? `zuletzt geöffnet ${formatDatumZeit(e.zuletzt_aufgerufen_am)}` : "noch nicht geöffnet"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap gap-1" data-testid="gesendetes-expose-knoepfe">
                  <Button size="sm" variant="ghost" className={KNOPF} onClick={() => oeffnen(e)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Öffnen
                  </Button>
                  {status !== "zurueckgezogen" && (
                    <>
                      {kopieren && (
                        <Button size="sm" variant="ghost" className={KNOPF} disabled={laeuft} onClick={() => void linkKopieren(e)}>
                          <Copy className="h-3.5 w-3.5" /> Link kopieren
                        </Button>
                      )}
                      {senden && (
                        <Button size="sm" variant="ghost" className={KNOPF} disabled={laeuft} onClick={() => void erneutSenden(e)}>
                          {laeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Erneut senden
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className={`${KNOPF} text-muted-foreground hover:text-destructive`} disabled={laeuft} onClick={() => void zurueckziehen(e)}>
                        <Undo2 className="h-3.5 w-3.5" /> Zurückziehen
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
