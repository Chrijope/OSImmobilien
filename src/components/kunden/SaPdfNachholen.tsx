import { useEffect } from "react";
import { getEigeneSaData, getInvestmentMetaField, getSaPapierUpload } from "@/lib/investmentsStore";
import { kundenSprache } from "@/lib/kundenSprache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { holeSaPdfNach, saPdfFehlt } from "@/lib/selbstauskunftPdfAblage";

/**
 * Welche Unterschriften in dieser Sitzung schon nachgeholt wurden. Je
 * Investment und Unterschriftszeitpunkt genau ein Versuch, auch wenn das
 * Profil neu gezeichnet oder erneut geöffnet wird.
 */
const VERSUCHT = new Set<string>();

/**
 * Holt die PDF der unterschriebenen Selbstauskunft nach, wenn sie fehlt.
 *
 * Normalerweise legt der Browser des Kunden sie gleich nach der letzten
 * Unterschrift ab. Fehlt sie trotzdem, weil die Selbstauskunft vor dem
 * 26.09.2026 unterschrieben wurde oder das Fenster zu früh geschlossen war,
 * erzeugt das Kundenprofil sie beim Öffnen aus den gespeicherten Angaben und
 * Unterschriften und legt sie ab. Zeigt nichts an.
 *
 * Nicht beim Papierweg: Dort ist das hochgeladene Original maßgeblich.
 */
export function SaPdfNachholen({ investmentId, kontaktId, kunde }: {
  investmentId: string;
  kontaktId: string;
  kunde: { vorname: string; nachname: string; moreId: string };
}) {
  const saSignedAt = getInvestmentMetaField<string | null>(investmentId, "saSignedAt", null);
  const saPdfPath = getInvestmentMetaField<string>(investmentId, "saPdfPath", "");

  useEffect(() => {
    if (isTestAccount() || !investmentId || !kontaktId) return;
    const meta = {
      saSigned: getInvestmentMetaField<unknown>(investmentId, "saSigned", false),
      saSignedAt,
      saPdfPath,
      saPdfUnterschriftAm: getInvestmentMetaField<unknown>(investmentId, "saPdfUnterschriftAm", null),
      saSignatures: getInvestmentMetaField<Record<string, { signatureData?: string; signedAt?: string }>>(investmentId, "saSignatures", {}),
    };
    if (!saPdfFehlt(meta)) return;
    if (getSaPapierUpload(investmentId)) return;
    const saData = getEigeneSaData(investmentId);
    if (!saData) return;

    const schluessel = `${investmentId}:${saSignedAt}`;
    if (VERSUCHT.has(schluessel)) return;
    VERSUCHT.add(schluessel);

    void holeSaPdfNach({
      investmentId,
      kontaktId,
      meta,
      saData,
      kunde,
      sprache: kundenSprache(kontaktId),
    }).then((ergebnis) => {
      if (!ergebnis.abgelegt) console.warn("Selbstauskunft-PDF nicht nachgeholt:", ergebnis.grund);
    });
    // `kunde` ist ein neues Objekt bei jedem Zeichnen, massgeblich sind die Kennungen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentId, kontaktId, saSignedAt, saPdfPath]);

  return null;
}
