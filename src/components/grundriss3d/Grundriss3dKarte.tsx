import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PencilRuler } from "lucide-react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { resolveImageUrl } from "@/lib/objekteImages";
import { Grundriss3dBlock } from "./Grundriss3dBlock";
import { hausAusMeta, planAusMeta, plaeneAusEinheiten } from "./plan";
import { speichereEinheitPlan } from "./speichern";
import { useBekanntesHaus, weNummer, type BekanntesHaus } from "./planBibliothek";

const Editor = lazy(() => import("./GrundrissEditor"));

/** Die Pläne aller Einheiten eines Hauses, für die gestapelte Ansicht. */
export function plaeneDesObjekts(objekt: Pick<ObjektData, "wohnungen" | "wohnungenNichtImAngebot">) {
  return plaeneAusEinheiten([...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot ?? [])]);
}

/** Plan einer Einheit aus der Bibliothek, über die Nummer der Einheit. */
function bibliotheksPlan(bekannt: BekanntesHaus | null, weNr: string) {
  const nr = weNummer(weNr);
  return bekannt?.einheiten.find((e) => e.we === nr)?.plan ?? null;
}

/**
 * Pläne aus der Datenbank, ergänzt um die der Bibliothek. Ein gespeicherter
 * Plan geht vor; Bibliothekseinheiten ohne passende Einheit im CRM (etwa
 * verkaufte) stehen trotzdem im Haus.
 */
function mitBibliothek(objekt: Pick<ObjektData, "wohnungen" | "wohnungenNichtImAngebot">, bekannt: BekanntesHaus | null) {
  const eigene = plaeneDesObjekts(objekt);
  if (!bekannt) return eigene;
  const alle = [...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot ?? [])];
  const mitEigenemPlan = new Set(alle.filter((w) => planAusMeta(w.grundriss3d)).map((w) => weNummer(w.weNr)));
  const ergaenzt = bekannt.einheiten
    .filter((e) => !mitEigenemPlan.has(e.we))
    .map((e) => ({ plan: e.plan, titel: `WE ${String(e.we).padStart(2, "0")}` }));
  return [...eigene, ...ergaenzt];
}

/** Editor im großen Fenster. Seit 17.10.2026 für jede interne Rolle (Datenbankfunktion grundriss3d_speichern). */
export function Grundriss3dEditorDialog({ offen, onOpenChange, wohnung, titel, onGespeichert }: {
  offen: boolean;
  onOpenChange: (o: boolean) => void;
  wohnung: Pick<ObjektWohnung, "id" | "grundriss3d">;
  titel: string;
  onGespeichert?: () => void;
}) {
  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col">
        <DialogHeader><DialogTitle>3D-Grundriss bearbeiten: {titel}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1">
          {offen && (
            <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}>
              <Editor start={planAusMeta(wohnung.grundriss3d)} entwurfId={wohnung.id} titel={titel}
                onSpeichern={async (plan) => { await speichereEinheitPlan(wohnung.id, plan); onGespeichert?.(); }} />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Einheitenseite, Reiter Übersicht: nur der Grundriss dieser Einheit. */
export function EinheitGrundriss3dKarte({ wohnung, darfBearbeiten, onGespeichert, objekt }: {
  wohnung: ObjektWohnung;
  darfBearbeiten: boolean;
  onGespeichert?: () => void;
  /** Für die Bibliothek nachgezeichneter Häuser (Erkennung an der Adresse). */
  objekt?: Pick<ObjektData, "adresse" | "titel">;
}) {
  const bekannt = useBekanntesHaus(objekt);
  const eigenerPlan = useMemo(() => planAusMeta(wohnung.grundriss3d), [wohnung.grundriss3d]);
  const plan = eigenerPlan ?? bibliotheksPlan(bekannt, wohnung.weNr);
  // Ein ganzes Haus als eine Einheit (Doppelhaushälfte): alle Geschosse zeigen.
  const hausEtagen = !plan && bekannt?.etagen && bekannt.einheiten.length === 0 ? bekannt.etagen : null;
  const [editor, setEditor] = useState(false);
  if (!plan && !hausEtagen && !darfBearbeiten) return null;
  return (
    <Card className="p-4" data-testid="einheit-grundriss-3d">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div>
          <div className="mb-2 h-1 w-8 bg-primary" />
          <h4 className="font-bold">Grundriss in 3D</h4>
        </div>
        {darfBearbeiten && (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setEditor(true)}>
            <PencilRuler className="h-3.5 w-3.5" /> {plan ? "Grundriss bearbeiten" : "Grundriss nachzeichnen"}
          </Button>
        )}
      </div>
      {hausEtagen ? (
        <>
          <Grundriss3dBlock einheiten={hausEtagen.map((e) => ({ plan: e.plan, titel: e.titel }))} hoehe="voll" aussehen={bekannt?.aussehen} />
          <p className="mt-1 text-[11px] text-muted-foreground">{bekannt?.name}: nachgezeichnet aus den Unterlagen; das einzelne Haus kann abweichen.</p>
        </>
      ) : plan ? (
        <>
          <Grundriss3dBlock einheiten={[{ plan: { ...plan, versatz: undefined }, titel: `WE ${wohnung.weNr}` }]} hoehe="voll" aussehen={eigenerPlan ? undefined : bekannt?.aussehen} />
          {!eigenerPlan && bekannt && <p className="mt-1 text-[11px] text-muted-foreground">Nachgezeichnet aus dem Grundriss der Unterlagen ({bekannt.name}).</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Noch kein 3D-Grundriss. Lege den Grundriss als Bild oder PDF in den Editor, setze den Maßstab und zeichne Wände, Türen, Fenster und Räume nach. Danach erscheint er hier, auf der Objektseite und im Exposé.
        </p>
      )}
      {darfBearbeiten && <Grundriss3dEditorDialog offen={editor} onOpenChange={setEditor} wohnung={wohnung} titel={`WE ${wohnung.weNr}`} onGespeichert={onGespeichert} />}
    </Card>
  );
}

/**
 * Durchschnittsfarbe des Titelbilds als Fassadenfarbe. Sehr helle und sehr
 * dunkle Bildpunkte (Himmel, Schatten) zählen nicht. Klappt das Laden nicht
 * (fremde Adresse ohne Freigabe), bleibt die Fassade neutral.
 */
export function dominanteFarbe(url: string): Promise<string | undefined> {
  return new Promise((fertig) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const k = c.getContext("2d");
        if (!k) return fertig(undefined);
        k.drawImage(img, 0, 0, 32, 32);
        const d = k.getImageData(0, 0, 32, 32).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const hell = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (hell < 40 || hell > 235 || d[i + 2] > d[i] + 25) continue; // ohne Schatten, Spitzlicht und Himmelblau
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return fertig(undefined);
        const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
        fertig(`#${hex(r)}${hex(g)}${hex(b)}`);
      } catch {
        fertig(undefined);
      }
    };
    img.onerror = () => fertig(undefined);
    img.src = url;
  });
}

/** Objektseite: alle Einheiten mit Plan, nach Geschoss gestapelt. */
export function ObjektGrundriss3dKarte({ objekt, darfBearbeiten }: { objekt: ObjektData; darfBearbeiten: boolean }) {
  const bekannt = useBekanntesHaus(objekt);
  // Etagenpläne aus der Bibliothek zeigen das ganze Haus samt aller Einheiten; sonst die Einheiten einzeln.
  const einheiten = useMemo(() => (bekannt?.etagen && !plaeneDesObjekts(objekt).length
    ? bekannt.etagen.map((e) => ({ plan: e.plan, titel: e.titel }))
    : mitBibliothek(objekt, bekannt)), [objekt, bekannt]);
  const haus = useMemo(() => hausAusMeta((objekt.meta as Record<string, unknown> | undefined)?.grundriss3dHaus) ?? bekannt?.haus ?? null, [objekt, bekannt]);
  const titelbild = objekt.bilder?.[0]?.url;
  const [fassade, setFassade] = useState<string | undefined>();
  useEffect(() => {
    let aktiv = true;
    if (titelbild) void dominanteFarbe(resolveImageUrl(titelbild)).then((f) => { if (aktiv) setFassade(f); });
    return () => { aktiv = false; };
  }, [titelbild]);

  if (!einheiten.length && !haus && !darfBearbeiten) return null;
  const geschosse = haus ? haus.geschosse : new Set(einheiten.map((e) => e.plan.geschoss ?? 0)).size;
  return (
    <Card className="p-6" data-testid="objekt-grundriss-3d">
      <div className="mb-3 h-1 w-8 bg-primary" />
      <h3 className="mb-1 font-bold">Haus in 3D</h3>
      {einheiten.length || haus ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {einheiten.length} {einheiten.length === 1 ? "Einheit" : "Einheiten"} mit Grundriss{geschosse > 1 ? ` auf ${geschosse} Geschossen. Mit dem Regler ziehst du die Etagen auseinander.` : "."}
            {haus ? " Hülle mit Hof, Treppenhäusern und Aufzügen aus der Flächenberechnung." : " Gebäudekörper aus den Grundrissen."}
            {bekannt?.aussehen ? " Fassade, Dach und Balkone nach Fotos und Ansichten." : " Fassadenfarbe aus dem Titelbild."}
          </p>
          <Grundriss3dBlock einheiten={einheiten} hoehe="voll" fassade={fassade} aussehen={bekannt?.aussehen} haus={haus} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Noch keine Einheit hat einen 3D-Grundriss. Die Grundrisse entstehen je Einheit auf der Einheitenseite; Geschoss und Lage im Haus legst du dort im Editor fest. Ab zwei Einheiten stapelt sich hier das Haus.
        </p>
      )}
    </Card>
  );
}
