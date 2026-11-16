import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { cacheGet, onCacheChange } from "@/lib/dataCache";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { erzeugeFinanzierungsanfrage, type AnfrageObjekt } from "@/lib/finanzierungsanfrage";
import { kaufpreisAusMeta, setInvestmentMetaNurLokal } from "@/lib/investmentsStore";
import { getWohnungKurz } from "@/lib/objekteStore";
import { openUnterlage } from "@/lib/storage";
import {
  FA_META_SCHLUESSEL,
  faStandLesen,
  type FaPerson,
} from "../../../supabase/functions/_shared/finanzierungsanfrage";

/**
 * Finanzierungsanfrage im Investment, Bereich Finanzierung (Christian, 16.11.2026).
 *
 * Füllt die Anfrage aus der unterschriebenen Selbstauskunft, schickt sie den
 * Käufern zur Unterschrift (jedem mit eigenem Link) und zeigt danach das
 * unterschriebene PDF. Senden dürfen dieselben Rollen wie beim
 * Finanzierungspartner; die Function prüft das noch einmal selbst.
 */

const FUNCTION_NAME = "send-finanzierungsanfrage-signatur";

function zeitpunkt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- investments.meta ist roh
function metaVon(investmentId: string): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zeile aus dem Zwischenspeicher
  return (cacheGet("investments").find((r: any) => r.id === investmentId)?.meta as any) || {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- investments.meta ist roh
function objektAngaben(meta: Record<string, any>): AnfrageObjekt | null {
  const w = getWohnungKurz(meta.objektId, meta.wohnungId);
  if (!w) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zeile aus dem Zwischenspeicher
  const objektZeile = cacheGet("objekte").find((o: any) => o.id === w.objektId) as any;
  return {
    strasse: w.adresse, plz: w.plz, ort: w.ort,
    baujahr: Number(objektZeile?.global_baujahr) || undefined,
    wohnflaeche: w.groesse || undefined,
    kaufpreis: kaufpreisAusMeta(meta) || w.vkGesamt || undefined,
  };
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function FinanzierungsanfrageKarte({ investmentId, darfSenden }: { investmentId: string; darfSenden: boolean }) {
  const [, setVersion] = useState(0);
  const [laeuft, setLaeuft] = useState<"vorschau" | "senden" | null>(null);

  // Unterschreibt ein Käufer, schreibt der Server den Stand; die Karte zieht nach.
  useEffect(() => onCacheChange((tabelle, _e, zeile) => {
    if (tabelle === "investments" && zeile?.id === investmentId) setVersion((v) => v + 1);
  }), [investmentId]);

  const meta = metaVon(investmentId);
  const sa = meta.saData || meta.saSnapshot;
  const saFertig = meta.saSigned === true && !!sa;
  const stand = faStandLesen(meta[FA_META_SCHLUESSEL]);
  const saNeuer = !!stand && String(stand.saSignedAt ?? "") !== String(meta.saSignedAt ?? "");

  const vorschau = async () => {
    setLaeuft("vorschau");
    try {
      const pdf = await erzeugeFinanzierungsanfrage(sa, objektAngaben(meta));
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("Finanzierungsanfrage Vorschau", err);
      toast.error("Die Vorschau konnte nicht erstellt werden.");
    } finally {
      setLaeuft(null);
    }
  };

  const senden = async () => {
    const zweitePerson = sa?.person2 === true && !!sa?.person2Data;
    const ok = await confirmDialog({
      title: stand ? "Finanzierungsanfrage erneut senden?" : "Finanzierungsanfrage zur Unterschrift senden?",
      description: [
        "Die Anfrage wird mit den Angaben aus der unterschriebenen Selbstauskunft gefüllt.",
        zweitePerson
          ? "Beide Käufer bekommen per E-Mail einen eigenen Link und unterschreiben jeder für sich."
          : "Der Kunde bekommt per E-Mail einen Link zum Unterschreiben.",
        ...(stand ? ["", "Ein noch offener Link aus dem letzten Versand wird ungültig."] : []),
      ].join("\n"),
      confirmText: stand ? "Erneut senden" : "Senden",
      cancelText: "Abbrechen",
    });
    if (!ok) return;
    setLaeuft("senden");
    try {
      const objekt = objektAngaben(meta);
      const pdf = await erzeugeFinanzierungsanfrage(sa, objekt);
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { investmentId, pdfBase64: base64(pdf), objekt, saSignedAt: meta.saSignedAt ?? null },
      });
      const neu = faStandLesen(data?.stand);
      // Die Function hat schon geschrieben, hier nur die Anzeige nachziehen.
      if (neu) setInvestmentMetaNurLokal(investmentId, FA_META_SCHLUESSEL, neu);
      setVersion((v) => v + 1);
      if (error) {
        const mitGrund = (await edgeFehlerMitGrund(error, { functionName: FUNCTION_NAME })) as Error;
        toast.error(mitGrund?.message || "Der Versand ist fehlgeschlagen.");
        return;
      }
      toast.success("Finanzierungsanfrage zur Unterschrift gesendet.");
    } catch (err) {
      console.error("Finanzierungsanfrage senden", err);
      toast.error("Der Versand ist fehlgeschlagen.");
    } finally {
      setLaeuft(null);
    }
  };

  const personZeile = (person: FaPerson) => {
    const p = stand?.personen[person];
    if (!p) return null;
    return (
      <li key={person} className="text-xs">
        <span className="font-medium">{p.name || (person === "p1" ? "Person 1" : "Person 2")}</span>
        <span className="text-muted-foreground"> · {p.email} · </span>
        {p.status === "unterschrieben"
          ? <span className="text-[hsl(var(--success))]">unterschrieben am {zeitpunkt(p.unterschriebenAm)}</span>
          : <span className="text-[hsl(var(--warning))]">Unterschrift offen{p.versandOk === false ? " (Mail nicht zugestellt)" : ""}</span>}
      </li>
    );
  };

  return (
    <div className="mb-4 rounded-lg border px-4 py-3 space-y-3" data-finanzierungsanfrage-karte>
      <p className="text-sm font-semibold">Finanzierungsanfrage</p>

      {!sa ? (
        <p className="text-xs text-muted-foreground">Noch keine Selbstauskunft. Die Anfrage wird aus ihr gefüllt.</p>
      ) : (
        <>
          {stand ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {stand.status === "unterschrieben"
                  ? `Vollständig unterschrieben am ${zeitpunkt(stand.unterschriebenAm)}.`
                  : `Zur Unterschrift gesendet am ${zeitpunkt(stand.gesendetAm)}.`}
              </p>
              <ul className="space-y-0.5">{(["p1", "p2"] as const).map(personZeile)}</ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {saFertig
                ? "Noch nicht angefordert."
                : "Senden geht, sobald die Selbstauskunft vollständig unterschrieben ist."}
            </p>
          )}

          {saNeuer && (
            <p className="text-xs text-[hsl(var(--warning))]">
              Die Selbstauskunft wurde nach dem Versand neu unterschrieben. Bitte die Anfrage neu senden.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {stand?.pdfPath && (
              <Button size="sm" onClick={() => openUnterlage(stand.pdfPath)}>
                <FileText className="h-3.5 w-3.5 mr-1" /> Unterschriebene Anfrage öffnen
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={laeuft !== null} onClick={vorschau}>
              {laeuft === "vorschau" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
              Vorschau
            </Button>
            {darfSenden && (stand?.status !== "unterschrieben" || saNeuer) && (
              <Button
                size="sm"
                variant="outline"
                disabled={!saFertig || laeuft !== null}
                title={saFertig ? undefined : "Erst wenn die Selbstauskunft vollständig unterschrieben ist."}
                onClick={senden}
              >
                {laeuft === "senden" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                {stand ? "Erneut zur Unterschrift senden" : "Zur Unterschrift an Kunden senden"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
