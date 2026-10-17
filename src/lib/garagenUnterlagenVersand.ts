/**
 * Garagenunterlagen am Investment (Christian, 17.10.2026): wann sie angeboten
 * werden, woher die Werte kommen und der Versand an den Käufer. Die Schreiben
 * selbst stehen in `garagenUnterlagen.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAbwicklungDaten } from "@/lib/abwicklungStore";
import { garagenDateinamen, garagenUnterlagenPdfs, type GaragenBriefAngaben } from "@/lib/garagenUnterlagen";
import { getInvestmentMetaField, setInvestmentMetaFields, type Investment } from "@/lib/investmentsStore";
import { dateiHerunterladen } from "@/lib/kaufpreislisteExport";
import { getKontaktById } from "@/lib/kundenStore";
import { listendatenFuerEinheit } from "@/lib/listendaten";
import { garageFuerEinheit, mietgarantieFuerObjekt } from "@/lib/mietgarantie";
import { getMieter } from "@/lib/mieterStore";
import { getObjektById } from "@/lib/objekteStore";
import { aktuellerMieter } from "@/lib/objektdaten";

/** Meta-Feld am Investment: ISO-Zeitpunkt des Versands. */
export const VERSENDET_FELD = "garagenUnterlagenVersendetAm";

const heute = () => new Date().toISOString().slice(0, 10);

/**
 * Nur Hauffstraße, nur vermietete Garagen: Die Schreiben nennen Adresse,
 * Zielmiete und Kündigungsfrist dieses Objekts.
 */
export function garagenUnterlagenFuer(inv: Pick<Investment, "objektId" | "wohnungId">): boolean {
  if (!inv.objektId || !inv.wohnungId) return false;
  const o = getObjektById(inv.objektId);
  if (!o || !/hauffstr/i.test(`${o.titel} ${o.adresse}`)) return false;
  const g = garageFuerEinheit(inv.wohnungId);
  return !!g && g.status !== "frei";
}

/** Erst nach dem Notartermin, vorher ist der Käufer noch nicht Käufer. */
export const nachNotartermin = (inv: Pick<Investment, "notarTermin">) => !!inv.notarTermin && inv.notarTermin.slice(0, 10) <= heute();

export const versendetAm = (inv: Pick<Investment, "id">) => getInvestmentMetaField<string>(inv.id, VERSENDET_FELD, "");

export function garagenAngaben(inv: Investment): GaragenBriefAngaben | null {
  if (!garagenUnterlagenFuer(inv)) return null;
  const g = garageFuerEinheit(inv.wohnungId!)!;
  const k = getKontaktById(inv.kontaktId);
  const o = getObjektById(inv.objektId!);
  const w = o?.wohnungen.find((x) => x.id === inv.wohnungId);
  const m = g.status === "eigener_mieter" ? aktuellerMieter(getMieter(), inv.wohnungId!) : undefined;
  const haus = listendatenFuerEinheit(inv.wohnungId!)?.werte.haus;
  return {
    kaeuferName: [k?.vorname, k?.nachname].filter(Boolean).join(" "),
    kaeuferStrasse: [k?.strasse, k?.hausnummer].filter(Boolean).join(" "),
    kaeuferPlzOrt: [k?.plz, k?.ort].filter(Boolean).join(" "),
    weNr: w?.weNr || inv.weNr || "",
    haus: haus === null || haus === undefined ? "" : String(haus),
    garageNr: g.nr,
    istMiete: g.istMiete ?? 0,
    // ponytail: 100 € gilt für die Hauffstraße, wenn am Objekt nichts hinterlegt ist.
    zielMiete: mietgarantieFuerObjekt(inv.objektId!)?.garageAnrechnung || 100,
    nutzerName: m ? `${m.vorname} ${m.nachname}`.trim() : undefined,
    uebergabe: getAbwicklungDaten(inv.id).uebergabeDatum || undefined,
    datum: heute(),
  };
}

export async function garagenUnterlagenHerunterladen(inv: Investment) {
  const a = garagenAngaben(inv);
  if (!a) return;
  const pdf = await garagenUnterlagenPdfs(a);
  const namen = garagenDateinamen(a);
  dateiHerunterladen(pdf.anschreiben, namen.anschreiben);
  dateiHerunterladen(pdf.muster, namen.muster);
}

const alsBase64 = (blob: Blob) =>
  new Promise<string>((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => fehler(r.error);
    r.readAsDataURL(blob);
  });

/** Schickt beide PDFs an den Käufer und merkt sich den Zeitpunkt. Wirft bei Fehlern. */
export async function garagenUnterlagenSenden(inv: Investment): Promise<void> {
  const a = garagenAngaben(inv);
  const email = getKontaktById(inv.kontaktId)?.email?.trim();
  if (!a) throw new Error("Für diese Einheit gibt es keine vermietete Garage.");
  if (!email) throw new Error("Beim Käufer ist keine E-Mail-Adresse hinterlegt.");
  const pdf = await garagenUnterlagenPdfs(a);
  const namen = garagenDateinamen(a);
  const { data, error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "garagen-unterlagen",
      recipientEmail: email,
      kontaktId: inv.kontaktId,
      // Je Minute ein Versand, Doppelklicks laufen ins Leere.
      idempotencyKey: `garagen-unterlagen-${inv.id}-${new Date().toISOString().slice(0, 16)}`,
      templateData: { name: a.kaeuferName, wohnung: a.haus ? `${a.weNr}, Haus ${a.haus}` : a.weNr, garage: a.garageNr },
      attachments: [
        { filename: namen.anschreiben, content: await alsBase64(pdf.anschreiben), type: "application/pdf" },
        { filename: namen.muster, content: await alsBase64(pdf.muster), type: "application/pdf" },
      ],
    },
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.reason || data.error || "Versand fehlgeschlagen");
  setInvestmentMetaFields(inv.id, { [VERSENDET_FELD]: new Date().toISOString() });
}
