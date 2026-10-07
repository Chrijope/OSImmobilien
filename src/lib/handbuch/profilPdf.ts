/**
 * Das Immobilienhandbuch eines Kunden als PDF, aus dem Kundenprofil heraus
 * (Karte „Aus dem Konfigurator“, seit dem 30.09.2026).
 *
 * Derselbe Weg wie „Als PDF speichern“ auf der Ergebnisseite
 * (`pages/HandbuchErgebnis.tsx`): `baueHandbuch` mit denselben Angaben, dann
 * `ladeHandbuchPdfHerunter`. Nur die Quelle der Angaben ist eine andere.
 * Die Ergebnisseite holt sie über `handbuch_abrufen`; das geht hier nicht,
 * weil die Funktion jedes Öffnen zählt (der Lead stünde danach auf
 * „Handbuch gelesen“) und nach 30 Tagen nichts mehr liefert. Deshalb kommt
 * alles vom Kontakt:
 *   - Antworten und Datum aus `meta.handbuchFunnel`, genau der Stand, den die
 *     Karte zeigt. submit-lead schreibt dort dieselben Antworten wie in die
 *     Handbuch-Zeile.
 *   - Vor- und Nachname aus dem Kontakt.
 *   - Sprache aus `meta.kundenSprache`, die submit-lead aus der Seite setzt.
 *   - Partner: der aktuell Zuständige, über sein Kürzel und dieselbe Function
 *     wie auf der Ergebnisseite. Der Partner von damals steht nur in der
 *     Handbuch-Zeile, die Vertriebsleitung per Zeilensicherheit nicht lesen
 *     darf. Solange der Kontakt nicht umgehängt wurde, ist es derselbe.
 * Nichts wird gespeichert oder hochgeladen, und „PDF gespeichert“ wird nicht
 * vermerkt: Das ist der Stand des Kunden, nicht der des Partners.
 */
import { cacheGetById } from "@/lib/dataCache";
import { kundenSprache } from "@/lib/kundenSprache";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { datumText as datumInSprache } from "@/lib/sprachFormat";
import type { HandbuchAngaben, HandbuchPartner } from "./inhalt";
import { saWege } from "./wege";
import { istHandbuchToken, pruefeAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/** Wie `HANDBUCH_BASIS_URL` der Functions: Links im PDF zeigen immer aufs Portal, nie auf die Vorschau. */
const PORTAL = "https://portal.more.immo";

/** Wie `datumText` auf der Ergebnisseite. */
function datumText(iso: string | null, sprache: Sprache): string {
  const roh = iso ? new Date(iso) : new Date();
  const d = Number.isNaN(roh.getTime()) ? new Date() : roh;
  return sprache === "en" ? datumInSprache(d, "en") : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export interface ProfilKontakt {
  vorname?: string | null;
  nachname?: string | null;
  meta?: unknown;
}

/**
 * Die Angaben für `baueHandbuch`, ohne Partner. `null`, wenn am Kontakt keine
 * vollständigen Antworten liegen.
 */
export function handbuchAngabenAusKontakt(
  kontakt: ProfilKontakt,
  opt: { partnerKuerzel: string | null; saAusgefuellt: boolean },
): HandbuchAngaben | null {
  const meta = kontakt.meta && typeof kontakt.meta === "object" ? (kontakt.meta as Record<string, unknown>) : {};
  const funnel = meta.handbuchFunnel as Record<string, unknown> | undefined;
  const antworten = funnel ? pruefeAntworten(funnel.antworten) : null;
  if (!antworten || !funnel) return null;
  const sprache = kundenSprache({ meta });
  const token = typeof funnel.token === "string" && istHandbuchToken(funnel.token) ? funnel.token : null;
  // Der Link im PDF wie auf der Ergebnisseite (`saWege(...).pdf`).
  const pfad = saWege({
    saToken: null,
    handbuchToken: token,
    saStatus: opt.saAusgefuellt ? "ausgefuellt" : null,
    beraterSlug: opt.partnerKuerzel,
  }).pdf;
  return {
    antworten,
    vorname: (kontakt.vorname || "").trim(),
    nachname: (kontakt.nachname || "").trim(),
    datum: datumText(typeof funnel.zeitpunkt === "string" ? funnel.zeitpunkt : null, sprache),
    saLink: pfad ? `${PORTAL}${mitSeitenSprache(pfad, sprache)}` : null,
    partner: null,
    sprache,
  };
}

/** Das Kürzel des Zuständigen. Gesperrte Partner bekommt der Kunde auch auf der Seite nicht zu sehen (`handbuch_abrufen`). */
export function partnerKuerzelVon(zustaendigId: string | null | undefined): string | null {
  if (!zustaendigId) return null;
  const p = cacheGetById<{ vp_slug?: string | null; gesperrt?: boolean | null }>("profiles", zustaendigId);
  if (!p || p.gesperrt) return null;
  return (p.vp_slug || "").trim() || null;
}

/**
 * Baut das Handbuch und lädt das PDF herunter. Wirft, wenn die Antworten
 * fehlen oder das PDF nicht entsteht; der Aufrufer zeigt den Hinweis.
 */
export async function ladeHandbuchPdfAusProfil(
  kontakt: ProfilKontakt & { zustaendigId?: string | null },
  opt: { saAusgefuellt: boolean },
): Promise<void> {
  const kuerzel = partnerKuerzelVon(kontakt.zustaendigId);
  const angaben = handbuchAngabenAusKontakt(kontakt, { partnerKuerzel: kuerzel, saAusgefuellt: opt.saAusgefuellt });
  if (!angaben) throw new Error("Antworten unvollständig");
  // Erst hier laden: jsPDF und der Satz sind groß, das Profil braucht sie sonst nicht.
  const [{ ladeBeraterAusKuerzel }, { baueHandbuch }, { ladeHandbuchPdfHerunter }] = await Promise.all([
    import("@/components/handbuch/Rahmen"),
    import("./inhalt"),
    import("./handbuchPdf"),
  ]);
  let partner: HandbuchPartner | null = null;
  if (kuerzel) {
    const stand = await ladeBeraterAusKuerzel(kuerzel);
    if (stand.status === "ok") {
      const b = stand.berater;
      partner = { name: b.name, email: b.email, telefon: b.telefon, buchungslink: b.buchungslink };
    }
  }
  await ladeHandbuchPdfHerunter(baueHandbuch({ ...angaben, partner }));
}
