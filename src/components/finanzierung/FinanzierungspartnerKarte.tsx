import { useState } from "react";
import { toast } from "sonner";
import { Bell, FileArchive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useUnterlagenZip } from "@/hooks/useUnterlagenZip";
import { confirmDialog } from "@/lib/confirm";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { protokolliereZugriff } from "@/lib/finanzierungEinreichung";
import { finanzierungIstFrei } from "@/lib/finanzierungFreigabe";
import { darfObjektpaketHinweisSehen, fehlendeFinanzierungsunterlagen } from "@/lib/finanzierungsObjektpaket";
import { filterFinanzierungspartner } from "@/lib/finanzierungspartner";
import { kundenUnterlagenDateien, type KundenordnerZeile } from "@/lib/finanzierungUnterlagenZip";
import { getInvestmentMetaField, setInvestmentMeta, setInvestmentMetaNurLokal } from "@/lib/investmentsStore";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { getObjektById } from "@/lib/objekteStore";
import { einheitUnterlagenGruppen, objektUnterlagenEintraege } from "@/lib/objektUnterlagenRegeln";
import { darfUnterlagenAlsZip, zipDateienAusBereichen, zipDateiname } from "@/lib/unterlagenZip";
import {
  kennungenLesen,
  meldungenLesen,
  type PartnerMeldung,
} from "../../../supabase/functions/_shared/finanzierung-partner-benachrichtigen";

/**
 * Finanzierungspartner am Investment wählen und benachrichtigen, dazu die
 * Unterlagen als ZIP (Entscheidung des Inhabers vom 16.10.2026).
 *
 * Die Mail trägt keine Anhänge, nur den Link hierher. Wer den Link öffnet,
 * meldet sich an und lädt Kunden- und Objektunterlagen mit den Knöpfen unten.
 * Wer was lesen darf, entscheiden die Leseregeln der Datenbank; die Knöpfe
 * nutzen denselben Weg wie der Einzeldownload.
 */

const FUNCTION_NAME = "finanzierung-partner-benachrichtigen";

function zeitpunkt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

export interface FinanzierungspartnerKarteProps {
  investmentId: string;
  kontaktId: string;
  rvSigned: boolean;
  /** Interne Rolle mit Bearbeitungsrecht am Investment. Sonst nur lesend. */
  darfBearbeiten: boolean;
  /** Bonitätsunterlagen dieses Investments, wie im Abschnitt Unterlagen. */
  docFileUrls: Record<string, string>;
  objektId?: string;
  wohnungId?: string;
  objektTitel?: string;
  weNr?: string;
}

export function FinanzierungspartnerKarte(p: FinanzierungspartnerKarteProps) {
  const { user } = useUser();
  const partner = filterFinanzierungspartner(loadAllUsers());
  const [gewaehlt, setGewaehlt] = useState<string[]>(() =>
    kennungenLesen(getInvestmentMetaField<unknown>(p.investmentId, "finanzierungspartnerIds", [])));
  const [meldungen, setMeldungen] = useState<PartnerMeldung[]>(() =>
    meldungenLesen(getInvestmentMetaField<unknown>(p.investmentId, "finanzierungPartnerMeldungen", [])));
  const [sendet, setSendet] = useState(false);
  const { lauf, starten, abbrechen } = useUnterlagenZip();

  const meldungVon = (id: string) => meldungen.find((m) => m.userId === id);
  const nameVon = (id: string) => partner.find((u) => u.id === id)?.name || "Unbekannt";

  const umschalten = (id: string, an: boolean) => {
    const neu = an ? [...new Set([...gewaehlt, id])] : gewaehlt.filter((x) => x !== id);
    setGewaehlt(neu);
    setInvestmentMeta(p.investmentId, "finanzierungspartnerIds", neu);
  };

  // Nur gewählte, die es als Finanzierungspartner noch gibt.
  const aktiveAuswahl = gewaehlt.filter((id) => partner.some((u) => u.id === id));
  /*
   * Eingereicht wird erst mit freigegebener Bonitaet (Christian, 27.10.2026):
   * Der Finanzierer bekommt die Nachricht „Bonitaetsunterlagen vollstaendig“,
   * das muss dann auch stimmen.
   */
  const bonitaetFrei = finanzierungIstFrei({
    bonitaetFreigabeGemeldetAm: getInvestmentMetaField<string | null>(p.investmentId, "bonitaetFreigabeGemeldetAm", null),
    docStatuses: getInvestmentMetaField<Record<string, string>>(p.investmentId, "docStatuses", {}),
    saData: getInvestmentMetaField<Record<string, unknown> | null>(p.investmentId, "saData", null),
    saSnapshot: getInvestmentMetaField<Record<string, unknown> | null>(p.investmentId, "saSnapshot", null),
  });
  /*
   * Fehlen Pflichtunterlagen im Objektpaket, sieht die Leitung das vor dem
   * Einreichen (Christian, 27.10.2026). Kein Riegel: Der Finanzierer kann mit
   * der Bonitaet schon anfangen, das Paket wird nachgereicht.
   */
  const paketObjekt = p.objektId ? getObjektById(p.objektId) : undefined;
  const paketWohnung = paketObjekt && p.wohnungId ? paketObjekt.wohnungen.find((w) => w.id === p.wohnungId) : undefined;
  const paketFehlt = paketObjekt && darfObjektpaketHinweisSehen(user.role)
    ? fehlendeFinanzierungsunterlagen(paketObjekt, paketWohnung).fehlend
    : [];
  const sperrgrund = aktiveAuswahl.length === 0
    ? "Bitte mindestens einen Finanzierungspartner wählen."
    : !p.rvSigned
      ? "Einreichen geht erst, wenn die Reservierung unterschrieben ist."
      : !bonitaetFrei
        ? "Einreichen geht erst, wenn die Bonitätsunterlagen vollständig freigegeben sind."
        : "";

  const benachrichtigen = async () => {
    if (sperrgrund || sendet) return;
    const empfaenger = aktiveAuswahl.map((id) => partner.find((u) => u.id === id)!);
    const schonGemeldet = empfaenger.filter((u) => meldungVon(u.id));
    const ok = await confirmDialog({
      title: "Finanzierungspartner benachrichtigen?",
      description: [
        "Eine Mail mit Link ins CRM geht an:",
        ...empfaenger.map((u) => `• ${u.name}${u.email ? ` (${u.email})` : ""}`),
        "",
        "Die Mail enthält keine Unterlagen. Sie liegen nach der Anmeldung hier als ZIP bereit.",
        ...(paketFehlt.length > 0 ? ["", `Im Objektpaket fehlt noch: ${paketFehlt.join(", ")}.`] : []),
        ...(schonGemeldet.length > 0
          ? ["", `Schon benachrichtigt: ${schonGemeldet.map((u) => `${u.name} am ${zeitpunkt(meldungVon(u.id)!.am)}`).join("; ")}. Die Mail geht dann erneut hinaus.`]
          : []),
      ].join("\n"),
      confirmText: schonGemeldet.length > 0 ? "Erneut senden" : "Benachrichtigen",
      cancelText: "Abbrechen",
    });
    if (!ok) return;

    setSendet(true);
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { investmentId: p.investmentId, partnerIds: aktiveAuswahl },
      });
      if (error) {
        const mitGrund = (await edgeFehlerMitGrund(error, { functionName: FUNCTION_NAME })) as Error;
        toast.error(mitGrund?.message || "Die Benachrichtigung ist fehlgeschlagen.");
        return;
      }
      const ergebnisse = (data?.ergebnisse || []) as Array<{ userId: string; ok: boolean; grund?: string }>;
      const neueMeldungen = meldungenLesen(data?.meldungen);
      // Die Function hat schon geschrieben, hier nur die Anzeige nachziehen.
      setInvestmentMetaNurLokal(p.investmentId, "finanzierungPartnerMeldungen", neueMeldungen);
      setMeldungen(neueMeldungen);
      const fehler = ergebnisse.filter((e) => !e.ok);
      const gesendet = ergebnisse.length - fehler.length;
      window.dispatchEvent(new CustomEvent("finanzierung-einreichung"));
      if (fehler.length === 0) toast.success(`${gesendet} Finanzierungspartner benachrichtigt.`);
      else toast.warning(`${gesendet} benachrichtigt, nicht erreicht: ${fehler.map((e) => `${nameVon(e.userId)} (${e.grund || "Fehler"})`).join(", ")}`);
    } finally {
      setSendet(false);
    }
  };

  const kundenZip = async () => {
    const { data, error } = await supabase
      .from("kunde_dokumente")
      .select("id, parent_id, typ, name, storage_path")
      .eq("kontakt_id", p.kontaktId)
      .eq("investment_id", p.investmentId);
    if (error) console.warn("[FinanzierungspartnerKarte] Kundenordner nicht ladbar", error);
    const dateien = kundenUnterlagenDateien({
      docFileUrls: p.docFileUrls,
      saPdfPath: getInvestmentMetaField<string>(p.investmentId, "saPdfPath", ""),
      saPdf: getInvestmentMetaField<string>(p.investmentId, "saPdf", ""),
      rvPdfPath: getInvestmentMetaField<string>(p.investmentId, "rvPdfPath", ""),
      kundenordner: (data || []) as KundenordnerZeile[],
    });
    protokolliereZugriff(p.investmentId, "Kundenunterlagen als ZIP");
    starten("kunde", dateien, zipDateiname({ objektTitel: p.objektTitel, weNr: p.weNr, zusatz: "Kunde" }));
  };

  const objektZip = () => {
    const objekt = p.objektId ? getObjektById(p.objektId) : undefined;
    if (!objekt) {
      toast.error("Am Investment ist kein Objekt aus dem Bestand eingetragen.");
      return;
    }
    const wohnung = p.wohnungId ? objekt.wohnungen.find((w) => w.id === p.wohnungId) : undefined;
    const bereiche = wohnung
      ? einheitUnterlagenGruppen(objekt, wohnung)
      : [{ schluessel: "objekt", eintraege: objektUnterlagenEintraege(objekt) }];
    const weNr = wohnung?.weNr || p.weNr;
    const dateien = zipDateienAusBereichen(bereiche, user.role, (s) => (s === "wohnung" ? (weNr ? `Wohnung ${weNr}` : "Wohnung") : "Objekt"));
    protokolliereZugriff(p.investmentId, "Objektunterlagen als ZIP");
    starten("objekt", dateien, zipDateiname({ objektTitel: objekt.titel || p.objektTitel, weNr, zusatz: "Objekt" }));
  };

  const zipKnopf = (art: "kunde" | "objekt", text: string, onClick: () => void) => (
    <Button size="sm" variant="outline" className="text-xs h-8" disabled={!!lauf && lauf.art !== art} onClick={lauf?.art === art ? abbrechen : onClick}>
      {lauf?.art === art
        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{lauf.fertig} von {lauf.gesamt}, abbrechen</>
        : <><FileArchive className="h-3.5 w-3.5 mr-1.5" />{text}</>}
    </Button>
  );

  const anzeige = p.darfBearbeiten ? partner : partner.filter((u) => gewaehlt.includes(u.id));

  // Der Finanzierer sieht nur seine Unterlagen, nicht, wer sonst angefragt ist.
  if (user.role === "finanzierungspartner") {
    return (
      <div className="mb-4 rounded-lg border px-4 py-3 space-y-3" data-finanzierungspartner-karte>
        <p className="text-sm font-semibold">Unterlagen</p>
        <div className="flex flex-wrap gap-2">
          {zipKnopf("kunde", "Kundenunterlagen als ZIP", kundenZip)}
          {zipKnopf("objekt", "Objektunterlagen als ZIP", objektZip)}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border px-4 py-3 space-y-3" data-finanzierungspartner-karte>
      <p className="text-sm font-semibold">Finanzierungspartner</p>

      {partner.length === 0 ? (
        <p className="text-xs text-muted-foreground">Im CRM ist noch niemand mit der Rolle Finanzierungspartner angelegt.</p>
      ) : anzeige.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch kein Finanzierungspartner gewählt.</p>
      ) : (
        <ul className="space-y-1.5">
          {anzeige.map((u) => {
            const meldung = meldungVon(u.id);
            return (
              <li key={u.id} className="flex items-start gap-2 text-sm">
                {p.darfBearbeiten && (
                  <Checkbox
                    id={`fp-${p.investmentId}-${u.id}`}
                    checked={gewaehlt.includes(u.id)}
                    onCheckedChange={(v) => umschalten(u.id, v === true)}
                    className="mt-0.5"
                  />
                )}
                <label htmlFor={`fp-${p.investmentId}-${u.id}`} className="flex-1 min-w-0">
                  <span className="font-medium">{u.name}</span>
                  {u.email && <span className="text-muted-foreground">, {u.email}</span>}
                  {meldung && (
                    <span className="block text-xs text-muted-foreground">benachrichtigt am {zeitpunkt(meldung.am)}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {p.darfBearbeiten && partner.length > 0 && (
        <div className="space-y-1">
          {paketFehlt.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Objektpaket unvollständig:</span> {paketFehlt.join(", ")} fehlt.
            </div>
          )}
          <Button size="sm" className="text-xs h-8" disabled={!!sperrgrund || sendet} onClick={benachrichtigen}>
            {sendet ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Bell className="h-3.5 w-3.5 mr-1.5" />}
            Bei Finanzierern einreichen
          </Button>
          {sperrgrund ? (
            <p className="text-xs text-muted-foreground">{sperrgrund}</p>
          ) : aktiveAuswahl.some((id) => meldungVon(id)) ? (
            <p className="text-xs text-muted-foreground">Erneut senden ist möglich, die Mail geht dann noch einmal hinaus.</p>
          ) : null}
        </div>
      )}

      {darfUnterlagenAlsZip(user.role) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {zipKnopf("kunde", "Kundenunterlagen als ZIP", kundenZip)}
          {zipKnopf("objekt", "Objektunterlagen als ZIP", objektZip)}
        </div>
      )}
    </div>
  );
}
