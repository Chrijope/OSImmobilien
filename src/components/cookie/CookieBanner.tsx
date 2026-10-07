import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCookieEinwilligung, usePartnerPixelKontext } from "@/hooks/useCookieEinwilligung";
import {
  EINSTELLUNGEN_OEFFNEN_EREIGNIS,
  entferneMetaCookies,
  istOeffentlicheSeite,
  partnerMarketingEntscheidung,
  speichereCookieEinwilligung,
  type EinwilligungsWahl,
} from "@/lib/cookieEinwilligung";
import { kampagneErfassen } from "@/lib/kampagnenKennung";
import { istMetaPixelRoute, pruefeMetaPixelBindung } from "@/lib/metaPixel";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { COOKIE_BANNER_TEXTE } from "./cookieBannerTexte";
import { useFussLinkVorhanden } from "./fussLinkRegister";

/**
 * Die Sprache der Seite, abgelesen an `<html lang>`.
 *
 * Der Banner steht oberhalb der Routen und damit außerhalb jedes
 * `SeitenSpracheProvider`. Die öffentlichen Seiten setzen aber `<html lang>`
 * auf ihre Sprache (Provider und `useHtmlLang`). Daran hält sich der Banner,
 * dann spricht er dieselbe Sprache wie die Seite darunter, auch nach dem
 * Umschalten.
 */
function useDokumentSprache(): Sprache {
  return useSyncExternalStore(
    (melden) => {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
      const beobachter = new MutationObserver(melden);
      beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      return () => beobachter.disconnect();
    },
    () =>
      typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en")
        ? "en"
        : "de",
    () => "de",
  );
}

type Ansicht = "kurz" | "einstellungen" | null;

/** Die Wahl im Banner, `partner` nur auf der Seite eines Partners mit Pixel. */
type BannerWahl = EinwilligungsWahl & { partner: boolean };
const ALLE: BannerWahl = { statistik: true, marketing: true, partner: true };
const NUR_NOTWENDIGE: BannerWahl = { statistik: false, marketing: false, partner: false };

/**
 * Der Cookie-Banner der öffentlichen Seiten.
 *
 * Steht einmal in `App.tsx` oberhalb der Routen und entscheidet selbst, ob er
 * erscheint: nur auf den Seiten aus `istOeffentlicheSeite`, nie im CRM. Er
 * blockiert die Seite nicht, man kann weiterlesen, ohne zu entscheiden. Dann
 * gilt eben nur das Notwendige.
 *
 * Drei gleichwertige Knöpfe, gleich gestaltet: Wer ablehnt, soll dafür nicht
 * länger suchen müssen als der, der zustimmt.
 *
 * Auf der Seite eines Partners mit Meta Pixel fragt er zusätzlich gezielt
 * für diesen Partner, nennt ihn mit Name und Anschrift als gemeinsam
 * Verantwortlichen und erscheint, solange für ihn noch keine Wahl vorliegt,
 * auch wenn allgemein schon entschieden wurde.
 *
 * Außerdem wacht er über ein geladenes Pixel (`pruefeMetaPixelBindung`):
 * Verlässt der Besucher den Partnerbereich oder nimmt er die Einwilligung
 * zurück, auch in einem anderen Tab, lädt die Seite neu.
 *
 * Nebenbei merkt er sich auf jeder öffentlichen Seite die Kampagnenkennung
 * aus der Adresse (`kampagnenKennung.ts`). Ohne Statistik-Einwilligung nur im
 * Arbeitsspeicher, dann überlebt sie den Wechsel zwischen den Seiten, legt
 * aber nichts im Browser ab.
 */
export function CookieBanner() {
  const { pathname, search } = useLocation();
  const oeffentlich = istOeffentlicheSeite(pathname);
  const einwilligung = useCookieEinwilligung();
  const pixelKontext = usePartnerPixelKontext();
  // Nur auf den Pixel-Routen fragt der Banner für den Partner.
  const partner = pixelKontext && istMetaPixelRoute(pathname) ? pixelKontext : null;
  // `einwilligung` steht davor, damit nach jeder neuen Wahl frisch gelesen wird.
  const partnerWahl = einwilligung && partner ? partnerMarketingEntscheidung(partner.partnerId) : null;
  const partnerOffen = !!partner && !partnerWahl;
  const sprache = useDokumentSprache();
  const t = COOKIE_BANNER_TEXTE[sprache];
  const fussLinkVorhanden = useFussLinkVorhanden();
  const titelId = useId();
  const textId = useId();

  const [ansicht, setAnsicht] = useState<Ansicht>(() => (einwilligung ? null : "kurz"));
  const bisherigeWahl = (): BannerWahl => ({
    statistik: einwilligung?.statistik ?? false,
    marketing: einwilligung?.marketing ?? false,
    partner: partnerWahl?.marketing ?? false,
  });
  const [wahl, setWahl] = useState<BannerWahl>(bisherigeWahl);

  // Der Partner der Seite steht erst nach dem Laden fest. Liegt für ihn noch
  // keine Wahl vor, fragt der Banner, auch nach einer allgemeinen Wahl.
  useEffect(() => {
    if (partnerOffen) setAnsicht((a) => a ?? "kurz");
  }, [partnerOffen]);

  // Pixel an Seite und Einwilligung binden: bei jedem Seitenwechsel und bei
  // jeder neuen Wahl, auch aus einem anderen Tab.
  useEffect(() => {
    pruefeMetaPixelBindung(pathname);
  }, [pathname, einwilligung]);

  // Die Kennung beim Betreten jeder öffentlichen Seite festhalten, auch wenn
  // das Formular erst zwei Seiten später kommt.
  useEffect(() => {
    if (oeffentlich) kampagneErfassen(search);
  }, [oeffentlich, search]);

  // Der Link "Cookie-Einstellungen" im Fuß öffnet die ausführliche Ansicht.
  useEffect(() => {
    const oeffnen = () => {
      setWahl(bisherigeWahl());
      setAnsicht("einstellungen");
    };
    window.addEventListener(EINSTELLUNGEN_OEFFNEN_EREIGNIS, oeffnen);
    return () => window.removeEventListener(EINSTELLUNGEN_OEFFNEN_EREIGNIS, oeffnen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einwilligung, partnerWahl?.marketing]);

  if (!oeffentlich) return null;

  const speichern = (neu: BannerWahl) => {
    // "Nur notwendige" und "Marketing aus" nehmen alle Partner-Freigaben
    // zurueck, auch die dieses Partners (PIXEL-001).
    const gespeichert = speichereCookieEinwilligung(
      { statistik: neu.statistik, marketing: neu.marketing },
      partner ? { partnerId: partner.partnerId, marketing: neu.partner } : undefined,
      { nurNotwendige: neu === NUR_NOTWENDIGE },
    );
    const partnerAn = !!partner && gespeichert.partner.some((p) => p.partnerId === partner.partnerId && p.marketing);
    setAnsicht(null);
    // Ohne Erlaubnis für das Pixel sollen auch die Cookies von Meta weg. Ein
    // schon geladenes Pixel entfernt `pruefeMetaPixelBindung` (Seite neu laden).
    if (partner ? !partnerAn : !neu.marketing) entferneMetaCookies();
  };

  if (!ansicht) {
    // Seiten ohne eigenen Fuß bekommen einen kleinen Knopf in der Ecke, damit
    // die Wahl auch dort jederzeit änderbar bleibt.
    if (!einwilligung || fussLinkVorhanden) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setWahl(bisherigeWahl());
          setAnsicht("einstellungen");
        }}
        aria-label={t.fussLink}
        title={t.fussLink}
        className="fixed bottom-3 left-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
      >
        <Cookie className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  const knopf = "flex-1 min-h-[44px] font-semibold";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titelId}
      aria-describedby={textId}
      data-testid="cookie-banner"
      className="fixed bottom-4 left-4 right-4 z-[60] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 sm:right-auto sm:max-w-lg print:hidden"
    >
      <p id={titelId} className="mb-1.5 text-sm font-semibold">
        {t.titel}
      </p>
      <p id={textId} className="text-sm leading-relaxed text-muted-foreground">
        {t.text}
        <Link to={mitSeitenSprache("/datenschutz", sprache)} className="text-primary underline hover:no-underline">
          {t.datenschutz}
        </Link>
        {t.textEnde}
      </p>
      {partner && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid="cookie-banner-partner">
          {t.partner.text(partner.name, partner.anschrift)}
        </p>
      )}

      {ansicht === "einstellungen" && (
        <ul className="mt-4 space-y-3">
          {(["notwendig", "statistik", "marketing"] as const).map((art) => {
            const k = t.kategorien[art];
            const schalterId = `${titelId}-${art}`;
            const fest = art === "notwendig";
            return (
              <li key={art} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={schalterId} className="text-sm font-semibold">
                    {k.titel}
                  </label>
                  <div className="flex items-center gap-2">
                    {fest && <span className="text-xs text-muted-foreground">{t.immerAktiv}</span>}
                    <Switch
                      id={schalterId}
                      checked={fest ? true : wahl[art]}
                      disabled={fest}
                      onCheckedChange={(an) => {
                        if (fest) return;
                        // Marketing aus nimmt auch die Freigabe fuer den
                        // Partner zurueck; der Schalter zeigt das gleich an.
                        // Wieder anschalten laesst sich der Partner danach
                        // einzeln.
                        setWahl((alt) => ({
                          ...alt,
                          [art]: an === true,
                          ...(art === "marketing" && an !== true ? { partner: false } : {}),
                        }));
                      }}
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{k.text}</p>
              </li>
            );
          })}
          {partner && (
            <li className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${titelId}-partner`} className="text-sm font-semibold">
                  {t.partner.titel(partner.name)}
                </label>
                <Switch
                  id={`${titelId}-partner`}
                  checked={wahl.partner}
                  onCheckedChange={(an) => setWahl((alt) => ({ ...alt, partner: an === true }))}
                />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {t.partner.text(partner.name, partner.anschrift)}
              </p>
            </li>
          )}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className={knopf} onClick={() => speichern(ALLE)}>
          {t.alleAkzeptieren}
        </Button>
        <Button type="button" variant="outline" className={knopf} onClick={() => speichern(NUR_NOTWENDIGE)}>
          {t.nurNotwendige}
        </Button>
        {ansicht === "kurz" ? (
          <Button
            type="button"
            variant="outline"
            className={knopf}
            onClick={() => {
              setWahl(bisherigeWahl());
              setAnsicht("einstellungen");
            }}
          >
            {t.einstellungen}
          </Button>
        ) : (
          <Button type="button" variant="outline" className={knopf} onClick={() => speichern(wahl)}>
            {t.auswahlSpeichern}
          </Button>
        )}
      </div>
    </div>
  );
}
