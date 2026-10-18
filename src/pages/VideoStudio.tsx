/**
 * Video-Studio (Marketing): sprechende Avatar-Videos aus einem Skript.
 *
 * Erzeugt wird ueber die Function `video-studio` (Higgsfield, Seedance 2.0).
 * Ein Video besteht aus Clips von hoechstens 15 Sekunden; die Bibliothek
 * spielt sie nacheinander ab. Nur Admin und Inhaber, siehe Migration
 * 20261018100000_video_studio.sql.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Play, RotateCcw, Trash2, UserPlus, Wand2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { skriptInClips } from "../../supabase/functions/video-studio/clips";

// Tabellen sind neu und noch nicht in den erzeugten Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const EIMER = "video-studio";

type Avatar = { id: string; name: string; bild_pfad: string; stimme_pfad: string | null };
type Clip = { text: string; sekunden: number; status: "wartet" | "fertig" | "fehler"; fehler?: string };
type Projekt = {
  id: string; titel: string; skript: string; avatar_id: string | null; format: string;
  status: "entwurf" | "laeuft" | "fertig" | "fehler"; clips: Clip[]; fehler: string | null; created_at: string;
};

const VORLAGEN: { name: string; skript: string }[] = [
  {
    name: "Objektvorstellung",
    skript: "Hallo, ich bin [Name] von OS Immobilien. Heute stelle ich Ihnen eine besondere Kapitalanlage vor: [Objekt] in [Ort]. Die Wohnungen sind ab [Preis] Euro zu haben und bereits vermietet. Die Lage überzeugt mit [Lagevorteil]. Wenn Sie mehr wissen möchten, buchen Sie jetzt Ihr kostenloses Beratungsgespräch.",
  },
  {
    name: "Persönliche Vorstellung",
    skript: "Hallo, ich bin [Name], Ihr Ansprechpartner bei OS Immobilien. Ich helfe Ihnen dabei, mit einer vermieteten Wohnung Vermögen aufzubauen und Steuern zu sparen. Lassen Sie uns in einem kurzen Gespräch herausfinden, was zu Ihnen passt.",
  },
  {
    name: "Terminerinnerung",
    skript: "Hallo [Kunde], hier ist [Name] von OS Immobilien. Ich freue mich auf unser Gespräch am [Datum] um [Uhrzeit]. Bringen Sie gerne Ihre Fragen mit. Bis bald!",
  },
  {
    name: "Social-Media-Tipp",
    skript: "Wussten Sie, dass Sie bei einer vermieteten Wohnung die Abschreibung steuerlich geltend machen können? Das senkt Ihre Steuerlast jedes Jahr. Folgen Sie uns für mehr Tipps rund um Immobilien als Kapitalanlage.",
  },
];

const STATUS_TEXT: Record<Projekt["status"], string> = {
  entwurf: "Entwurf", laeuft: "Wird erzeugt", fertig: "Fertig", fehler: "Fehler",
};

async function signierteLinks(pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {};
  const { data } = await supabase.storage.from(EIMER).createSignedUrls(pfade, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

async function functionAufruf(aktion: "starten" | "abfragen", projektId: string) {
  const { data, error } = await supabase.functions.invoke("video-studio", { body: { aktion, projektId } });
  if (error) throw await edgeFehlerMitGrund(error, { functionName: "video-studio" });
  return data as { projekt: Projekt; links: Record<number, string> };
}

export default function VideoStudio() {
  const [tab, setTab] = useState("neu");
  const [avatare, setAvatare] = useState<Avatar[]>([]);
  const [bilder, setBilder] = useState<Record<string, string>>({});
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [links, setLinks] = useState<Record<string, Record<number, string>>>({});

  const laden = useCallback(async () => {
    const [a, p] = await Promise.all([
      db.from("video_avatare").select("*").order("created_at", { ascending: false }),
      db.from("video_projekte").select("*").order("created_at", { ascending: false }),
    ]);
    if (a.error || p.error) {
      toast.error("Video-Studio konnte nicht geladen werden. Ist die Migration eingespielt?");
      return;
    }
    setAvatare(a.data);
    setProjekte(p.data);
    setBilder(await signierteLinks((a.data as Avatar[]).map((x) => x.bild_pfad)));
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const abfragen = useCallback(async (id: string) => {
    try {
      const r = await functionAufruf("abfragen", id);
      setProjekte((alt) => alt.map((p) => (p.id === id ? r.projekt : p)));
      setLinks((alt) => ({ ...alt, [id]: r.links }));
    } catch (e) {
      console.error("video-studio abfragen", e);
    }
  }, []);

  // Laufende Videos alle 10 Sekunden nachfragen; fertige einmal, um die Abspiel-Links zu holen.
  const laufendeIds = projekte.filter((p) => p.status === "laeuft").map((p) => p.id).join(",");
  useEffect(() => {
    if (!laufendeIds) return;
    const t = setInterval(() => laufendeIds.split(",").forEach(abfragen), 10_000);
    return () => clearInterval(t);
  }, [laufendeIds, abfragen]);
  useEffect(() => {
    projekte.filter((p) => p.status !== "entwurf" && !links[p.id]).forEach((p) => abfragen(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projekte.length]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Video-Studio" subtitle="Sprechende Avatar-Videos aus einem Skript, mit eigenem Gesicht und eigener Stimme." />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="neu">Neues Video</TabsTrigger>
            <TabsTrigger value="bibliothek">Bibliothek ({projekte.length})</TabsTrigger>
            <TabsTrigger value="avatare">Avatare ({avatare.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="neu">
            <NeuesVideo
              avatare={avatare} bilder={bilder}
              zuAvataren={() => setTab("avatare")}
              gestartet={async () => { await laden(); setTab("bibliothek"); }}
            />
          </TabsContent>
          <TabsContent value="bibliothek">
            <Bibliothek projekte={projekte} avatare={avatare} links={links} neuLaden={laden} />
          </TabsContent>
          <TabsContent value="avatare">
            <Avatare avatare={avatare} bilder={bilder} neuLaden={laden} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function NeuesVideo({ avatare, bilder, zuAvataren, gestartet }: {
  avatare: Avatar[]; bilder: Record<string, string>; zuAvataren: () => void; gestartet: () => Promise<void>;
}) {
  const [titel, setTitel] = useState("");
  const [skript, setSkript] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [format, setFormat] = useState("9:16");
  const [laeuft, setLaeuft] = useState(false);

  const plan = useMemo(() => skriptInClips(skript), [skript]);
  const sekunden = plan.reduce((s, c) => s + c.sekunden, 0);
  const platzhalter = skript.match(/\[[^\]]+\]/g);

  async function erzeugen() {
    if (!titel.trim() || !skript.trim() || !avatarId) {
      toast.error("Titel, Skript und Avatar angeben.");
      return;
    }
    if (platzhalter && !confirm(`Im Skript stehen noch Platzhalter: ${platzhalter.join(", ")}. Trotzdem erzeugen?`)) return;
    setLaeuft(true);
    try {
      const { data, error } = await db.from("video_projekte")
        .insert({ titel: titel.trim(), skript: skript.trim(), avatar_id: avatarId, format })
        .select("id").single();
      if (error) throw new Error(error.message);
      await functionAufruf("starten", data.id);
      toast.success("Video wird erzeugt. Das dauert einige Minuten.");
      setTitel(""); setSkript("");
      await gestartet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Video konnte nicht gestartet werden.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] mt-4">
      <Card className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vs-titel">Titel</Label>
          <Input id="vs-titel" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Objektvorstellung Zossen" />
        </div>
        <div className="space-y-1.5">
          <Label>Vorlage</Label>
          <div className="flex flex-wrap gap-2">
            {VORLAGEN.map((v) => (
              <Button key={v.name} type="button" variant="outline" size="sm"
                onClick={() => { setSkript(v.skript); if (!titel) setTitel(v.name); }}>
                {v.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vs-skript">Skript</Label>
          <Textarea id="vs-skript" rows={10} value={skript} onChange={(e) => setSkript(e.target.value)}
            placeholder="Was soll der Avatar sagen?" />
          <p className="text-xs text-muted-foreground">
            {plan.length === 0 ? "Noch kein Text." : `ca. ${sekunden} Sekunden, ${plan.length} Clip${plan.length === 1 ? "" : "s"} à höchstens 15 Sekunden`}
            {plan.length > 20 && <span className="text-destructive"> · zu lang, höchstens 20 Clips</span>}
          </p>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label>Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="9:16">Hochformat 9:16 (Reels, Stories)</SelectItem>
              <SelectItem value="16:9">Querformat 16:9 (YouTube, Website)</SelectItem>
              <SelectItem value="1:1">Quadrat 1:1 (Feed)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={erzeugen} disabled={laeuft || plan.length === 0 || plan.length > 20}>
          {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
          Video erzeugen
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <Label>Avatar</Label>
        {avatare.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Noch kein Avatar angelegt.</p>
            <Button variant="outline" size="sm" onClick={zuAvataren}><UserPlus className="h-4 w-4 mr-2" />Avatar anlegen</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {avatare.map((a) => (
              <button key={a.id} type="button" onClick={() => setAvatarId(a.id)}
                className={`rounded-lg border-2 overflow-hidden text-left transition ${avatarId === a.id ? "border-primary" : "border-transparent hover:border-muted"}`}>
                {bilder[a.bild_pfad]
                  ? <img src={bilder[a.bild_pfad]} alt={a.name} className="aspect-square w-full object-cover" />
                  : <div className="aspect-square w-full bg-muted" />}
                <div className="px-2 py-1 text-xs font-medium truncate">{a.name}{!a.stimme_pfad && " (ohne Stimme)"}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Bibliothek({ projekte, avatare, links, neuLaden }: {
  projekte: Projekt[]; avatare: Avatar[]; links: Record<string, Record<number, string>>; neuLaden: () => Promise<void>;
}) {
  if (projekte.length === 0) return <p className="text-sm text-muted-foreground mt-6">Noch keine Videos.</p>;
  return (
    <div className="grid gap-4 mt-4 sm:grid-cols-2 xl:grid-cols-3">
      {projekte.map((p) => (
        <ProjektKarte key={p.id} projekt={p} avatar={avatare.find((a) => a.id === p.avatar_id)}
          links={links[p.id] ?? {}} neuLaden={neuLaden} />
      ))}
    </div>
  );
}

function ProjektKarte({ projekt, avatar, links, neuLaden }: {
  projekt: Projekt; avatar?: Avatar; links: Record<number, string>; neuLaden: () => Promise<void>;
}) {
  const [clipIndex, setClipIndex] = useState(0);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fertig = projekt.clips.filter((c) => c.status === "fertig").length;
  const reihenfolge = Object.keys(links).map(Number).sort((a, b) => a - b);
  const aktuell = links[reihenfolge[clipIndex]];

  // Clips nacheinander abspielen: am Ende eines Clips zum naechsten springen.
  function naechster() {
    if (clipIndex + 1 < reihenfolge.length) {
      setClipIndex(clipIndex + 1);
      setTimeout(() => videoRef.current?.play(), 0);
    } else {
      setClipIndex(0);
    }
  }

  async function neuStarten() {
    setBeschaeftigt(true);
    try {
      await functionAufruf("starten", projekt.id);
      await neuLaden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Neustart fehlgeschlagen.");
    } finally {
      setBeschaeftigt(false);
    }
  }

  async function loeschen() {
    if (!confirm(`„${projekt.titel}“ aus der Bibliothek löschen? Das lässt sich nicht rückgängig machen.`)) return;
    const pfade = reihenfolge.map((i) => `projekte/${projekt.id}/clip-${String(i + 1).padStart(2, "0")}.mp4`);
    if (pfade.length) await supabase.storage.from(EIMER).remove(pfade);
    const { error } = await db.from("video_projekte").delete().eq("id", projekt.id);
    if (error) toast.error(error.message);
    await neuLaden();
  }

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className={`bg-black ${projekt.format === "16:9" ? "aspect-video" : projekt.format === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[420px]"} flex items-center justify-center`}>
        {aktuell ? (
          <video ref={videoRef} key={aktuell} src={aktuell} controls playsInline onEnded={naechster} className="h-full w-full object-contain" />
        ) : projekt.status === "laeuft" ? (
          <div className="text-white/80 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{fertig}/{projekt.clips.length} Clips fertig</div>
        ) : (
          <Play className="h-8 w-8 text-white/40" />
        )}
      </div>
      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium leading-tight">{projekt.titel}</div>
          <Badge variant={projekt.status === "fehler" ? "destructive" : projekt.status === "fertig" ? "default" : "secondary"}>
            {STATUS_TEXT[projekt.status]}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {avatar?.name ?? "Avatar gelöscht"} · {projekt.format} · {new Date(projekt.created_at).toLocaleDateString("de-DE")}
          {reihenfolge.length > 1 && ` · Clip ${clipIndex + 1}/${reihenfolge.length}`}
        </div>
        {projekt.fehler && <p className="text-xs text-destructive break-words">{projekt.fehler}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1 mt-auto">
          {reihenfolge.map((i) => (
            <Button key={i} asChild variant="outline" size="sm">
              <a href={links[i]} download={`${projekt.titel}-clip-${i + 1}.mp4`} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5 mr-1" />{reihenfolge.length > 1 ? `Clip ${i + 1}` : "Download"}
              </a>
            </Button>
          ))}
          {(projekt.status === "fehler" || projekt.status === "entwurf") && (
            <Button variant="outline" size="sm" onClick={neuStarten} disabled={beschaeftigt}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Neu erzeugen
            </Button>
          )}
          {projekt.status !== "laeuft" && (
            <Button variant="ghost" size="sm" onClick={loeschen} aria-label="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Avatare({ avatare, bilder, neuLaden }: { avatare: Avatar[]; bilder: Record<string, string>; neuLaden: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [bild, setBild] = useState<File | null>(null);
  const [stimme, setStimme] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !bild) { toast.error("Name und Foto angeben."); return; }
    setLaeuft(true);
    try {
      const id = crypto.randomUUID();
      const endung = (f: File) => f.name.split(".").pop()?.toLowerCase() || "bin";
      const bildPfad = `avatare/${id}/foto.${endung(bild)}`;
      const up1 = await supabase.storage.from(EIMER).upload(bildPfad, bild, { contentType: bild.type });
      if (up1.error) throw new Error(up1.error.message);
      let stimmePfad: string | null = null;
      if (stimme) {
        stimmePfad = `avatare/${id}/stimme.${endung(stimme)}`;
        const up2 = await supabase.storage.from(EIMER).upload(stimmePfad, stimme, { contentType: stimme.type });
        if (up2.error) throw new Error(up2.error.message);
      }
      const { error } = await db.from("video_avatare").insert({ id, name: name.trim(), bild_pfad: bildPfad, stimme_pfad: stimmePfad });
      if (error) throw new Error(error.message);
      toast.success("Avatar angelegt.");
      setName(""); setBild(null); setStimme(null); formRef.current?.reset();
      await neuLaden();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar konnte nicht gespeichert werden.");
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen(a: Avatar) {
    if (!confirm(`Avatar „${a.name}“ löschen? Foto und Stimmprobe werden entfernt.`)) return;
    await supabase.storage.from(EIMER).remove([a.bild_pfad, ...(a.stimme_pfad ? [a.stimme_pfad] : [])]);
    const { error } = await db.from("video_avatare").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    await neuLaden();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr] mt-4">
      <Card className="p-5">
        <form ref={formRef} onSubmit={speichern} className="space-y-4">
          <div className="font-medium">Eigenen Avatar anlegen</div>
          <div className="space-y-1.5">
            <Label htmlFor="av-name">Name</Label>
            <Input id="av-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Christian im Büro" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="av-bild">Foto</Label>
            <Input id="av-bild" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setBild(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Gut ausgeleuchtet, Blick in die Kamera, Oberkörper sichtbar. Der Hintergrund wird übernommen.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="av-stimme">Stimmprobe (optional)</Label>
            <Input id="av-stimme" type="file" accept="audio/*" onChange={(e) => setStimme(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">5 bis 15 Sekunden klare Sprache ohne Musik, z. B. als Sprachmemo aufgenommen. Ohne Probe wählt das Modell eine Stimme.</p>
          </div>
          <Button type="submit" disabled={laeuft}>
            {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}Avatar speichern
          </Button>
          <p className="text-xs text-muted-foreground">Nur Fotos und Stimmen von Personen verwenden, die zugestimmt haben.</p>
        </form>
      </Card>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 content-start">
        {avatare.map((a) => (
          <Card key={a.id} className="overflow-hidden">
            {bilder[a.bild_pfad]
              ? <img src={bilder[a.bild_pfad]} alt={a.name} className="aspect-square w-full object-cover" />
              : <div className="aspect-square w-full bg-muted" />}
            <div className="p-2 flex items-center justify-between gap-1">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.stimme_pfad ? "Eigene Stimme" : "Ohne Stimmprobe"}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => loeschen(a)} aria-label={`${a.name} löschen`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
