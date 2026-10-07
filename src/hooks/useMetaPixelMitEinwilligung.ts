import { useEffect } from "react";
import { useCookieEinwilligung } from "@/hooks/useCookieEinwilligung";
import { hatPartnerMarketingEinwilligung, setzePartnerPixelKontext } from "@/lib/cookieEinwilligung";
import { istGueltigeMetaPixelId, ladeMetaPixel, meldeFormularOffen } from "@/lib/metaPixel";

/**
 * Solange `offen` gilt (halbfertige Eingaben), laedt ein Widerruf der
 * Einwilligung die Seite nicht neu; das Pixel wird nur angehalten
 * (PIXEL-002, `meldeFormularOffen` in metaPixel.ts).
 */
export function useFormularOffenFuerPixel(offen: boolean): void {
  useEffect(() => (offen ? meldeFormularOffen() : undefined), [offen]);
}

/** Was eine Partnerseite aus `get-vp-microsite` kennt. */
export interface PixelPartner {
  userId?: string | null;
  metaPixelId?: string | null;
  /** Name und Anschrift fuer den Datenschutzhinweis, nur mit aktivem Pixel. */
  pixelVerantwortlicher?: { name: string; anschrift: string } | null;
}

/** Name und Anschrift aus `get-vp-microsite`, sonst `null`. */
export function leseVerantwortlicher(v: unknown): { name: string; anschrift: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const anschrift = typeof o.anschrift === "string" ? o.anschrift.trim() : "";
  return name && anschrift ? { name, anschrift } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Das Meta Pixel eines Partners auf seiner Seite.
 *
 * Meldet den Partner als Pixel-Partner dieser Seite an (Banner und Fuss fragen
 * und nennen ihn dann) und beim Verlassen wieder ab. Laden darf das Pixel erst
 * mit der Einwilligung fuer GENAU diesen Partner. Ohne Kennung, gueltige
 * Pixel-ID, Name oder Anschrift geschieht nichts: kein Skript von
 * connect.facebook.net, kein Aufruf an Meta.
 *
 * Verlassen, Partnerwechsel und Widerruf erledigt `pruefeMetaPixelBindung`
 * im Cookie-Banner (Seite neu laden), weil sich ein geladenes Skript nicht
 * wieder entfernen laesst.
 */
export function useMetaPixelMitEinwilligung(partner: PixelPartner | null | undefined): void {
  const einwilligung = useCookieEinwilligung();
  const partnerId = (partner?.userId ?? "").trim().toLowerCase();
  const pixelId = (partner?.metaPixelId ?? "").trim();
  const name = (partner?.pixelVerantwortlicher?.name ?? "").trim();
  const anschrift = (partner?.pixelVerantwortlicher?.anschrift ?? "").trim();
  const vollstaendig = UUID.test(partnerId) && istGueltigeMetaPixelId(pixelId) && !!name && !!anschrift;

  useEffect(() => {
    if (!vollstaendig) return;
    return setzePartnerPixelKontext({ partnerId, pixelId, name, anschrift });
  }, [vollstaendig, partnerId, pixelId, name, anschrift]);

  // `einwilligung` nur, damit bei jeder neuen Wahl frisch gelesen wird.
  const erlaubt = vollstaendig && !!einwilligung && hatPartnerMarketingEinwilligung(partnerId);
  useEffect(() => {
    if (erlaubt) ladeMetaPixel({ pixelId, partnerId });
  }, [erlaubt, pixelId, partnerId]);
}
