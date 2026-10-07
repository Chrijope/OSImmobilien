import { useState } from "react";
import { PlayCircle } from "lucide-react";

/**
 * Ein YouTube-Video auf der News-Seite, erst nach Klick geladen.
 *
 * Schon das Laden eines eingebetteten Videos schickt die IP-Adresse und
 * Browserangaben an Google. Deshalb steht zuerst nur ein Knopf da, ohne
 * Vorschaubild (auch das käme von Google). Erst der Klick lädt das Video, und
 * zwar über youtube-nocookie.com, damit YouTube vor dem Abspielen keine
 * Cookies setzt. Entschieden am 27.09.2026 (Datenschutz, Punkt 12).
 */
function youtubeNocookieUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
}

export function YoutubeNachKlick({ videoId, titel }: { videoId: string; titel: string }) {
  const [geladen, setGeladen] = useState(false);

  if (geladen) {
    return (
      <iframe
        src={youtubeNocookieUrl(videoId)}
        className="w-full h-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title={titel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setGeladen(true)}
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted px-6 text-center transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlayCircle className="h-10 w-10 text-muted-foreground" aria-hidden />
      <span className="text-sm font-semibold text-foreground">Video laden</span>
      <span className="max-w-sm text-xs text-muted-foreground">
        Das Video kommt von YouTube. Beim Laden erhält Google deine IP-Adresse und Angaben zu deinem Browser.
      </span>
    </button>
  );
}
