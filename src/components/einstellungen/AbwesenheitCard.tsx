import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Plane, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { loadAllUsers } from "@/lib/loadAllUsers";
import {
  ABWESENHEIT_MIGRATION,
  datumAnzeige,
  heutigesDatum,
  ladeAbwesenheiten,
  laeuftHeute,
  loescheAbwesenheit,
  speichereAbwesenheit,
  type Abwesenheit,
} from "@/lib/abwesenheitStore";

/**
 * Abwesenheit eintragen und eine Vertretung benennen.
 *
 * Wichtig fuer das Verstaendnis: Die Zustaendigkeit fuer die Leads wechselt
 * dabei NICHT. An ihr haengt die Provision. Die Vertretung bekommt waehrend
 * des Zeitraums Zugriff auf die Leads und deren Benachrichtigungen, mehr
 * nicht. Wer wirklich abgeben will, haengt den Lead wie bisher von Hand um.
 */

/**
 * Rollen, die als Vertretung in Frage kommen. Kunden, Tippgeber und Bewerber
 * sind bewusst nicht dabei, sie haben im CRM nichts zu vertreten. Die
 * Datenbank prueft dasselbe noch einmal, die Liste hier ist nur die Bequemlichkeit.
 */
const VERTRETUNG_ROLLEN = new Set([
  "inhaber", "admin", "vertriebsleiter", "vertriebspartner", "setterin",
  "backoffice", "objektpartner", "finanzierungspartner", "hausverwaltung",
  "buchhaltung", "marketing", "hr", "versicherungsexperte", "individuell",
]);

const LEER = { von: "", bis: "", vertretungId: "__keine__", notiz: "" };

export function AbwesenheitCard({ userId }: { userId: string }) {
  const [eintraege, setEintraege] = useState<Abwesenheit[]>([]);
  const [bereit, setBereit] = useState(false);
  const [migrationFehlt, setMigrationFehlt] = useState(false);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [formular, setFormular] = useState(LEER);
  /** Gesetzt, wenn ein vorhandener Eintrag bearbeitet wird. */
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const ergebnis = await ladeAbwesenheiten(userId);
    setEintraege(ergebnis.eintraege);
    setMigrationFehlt(ergebnis.migrationFehlt);
    setLadefehler(ergebnis.fehler);
    setBereit(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void laden();
  }, [userId, laden]);

  const moeglicheVertretungen = useMemo(() => {
    try {
      return loadAllUsers()
        .filter((u) => u.id !== userId && !!u.name)
        .filter((u) => (u.rollen || []).some((r) => VERTRETUNG_ROLLEN.has((r || "").toLowerCase())))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
    } catch {
      return [];
    }
  }, [userId]);

  const namen = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of moeglicheVertretungen) map.set(u.id, u.name);
    return map;
  }, [moeglicheVertretungen]);

  const zuruecksetzen = () => {
    setFormular(LEER);
    setBearbeiteId(null);
  };

  const bearbeiten = (eintrag: Abwesenheit) => {
    setBearbeiteId(eintrag.id);
    setFormular({
      von: eintrag.von,
      bis: eintrag.bis,
      vertretungId: eintrag.vertretung_id || "__keine__",
      notiz: eintrag.notiz || "",
    });
  };

  const speichern = async () => {
    if (!formular.von || !formular.bis) {
      toast.error("Bitte Beginn und Ende der Abwesenheit angeben.");
      return;
    }
    if (formular.bis < formular.von) {
      toast.error("Das Enddatum liegt vor dem Startdatum.");
      return;
    }
    setSpeichert(true);
    const ergebnis = await speichereAbwesenheit({
      id: bearbeiteId || undefined,
      userId,
      von: formular.von,
      bis: formular.bis,
      vertretungId: formular.vertretungId === "__keine__" ? null : formular.vertretungId,
      notiz: formular.notiz,
    });
    setSpeichert(false);
    if (!ergebnis.ok) {
      toast.error(ergebnis.meldung || "Speichern fehlgeschlagen.");
      return;
    }
    toast.success(bearbeiteId ? "Abwesenheit geändert." : "Abwesenheit eingetragen.");
    zuruecksetzen();
    void laden();
  };

  const entfernen = async (eintrag: Abwesenheit) => {
    const ergebnis = await loescheAbwesenheit(eintrag.id);
    if (!ergebnis.ok) {
      toast.error(ergebnis.meldung || "Löschen fehlgeschlagen.");
      return;
    }
    toast.success("Abwesenheit entfernt.");
    if (bearbeiteId === eintrag.id) zuruecksetzen();
    void laden();
  };

  if (!bereit) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Abwesenheiten werden geladen...
      </div>
    );
  }

  if (migrationFehlt) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Die Datenbank kennt die Abwesenheiten noch nicht. Dafür muss zuerst die Migration{" "}
          <code className="text-xs">{ABWESENHEIT_MIGRATION}</code> im Supabase-SQL-Editor ausgeführt werden.
          Bis dahin lässt sich hier nichts eintragen.
        </AlertDescription>
      </Alert>
    );
  }

  if (ladefehler) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Die Abwesenheiten konnten nicht geladen werden: {ladefehler}
        </AlertDescription>
      </Alert>
    );
  }

  const heute = heutigesDatum();

  return (
    <div className="space-y-6">
      {eintraege.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Du hast keine Abwesenheit eingetragen.
        </p>
      ) : (
        <div className="space-y-2">
          {eintraege.map((e) => {
            const aktiv = laeuftHeute(e, heute);
            const vertretungName = e.vertretung_id ? namen.get(e.vertretung_id) : null;
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {datumAnzeige(e.von)} bis {datumAnzeige(e.bis)}
                    </span>
                    {aktiv && (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
                        Läuft gerade
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.vertretung_id
                      ? `Vertretung: ${vertretungName || "unbekannter Nutzer"}`
                      : "Keine Vertretung eingetragen. Deine Leads bekommt in dieser Zeit niemand zu sehen."}
                  </p>
                  {e.notiz && <p className="text-xs text-muted-foreground">{e.notiz}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => bearbeiten(e)}>
                    Ändern
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Abwesenheit entfernen"
                    onClick={() => entfernen(e)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">
          {bearbeiteId ? "Abwesenheit ändern" : "Neue Abwesenheit"}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="abwesend-von">Von</Label>
            <Input
              id="abwesend-von"
              type="date"
              value={formular.von}
              onChange={(e) => setFormular((f) => ({ ...f, von: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="abwesend-bis">Bis</Label>
            <Input
              id="abwesend-bis"
              type="date"
              value={formular.bis}
              onChange={(e) => setFormular((f) => ({ ...f, bis: e.target.value }))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Beide Tage zählen mit.</p>

        <div className="space-y-1">
          <Label>Vertretung</Label>
          <Select
            value={formular.vertretungId}
            onValueChange={(v) => setFormular((f) => ({ ...f, vertretungId: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Person wählen..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__keine__">Keine Vertretung</SelectItem>
              {moeglicheVertretungen.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Die Vertretung sieht in diesem Zeitraum deine Leads und bekommt deren Benachrichtigungen.
            Zuständig für die Leads bleibst du, an der Provision ändert sich nichts.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="abwesend-notiz">Notiz (freiwillig)</Label>
          <Textarea
            id="abwesend-notiz"
            rows={2}
            placeholder="z. B. Urlaub, erreichbar per E-Mail"
            value={formular.notiz}
            onChange={(e) => setFormular((f) => ({ ...f, notiz: e.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2">
          {bearbeiteId && (
            <Button variant="outline" onClick={zuruecksetzen}>
              Abbrechen
            </Button>
          )}
          <Button onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bearbeiteId ? "Änderung speichern" : "Abwesenheit eintragen"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AbwesenheitCard;
