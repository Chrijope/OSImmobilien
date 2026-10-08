import { useEffect, useMemo, useState } from "react";
import { FileDown, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SectionCard, SectionCardContent, SectionCardDescription, SectionCardHeader, SectionCardTitle,
} from "@/components/ui/section-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  berechneSubvention, KAPPUNGSGRENZE_BERLIN, KAPPUNGSGRENZE_UMLAND, leseZahl, neueZeile, SUBVENTION_STANDARD,
  SUBVENTION_VERSIONEN_SCHLUESSEL, type SubventionsEingaben, type SubventionsVersion, type SubventionsZeile,
} from "@/lib/mietsubvention";
import { versionSpeichern } from "@/lib/ankaufstool";
import { eur, prozent } from "@/lib/ankaufstoolPdf";
import { buildMietsubventionPdf, SUBVENTION_HINWEIS } from "@/lib/mietsubventionPdf";
import { getAktuelleMiete, getObjekte } from "@/lib/objekteStore";
import { getUserSetting, setUserSettingSicher } from "@/lib/userSettingsCache";
import { useLiveVersion } from "@/hooks/useLiveData";

/*
 * Seite /mietsubvention: Ist- gegen Soll-Miete je Einheit, die Differenz geht
 * als Subvention an die Hausverwaltung. Gerechnet wird in
 * `src/lib/mietsubvention.ts`. Versionen liegen wie beim Ankaufstool je
 * Nutzer in `user_settings` (Schlüssel `mietsubvention_versionen`).
 */

const KEIN_OBJEKT = "__frei__";

/** Zahl als deutscher Text für die Bearbeitung, null bleibt leer. */
const alsText = (n: number | null, faktor = 1) =>
  n === null ? "" : String(Math.round(n * faktor * 1e6) / 1e6).replace(".", ",");

/**
 * Zahlenfeld, das „leer“ von 0 unterscheidet: leer heißt „nicht
 * überschrieben“, der Platzhalter zeigt dann den berechneten Wert.
 */
function ZahlFeld({ wert, setze, platzhalter, faktor = 1, label, className }: {
  wert: number | null; setze: (v: number | null) => void; platzhalter?: string; faktor?: number; label: string; className?: string;
}) {
  const [text, setText] = useState(alsText(wert, faktor));
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    if (!fokus) setText(alsText(wert, faktor));
  }, [wert, faktor, fokus]);
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={text}
      placeholder={platzhalter}
      className={cn("h-8 px-2 text-right tabular-nums", className)}
      onFocus={() => setFokus(true)}
      onBlur={() => setFokus(false)}
      onChange={(ev) => {
        setText(ev.target.value);
        const n = leseZahl(ev.target.value);
        setze(n === null ? null : n / faktor);
      }}
    />
  );
}

const Mietsubvention = () => {
  const [eingaben, setEingaben] = useState<SubventionsEingaben>(SUBVENTION_STANDARD);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const r = useMemo(() => berechneSubvention(eingaben), [eingaben]);
  const setze = <K extends keyof SubventionsEingaben>(k: K, v: SubventionsEingaben[K]) =>
    setEingaben((alt) => ({ ...alt, [k]: v }));
  const setzeZeile = (id: string, teil: Partial<SubventionsZeile>) =>
    setEingaben((alt) => ({ ...alt, zeilen: alt.zeilen.map((z) => (z.id === id ? { ...z, ...teil } : z)) }));

  const objektStand = useLiveVersion(["objekte", "wohnungen"]);
  const objekte = useMemo(
    () => getObjekte().filter((o) => o.wohnungen?.length).sort((a, b) => a.titel.localeCompare(b.titel, "de")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objektStand],
  );

  /** Einheiten des Objekts übernehmen: Ist-Miete zum Stichtag und Stellplatzmiete. */
  const objektWaehlen = (id: string) => {
    if (id === KEIN_OBJEKT) return setze("objektId", null);
    const o = objekte.find((x) => x.id === id);
    if (!o) return;
    if (eingaben.zeilen.some((z) => z.istWohnung || z.istGarage) && !window.confirm("Die Tabelle durch die Einheiten des Objekts ersetzen?")) return;
    const zeilen = [...o.wohnungen]
      .sort((a, b) => a.weNr.localeCompare(b.weNr, "de", { numeric: true }))
      .map((w) => ({
        ...neueZeile(w.weNr),
        istWohnung: getAktuelleMiete(w, eingaben.stichtag) || 0,
        istGarage: Number(w.stellplatzMiete) || 0,
      }));
    setEingaben((alt) => ({ ...alt, objektId: o.id, objektName: o.titel, zeilen }));
  };

  // Versionen, Muster wie im Ankaufstool.
  const cacheStand = useLiveVersion(["user_settings"]);
  const [gespeichertStand, setGespeichertStand] = useState(0);
  const [aktiveVersion, setAktiveVersion] = useState<string | null>(null);
  const [speichertGerade, setSpeichertGerade] = useState(false);
  const versionen = useMemo(
    () => getUserSetting<SubventionsVersion[]>(SUBVENTION_VERSIONEN_SCHLUESSEL, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheStand, gespeichertStand],
  );
  const versionenSchreiben = async (liste: SubventionsVersion[]) => {
    await setUserSettingSicher(SUBVENTION_VERSIONEN_SCHLUESSEL, liste);
    setGespeichertStand((n) => n + 1);
  };
  const versionSichern = async () => {
    const jetzt = new Date();
    const name = eingaben.objektName.trim() || `Rechnung vom ${jetzt.toLocaleDateString("de-DE")} ${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    const neu: SubventionsVersion = { id: crypto.randomUUID(), name, gespeichertAm: jetzt.toISOString(), eingaben };
    setSpeichertGerade(true);
    try {
      await versionenSchreiben(versionSpeichern(versionen, neu));
      setAktiveVersion(neu.id);
      toast.success(`Version „${name}“ gespeichert.`);
    } catch (err) {
      console.error(err);
      toast.error("Die Version konnte nicht gespeichert werden.");
    } finally {
      setSpeichertGerade(false);
    }
  };
  const versionLaden = (v: SubventionsVersion) => {
    setEingaben({ ...SUBVENTION_STANDARD(), ...v.eingaben });
    setAktiveVersion(v.id);
  };
  const versionLoeschen = async (v: SubventionsVersion) => {
    if (!window.confirm(`Version „${v.name}“ löschen?`)) return;
    try {
      await versionenSchreiben(versionen.filter((x) => x.id !== v.id));
      if (aktiveVersion === v.id) setAktiveVersion(null);
    } catch (err) {
      console.error(err);
      toast.error("Die Version konnte nicht gelöscht werden.");
    }
  };

  const pdfSpeichern = async () => {
    setPdfLaeuft(true);
    try {
      const doc = await buildMietsubventionPdf(eingaben);
      const name = eingaben.objektName.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
      doc.save(`Mietsubvention_${name ? `${name}_` : ""}${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Das PDF konnte nicht erstellt werden.");
    } finally {
      setPdfLaeuft(false);
    }
  };

  const ergebnisZeilen: [string, string, boolean?][] = [
    ["Summe Ist-Miete / Monat", eur(r.summeIst, 2)],
    ["Summe Soll-Miete / Monat", eur(r.summeSoll, 2)],
    ["Differenz pro Monat", eur(r.differenzMonat, 2), true],
    ["Differenz pro Jahr", eur(r.differenzJahr, 2)],
    [`Subvention gesamt (${eingaben.monate} Monate)`, eur(r.subventionGesamt, 2), true],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        <PageHeader title="Mietsubvention" subtitle="Ist- gegen Soll-Miete je Einheit. Die Differenz geht als Subvention an die Hausverwaltung.">
          <Button variant="outline" size="sm" onClick={() => { setEingaben(SUBVENTION_STANDARD()); setAktiveVersion(null); }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Zurücksetzen
          </Button>
          <Button size="sm" onClick={pdfSpeichern} disabled={pdfLaeuft}>
            <FileDown className="h-4 w-4 mr-1" /> {pdfLaeuft ? "Erstelle PDF …" : "Als PDF herunterladen"}
          </Button>
        </PageHeader>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6 min-w-0">
            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Objekt & Annahmen</SectionCardTitle>
                <SectionCardDescription>
                  Objekt aus dem CRM wählen, dann kommen Ist-Miete (zum Stichtag) und Stellplatzmiete der Einheiten mit. Oder frei rechnen.
                </SectionCardDescription>
              </SectionCardHeader>
              <SectionCardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Objekt aus dem CRM</Label>
                    <Select value={eingaben.objektId ?? KEIN_OBJEKT} onValueChange={objektWaehlen}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEIN_OBJEKT}>Ohne Objekt (frei)</SelectItem>
                        {objekte.map((o) => <SelectItem key={o.id} value={o.id}>{o.titel}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sub-objekt">Objektbezeichnung</Label>
                    <Input id="sub-objekt" value={eingaben.objektName} onChange={(ev) => setze("objektName", ev.target.value)} placeholder="z. B. Musterstraße 1, Falkensee" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sub-hv">Hausverwaltung (Empfänger)</Label>
                    <Input id="sub-hv" value={eingaben.hausverwaltung} onChange={(ev) => setze("hausverwaltung", ev.target.value)} placeholder="Name der verwaltenden Firma" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sub-stichtag">Stichtag</Label>
                    <Input id="sub-stichtag" type="date" value={eingaben.stichtag} onChange={(ev) => setze("stichtag", ev.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Mietsteigerung (Standard für alle Einheiten)</Label>
                    <div className="flex gap-2">
                      <div className="relative w-28">
                        <ZahlFeld label="Mietsteigerung in Prozent" wert={eingaben.steigerung} faktor={100} setze={(v) => setze("steigerung", v ?? 0)} className="h-10 pr-6" />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <Button type="button" variant={eingaben.steigerung === KAPPUNGSGRENZE_UMLAND ? "default" : "outline"} onClick={() => setze("steigerung", KAPPUNGSGRENZE_UMLAND)}>20 % Umland</Button>
                      <Button type="button" variant={eingaben.steigerung === KAPPUNGSGRENZE_BERLIN ? "default" : "outline"} onClick={() => setze("steigerung", KAPPUNGSGRENZE_BERLIN)}>15 % Berlin</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Kappungsgrenze: Berliner Umland 20 %, Berlin selbst 15 %. Je Einheit überschreibbar.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Subventionsdauer</Label>
                    <div className="relative w-28">
                      <ZahlFeld label="Subventionsdauer in Monaten" wert={eingaben.monate} setze={(v) => setze("monate", v ?? 0)} className="h-10 pr-16" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Monate</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={versionSichern} disabled={speichertGerade}>
                    <Save className="h-4 w-4 mr-1" /> {speichertGerade ? "Speichert …" : "Version speichern"}
                  </Button>
                </div>
                {versionen.length > 0 && (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                    {versionen.map((v) => (
                      <li key={v.id} className={cn("flex items-center gap-2 pr-2", aktiveVersion === v.id && "bg-muted/50")}>
                        <button type="button" onClick={() => versionLaden(v)} className="flex-1 min-w-0 px-3 py-2 text-left hover:bg-muted/40 rounded-l-xl">
                          <span className="block truncate text-sm font-medium">{v.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(v.gespeichertAm).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                            {" · "}{eur(berechneSubvention({ ...SUBVENTION_STANDARD(), ...v.eingaben }).subventionGesamt, 2)}
                          </span>
                        </button>
                        <Button variant="ghost" size="icon" aria-label={`Version ${v.name} löschen`} onClick={() => versionLoeschen(v)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCardContent>
            </SectionCard>

            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Einheiten</SectionCardTitle>
                <SectionCardDescription>
                  Beträge pro Monat (kalt). Leere Felder bei Steigerung und Soll übernehmen den berechneten Wert (grau vorgeschlagen).
                </SectionCardDescription>
              </SectionCardHeader>
              <SectionCardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left font-medium pb-1 w-20">WE-Nr.</th>
                        <th className="text-right font-medium pb-1">Ist Wohnung</th>
                        <th className="text-right font-medium pb-1">Ist Garage</th>
                        <th className="text-right font-medium pb-1 pr-3 border-r border-border/60">Ist gesamt</th>
                        <th className="text-right font-medium pb-1 pl-3 w-20">Steig. %</th>
                        <th className="text-right font-medium pb-1">Soll Wohnung</th>
                        <th className="text-right font-medium pb-1">Soll Garage</th>
                        <th className="text-right font-medium pb-1 pr-3 border-r border-border/60">Soll gesamt</th>
                        <th className="text-right font-medium pb-1 pl-3">Differenz / Monat</th>
                        <th className="w-9" />
                      </tr>
                    </thead>
                    <tbody>
                      {eingaben.zeilen.map((z, i) => {
                        const zr = r.zeilen[i];
                        const vorschlag = (ist: number) => eur(ist * (1 + zr.steigerung), 2);
                        return (
                          <tr key={z.id} className="border-t border-border/40">
                            <td className="py-1 pr-1">
                              <Input aria-label="WE-Nr." value={z.weNr} onChange={(ev) => setzeZeile(z.id, { weNr: ev.target.value })} className="h-8 px-2" />
                            </td>
                            <td className="py-1 px-1"><ZahlFeld label="Ist Wohnung" wert={z.istWohnung || null} platzhalter="0" setze={(v) => setzeZeile(z.id, { istWohnung: v ?? 0 })} /></td>
                            <td className="py-1 px-1"><ZahlFeld label="Ist Garage" wert={z.istGarage || null} platzhalter="0" setze={(v) => setzeZeile(z.id, { istGarage: v ?? 0 })} /></td>
                            <td className="py-1 pl-1 pr-3 text-right tabular-nums border-r border-border/60">{eur(zr.istGesamt, 2)}</td>
                            <td className="py-1 pl-3 pr-1"><ZahlFeld label="Steigerung in Prozent" wert={z.steigerung} faktor={100} platzhalter={prozent(eingaben.steigerung, 1).replace(/\s?%/, "")} setze={(v) => setzeZeile(z.id, { steigerung: v })} /></td>
                            <td className="py-1 px-1"><ZahlFeld label="Soll Wohnung" wert={z.sollWohnung} platzhalter={vorschlag(z.istWohnung || 0)} setze={(v) => setzeZeile(z.id, { sollWohnung: v })} /></td>
                            <td className="py-1 px-1"><ZahlFeld label="Soll Garage" wert={z.sollGarage} platzhalter={vorschlag(z.istGarage || 0)} setze={(v) => setzeZeile(z.id, { sollGarage: v })} /></td>
                            <td className="py-1 pl-1 pr-3 text-right tabular-nums border-r border-border/60">{eur(zr.sollGesamt, 2)}</td>
                            <td className={cn("py-1 pl-3 text-right tabular-nums font-semibold", zr.differenz < 0 && "text-destructive")}>{eur(zr.differenz, 2)}</td>
                            <td className="py-1 pl-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Einheit ${z.weNr} entfernen`}
                                onClick={() => setEingaben((alt) => ({ ...alt, zeilen: alt.zeilen.filter((x) => x.id !== z.id) }))}>
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border font-semibold tabular-nums">
                        <td className="py-2">Summe</td>
                        <td className="py-2 px-1 text-right">{eur(r.summeIstWohnung, 2)}</td>
                        <td className="py-2 px-1 text-right">{eur(r.summeIstGarage, 2)}</td>
                        <td className="py-2 pl-1 pr-3 text-right border-r border-border/60">{eur(r.summeIst, 2)}</td>
                        <td />
                        <td className="py-2 px-1 text-right">{eur(r.summeSollWohnung, 2)}</td>
                        <td className="py-2 px-1 text-right">{eur(r.summeSollGarage, 2)}</td>
                        <td className="py-2 pl-1 pr-3 text-right border-r border-border/60">{eur(r.summeSoll, 2)}</td>
                        <td className="py-2 pl-3 text-right">{eur(r.differenzMonat, 2)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" size="sm" className="mt-3"
                  onClick={() => setEingaben((alt) => ({ ...alt, zeilen: [...alt.zeilen, neueZeile(String(alt.zeilen.length + 1))] }))}>
                  <Plus className="h-4 w-4 mr-1" /> Einheit hinzufügen
                </Button>
              </SectionCardContent>
            </SectionCard>
          </div>

          <div className="xl:sticky xl:top-4 self-start space-y-4">
            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Ergebnis</SectionCardTitle>
              </SectionCardHeader>
              <SectionCardContent className="space-y-4">
                <div className="rounded-xl bg-primary px-4 py-3 text-center text-primary-foreground">
                  <div className="text-xs opacity-90">An {eingaben.hausverwaltung.trim() || "die Hausverwaltung"} zu überweisen</div>
                  <div className="text-2xl font-bold tabular-nums">{eur(r.subventionGesamt, 2)}</div>
                  <div className="text-xs opacity-90">{eur(r.differenzMonat, 2)} × {eingaben.monate} Monate</div>
                </div>
                <dl className="text-sm">
                  {ergebnisZeilen.map(([label, wert, fett]) => (
                    <div key={label} className={cn("flex justify-between gap-3 py-1 border-b border-border/40 last:border-0", fett && "font-semibold")}>
                      <dt className={cn(!fett && "text-muted-foreground")}>{label}</dt>
                      <dd className="tabular-nums text-right">{wert}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCardContent>
            </SectionCard>
            <p className="text-xs text-muted-foreground px-1">{SUBVENTION_HINWEIS}</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Mietsubvention;
