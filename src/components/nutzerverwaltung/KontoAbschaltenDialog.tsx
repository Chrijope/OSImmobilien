import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { cacheRefreshTable } from "@/lib/dataCache";
import { reassignBeraterBulk, releaseBeraterToPoolBulk } from "@/lib/beraterHistorie";
import { logAudit } from "@/lib/auditLog";

/**
 * Pflichtschritt beim Abschalten eines Kontos.
 *
 * Wer ein Konto sperrt oder löscht, muss im selben Zug entscheiden, was mit
 * dessen Leads geschieht. Ohne Entscheidung geht das Abschalten nicht durch.
 * Der Grund: Die Sichtbarkeit eines Leads hängt an `kontakte.zustaendig_id`.
 * Bleibt sie auf einem abgeschalteten Konto stehen, sieht den Lead niemand
 * mehr, und gemeldet wird das frühestens von der Nachtprüfung.
 *
 * Reihenfolge der Ausführung ist Absicht: erst die Leads, dann das Konto.
 * Scheitert der zweite Schritt, sind die Leads umgehängt und das Konto ist
 * noch aktiv. Das ist sichtbar und reparierbar. Andersherum wäre das Konto
 * aus und die Leads lägen unsichtbar herum, also genau der Zustand, den
 * dieser Dialog verhindern soll.
 */

/** Rollen, an die Leads übergeben werden dürfen. */
const UEBERNAHME_ROLLEN = new Set([
  "inhaber", "admin", "vertriebsleiter", "vertriebspartner", "setterin", "backoffice",
]);

export interface AbschaltNutzer {
  id: string;
  name: string;
  email: string;
}

type Entscheidung = "" | "umhaengen" | "pool";

export function KontoAbschaltenDialog({
  nutzer,
  modus,
  open,
  onOpenChange,
  onAusfuehren,
  onFertig,
}: {
  nutzer: AbschaltNutzer | null;
  /** "sperren" setzt profiles.gesperrt, "loeschen" entfernt das Konto ganz. */
  modus: "sperren" | "loeschen";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Führt die eigentliche Kontoaktion aus. Wirft bei Fehlschlag. */
  onAusfuehren: (grund: string) => Promise<void>;
  onFertig: () => void;
}) {
  const { user, authUser } = useUser();
  const [anzahlLeads, setAnzahlLeads] = useState<number | null>(null);
  const [zaehlfehler, setZaehlfehler] = useState<string | null>(null);
  const [entscheidung, setEntscheidung] = useState<Entscheidung>("");
  const [zielId, setZielId] = useState("");
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const zaehlen = useCallback(async () => {
    if (!nutzer) return;
    setAnzahlLeads(null);
    setZaehlfehler(null);
    // Direkt gezählt statt aus dem Zwischenspeicher: Vor einer nicht ohne
    // Weiteres umkehrbaren Aktion soll die Zahl aus der Datenbank kommen und
    // nicht aus einem womöglich veralteten Abbild.
    const { count, error } = await supabase
      .from("kontakte")
      .select("id", { count: "exact", head: true })
      .eq("zustaendig_id", nutzer.id)
      .or("geloescht.is.null,geloescht.eq.false");
    if (error) {
      setZaehlfehler(error.message);
      return;
    }
    setAnzahlLeads(count ?? 0);
  }, [nutzer]);

  useEffect(() => {
    if (!open) return;
    setEntscheidung("");
    setZielId("");
    setGrund("");
    void zaehlen();
  }, [open, zaehlen]);

  const moeglicheZiele = useMemo(() => {
    if (!nutzer) return [];
    try {
      return loadAllUsers()
        .filter((u) => u.id !== nutzer.id && !!u.name)
        .filter((u) => (u.rollen || []).some((r) => UEBERNAHME_ROLLEN.has((r || "").toLowerCase())))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
    } catch {
      return [];
    }
  }, [nutzer]);

  const hatLeads = (anzahlLeads ?? 0) > 0;
  const entscheidungVollstaendig =
    !hatLeads || entscheidung === "pool" || (entscheidung === "umhaengen" && !!zielId);
  const kannAusfuehren =
    !!nutzer && anzahlLeads !== null && !zaehlfehler && entscheidungVollstaendig && !laeuft;

  const ausfuehren = async () => {
    if (!nutzer || !kannAusfuehren) return;
    setLaeuft(true);
    try {
      let umgehaengt = 0;
      let zielName = "";

      if (hatLeads) {
        const { data, error } = await supabase
          .from("kontakte")
          .select("id")
          .eq("zustaendig_id", nutzer.id)
          .or("geloescht.is.null,geloescht.eq.false");
        if (error) throw new Error(`Die Leads konnten nicht gelesen werden: ${error.message}`);
        const ids = (data || []).map((k) => k.id);

        if (entscheidung === "umhaengen") {
          zielName = moeglicheZiele.find((u) => u.id === zielId)?.name || "";
          if (!zielName) throw new Error("Die gewählte Person hat keinen Namen im Profil.");
          // Der Grund steht hier fest und wird nicht erfragt: Das Konto wird
          // gerade abgeschaltet, das ist der Grund. Der übernehmende Partner
          // liest ihn in der Glocke und am Kontakt.
          umgehaengt = reassignBeraterBulk(ids, zielName, {
            zielId,
            changedById: authUser?.id,
            changedByName: user?.name,
            changedByRole: user?.role,
            grund: {
              key: "ausgeschieden",
              text: `Konto von ${nutzer.name} wurde ${modus === "loeschen" ? "gelöscht" : "gesperrt"}.`,
            },
          });
        } else {
          umgehaengt = releaseBeraterToPoolBulk(ids, {
            changedById: authUser?.id,
            changedByName: user?.name,
          });
        }

        // Die Schreibvorgänge laufen über den Zwischenspeicher und sind nicht
        // abwartbar. Deshalb kurz warten und danach in der Datenbank
        // nachsehen, statt dem eigenen Abbild zu glauben.
        await new Promise((r) => setTimeout(r, 1200));
        const { count: rest, error: restFehler } = await supabase
          .from("kontakte")
          .select("id", { count: "exact", head: true })
          .eq("zustaendig_id", nutzer.id)
          .or("geloescht.is.null,geloescht.eq.false");
        if (restFehler) throw new Error(`Die Übergabe ließ sich nicht prüfen: ${restFehler.message}`);
        if ((rest ?? 0) > 0) {
          throw new Error(
            `${rest} Lead(s) hängen weiterhin an diesem Konto. Das Konto bleibt deshalb aktiv. Bitte erneut versuchen.`,
          );
        }
      }

      await onAusfuehren(grund.trim());

      await logAudit({
        action: modus === "sperren" ? "konto_gesperrt" : "konto_geloescht",
        entity: "profiles",
        entityId: nutzer.id,
        meta: {
          name: nutzer.name,
          email: nutzer.email,
          leads: anzahlLeads ?? 0,
          leadsUmgehaengt: umgehaengt,
          entscheidung: hatLeads ? entscheidung : "keine_leads",
          zielId: entscheidung === "umhaengen" ? zielId : null,
          zielName: entscheidung === "umhaengen" ? zielName : null,
          grund: grund.trim() || null,
        },
      });

      void cacheRefreshTable("kontakte");
      toast.success(
        hatLeads
          ? `${nutzer.name}: Konto ${modus === "sperren" ? "gesperrt" : "gelöscht"}, ${umgehaengt} Lead(s) ${
              entscheidung === "umhaengen" ? `an ${zielName} übergeben` : "zurück in den offenen Pool gelegt"
            }.`
          : `${nutzer.name}: Konto ${modus === "sperren" ? "gesperrt" : "gelöscht"}. Es hingen keine Leads daran.`,
      );
      onOpenChange(false);
      onFertig();
    } catch (fehler: unknown) {
      const text = fehler instanceof Error ? fehler.message : String(fehler);
      toast.error(text || "Die Aktion ist fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  };

  const titel = modus === "sperren" ? "Konto sperren" : "Konto endgültig löschen";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!laeuft) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription>
            {nutzer ? `${nutzer.name} (${nutzer.email})` : ""}
            {modus === "sperren"
              ? " kann sich danach nicht mehr anmelden. Die Daten bleiben erhalten und die Sperre lässt sich wieder aufheben."
              : " wird mit allen Rollen, Einstellungen, Sessions und Benachrichtigungen unwiderruflich entfernt."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {anzahlLeads === null && !zaehlfehler && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Leads werden gezählt...
            </div>
          )}

          {zaehlfehler && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Die Leads dieses Kontos konnten nicht gezählt werden: {zaehlfehler}. Solange das nicht
                geht, wird das Konto nicht abgeschaltet.
              </AlertDescription>
            </Alert>
          )}

          {anzahlLeads !== null && !hatLeads && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> An diesem Konto hängt kein Lead. Es ist nichts zu übergeben.
            </p>
          )}

          {hatLeads && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  {anzahlLeads} Lead{anzahlLeads === 1 ? "" : "s"} hängen an diesem Konto.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bitte entscheide, was damit geschieht. Ohne Entscheidung wären die Leads danach für
                  niemanden mehr sichtbar.
                </p>
              </div>

              <RadioGroup
                value={entscheidung}
                onValueChange={(v) => setEntscheidung(v as Entscheidung)}
                className="space-y-2"
              >
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="umhaengen" id="entscheidung-umhaengen" className="mt-0.5" />
                  <div className="space-y-2 flex-1 min-w-0">
                    <Label htmlFor="entscheidung-umhaengen" className="text-sm font-medium">
                      An eine andere Person übergeben
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Die Person wird zuständig und benachrichtigt. Der Wechsel steht in der
                      Betreuer-Historie jedes Leads.
                    </p>
                    {entscheidung === "umhaengen" && (
                      <Select value={zielId} onValueChange={setZielId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Person wählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {moeglicheZiele.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="pool" id="entscheidung-pool" className="mt-0.5" />
                  <div className="space-y-1">
                    <Label htmlFor="entscheidung-pool" className="text-sm font-medium">
                      Zurück in den offenen Pool
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Zuständigkeit und Betreuername werden geleert. Die Nachtprüfung meldet Leads, die
                      danach länger als drei Tage im Pool liegen bleiben.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {modus === "sperren" && (
            <div className="space-y-1">
              <Label htmlFor="sperr-grund">Grund (wird der Person beim Anmelden angezeigt)</Label>
              <Textarea
                id="sperr-grund"
                rows={2}
                placeholder="z. B. Zusammenarbeit beendet zum 31.08."
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laeuft}>
            Abbrechen
          </Button>
          <Button
            onClick={ausfuehren}
            disabled={!kannAusfuehren}
            className={modus === "loeschen" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {modus === "sperren"
              ? hatLeads ? "Leads übergeben und sperren" : "Konto sperren"
              : hatLeads ? "Leads übergeben und löschen" : "Konto löschen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KontoAbschaltenDialog;
