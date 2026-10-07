import { TechnikProbe } from "@/components/videoraum/TechnikProbe";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldAlert, Info, Camera, Loader2, Trash2, Upload, Check } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import {
  ladeVideocallProfilSicher, speichereVideocallProfil, normalisiereHintergrund,
  type HintergrundWahl,
} from "@/lib/videocallEinstellungen";
import { kannLautsprecherWaehlen, listeGeraete, type GeraeteListe } from "@/lib/videocallGeraete";
import { ladeSegmentierungVor } from "@/lib/videocallHintergrund";
import {
  listeHintergrundBilder, hintergrundBildUrl, ladeHintergrundBildHoch,
  loescheHintergrundBild,
} from "@/lib/videocallHintergrundStore";

/**
 * Einstellungen rund um den eigenen Videoraum.
 *
 * Hier steht, was der Kunde im Warteraum ueber seinen Ansprechpartner liest,
 * dazu die Geraetewahl, die Vorgaben beim Beitritt und der Video-Hintergrund.
 * Alles landet im userSetting "videocall" und gilt beim naechsten Gespraech.
 * Alles zum Kalender liegt unter Einstellungen, Kalender, damit es nicht zwei
 * Stellen fuer dieselbe Sache gibt.
 */

import type { VideocallProfil } from "@/lib/videocallEinstellungen";

interface BildEintrag {
  pfad: string;
  name: string;
  url: string | null;
}

function GeraeteAuswahl({
  label,
  wert,
  geraete,
  aufWechsel,
}: {
  label: string;
  wert?: string;
  geraete: MediaDeviceInfo[];
  aufWechsel: (id: string | undefined) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        aria-label={label}
        value={wert && geraete.some((g) => g.deviceId === wert) ? wert : ""}
        onChange={(e) => aufWechsel(e.target.value || undefined)}
        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Standard des Browsers</option>
        {geraete.map((g, i) => (
          <option key={g.deviceId} value={g.deviceId}>{g.label || `${label} ${i + 1}`}</option>
        ))}
      </select>
    </div>
  );
}

export default function VideocallEinstellungen() {
  const { user } = useUser();
  const { darf: darfSehen } = useVideocallFreigabe();

  const [zitat, setZitat] = useState("");
  const [profilFehler, setProfilFehler] = useState<Partial<VideocallProfil> | null>(null);
  const [profilSpeichert, setProfilSpeichert] = useState(false);
  const sichereProfil = async (patch: Partial<VideocallProfil>) => {
    setProfilSpeichert(true);
    const gesamt = { ...profilFehler, ...patch };
    const ok = await speichereVideocallProfil(gesamt);
    setProfilFehler((bisher) => ok ? null : { ...bisher, ...gesamt });
    setProfilSpeichert(false);
    return ok;
  };
  const [gespeichert, setGespeichert] = useState(true);
  const [kameraId, setKameraId] = useState<string | undefined>(undefined);
  const [mikrofonId, setMikrofonId] = useState<string | undefined>(undefined);
  const [lautsprecherId, setLautsprecherId] = useState<string | undefined>(undefined);
  const [beitrittStumm, setBeitrittStumm] = useState(false);
  const [beitrittOhneKamera, setBeitrittOhneKamera] = useState(false);
  const [spiegeln, setSpiegeln] = useState(true);
  const [hintergrund, setHintergrund] = useState<HintergrundWahl>({ art: "aus" });

  const [geraete, setGeraete] = useState<GeraeteListe>({ kameras: [], mikrofone: [], lautsprecher: [] });
  const [geraeteGeladen, setGeraeteGeladen] = useState(false);
  const [erkennt, setErkennt] = useState(false);

  const [bilder, setBilder] = useState<BildEintrag[]>([]);
  const [bucketFehlt, setBucketFehlt] = useState(false);
  const [laedtHoch, setLaedtHoch] = useState(false);
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  /*
   * Erst lesen, wenn die Einstellungen wirklich da sind. Ohne das zeigte die
   * Seite bei einem Direktaufruf die Vorgaben, also "Kein Hintergrund", auch
   * wenn laengst ein Bild gewaehlt war.
   */
  useEffect(() => {
    let aktiv = true;
    void ladeVideocallProfilSicher().then((profil) => {
      if (!aktiv) return;
      setZitat(profil.zitat ?? "");
      setKameraId(profil.kameraId);
      setMikrofonId(profil.mikrofonId);
      setLautsprecherId(profil.lautsprecherId);
      setBeitrittStumm(profil.beitrittStumm);
      setBeitrittOhneKamera(profil.beitrittOhneKamera);
      setSpiegeln(profil.spiegeln);
      setHintergrund(normalisiereHintergrund(profil.hintergrund));
    });
    return () => { aktiv = false; };
  }, []);


  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => { if (!gespeichert) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [gespeichert]);

  const ladeBilder = useCallback(async () => {
    const ergebnis = await listeHintergrundBilder();
    setBucketFehlt(ergebnis.bucketFehlt);
    const mitUrl = await Promise.all(
      ergebnis.bilder.map(async (b) => ({ ...b, url: await hintergrundBildUrl(b.pfad) })),
    );
    setBilder(mitUrl);
  }, []);

  useEffect(() => {
    if (!darfSehen) return;
    void listeGeraete().then((liste) => {
      setGeraete(liste);
      setGeraeteGeladen(true);
    });
    void ladeBilder();
    /*
     * Auf dieser Seite steht die Auswahl des Hintergrunds, also wird das
     * Modell hier schon geholt. Sonst wartet der erste Klick darauf, und in
     * der Messung waren das bei 16 Mbit sechs Sekunden. Wer die Seite nicht
     * sehen darf, laedt nichts, deshalb steht es hinter `darfSehen`.
     */
    void ladeSegmentierungVor().catch(() => { /* faellt beim Klick erneut an */ });
  }, [darfSehen, ladeBilder]);

  /**
   * Ohne erteilte Freigabe liefert der Browser die Geraete ohne Namen. Der
   * Knopf holt einmal kurz Kamera und Mikrofon, stoppt sie sofort wieder und
   * liest die Liste danach mit Namen neu.
   */
  const erkenneGeraete = async () => {
    setErkennt(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((s) => s.stop());
      setGeraete(await listeGeraete());
    } catch {
      toast.error("Der Zugriff auf Kamera und Mikrofon wurde nicht erlaubt.");
    } finally {
      setErkennt(false);
    }
  };

  if (!darfSehen) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Noch nicht freigegeben</h2>
          <p className="mt-2 text-sm text-muted-foreground">Der eigene Videoraum wird gerade getestet und ist noch nicht für alle freigeschaltet.</p>
        </Card>
      </DashboardLayout>
    );
  }

  const speichern = async () => {
    if (!await sichereProfil({ zitat: zitat.trim() || undefined })) return;
    setGespeichert(true);
    toast.success("Gespeichert.");
  };

  const hatBenannteGeraete = geraete.kameras.some((g) => g.label) || geraete.mikrofone.some((g) => g.label);

  /*
   * Ein frisch hochgeladenes Bild wird sofort der gewaehlte Hintergrund.
   *
   * Vorher landete es nur in der Kachelreihe und blieb wirkungslos, bis
   * jemand es zusaetzlich anklickte. Die Meldung sagte "Bild hochgeladen",
   * und das Gespraech lief danach trotzdem ohne Hintergrund: Christian hat
   * genau das am 14.09.2026 gemeldet. Wer ein Hintergrundbild hochlaedt, will
   * es benutzen, sonst haette er es nicht hochgeladen. Umstellen laesst es
   * sich mit einem Klick, hier wie im laufenden Gespraech.
   */
  const hochladen = async (datei: File) => {
    setLaedtHoch(true);
    try {
      const ergebnis = await ladeHintergrundBildHoch(datei);
      if (ergebnis.bucketFehlt) setBucketFehlt(true);
      if (ergebnis.fehler) {
        toast.error(ergebnis.fehler);
        return;
      }
      await ladeBilder();
      if (ergebnis.bild) {
        waehleHintergrund({ art: "bild", bildPfad: ergebnis.bild.pfad });
        toast.success("Bild hochgeladen und als Hintergrund gewählt.");
      } else {
        toast.success("Bild hochgeladen.");
      }
    } finally {
      setLaedtHoch(false);
    }
  };

  const loeschen = async (pfad: string) => {
    if (!await loescheHintergrundBild(pfad)) {
      toast.error("Das Bild konnte nicht gelöscht werden.");
      return;
    }
    // Zeigt die Wahl auf das geloeschte Bild, faellt sie auf "aus" zurueck.
    if (hintergrund.art === "bild" && hintergrund.bildPfad === pfad) {
      setHintergrund({ art: "aus" });
      sichereProfil({ hintergrund: { art: "aus" } });
    }
    setBilder((alt) => alt.filter((b) => b.pfad !== pfad));
  };

  const waehleHintergrund = (wahl: HintergrundWahl) => {
    setHintergrund(wahl);
    sichereProfil({ hintergrund: wahl });
  };

  const pille = (aktiv: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      aktiv ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
    }`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <PageHeader
        title="Videocall-Einstellungen"
        subtitle="Dein Auftritt, deine Geräte und dein Hintergrund im Videoraum."
      >
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] uppercase tracking-wide text-primary">
          Persönlich
        </Badge>
      </PageHeader>

      {profilSpeichert && <p role="status" className="text-sm text-muted-foreground">Einstellung wird gespeichert…</p>}
      {profilFehler && <div role="alert" className="rounded-xl border border-destructive p-3 text-sm">Änderung noch nicht gespeichert. <Button variant="outline" size="sm" onClick={() => void sichereProfil(profilFehler)}>Erneut speichern</Button></div>}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Dein Auftritt im Warteraum</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Name, Position, Bild, E-Mail und Telefon kommen aus deinem Profil unter Einstellungen.
          Hier legst du nur fest, was der Kunde zusätzlich im Warteraum liest.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="videocall-zitat">Ein Satz an den Kunden</Label>
            <Textarea
              id="videocall-zitat"
              value={zitat}
              onChange={(e) => { setZitat(e.target.value); setGespeichert(false); }}
              rows={3}
              placeholder="Ich begleite dich von der ersten Einschätzung bis zur Übergabe. Ohne Verkaufsdruck."
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Der Satz steht im Warteraum unter deinem Namen und nimmt dem Kunden die Anspannung,
              bevor das Gespräch überhaupt beginnt. Leer lassen geht auch.
            </p>
          </div>

          <Button onClick={speichern} disabled={gespeichert}>
            {gespeichert ? "Gespeichert" : "Speichern"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Geräte</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Welche Kamera, welches Mikrofon und welcher Lautsprecher im Gespräch verwendet werden.
          Fehlt das Gerät später, greift automatisch der Standard des Browsers. Im Gespräch lässt
          sich jederzeit über den Knopf „Geräte" umschalten.
        </p>

        {!hatBenannteGeraete && (
          <div className="mt-4">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void erkenneGeraete()} disabled={erkennt}>
              {erkennt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Geräte erkennen
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Der Browser zeigt die Gerätenamen erst nach einer kurzen Freigabe von Kamera und Mikrofon.
            </p>
          </div>
        )}

        {geraeteGeladen && hatBenannteGeraete && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <GeraeteAuswahl
              label="Kamera"
              wert={kameraId}
              geraete={geraete.kameras}
              aufWechsel={(id) => { setKameraId(id); sichereProfil({ kameraId: id }); }}
            />
            <GeraeteAuswahl
              label="Mikrofon"
              wert={mikrofonId}
              geraete={geraete.mikrofone}
              aufWechsel={(id) => { setMikrofonId(id); sichereProfil({ mikrofonId: id }); }}
            />
            {kannLautsprecherWaehlen() && (
              <GeraeteAuswahl
                label="Lautsprecher"
                wert={lautsprecherId}
                geraete={geraete.lautsprecher}
                aufWechsel={(id) => { setLautsprecherId(id); sichereProfil({ lautsprecherId: id }); }}
              />
            )}
          </div>
        )}
      </Card>

      <TechnikProbe kameraId={kameraId} mikrofonId={mikrofonId} lautsprecherId={lautsprecherId} spiegeln={spiegeln} hintergrund={hintergrund} />

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Gesprächsbeginn</h2>
        <div className="mt-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="beitritt-stumm">Mit stummem Mikrofon beitreten</Label>
              <p className="text-xs text-muted-foreground">Du kannst das Mikrofon im Gespräch jederzeit einschalten.</p>
            </div>
            <Switch
              className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
              id="beitritt-stumm"
              checked={beitrittStumm}
              onCheckedChange={(an) => { setBeitrittStumm(an); sichereProfil({ beitrittStumm: an }); }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="beitritt-ohne-kamera">Ohne Kamera beitreten</Label>
              <p className="text-xs text-muted-foreground">Die Kamera bleibt beim Start aus, bis du sie einschaltest.</p>
            </div>
            <Switch
              className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
              id="beitritt-ohne-kamera"
              checked={beitrittOhneKamera}
              onCheckedChange={(an) => { setBeitrittOhneKamera(an); sichereProfil({ beitrittOhneKamera: an }); }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="spiegeln">Eigene Vorschau spiegeln</Label>
              <p className="text-xs text-muted-foreground">Wirkt nur auf deine eigene Vorschau, die Kunden sehen dich unverändert.</p>
            </div>
            <Switch
              className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
              id="spiegeln"
              checked={spiegeln}
              onCheckedChange={(an) => { setSpiegeln(an); sichereProfil({ spiegeln: an }); }}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Video-Hintergrund</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Kein Hintergrund, Weichzeichnen oder ein eigenes Bild. Die Auswahl gilt ab dem nächsten
          Gespräch und lässt sich dort jederzeit umstellen. Die Berechnung läuft komplett auf deinem
          Gerät, es wird nichts an fremde Server geschickt.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={pille(hintergrund.art === "aus")} aria-pressed={hintergrund.art === "aus"} onClick={() => waehleHintergrund({ art: "aus" })}>
            Kein Hintergrund
          </button>
          <button type="button" className={pille(hintergrund.art === "weich")} aria-pressed={hintergrund.art === "weich"} onClick={() => waehleHintergrund({ art: "weich" })}>
            Weichzeichnen
          </button>
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eigene Bilder</h3>

        {bucketFehlt ? (
          <p className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
            Eigene Hintergrundbilder sind derzeit nicht verfügbar. Bitte informiere den Administrator. Weichzeichnen kannst du weiterhin verwenden.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {bilder.map((bild) => {
                const aktivBild = hintergrund.art === "bild" && hintergrund.bildPfad === bild.pfad;
                return (
                  <div key={bild.pfad} className="group relative">
                    <button
                      type="button"
                      onClick={() => waehleHintergrund({ art: "bild", bildPfad: bild.pfad })}
                      title={bild.name}
                      aria-label={`Hintergrund ${bild.name}`} aria-pressed={aktivBild}
                      className={`relative block aspect-[16/10] w-full overflow-hidden rounded-lg border-2 transition-colors ${
                        aktivBild ? "border-primary" : "border-transparent hover:border-border"
                      }`}
                    >
                      {bild.url ? (
                        <img src={bild.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center bg-muted text-xs text-muted-foreground">Bild</span>
                      )}
                      {aktivBild && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loeschen(bild.pfad)}
                      aria-label={`${bild.name} löschen`}
                      className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <input
              ref={dateiFeld}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const datei = e.target.files?.[0];
                e.target.value = "";
                if (datei) void hochladen(datei);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              disabled={laedtHoch}
              onClick={() => dateiFeld.current?.click()}
            >
              {laedtHoch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Bild hochladen
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              JPEG, PNG oder WebP. Das Bild wird vor dem Hochladen automatisch auf höchstens
              1920 Pixel Breite verkleinert.
            </p>
          </>
        )}
      </Card>

      <Card className="border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm text-muted-foreground">
            <p>
              Alles zu deiner Kalenderanbindung findest du gebündelt unter{" "}
              <Link to="/einstellungen?tab=kalender" className="text-primary underline">
                Einstellungen, Kalender
              </Link>
              . Die Mitschrift der Gespräche kommt später dazu, sie braucht kein fremdes Unternehmen.
            </p>
          </div>
        </div>
      </Card>
      </div>
    </DashboardLayout>
  );
}
