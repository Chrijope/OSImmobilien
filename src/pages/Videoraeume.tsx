import { cacheGet } from "@/lib/dataCache";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Video, Plus, Copy, Trash2, ArrowRight, Link2, Building2, MessageSquare, ShieldAlert,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import { entferneMeetingRaum } from "@/lib/meetingSpeichern";
import { addAktivitaet, getAktivitaeten, loescheAktivitaet } from "@/lib/aktivitaetenStore";
import { ladeBerater } from "@/lib/beraterProfil";
import { getUserSetting } from "@/lib/userSettingsCache";
import { STANDARD_AGENDA } from "@/lib/videoraumAgenda";
import {
  listMeineRaeume, erstelleRaum, loescheRaum, raumUrl,
  type Videoraum, type VideoraumArt,
} from "@/lib/videoraumStore";

/**
 * Uebersicht der eigenen Videoraeume.
 *
 * Bis zur Freigabe sehen nur admin und inhaber diese Seite. Die Sperre haengt zusaetzlich in der Datenbank: die Policy
 * "Videoraum anlegen" verlangt `is_admin_role`.
 */

/** Vorgabe der Gespraechsdauer, im Dialog aenderbar. */
const STANDARD_DAUER = 45;
const DAUER_AUSWAHL = [30, 45, 60, 90];


export default function Videoraeume() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [raeume, setRaeume] = useState<Videoraum[]>([]);
  const [seite, setSeite] = useState(0);
  const [beendet, setBeendet] = useState(false);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [laden, setLaden] = useState(true);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const [art, setArt] = useState<VideoraumArt>("beratung");
  const [titel, setTitel] = useState("");
  const [dauer, setDauer] = useState(STANDARD_DAUER);
  const [terminAt, setTerminAt] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [objektTitel, setObjektTitel] = useState("");
  const [objektOrt, setObjektOrt] = useState("");

  const { darf: darfSehen } = useVideocallFreigabe();

  const laderaeume = useCallback(async () => {
    setLaden(true);
    setLadeFehler(false);
    try { setRaeume(await listMeineRaeume(40, seite * 40, beendet)); }
    catch { setLadeFehler(true); }
    finally { setLaden(false); }
  }, [seite, beendet]);

  useEffect(() => {
    if (!darfSehen) { setLaden(false); return; }
    void laderaeume();
  }, [darfSehen, laderaeume]);

  const berater = useMemo(() => ladeBerater(), []);
  // Der Satz an den Kunden kommt aus den Videocall-Einstellungen.
  const videocallProfil = useMemo(
    () => ({ zitat: getUserSetting<{ zitat?: string } | null>("videocall", null)?.zitat }),
    [],
  );

  if (!darfSehen) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Noch nicht freigegeben</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Der eigene Videoraum wird gerade getestet und ist noch nicht für alle freigeschaltet.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  const anlegen = async () => {
    setSpeichert(true);
    const raum = await erstelleRaum({
      art,
      titel: titel.trim() || undefined,
      gastgeber: {
        name: berater.name,
        position: berater.position,
        telefon: berater.telefon,
        email: berater.email,
        bild: berater.bild ?? null,
        ...videocallProfil,
      },
      terminAt: terminAt ? new Date(terminAt).toISOString() : null,
      // Stand vorher fest auf 45 Minuten, obwohl der Kunde die Dauer im
      // Warteraum liest.
      dauerMinuten: dauer,
      agenda: STANDARD_AGENDA[art] ?? [],
      hinweis: hinweis.trim() || null,
      meta: art === "objektvorstellung"
        ? { objekt: { titel: objektTitel.trim() || null, ort: objektOrt.trim() || null } }
        : {},
    });
    setSpeichert(false);

    if (!raum) {
      toast.error("Der Raum konnte nicht angelegt werden.");
      return;
    }
    setDialogOffen(false);
    // Auch der Anlass und die Dauer gehen zurueck auf den Anfang. Sonst stand
    // beim naechsten Raum noch die Wahl von vorhin im Dialog.
    setArt("beratung"); setDauer(STANDARD_DAUER);
    setTitel(""); setTerminAt(""); setHinweis(""); setObjektTitel(""); setObjektOrt("");
    await laderaeume();
    void navigator.clipboard?.writeText(raumUrl(raum.token)).then(
      () => toast.success("Raum angelegt, Link ist kopiert."),
      () => toast.success("Raum angelegt."),
    );
  };

  const kopiere = async (raum: Videoraum) => {
    try {
      await navigator.clipboard.writeText(raumUrl(raum.token));
      toast.success("Link kopiert.");
    } catch {
      toast.error("Der Link konnte nicht kopiert werden.");
    }
  };

  const entfernen = async (raum: Videoraum) => {
    const ok = await confirmDialog({
      title: "Raum löschen?",
      description: "Der Link funktioniert danach nicht mehr. Ein bereits eingeladener Kunde kommt damit nicht mehr in den Raum.",
      confirmText: "Löschen",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await entferneMeetingRaum(raum.id);
      toast.success("Raum und verknüpfter Termin entfernt.");
      await laderaeume();
    } catch {
      toast.error("Nicht gelöscht. Bitte erneut versuchen; Buchung, Raum und Aufgaben bleiben zusammen erhalten.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <PageHeader
        title="Meine Gespräche"
        subtitle="Alle deine Videogespräche an einem Ort. Für freigegebene Mitarbeitende."
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="brand" onClick={() => setDialogOffen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Spontanen Raum anlegen
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Für ein Gespräch ohne Termin, zum Beispiel wenn der Kunde gerade am Telefon ist.
            Räume für gebuchte Termine und Meetings entstehen automatisch.
          </TooltipContent>
        </Tooltip>
      </PageHeader>

      <Card className="border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex gap-3">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Räume entstehen von selbst</p>
            <p className="mt-1">
              Sobald ein Kunde über den Buchungskalender bucht oder du im Kundenprofil ein Meeting
              anlegst, entsteht der Videoraum automatisch. Hier siehst du alle Gespräche, kopierst den
              Link für den Kunden und betrittst den Raum. Von Hand anlegen brauchst du einen Raum nur
              für spontane Gespräche ohne Termin.
            </p>
            <p className="mt-2">
              Aufräumen musst du hier nichts. Ein Gespräch, dessen Termin vorbei ist, wandert über
              Nacht von selbst nach „Beendet“. Dort bleibt es mitsamt Notiz und Link erreichbar und
              lässt sich im Raum jederzeit wieder öffnen.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={!beendet ? "default" : "outline"} aria-pressed={!beendet} onClick={() => { setBeendet(false); setSeite(0); }}>Geplant & laufend</Button>
        <Button variant={beendet ? "default" : "outline"} aria-pressed={beendet} onClick={() => { setBeendet(true); setSeite(0); }}>Beendet</Button>
        <Button variant="outline" disabled={seite === 0 || laden} onClick={() => setSeite((n) => n - 1)}>Zurück</Button>
        <span className="text-xs">Seite {seite + 1}</span>
        <Button variant="outline" disabled={raeume.length < 40 || laden} onClick={() => setSeite((n) => n + 1)}>Weitere Gespräche</Button>
      </div>
      {ladeFehler && <p role="alert" className="text-sm text-destructive">Gespräche konnten nicht geladen werden. <Button variant="outline" size="sm" onClick={() => void laderaeume()}>Erneut laden</Button></p>}
      {laden ? (
        <p className="text-sm text-muted-foreground">Räume werden geladen…</p>
      ) : raeume.length === 0 ? (
        <Card className="p-10 text-center">
          <Video className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-4 font-semibold">Noch keine Gespräche</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Sobald ein Kunde einen Termin bucht oder du ein Meeting anlegst, erscheint der Raum hier
            von selbst. Ein Raum ist ein Link, den der Kunde ohne Konto und ohne Programm öffnet.
          </p>
          <Button variant="brand" onClick={() => setDialogOffen(true)} className="mt-5 gap-2">
            <Plus className="h-4 w-4" /> Spontanen Raum anlegen
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {raeume.map((raum) => (
            <Card key={raum.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {raum.art === "objektvorstellung" ? <Building2 className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {raum.titel || (raum.art === "objektvorstellung" ? "Objektvorstellung" : "Beratungsgespräch")}
                  </span>
                  <Badge variant={raum.status === "beendet" ? "secondary" : "outline"} className="text-[10px]">
                    {raum.status === "beendet" ? "beendet" : raum.status === "laufend" ? "läuft" : "offen"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {raum.termin_at
                    ? new Date(raum.termin_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
                    : "ohne festen Termin"}
                  {raum.kontakt_id && (() => { const k = cacheGet<{id:string;vorname?:string;nachname?:string}>("kontakte").find((k) => k.id === raum.kontakt_id); return k ? ` · ${k.vorname || ""} ${k.nachname || ""}` : ""; })()}
                  {" · "}
                  {raum.dauer_minuten} Minuten
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void kopiere(raum)}>
                  <Copy className="h-3.5 w-3.5" /> Link
                </Button>
                {/*
                  Orange, obwohl der Knopf je Raumzeile einmal vorkommt: Das
                  Betreten ist die Handlung, fuer die diese Seite ueberhaupt
                  geoeffnet wird. Kopieren und Loeschen daneben bleiben leise.
                */}
                <Button variant="brand" size="sm" className="gap-1.5" onClick={() => navigate(`/videocall/raum/${raum.id}`)}>
                  Betreten <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void entfernen(raum)} aria-label="Raum löschen">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Spontanen Raum anlegen</DialogTitle>
            <DialogDescription>
              Für ein Gespräch ohne gebuchten Termin. Der Anlass bestimmt, was der Kunde im
              Warteraum sieht.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {/* "Bewerbergespräch" steht hier für den Fall, dass ein Termin
                  von Hand entsteht. Der Regelweg ist die Selbstbuchung des
                  Bewerbers am Ende seines Kennenlernens. */}
              {([["erstgespraech", "Erstgespräch"], ["beratung", "Beratungsgespräch"], ["objektvorstellung", "Objektvorstellung"], ["bewerbergespraech", "Bewerbergespräch"]] as const).map(([wert, beschriftung]) => (
                <button
                  key={wert}
                  type="button"
                  aria-pressed={art === wert}
                  onClick={() => setArt(wert)}
                  className={`rounded-xl border p-3 text-left text-sm transition-colors ${art === wert ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="font-medium">{beschriftung}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {wert === "objektvorstellung" ? "Warteraum mit dem Objekt" : "Warteraum mit Agenda"}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="raum-titel">Titel (optional)</Label>
              <Input
                id="raum-titel"
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                placeholder={art === "objektvorstellung" ? "Objektvorstellung Familie Brandl" : "Beratungsgespräch Familie Brandl"}
                className="mt-1.5"
              />
            </div>

            {art === "objektvorstellung" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="objekt-titel">Objekt</Label>
                  <Input id="objekt-titel" value={objektTitel} onChange={(e) => setObjektTitel(e.target.value)} placeholder="3-Zimmer-Wohnung, Neubau" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="objekt-ort">Ort</Label>
                  <Input id="objekt-ort" value={objektOrt} onChange={(e) => setObjektOrt(e.target.value)} placeholder="Leipzig" className="mt-1.5" />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="raum-termin">Termin (optional)</Label>
                <Input id="raum-termin" type="datetime-local" value={terminAt} onChange={(e) => setTerminAt(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Dauer</Label>
                <div className="mt-1.5 flex gap-2">
                  {DAUER_AUSWAHL.map((minuten) => (
                    <button
                      key={minuten}
                      type="button"
                      onClick={() => setDauer(minuten)}
                      aria-pressed={dauer === minuten}
                      className={`flex-1 rounded-xl border px-2 py-2 text-sm transition-colors ${dauer === minuten ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"}`}
                    >
                      {minuten} Min.
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Steht im Warteraum des Kunden.</p>
              </div>
            </div>

            <div>
              <Label htmlFor="raum-hinweis">Hinweis für den Warteraum (optional)</Label>
              <Textarea
                id="raum-hinweis"
                value={hinweis}
                onChange={(e) => setHinweis(e.target.value)}
                rows={2}
                placeholder="Falls zur Hand: deine letzte Gehaltsabrechnung."
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
            <Button onClick={() => void anlegen()} disabled={speichert}>
              {speichert ? "Wird angelegt…" : "Anlegen und Link kopieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
