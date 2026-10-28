/*
 * Persönlicher Objektvergleich im Artefakt des Investmentrechners
 * (Christian, 28.10.2026): dasselbe Dokument und dieselben Eingaben wie im
 * CRM (KundenObjektvergleich.tsx), nur ohne Objekte, Kunden und Datenbank.
 * Alles wird von Hand eingetragen, der Stand bleibt in diesem Browser.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KundenObjektvergleichDokument } from "@/components/investmentrechner/kundenvergleich/KundenObjektvergleichDokument";
import { ObjektvergleichFormular } from "@/components/investmentrechner/kundenvergleich/ObjektvergleichFormular";
import { rechneEinheit, vergleichAusJson, vergleichDateiname, type KundenObjektvergleich } from "@/lib/investmentrechner/kundenObjektvergleich";
import { BEISPIEL_VERGLEICH } from "@/lib/investmentrechner/kundenObjektvergleichBeispiel";

const SCHLUESSEL = "objektvergleich-v1";

function laden(): KundenObjektvergleich {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    return (roh && vergleichAusJson(JSON.parse(roh))) || BEISPIEL_VERGLEICH;
  } catch {
    return BEISPIEL_VERGLEICH;
  }
}

export function ArtefaktObjektvergleich() {
  const [v, setV] = useState<KundenObjektvergleich | null>(laden);
  const [arbeitet, setArbeitet] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const dokument = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (v) localStorage.setItem(SCHLUESSEL, JSON.stringify(v));
      setHinweis("");
    } catch {
      // Meist zu große Fotos für den Browserspeicher; der Vergleich gilt trotzdem bis zum Schließen.
      setHinweis("Der Stand passt nicht in den Browserspeicher (meist wegen großer Fotos) und geht beim Schließen verloren.");
    }
  }, [v]);

  const ergebnisse = useMemo(() => {
    if (!v || v.einheiten.length !== 2) return null;
    if (v.einheiten.some((e) => !(e.qm > 0) || !(e.kpWohnung + e.garageKp > 0) || !(e.afaJahre > 0))) return null;
    return v.einheiten.map((e) => rechneEinheit(e, v.annahmen));
  }, [v]);

  const herunterladen = async () => {
    if (!v || !dokument.current) return;
    setArbeitet(true);
    try {
      const { erzeugeBerechnungsansichtPdf } = await import("@/lib/investmentrechner/berechnungAnsichtPdf");
      dokument.current.classList.add("kov-export");
      // `save` geht im Artefakt über die Fähigkeit „downloads“ (main.tsx).
      (await erzeugeBerechnungsansichtPdf(dokument.current)).save(vergleichDateiname(v, v.stand.split("-").reverse().join(".")));
    } catch (f) {
      console.error("[Objektvergleich] PDF", f);
      setHinweis("Das PDF konnte nicht erzeugt werden.");
    } finally {
      dokument.current?.classList.remove("kov-export");
      setArbeitet(false);
    }
  };

  if (!v) return null;
  const [A, B] = ergebnisse ?? [];
  return (
    <div className="space-y-3">
      <div className="artefakt-leiste">
        <p>Zwei Wohnungen im Aufbau des Kundenvergleichs. Beim ersten Öffnen sind Beispielzahlen vorbelegt; alles ist änderbar und bleibt in diesem Browser.</p>
        <div className="artefakt-knoepfe">
          <button type="button" onClick={() => setV(BEISPIEL_VERGLEICH)}>Beispiel laden</button>
          <button type="button" disabled={!A || !B || arbeitet} onClick={herunterladen}>{arbeitet ? "PDF entsteht …" : "PDF herunterladen"}</button>
        </div>
      </div>
      {hinweis && <p className="text-sm text-destructive">{hinweis}</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-3"><ObjektvergleichFormular v={v} setV={setV} freieHaeuser /></div>
        <div className="min-w-0 overflow-x-auto rounded-xl border bg-muted/30 p-4">
          {!A || !B
            ? <p className="text-sm text-muted-foreground">Für beide Wohnungen fehlen noch Wohnfläche, Kaufpreis oder AfA-Dauer.</p>
            : <div ref={dokument}><KundenObjektvergleichDokument v={v} A={A} B={B} /></div>}
        </div>
      </div>
    </div>
  );
}
