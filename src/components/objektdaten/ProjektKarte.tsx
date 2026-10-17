import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { objektMetaErgaenzen, type ObjektData } from "@/lib/objekteStore";
import { zahlAus } from "@/lib/objektdatenFormular";
import { MEILENSTEINE, kalkulationSpeichern, projektKosten, type Meilenstein, type ObjektAufteilung, type ObjektKalkulation } from "@/lib/projektObjekt";

/*
 * Projektangaben eines Objekts (17.10.2026): Kosten von Ankauf und Aufteilung,
 * Provision, Dauer einer Reservierung und die Meilensteine der Aufteilung.
 * Daraus rechnet die Einheitenliste die Marge je Einheit und die Fristen.
 * Das Geld in `objekt_kalkulation` (gesperrt), Meilensteine und
 * Reservierungsdauer in `objekte.meta.aufteilung`.
 */

const KOSTEN: { schluessel: keyof ObjektKalkulation; titel: string; einheit: string }[] = [
  { schluessel: "ankaufpreis", titel: "Ankaufpreis", einheit: "€" },
  { schluessel: "ankaufNebenkosten", titel: "Ankaufnebenkosten", einheit: "€" },
  { schluessel: "aufteilungskosten", titel: "Aufteilung (Notar, Vermessung, Grundbuch)", einheit: "€" },
  { schluessel: "sanierung", titel: "Sanierung", einheit: "€" },
  { schluessel: "sonstigeKosten", titel: "Sonstige Kosten (Finanzierung, Makler)", einheit: "€" },
  { schluessel: "provisionProzent", titel: "Vertriebsprovision", einheit: "% vom Kaufpreis" },
];

const lesen = (s: string): number | undefined => {
  const n = zahlAus(s);
  return n !== null && n >= 0 ? n : undefined;
};
const alsText = (n: unknown) => (typeof n === "number" ? String(n).replace(".", ",") : "");
const eur = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";

export function ProjektKarte({ objekt, kalkulation, aufteilung, darfSchreiben, onGespeichert }: {
  objekt: ObjektData; kalkulation: ObjektKalkulation; aufteilung: ObjektAufteilung; darfSchreiben: boolean; onGespeichert: () => void;
}) {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [tage, setTage] = useState("");
  const [daten, setDaten] = useState<Partial<Record<Meilenstein, string>>>({});
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => {
    setWerte(Object.fromEntries(KOSTEN.map((k) => [k.schluessel, alsText(kalkulation[k.schluessel])])));
  }, [kalkulation]);
  useEffect(() => {
    setTage(alsText(aufteilung.reservierungTage));
    setDaten(aufteilung.meilensteine ?? {});
  }, [aufteilung]);

  const speichern = async () => {
    const neu: ObjektKalkulation = {};
    for (const k of KOSTEN) {
      const n = lesen(werte[k.schluessel] ?? "");
      if (n !== undefined) neu[k.schluessel] = n;
    }
    const auf: ObjektAufteilung = { meilensteine: Object.fromEntries(Object.entries(daten).filter(([, v]) => v)) };
    const t = lesen(tage);
    if (t) auf.reservierungTage = Math.round(t);
    setLaeuft(true);
    try {
      await kalkulationSpeichern(objekt.id, neu);
      await objektMetaErgaenzen(objekt.id, { aufteilung: auf });
      onGespeichert();
      toast({ title: "Projektangaben gespeichert" });
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  const kosten = projektKosten(kalkulation);
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <div className="text-sm font-semibold">Projekt {objekt.titel}</div>
          <p className="text-xs text-muted-foreground">
            Die Kosten werden nach MEA auf die Einheiten verteilt, fehlt eine MEA nach Wohnfläche. Marge = Kaufpreis − Kostenanteil − Provision.
            {kosten > 0 && ` Kosten gesamt ${eur(kosten)}.`}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KOSTEN.map((k) => (
            <div key={k.schluessel} className="space-y-1">
              <Label className="text-xs">{k.titel} <span className="text-muted-foreground">({k.einheit})</span></Label>
              <Input inputMode="decimal" disabled={!darfSchreiben} value={werte[k.schluessel] ?? ""} onChange={(e) => setWerte((w) => ({ ...w, [k.schluessel]: e.target.value }))} />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Reservierung gilt <span className="text-muted-foreground">(Tage, leer: kein Ablauf)</span></Label>
            <Input inputMode="numeric" disabled={!darfSchreiben} value={tage} onChange={(e) => setTage(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Aufteilung: erledigt am</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MEILENSTEINE.map((m) => (
              <div key={m.schluessel} className="space-y-1">
                <Label className="text-xs">{daten[m.schluessel] ? "✓ " : ""}{m.titel}</Label>
                <Input type="date" disabled={!darfSchreiben} value={daten[m.schluessel] ?? ""} onChange={(e) => setDaten((d) => ({ ...d, [m.schluessel]: e.target.value }))} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Ab der Abnahme läuft die Gewährleistung fünf Jahre; das Ende steht in den Fristen.</p>
        </div>
        {darfSchreiben && <div className="flex justify-end"><Button size="sm" disabled={laeuft} onClick={speichern}>{laeuft ? "Speichert …" : "Speichern"}</Button></div>}
      </CardContent>
    </Card>
  );
}
