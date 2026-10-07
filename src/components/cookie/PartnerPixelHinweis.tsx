import { usePartnerPixelKontext } from "@/hooks/useCookieEinwilligung";
import { oeffneCookieEinstellungen } from "@/lib/cookieEinwilligung";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { cn } from "@/lib/utils";
import { COOKIE_BANNER_TEXTE } from "./cookieBannerTexte";

/**
 * Der kurze Datenschutzhinweis im Fuß einer Partnerseite mit Meta Pixel:
 * wer gemeinsam verantwortlich ist, mit Link zur Datenschutzerklärung und zu
 * den Cookie-Einstellungen. Ohne angemeldeten Pixel-Partner zeigt er nichts.
 *
 * Der Knopf meldet sich bewusst nicht als Fuß-Link an, den trägt der Fuß
 * daneben schon.
 */
export function PartnerPixelHinweis({ sprache = "de", className }: { sprache?: "de" | "en"; className?: string }) {
  const kontext = usePartnerPixelKontext();
  if (!kontext) return null;
  const t = COOKIE_BANNER_TEXTE[sprache];
  return (
    <p className={cn("text-xs leading-relaxed", className)} data-testid="partner-pixel-hinweis">
      {t.fussHinweis(kontext.name, kontext.anschrift)}{" "}
      <a href={mitSeitenSprache("/datenschutz", sprache)} className="!inline underline hover:no-underline">
        {t.datenschutz}
      </a>
      {" · "}
      <button
        type="button"
        onClick={oeffneCookieEinstellungen}
        className="cursor-pointer bg-transparent p-0 text-inherit underline hover:no-underline"
      >
        {t.fussLink}
      </button>
    </p>
  );
}
