import { useEffect } from "react";
import { oeffneCookieEinstellungen } from "@/lib/cookieEinwilligung";
import { cn } from "@/lib/utils";
import { COOKIE_BANNER_TEXTE } from "./cookieBannerTexte";
import { fussLinkAnmelden } from "./fussLinkRegister";

/**
 * Der Link "Cookie-Einstellungen" für den Fuß der öffentlichen Seiten.
 *
 * Er öffnet den Banner in der ausführlichen Ansicht, dort lässt sich die Wahl
 * jederzeit ändern oder zurücknehmen. Gestaltet wird er wie die Nachbarn im
 * jeweiligen Fuß, deshalb nimmt er deren Klassen entgegen.
 *
 * Die Sprache gibt die Seite vor, ohne Angabe Deutsch.
 */
export function CookieEinstellungenLink({
  className,
  sprache = "de",
}: {
  className?: string;
  sprache?: "de" | "en";
}) {
  useEffect(() => fussLinkAnmelden(), []);
  return (
    <button
      type="button"
      onClick={oeffneCookieEinstellungen}
      className={cn("cursor-pointer bg-transparent p-0 text-inherit", className)}
    >
      {COOKIE_BANNER_TEXTE[sprache].fussLink}
    </button>
  );
}
