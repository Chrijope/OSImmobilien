import { useEffect, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Mail, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
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
  berechneKaufpreisliste, HAUSGELD_KATEGORIEN, hausgeldMonat, kategorieSumme, KPL_STANDARD, KPL_STATUS, KPL_VERSIONEN_SCHLUESSEL,
  kplDateiname, neueKplZeile, neueWpPosition,
  type HausgeldKategorie, type KplEingaben, type KplVersion, type KplZeile, type Verteiler, type Wirtschaftsplan, type WpPosition,
} from "@/lib/kaufpreisliste";
import { baueKaufpreislisteXlsx, dateiHerunterladen, kaufpreislisteVersenden, XLSX_MIME } from "@/lib/kaufpreislisteExport";
import { buildKaufpreislistePdf, KPL_HINWEIS } from "@/lib/kaufpreislistePdf";
import { leseZahl } from "@/lib/mietsubvention";
import { versionSpeichern } from "@/lib/ankaufstool";
import { eur, prozent, zahl } from "@/lib/ankaufstoolPdf";
import { getAktuelleMiete, getObjekte, type ObjektWohnung } from "@/lib/objekteStore";
import { getUserSetting, setUserSettingSicher } from "@/lib/userSettingsCache";
import { useLiveVersion } from "@/hooks/useLiveData";

/*
 * Seite /kaufpreisliste: Verkaufsliste, Mieterliste und Einzelwirtschaftsplan
 * in einer Tabelle, Hausgeld je Einheit aus dem Wirtschaftsplan über die MEA.
 * Gerechnet wird in `src/lib/kaufpreisliste.ts`. Versionen liegen wie beim
 * Ankaufstool je Nutzer in `user_settings` (Schlüssel `kaufpreisliste_versionen`).
 */

const KEIN_OBJEKT = "__frei__";

const alsText = (n: number | null) => (n === null ? "" : String(Math.round(n * 1e6) / 1e6).replace(".", ","));
const leer = (n: number | null, f: (n: number) => string) => (n === null ? "–" : f(n));

/** Zahlenfeld, das „leer“ von 0 unterscheidet (wie eine leere Excel-Zelle). */
function ZahlFeld({ wert, setze, platzhalter, label, className }: {
  wert: number | null; setze: (v: number | null) => void; platzhalter?: string; label: string; className?: string;
}) {
  const [text, setText] = useState(alsText(wert));
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    if (!fokus) setText(alsText(wert));
  }, [wert, fokus]);
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
        setze(leseZahl(ev.target.value));
      }}
    />
  );
}

const textFeld = "h-8 px-2";
const auswahl = "h-8 w-full rounded-md border border-input bg-background px-1 text-sm";

/** Status der Kaufpreisliste aus den CRM-Feldern der Einheit. */
function statusAusCrm(w: ObjektWohnung): string {
  if (w.status === "verkauft") return "verkauft";
  if (w.status === "reserviert") return "reserviert";
  switch (w.vermietungsStatus) {
    case "vermietet": case "gekuendigt": return "vermietet";
    case "eigennutzung": return "Eigennutzung";
    case "leerstand": case "in_vermietung": return "Leerstand";
  }
  return w.vermietet ? "vermietet" : "Leerstand";
}

/** CRM-Einheit als Zeile; MEA aus Investagon (`object_share_owner` in %, also × 10 für 1.000stel). */
function zeileAusCrm(w: ObjektWohnung, stand: string): KplZeile {
  const pos = (n: unknown) => (Number(n) > 0 ? Number(n) : null);
  const meaProzent = pos(w.investagonRaw?.object_share_owner);
  const seit = w.vermietetSeit ? (w.vermietetSeit.length === 7 ? `${w.vermietetSeit}-01` : w.vermietetSeit) : "";
  const status = statusAusCrm(w);
  const reserviert = (status === "reserviert" || status === "verkauft") && w.kundeName
    ? [w.kundeName, w.reserviertAm ? new Date(w.reserviertAm).toLocaleDateString("de-DE") : ""].filter(Boolean).join(", ")
    : "";
  return {
    ...neueKplZeile(w.weNr ? (/^\d/.test(w.weNr) ? `WE ${w.weNr}` : w.weNr) : ""),
    lage: [w.etage, w.lage].filter(Boolean).join(", "),
    status,
    mvBeginn: seit,
    flaeche: pos(w.groesse),
    mea: meaProzent === null ? null : Math.round(meaProzent * 10 * 1000) / 1000,
    ist: pos(getAktuelleMiete(w, stand)),
    bk: pos(w.nebenkostenMonat),
    vk: pos(w.vkGesamt),
    reserviert,
  };
}

const Kaufpreisliste = () => {
  const [eingaben, setEingaben] = useState<KplEingaben>(KPL_STANDARD);
  const [laeuft, setLaeuft] = useState<"xlsx" | "pdf" | "mail" | null>(null);
  const r = useMemo(() => berechneKaufpreisliste(eingaben), [eingaben]);
  const g = r.gesamt;
  const wp = eingaben.wirtschaftsplan;
  const setze = <K extends keyof KplEingaben>(k: K, v: KplEingaben[K]) => setEingaben((alt) => ({ ...alt, [k]: v }));
  const setzeZeile = (id: string, teil: Partial<KplZeile>) =>
    setEingaben((alt) => ({ ...alt, zeilen: alt.zeilen.map((z) => (z.id === id ? { ...z, ...teil } : z)) }));
  const setzeWp = (teil: Partial<Wirtschaftsplan>) =>
    setEingaben((alt) => ({ ...alt, wirtschaftsplan: { ...alt.wirtschaftsplan, ...teil } }));
  const setzePos = (id: string, teil: Partial<WpPosition>) =>
    setzeWp({ positionen: wp.positionen.map((p) => (p.id === id ? { ...p, ...teil } : p)) });

  const objektStand = useLiveVersion(["objekte", "wohnungen"]);
  const objekte = useMemo(
    () => getObjekte().filter((o) => o.wohnungen?.length).sort((a, b) => a.titel.localeCompare(b.titel, "de")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objektStand],
  );

  const objektWaehlen = (id: string) => {
    if (id === KEIN_OBJEKT) return setze("objektId", null);
    const o = objekte.find((x) => x.id === id);
    if (!o) return;
    if (eingaben.zeilen.some((z) => z.flaeche !== null || z.vk !== null) && !window.confirm("Die Einheiten durch die des Objekts ersetzen? Der Wirtschaftsplan bleibt.")) return;
    const zeilen = [...o.wohnungen]
      .sort((a, b) => a.weNr.localeCompare(b.weNr, "de", { numeric: true }))
      .map((w) => zeileAusCrm(w, eingaben.stand));
    setEingaben((alt) => ({
      ...alt, objektId: o.id, objektName: o.titel, ort: [o.plz, o.ort].filter(Boolean).join(" "), zeilen,
      wirtschaftsplan: { ...alt.wirtschaftsplan, anzahlEinheiten: alt.wirtschaftsplan.anzahlEinheiten ?? zeilen.length },
    }));
  };

  // Versionen, Muster wie im Ankaufstool.
  const cacheStand = useLiveVersion(["user_settings"]);
  const [gespeichertStand, setGespeichertStand] = useState(0);
  const [aktiveVersion, setAktiveVersion] = useState<string | null>(null);
  const [speichertGerade, setSpeichertGerade] = useState(false);
  const versionen = useMemo(
    () => getUserSetting<KplVersion[]>(KPL_VERSIONEN_SCHLUESSEL, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheStand, gespeichertStand],
  );
  const versionenSchreiben = async (liste: KplVersion[]) => {
    await setUserSettingSicher(KPL_VERSIONEN_SCHLUESSEL, liste);
    setGespeichertStand((n) => n + 1);
  };
  const versionSichern = async () => {
    const jetzt = new Date();
    const name = eingaben.objektName.trim() || `Liste vom ${jetzt.toLocaleDateString("de-DE")} ${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    const neu: KplVersion = { id: crypto.randomUUID(), name, gespeichertAm: jetzt.toISOString(), eingaben };
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
  const versionLaden = (v: KplVersion) => {
    const standard = KPL_STANDARD();
    setEingaben({ ...standard, ...v.eingaben, wirtschaftsplan: { ...standard.wirtschaftsplan, ...v.eingaben.wirtschaftsplan } });
    setAktiveVersion(v.id);
  };
  const versionLoeschen = async (v: KplVersion) => {
    if (!window.confirm(`Version „${v.name}“ löschen?`)) return;
    try {
      await versionenSchreiben(versionen.filter((x) => x.id !== v.id));
      if (aktiveVersion === v.id) setAktiveVersion(null);
    } catch (err) {
      console.error(err);
      toast.error("Die Version konnte nicht gelöscht werden.");
    }
  };

  const xlsxDatei = async () => new File([await baueKaufpreislisteXlsx(eingaben)], `${kplDateiname(eingaben)}.xlsx`, { type: XLSX_MIME });
  const pdfDatei = async () => new File([(await buildKaufpreislistePdf(eingaben)).output("blob")], `${kplDateiname(eingaben)}.pdf`, { type: "application/pdf" });
  const ausfuehren = async (art: "xlsx" | "pdf" | "mail", schritt: () => Promise<void>) => {
    setLaeuft(art);
    try {
      await schritt();
    } catch (err) {
      console.error(err);
      toast.error(art === "pdf" ? "Das PDF konnte nicht erstellt werden." : art === "xlsx" ? "Die Excel konnte nicht erstellt werden." : "Der Versand konnte nicht vorbereitet werden.");
    } finally {
      setLaeuft(null);
    }
  };
  const excelLaden = () => ausfuehren("xlsx", async () => { const d = await xlsxDatei(); dateiHerunterladen(d, d.name); });
  const pdfLaden = () => ausfuehren("pdf", async () => { const d = await pdfDatei(); dateiHerunterladen(d, d.name); });
  const perMail = () => ausfuehren("mail", async () => {
    const weg = await kaufpreislisteVersenden(eingaben.objektName, [await xlsxDatei(), await pdfDatei()]);
    if (weg === "mailto") toast.info("Excel und PDF sind heruntergeladen. Bitte im Mailentwurf anhängen.");
  });

  const kennzahlen: [string, string][] = [
    ["Fläche", `${zahl(g.flaeche, 2)} m²`],
    ["Ist-Miete / Monat", eur(g.ist, 2)],
    ["Soll-Miete / Monat", eur(g.soll, 2)],
    ["Verkaufspreise", eur(g.vk)],
    ["Rendite Ist / Soll", `${leer(g.renditeIst, (n) => prozent(n, 2))} / ${leer(g.renditeSoll, (n) => prozent(n, 2))}`],
    ["Vermietet", `${g.vermietet} von ${g.einheiten} WE`],
  ];
  const pruef = hausgeldMonat(wp, wp.pruefMea);
  const th = "font-medium pb-1 px-1 whitespace-nowrap";
  const tdZahl = "py-1 px-1 text-right tabular-nums whitespace-nowrap";

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        <PageHeader title="Kaufpreisliste" subtitle="Einheiten, Mieterliste, Soll-Miete, Kaufpreis und Hausgeld aus dem Wirtschaftsplan in einer Liste.">
          <Button variant="outline" size="sm" onClick={() => { setEingaben(KPL_STANDARD()); setAktiveVersion(null); }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Zurücksetzen
          </Button>
          <Button variant="outline" size="sm" onClick={perMail} disabled={laeuft !== null}>
            <Mail className="h-4 w-4 mr-1" /> {laeuft === "mail" ? "Bereite vor …" : "Per Mail versenden"}
          </Button>
          <Button variant="outline" size="sm" onClick={pdfLaden} disabled={laeuft !== null}>
            <FileDown className="h-4 w-4 mr-1" /> {laeuft === "pdf" ? "Erstelle PDF …" : "Als PDF"}
          </Button>
          <Button size="sm" onClick={excelLaden} disabled={laeuft !== null}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> {laeuft === "xlsx" ? "Erstelle Excel …" : "Als Excel herunterladen"}
          </Button>
        </PageHeader>

        <SectionCard>
          <SectionCardHeader>
            <SectionCardTitle>Objekt & Vorgaben</SectionCardTitle>
            <SectionCardDescription>
              Objekt aus dem CRM wählen, dann kommen Einheiten, Fläche, Ist-Miete, Nebenkosten, Verkaufspreis, Status und (aus Investagon) MEA mit. Oder frei ausfüllen. Alles bleibt änderbar.
            </SectionCardDescription>
          </SectionCardHeader>
          <SectionCardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <Label htmlFor="kpl-objekt">Objekt</Label>
                <Input id="kpl-objekt" value={eingaben.objektName} onChange={(ev) => setze("objektName", ev.target.value)} placeholder="z. B. Marktstraße 6" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kpl-ort">Ort</Label>
                <Input id="kpl-ort" value={eingaben.ort} onChange={(ev) => setze("ort", ev.target.value)} placeholder="z. B. 14822 Brück" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kpl-stand">Stand</Label>
                <Input id="kpl-stand" type="date" value={eingaben.stand} onChange={(ev) => setze("stand", ev.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Soll-Miete Vorgabe (€/m²)</Label>
                <ZahlFeld label="Soll-Miete Vorgabe in Euro je Quadratmeter" wert={eingaben.sollQmVorgabe} setze={(v) => setze("sollQmVorgabe", v)} className="h-10" />
                <p className="text-xs text-muted-foreground">Gilt für alle Einheiten ohne eigenen Soll-Wert.</p>
              </div>
              <div className="space-y-1">
                <Label>Mietsubvention gesamt (€)</Label>
                <ZahlFeld label="Mietsubvention gesamt in Euro" wert={eingaben.subventionGesamt} setze={(v) => setze("subventionGesamt", v)} className="h-10" />
                <p className="text-xs text-muted-foreground">Wird nach Verkaufspreis auf die Einheiten verteilt.</p>
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
                        {" · "}{v.eingaben.zeilen.length} Einheiten
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

        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {kennzahlen.map(([label, wert]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-base font-semibold tabular-nums">{wert}</div>
            </div>
          ))}
        </div>

        <SectionCard>
          <SectionCardHeader>
            <SectionCardTitle>Einheiten</SectionCardTitle>
            <SectionCardDescription>
              Beträge pro Monat. Soll €/m² leer lassen, dann gilt die Vorgabe. Das Hausgeld rechnet sich aus dem Wirtschaftsplan unten über die MEA.
            </SectionCardDescription>
          </SectionCardHeader>
          <SectionCardContent>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    {["WE", "Lage / Nutzung", "Status", "Mieter", "MV-Beginn"].map((t) => <th key={t} className={cn(th, "text-left")}>{t}</th>)}
                    {["Fläche m²", "MEA", "Nettokalt", "Ist €/m²", "BK-Vor.", "HK-Vor.", "Strom p.", "Wasser/Hzg. p.", "NK p.", "MwSt.", "Gesamtmiete", "Ist Jahr",
                      "Soll €/m²", "Soll mtl.", "Soll Jahr", "Verkaufspreis", "VK €/m²", "Rend. Ist", "Rend. Soll",
                      "HG uml.", "HG Heiz.", "HG n. uml.", "HG Rückl.", "Hausgeld", "Überschuss Soll", "Subvention"].map((t) => <th key={t} className={cn(th, "text-right")}>{t}</th>)}
                    <th className={cn(th, "text-left")}>Reserviert</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody>
                  {eingaben.zeilen.map((z, i) => {
                    const zr = r.zeilen[i];
                    const zf = (k: keyof KplZeile, label: string, breite = "w-20", platzhalter?: string) => (
                      <td className="py-1 px-1">
                        <ZahlFeld label={label} wert={z[k] as number | null} platzhalter={platzhalter} setze={(v) => setzeZeile(z.id, { [k]: v })} className={breite} />
                      </td>
                    );
                    const ergebnis = (n: number | null, f: (n: number) => string = (x) => eur(x, 2)) => <td className={tdZahl}>{leer(n, f)}</td>;
                    return (
                      <tr key={z.id} className="border-t border-border/40">
                        <td className="py-1 px-1"><Input aria-label="WE" value={z.we} onChange={(ev) => setzeZeile(z.id, { we: ev.target.value })} className={cn(textFeld, "w-20")} /></td>
                        <td className="py-1 px-1"><Input aria-label="Lage / Nutzung" value={z.lage} onChange={(ev) => setzeZeile(z.id, { lage: ev.target.value })} className={cn(textFeld, "w-44")} /></td>
                        <td className="py-1 px-1">
                          <select aria-label="Status" value={z.status} onChange={(ev) => setzeZeile(z.id, { status: ev.target.value })} className={cn(auswahl, "w-28")}>
                            <option value="" />
                            {KPL_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                            {z.status && !(KPL_STATUS as readonly string[]).includes(z.status) && <option value={z.status}>{z.status}</option>}
                          </select>
                        </td>
                        <td className="py-1 px-1"><Input aria-label="Mieter" value={z.mieter} onChange={(ev) => setzeZeile(z.id, { mieter: ev.target.value })} className={cn(textFeld, "w-44")} /></td>
                        <td className="py-1 px-1"><Input aria-label="MV-Beginn" type="date" value={z.mvBeginn} onChange={(ev) => setzeZeile(z.id, { mvBeginn: ev.target.value })} className={cn(textFeld, "w-36")} /></td>
                        {zf("flaeche", "Fläche")}
                        {zf("mea", "MEA", "w-16")}
                        {zf("ist", "Nettokaltmiete monatlich")}
                        {ergebnis(zr.istQm)}
                        {zf("bk", "BK-Vorauszahlung")}
                        {zf("hk", "HK-Vorauszahlung")}
                        {zf("strom", "Strom pauschal", "w-16")}
                        {zf("wasser", "Wasser/Heizung pauschal", "w-16")}
                        {zf("nk", "NK pauschal", "w-16")}
                        {zf("mwst", "MwSt.", "w-16")}
                        {ergebnis(zr.gesamtmiete)}
                        {ergebnis(zr.istJahr)}
                        {zf("sollQm", "Soll Euro je Quadratmeter", "w-16", eingaben.sollQmVorgabe === null ? "" : alsText(eingaben.sollQmVorgabe))}
                        {ergebnis(zr.soll)}
                        {ergebnis(zr.sollJahr)}
                        {zf("vk", "Verkaufspreis", "w-24")}
                        {ergebnis(zr.vkQm)}
                        {ergebnis(zr.renditeIst, (n) => prozent(n, 2))}
                        {ergebnis(zr.renditeSoll, (n) => prozent(n, 2))}
                        {ergebnis(zr.hgUml)}
                        {ergebnis(zr.hgHk)}
                        {ergebnis(zr.hgNuml)}
                        {ergebnis(zr.hgEr)}
                        <td className={cn(tdZahl, "font-semibold")}>{leer(zr.hg, (n) => eur(n, 2))}</td>
                        <td className={cn(tdZahl, zr.ueberschuss !== null && zr.ueberschuss < 0 && "text-destructive")}>{leer(zr.ueberschuss, (n) => eur(n, 2))}</td>
                        {ergebnis(zr.subvention)}
                        <td className="py-1 px-1"><Input aria-label="Reserviert" value={z.reserviert} onChange={(ev) => setzeZeile(z.id, { reserviert: ev.target.value })} className={cn(textFeld, "w-40")} /></td>
                        <td className="py-1 pl-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Einheit ${z.we} entfernen`}
                            onClick={() => setEingaben((alt) => ({ ...alt, zeilen: alt.zeilen.filter((x) => x.id !== z.id) }))}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-semibold tabular-nums">
                    <td className="py-2 px-1">GESAMT</td>
                    <td />
                    <td className="py-2 px-1 whitespace-nowrap" colSpan={3}>{g.vermietet} verm. / {g.einheiten} WE</td>
                    {[
                      `${zahl(g.flaeche, 2)}`, zahl(g.mea, 1), eur(g.ist, 2), leer(g.istQm, (n) => eur(n, 2)), eur(g.bk, 2), eur(g.hk, 2), eur(g.strom, 2),
                      eur(g.wasser, 2), eur(g.nk, 2), eur(g.mwst, 2), eur(g.gesamtmiete, 2), eur(g.istJahr, 2), leer(g.sollQm, (n) => eur(n, 2)),
                      eur(g.soll, 2), eur(g.sollJahr, 2), eur(g.vk), leer(g.vkQm, (n) => eur(n, 2)), leer(g.renditeIst, (n) => prozent(n, 2)),
                      leer(g.renditeSoll, (n) => prozent(n, 2)), eur(g.hgUml, 2), eur(g.hgHk, 2), eur(g.hgNuml, 2), eur(g.hgEr, 2), eur(g.hg, 2),
                      eur(g.ueberschuss, 2), eur(g.subvention, 2),
                    ].map((t, i) => <td key={i} className={cn(tdZahl, "py-2")}>{t}</td>)}
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="mt-3"
              onClick={() => setEingaben((alt) => ({ ...alt, zeilen: [...alt.zeilen, neueKplZeile(`WE ${alt.zeilen.length + 1}`)] }))}>
              <Plus className="h-4 w-4 mr-1" /> Einheit hinzufügen
            </Button>
          </SectionCardContent>
        </SectionCard>

        <SectionCard>
          <SectionCardHeader>
            <SectionCardTitle>Wirtschaftsplan</SectionCardTitle>
            <SectionCardDescription>
              Gesamtansätze pro Jahr aus dem Wirtschaftsplan der Gemeinschaft. Verteiler MEA verteilt nach Miteigentumsanteil, WE gleich je Einheit.
            </SectionCardDescription>
          </SectionCardHeader>
          <SectionCardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Gesamt-MEA</Label>
                <ZahlFeld label="Gesamt-MEA" wert={wp.gesamtMea} setze={(v) => setzeWp({ gesamtMea: v })} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label>Anzahl Einheiten (Verteiler WE)</Label>
                <ZahlFeld label="Anzahl Einheiten" wert={wp.anzahlEinheiten} setze={(v) => setzeWp({ anzahlEinheiten: v })} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label>Gesamtfläche lt. Plan (m²)</Label>
                <ZahlFeld label="Gesamtfläche laut Plan" wert={wp.gesamtflaeche} setze={(v) => setzeWp({ gesamtflaeche: v })} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kpl-gueltig">Plan gültig ab</Label>
                <Input id="kpl-gueltig" value={wp.gueltigAb} onChange={(ev) => setzeWp({ gueltigAb: ev.target.value })} placeholder="z. B. 2027" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className={cn(th, "text-left")}>Position</th>
                    <th className={cn(th, "text-left")}>Kategorie</th>
                    <th className={cn(th, "text-right")}>Ansatz €/Jahr</th>
                    <th className={cn(th, "text-left")}>Verteiler</th>
                    <th className={cn(th, "text-left")}>Hinweis</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody>
                  {wp.positionen.map((p) => (
                    <tr key={p.id} className="border-t border-border/40">
                      <td className="py-1 px-1"><Input aria-label="Position" value={p.position} onChange={(ev) => setzePos(p.id, { position: ev.target.value })} className={textFeld} /></td>
                      <td className="py-1 px-1">
                        <select aria-label="Kategorie" value={p.kategorie} onChange={(ev) => setzePos(p.id, { kategorie: ev.target.value as HausgeldKategorie })} className={cn(auswahl, "w-40")}>
                          {HAUSGELD_KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-1"><ZahlFeld label="Ansatz pro Jahr" wert={p.ansatzJahr} setze={(v) => setzePos(p.id, { ansatzJahr: v })} className="w-28" /></td>
                      <td className="py-1 px-1">
                        <select aria-label="Verteiler" value={p.verteiler} onChange={(ev) => setzePos(p.id, { verteiler: ev.target.value as Verteiler })} className={cn(auswahl, "w-20")}>
                          <option value="MEA">MEA</option>
                          <option value="WE">WE</option>
                        </select>
                      </td>
                      <td className="py-1 px-1"><Input aria-label="Hinweis" value={p.hinweis} onChange={(ev) => setzePos(p.id, { hinweis: ev.target.value })} className={textFeld} /></td>
                      <td className="py-1 pl-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Position ${p.position} entfernen`}
                          onClick={() => setzeWp({ positionen: wp.positionen.filter((x) => x.id !== p.id) })}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={() => setzeWp({ positionen: [...wp.positionen, neueWpPosition()] })}>
              <Plus className="h-4 w-4 mr-1" /> Position hinzufügen
            </Button>
            <div className="grid gap-6 md:grid-cols-2">
              <dl className="text-sm">
                {HAUSGELD_KATEGORIEN.map((k) => (
                  <div key={k} className="flex justify-between gap-3 py-1 border-b border-border/40">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{eur(kategorieSumme(wp, k), 2)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 py-1 font-semibold">
                  <dt>Summe der Ausgaben</dt>
                  <dd className="tabular-nums">{eur(HAUSGELD_KATEGORIEN.reduce((s, k) => s + kategorieSumme(wp, k), 0), 2)}</dd>
                </div>
              </dl>
              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="text-sm font-medium">Prüfung: Hausgeld einer Einheit</div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-28">MEA der Einheit</Label>
                  <ZahlFeld label="MEA der Einheit für die Prüfung" wert={wp.pruefMea} setze={(v) => setzeWp({ pruefMea: v })} className="w-24" />
                </div>
                <div className="text-sm">
                  Hausgeld pro Monat: <span className="font-semibold tabular-nums">{leer(pruef, (n) => eur(n, 2))}</span>
                </div>
                <p className="text-xs text-muted-foreground">Zum Abgleich mit dem Einzelwirtschaftsplan einer Einheit.</p>
              </div>
            </div>
          </SectionCardContent>
        </SectionCard>

        <p className="text-xs text-muted-foreground px-1">{KPL_HINWEIS}</p>
      </div>
    </DashboardLayout>
  );
};

export default Kaufpreisliste;
