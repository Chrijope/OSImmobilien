import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Award, Download, Loader2, MessageSquare, Send, Undo2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { openUnterlage } from "@/lib/storage";
import { createAngebot, updateAngebot, updateDokumentStatus } from "@/lib/finanzierungStore";
import {
  STATUS_TEXT, aendereEinreichung, angeboteImVergleich, bankenKollisionen, darfFinanzierungSteuern,
  fehlendeAngaben, fristAmpel, gibZuschlag, ladeEinreichungen, ladeNachrichten, ladeZugriffe, laeuft,
  monatsrate, schreibeNachricht,
  type Einreichung, type EinreichungAngebot, type EinreichungNachricht,
} from "@/lib/finanzierungEinreichung";

/**
 * Einreichungen eines Investments bei mehreren Finanzierern (Christian,
 * 27.10.2026).
 *
 * Die Leitung (admin, inhaber, backoffice) sieht alle Einreichungen mit
 * Stand, Frist, Zielbanken, Angebotsvergleich und vergibt den Zuschlag. Der
 * Finanzierer sieht nur seine eigene: Die Datenbank liefert ihm keine andere
 * Zeile, die Oberflaeche muss also nichts ausblenden. Alle anderen Rollen
 * bekommen keine Zeile und sehen nichts.
 */

const eur = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const prozent = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 3 })} %`;
const datum = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("de-DE") : "");

const STATUS_FARBE: Record<string, string> = {
  eingereicht: "bg-muted text-muted-foreground",
  in_pruefung: "bg-primary/10 text-primary",
  rueckfrage: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  angebot: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  zuschlag: "bg-[hsl(var(--success))] text-white",
  abgelehnt: "bg-destructive/10 text-destructive",
  abgesagt: "bg-muted text-muted-foreground",
  zurueckgezogen: "bg-muted text-muted-foreground",
};
const AMPEL: Record<string, string> = { rot: "bg-destructive", gelb: "bg-[hsl(var(--warning))]", gruen: "bg-[hsl(var(--success))]" };

function StatusMarke({ status }: { status: Einreichung["status"] }) {
  return <Badge variant="outline" className={`text-xs border-0 ${STATUS_FARBE[status]}`}>{STATUS_TEXT[status]}</Badge>;
}

function Frist({ e }: { e: Einreichung }) {
  const ampel = fristAmpel(e);
  if (!e.frist_bis || !ampel) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${AMPEL[ampel]}`} /> Angebot bis {datum(e.frist_bis)}
    </span>
  );
}

export function FinanzierungEinreichungen({ investmentId }: { investmentId: string }) {
  const { user } = useUser();
  const steuern = darfFinanzierungSteuern(user.role);
  const [liste, setListe] = useState<Einreichung[] | null>(null);

  const laden = useCallback(() => {
    ladeEinreichungen(investmentId).then(setListe).catch((f) => {
      console.error("[FinanzierungEinreichungen]", f);
      setListe([]);
    });
  }, [investmentId]);
  useEffect(() => {
    laden();
    // Nach „Bei Finanzierern einreichen“ in der Karte darueber.
    window.addEventListener("finanzierung-einreichung", laden);
    return () => window.removeEventListener("finanzierung-einreichung", laden);
  }, [laden]);

  if (!liste || liste.length === 0) {
    return steuern && liste ? (
      <p className="mb-4 text-xs text-muted-foreground">Noch bei keinem Finanzierer eingereicht.</p>
    ) : null;
  }
  return steuern
    ? <LeitungsAnsicht investmentId={investmentId} liste={liste} neuLaden={laden} />
    : <>{liste.map((e) => <FinanziererAnsicht key={e.id} e={e} neuLaden={laden} />)}</>;
}

// ---------------------------------------------------------------------------
// Leitung
// ---------------------------------------------------------------------------

function LeitungsAnsicht({ investmentId, liste, neuLaden }: { investmentId: string; liste: Einreichung[]; neuLaden: () => void }) {
  const namen = new Map(loadAllUsers().map((u) => [u.id, u.name || "Unbekannt"]));
  const name = (id: string) => namen.get(id) || "Unbekannt";
  const kollisionen = bankenKollisionen(liste);
  const vergleich = angeboteImVergleich(liste);
  const [offen, setOffen] = useState<string | null>(null);
  const [zugriffe, setZugriffe] = useState<Array<{ user_id: string; aktion: string; am: string }> | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const zuschlag = async (e: Einreichung) => {
    const ok = await confirmDialog({
      title: `Zuschlag an ${name(e.finanzierer_id)}?`,
      description: "Alle anderen laufenden Einreichungen dieses Kunden werden abgesagt, die Finanzierer bekommen eine Glocke. Das Angebot wird in die Finanzierung übernommen; für den Kunden sichtbar wird es erst, wenn es dort freigegeben ist.",
      confirmText: "Zuschlag geben",
      cancelText: "Abbrechen",
    });
    if (!ok) return;
    setArbeitet(true);
    try {
      await gibZuschlag(e.id);
      if (e.angebot) await inFinanzierungUebernehmen(investmentId, e);
      toast.success("Zuschlag erteilt.");
    } catch (f: any) {
      toast.error(f?.message || "Zuschlag fehlgeschlagen.");
    } finally {
      setArbeitet(false);
      neuLaden();
    }
  };

  const zurueckziehen = async (e: Einreichung) => {
    const ok = await confirmDialog({
      title: `Einreichung bei ${name(e.finanzierer_id)} zurückziehen?`,
      description: "Der Finanzierer verliert den Zugang zu diesem Kunden und bekommt eine Glocke.",
      confirmText: "Zurückziehen",
      cancelText: "Abbrechen",
    });
    if (!ok) return;
    try {
      await aendereEinreichung(e.id, { status: "zurueckgezogen" });
    } catch (f: any) {
      toast.error(f?.message || "Zurückziehen fehlgeschlagen.");
    }
    neuLaden();
  };

  return (
    <div className="mb-4 rounded-lg border px-4 py-3 space-y-3" data-finanzierung-einreichungen>
      <p className="text-sm font-semibold">Einreichungen bei Finanzierern</p>

      {kollisionen.size > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Doppelte Bankanfrage</p>
          {[...kollisionen.entries()].map(([bank, ids]) => (
            <p key={bank}>{bank}: angefragt von {ids.map(name).join(" und ")}. Die Bank sieht den Kunden zweimal, bitte abstimmen.</p>
          ))}
        </div>
      )}

      <ul className="divide-y">
        {liste.map((e) => (
          <li key={e.id} className="py-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{name(e.finanzierer_id)}</span>
              <StatusMarke status={e.status} />
              <Frist e={e} />
              {!e.gesichtet_am && laeuft(e) && <span className="text-xs text-muted-foreground">noch nicht geöffnet</span>}
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOffen(offen === e.id ? null : e.id)}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" /> Verlauf
                </Button>
                {laeuft(e) && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={arbeitet} onClick={() => zuschlag(e)}>
                      <Award className="h-3.5 w-3.5 mr-1" /> Zuschlag
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => zurueckziehen(e)}>
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Zurückziehen
                    </Button>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Banken: {e.banken.length > 0
                ? e.banken.map((b, i) => (
                  <span key={b}>{i > 0 && ", "}<span className={[...kollisionen.keys()].some((k) => k.toLowerCase() === b.trim().toLowerCase()) ? "text-destructive font-semibold" : ""}>{b}</span></span>
                ))
                : "noch nicht angegeben"}
              {e.status === "abgelehnt" && e.grund ? ` · Ablehnungsgrund: ${e.grund}` : ""}
            </p>
            {offen === e.id && <Verlauf einreichung={e} namen={namen} />}
          </li>
        ))}
      </ul>

      {vergleich.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Angebote im Vergleich</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  {["Finanzierer", "Bank", "Summe", "Sollzins", "Effektivzins", "Zinsbindung", "Tilgung", "Rate", "Bereitstellungszinsfrei", "Sondertilgung", "Gültig bis", ""].map((k) => (
                    <th key={k} className="py-1 pr-3 font-medium whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vergleich.map((e, i) => {
                  const a = e.angebot!;
                  return (
                    <tr key={e.id} className={`border-t ${i === 0 ? "bg-[hsl(var(--success))]/5 font-medium" : ""}`}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{name(e.finanzierer_id)}{i === 0 && vergleich.length > 1 ? " ★" : ""}</td>
                      <td className="pr-3">{a.bank}</td>
                      <td className="pr-3 whitespace-nowrap">{eur(a.summe)}</td>
                      <td className="pr-3">{prozent(a.sollzins)}</td>
                      <td className="pr-3">{prozent(a.effektivzins)}</td>
                      <td className="pr-3 whitespace-nowrap">{a.zinsbindungJahre} J.</td>
                      <td className="pr-3">{prozent(a.tilgung)}</td>
                      <td className="pr-3 whitespace-nowrap">{eur(monatsrate(a))}</td>
                      <td className="pr-3 whitespace-nowrap">{a.bereitstellungszinsfreiMonate} Mon.</td>
                      <td className="pr-3">{a.sondertilgung}</td>
                      <td className="pr-3 whitespace-nowrap">{datum(a.gueltigBis)}</td>
                      <td>{e.angebot_datei && (
                        <button className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => openUnterlage(e.angebot_datei)}>
                          <Download className="h-3 w-3" /> PDF
                        </button>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <button className="text-xs text-muted-foreground hover:underline" onClick={() => {
          if (zugriffe) setZugriffe(null);
          else ladeZugriffe(investmentId).then(setZugriffe).catch(() => setZugriffe([]));
        }}>
          {zugriffe ? "Download-Protokoll ausblenden" : "Download-Protokoll anzeigen"}
        </button>
        {zugriffe && (
          <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
            {zugriffe.length === 0 && <li>Noch keine Downloads.</li>}
            {zugriffe.map((z, i) => (
              <li key={i}>{new Date(z.am).toLocaleString("de-DE")}: {namen.get(z.user_id) || "Unbekannt"}, {z.aktion}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Das gewonnene Angebot in die bisherige Finanzierung uebernehmen. Von dort
 * laufen Freigabe fuer den Kunden, Grundschuld und Darlehensvertrag wie
 * gewohnt. Die PDF kommt an den Ort, an dem die Finanzierung ihre Dateien
 * sucht.
 */
async function inFinanzierungUebernehmen(investmentId: string, e: Einreichung) {
  const a = e.angebot!;
  const komma = (v: number) => String(v).replace(".", ",");
  const neu = createAngebot(investmentId);
  updateAngebot(investmentId, neu.id, {
    bank: a.bank,
    summe: a.summe,
    zins: komma(a.sollzins),
    tilgung: komma(a.tilgung),
    laufzeit: `${a.zinsbindungJahre} Jahre Sollzinsbindung`,
    anmerkungen: [
      `Effektivzins ${komma(a.effektivzins)} %`,
      `bereitstellungszinsfrei ${a.bereitstellungszinsfreiMonate} Monate`,
      `Sondertilgung ${a.sondertilgung}`,
      `gültig bis ${datum(a.gueltigBis)}`,
      a.anmerkungen,
    ].filter(Boolean).join(", "),
  });
  const dok = neu.dokumente.find((d) => d.name === "Finanzierungsangebot");
  if (!e.angebot_datei || !dok) return;
  const ziel = `finanzierung/${investmentId}/${neu.id}/${dok.id}_${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("unterlagen").copy(e.angebot_datei, ziel);
  if (error) {
    toast.warning("Angebot übernommen, die PDF bitte in der Finanzierung noch einmal hochladen.");
    return;
  }
  updateDokumentStatus(investmentId, neu.id, dok.id, "uploaded", ziel);
}

// ---------------------------------------------------------------------------
// Finanzierer
// ---------------------------------------------------------------------------

const LEER: Partial<EinreichungAngebot> = {};

function FinanziererAnsicht({ e, neuLaden }: { e: Einreichung; neuLaden: () => void }) {
  const offen = laeuft(e);
  const [banken, setBanken] = useState(e.banken.join(", "));
  const [form, setForm] = useState<Partial<EinreichungAngebot>>(e.angebot || LEER);
  const [datei, setDatei] = useState<File | null>(null);
  const [grund, setGrund] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const dateiFeld = useRef<HTMLInputElement>(null);

  // Gesichtet zaehlt fuer die Reaktionszeit in den Kennzahlen.
  useEffect(() => {
    if (!e.gesichtet_am && offen) aendereEinreichung(e.id, { gesichtet_am: new Date().toISOString() }).catch(() => {});
  }, [e.id, e.gesichtet_am, offen]);

  const speichern = async (aenderung: Partial<Einreichung>, meldung: string) => {
    setArbeitet(true);
    try {
      await aendereEinreichung(e.id, aenderung);
      toast.success(meldung);
      neuLaden();
    } catch (f: any) {
      toast.error(f?.message || "Speichern fehlgeschlagen.");
    } finally {
      setArbeitet(false);
    }
  };

  const fehlt = fehlendeAngaben(form, !!datei || !!e.angebot_datei);
  const angebotAbgeben = async () => {
    if (fehlt.length > 0) return;
    setArbeitet(true);
    try {
      let pfad = e.angebot_datei;
      if (datei) {
        pfad = `finanzierung/${e.investment_id}/einreichung-${e.id}/angebot_${Date.now()}.pdf`;
        const { error } = await supabase.storage.from("unterlagen").upload(pfad, datei, { contentType: "application/pdf" });
        if (error) throw error;
      }
      await aendereEinreichung(e.id, { angebot: form as EinreichungAngebot, angebot_datei: pfad, status: "angebot" });
      toast.success("Angebot abgegeben.");
      setDatei(null);
      neuLaden();
    } catch (f: any) {
      toast.error(f?.message || "Angebot konnte nicht gespeichert werden.");
    } finally {
      setArbeitet(false);
    }
  };

  const zahlFeld = (feld: keyof EinreichungAngebot, label: string, schritt = "0.01") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={schritt} className="h-8" disabled={!offen} value={(form[feld] as number | undefined) ?? ""}
        onChange={(ev) => setForm({ ...form, [feld]: ev.target.value === "" ? undefined : Number(ev.target.value) })} />
    </div>
  );
  const textFeld = (feld: keyof EinreichungAngebot, label: string, typ = "text") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={typ} className="h-8" disabled={!offen} value={(form[feld] as string | undefined) ?? ""}
        onChange={(ev) => setForm({ ...form, [feld]: ev.target.value })} />
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border px-4 py-3 space-y-4" data-finanzierung-einreichung>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Finanzierungsanfrage</p>
        <StatusMarke status={e.status} />
        <Frist e={e} />
      </div>

      {offen && (
        <div className="flex flex-wrap gap-2">
          {e.status !== "in_pruefung" && e.status !== "angebot" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={arbeitet}
              onClick={() => speichern({ status: "in_pruefung" }, "Stand: in Prüfung.")}>In Prüfung</Button>
          )}
          {e.status !== "rueckfrage" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={arbeitet}
              onClick={() => speichern({ status: "rueckfrage" }, "Stand: Rückfrage. Bitte die Frage im Verlauf unten stellen.")}>Rückfrage</Button>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Banken, bei denen angefragt wird (durch Komma getrennt)</Label>
        <div className="flex gap-2">
          <Input className="h-8" disabled={!offen} value={banken} onChange={(ev) => setBanken(ev.target.value)} placeholder="z.B. Sparkasse Berlin, DKB" />
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!offen || arbeitet}
            onClick={() => speichern({ banken: banken.split(",").map((b) => b.trim()).filter(Boolean) }, "Banken gespeichert.")}>Speichern</Button>
        </div>
        <p className="text-xs text-muted-foreground">Nur für die Leitung von OS sichtbar, nicht für andere Finanzierer.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Angebot</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {textFeld("bank", "Bank")}
          {zahlFeld("summe", "Darlehenssumme (€)", "1000")}
          {zahlFeld("sollzins", "Sollzins (%)")}
          {zahlFeld("effektivzins", "Effektivzins (%)")}
          {zahlFeld("zinsbindungJahre", "Sollzinsbindung (Jahre)", "1")}
          {zahlFeld("tilgung", "Anfängliche Tilgung (%)")}
          {zahlFeld("bereitstellungszinsfreiMonate", "Bereitstellungszinsfrei (Monate)", "1")}
          {textFeld("sondertilgung", "Sondertilgung (z.B. 5 % p.a.)")}
          {textFeld("gueltigBis", "Angebot gültig bis", "date")}
        </div>
        {(form.summe ?? 0) > 0 && <p className="text-xs text-muted-foreground">Monatsrate: {eur(monatsrate(form as EinreichungAngebot))}</p>}
        <div>
          <Label className="text-xs">Anmerkungen</Label>
          <Textarea rows={2} disabled={!offen} value={form.anmerkungen ?? ""} onChange={(ev) => setForm({ ...form, anmerkungen: ev.target.value })} />
        </div>
        <input ref={dateiFeld} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(ev) => { setDatei(ev.target.files?.[0] || null); ev.target.value = ""; }} />
        {offen && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => dateiFeld.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> {datei ? datei.name : e.angebot_datei ? "Andere PDF wählen" : "Angebot als PDF wählen"}
            </Button>
            {e.angebot_datei && !datei && (
              <button className="text-xs text-primary hover:underline" onClick={() => openUnterlage(e.angebot_datei)}>Hochgeladene PDF ansehen</button>
            )}
            <Button size="sm" className="h-8 text-xs" disabled={arbeitet || fehlt.length > 0} onClick={angebotAbgeben}>
              {arbeitet ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {e.status === "angebot" ? "Angebot aktualisieren" : "Angebot abgeben"}
            </Button>
          </div>
        )}
        {offen && fehlt.length > 0 && <p className="text-xs text-muted-foreground">Es fehlen noch: {fehlt.join(", ")}.</p>}
      </div>

      {offen && (
        <div className="space-y-1">
          <Label className="text-xs">Keine Finanzierung möglich</Label>
          <div className="flex gap-2">
            <Input className="h-8" value={grund} onChange={(ev) => setGrund(ev.target.value)} placeholder="Grund, z.B. Haushaltsrechnung reicht nicht" />
            <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" disabled={!grund.trim() || arbeitet}
              onClick={async () => {
                const ok = await confirmDialog({ title: "Anfrage ablehnen?", description: "Danach ist der Kunde für Sie nicht mehr sichtbar.", confirmText: "Ablehnen", cancelText: "Abbrechen" });
                if (ok) speichern({ status: "abgelehnt", grund: grund.trim() }, "Abgelehnt.");
              }}>Ablehnen</Button>
          </div>
        </div>
      )}

      <Verlauf einreichung={e} namen={new Map(loadAllUsers().map((u) => [u.id, u.name || "Unbekannt"]))} alsFinanzierer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verlauf (Rueckfragen) je Einreichung
// ---------------------------------------------------------------------------

function Verlauf({ einreichung, namen, alsFinanzierer }: { einreichung: Einreichung; namen: Map<string, string>; alsFinanzierer?: boolean }) {
  const [nachrichten, setNachrichten] = useState<EinreichungNachricht[]>([]);
  const [text, setText] = useState("");
  const [nachforderung, setNachforderung] = useState(false);
  const [sendet, setSendet] = useState(false);
  const offen = laeuft(einreichung) || einreichung.status === "zuschlag";

  const laden = useCallback(() => {
    ladeNachrichten(einreichung.id).then(setNachrichten).catch(() => setNachrichten([]));
  }, [einreichung.id]);
  useEffect(laden, [laden]);

  const senden = async () => {
    if (!text.trim()) return;
    setSendet(true);
    try {
      await schreibeNachricht(einreichung.id, text.trim(), nachforderung);
      setText("");
      setNachforderung(false);
      laden();
    } catch (f: any) {
      toast.error(f?.message || "Nachricht nicht gesendet.");
    } finally {
      setSendet(false);
    }
  };

  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verlauf</p>
      {nachrichten.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Nachrichten.</p>}
      {nachrichten.map((n) => (
        <div key={n.id} className="text-sm">
          <span className="text-xs text-muted-foreground">
            {namen.get(n.von) || "Unbekannt"}, {new Date(n.erstellt_am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
            {n.nachforderung && <span className="ml-1 font-semibold text-[hsl(var(--warning))]">Unterlage nachgefordert</span>}
          </span>
          <p className="whitespace-pre-wrap">{n.text}</p>
        </div>
      ))}
      {offen && (
        <div className="space-y-1.5">
          <Textarea rows={2} value={text} onChange={(ev) => setText(ev.target.value)} placeholder={alsFinanzierer ? "Frage oder Hinweis an OS" : "Nachricht an den Finanzierer"} />
          <div className="flex items-center gap-3">
            {alsFinanzierer && (
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={nachforderung} onCheckedChange={(v) => setNachforderung(v === true)} />
                Unterlage nachfordern
              </label>
            )}
            <Button size="sm" className="h-7 text-xs ml-auto" disabled={sendet || !text.trim()} onClick={senden}>
              <Send className="h-3.5 w-3.5 mr-1" /> Senden
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
