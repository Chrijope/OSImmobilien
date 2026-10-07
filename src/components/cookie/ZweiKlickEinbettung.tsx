import { useState, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";

/**
 * Zwei-Klick-Lösung für fremde Einbettungen auf den öffentlichen Seiten.
 *
 * Ein eingebetteter Kalender (Calendly und ähnliche) lädt eine fremde Seite.
 * Schon beim Laden erfährt der Anbieter die IP-Adresse des Besuchers, und er
 * kann eigene Cookies setzen. Deshalb steht an seiner Stelle zuerst ein Kasten
 * mit einem Knopf. Erst der Klick lädt die Einbettung.
 *
 * Einmal geladen, gilt das für diesen Anbieter bis zum Schließen der Seite:
 * Wer den Kalender gerade freigegeben hat, soll nach einem Wechsel des Anlasses
 * nicht noch einmal klicken. Im Browser abgelegt wird dafür nichts.
 */
const freigegeben = new Set<string>();

/** Nur für Tests. */
export function _zweiKlickVergessen(): void {
  freigegeben.clear();
}

/** Der Name des Anbieters aus der Adresse, für den Hinweis im Kasten. */
export function anbieterAusAdresse(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "einem externen Anbieter";
  }
  if (/(^|\.)calendly\.com$/.test(host)) return "Calendly";
  if (/(^|\.)google\.com$/.test(host)) return "Google";
  if (/(^|\.)microsoft\.com$|(^|\.)office\.com$|(^|\.)outlook\.com$/.test(host)) return "Microsoft";
  if (/(^|\.)zoom\.us$/.test(host)) return "Zoom";
  return host.replace(/^www\./, "");
}

const TEXTE = {
  de: {
    titel: "Terminkalender laden",
    text: (a: string) =>
      `Hier erscheint der Terminkalender von ${a}. Beim Laden erhält ${a} deine IP-Adresse und Angaben zu deinem Browser und kann Cookies setzen. Mehr dazu in der `,
    datenschutz: "Datenschutzerklärung",
    knopf: "Kalender laden",
  },
  en: {
    titel: "Load the appointment calendar",
    text: (a: string) =>
      `The appointment calendar from ${a} appears here. When it loads, ${a} receives your IP address and details about your browser and may set cookies. More details in our `,
    datenschutz: "privacy policy",
    knopf: "Load calendar",
  },
};

export function ZweiKlickEinbettung({
  url,
  sprache = "de",
  children,
}: {
  /** Die Adresse der Einbettung, aus ihr ergibt sich der Anbieter. */
  url: string;
  sprache?: Sprache;
  /** Die eigentliche Einbettung, erst nach dem Klick gerendert. */
  children: ReactNode;
}) {
  const anbieter = anbieterAusAdresse(url);
  const [geladen, setGeladen] = useState(() => freigegeben.has(anbieter));
  const t = TEXTE[sprache];

  if (geladen) return <>{children}</>;

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 bg-white px-6 py-10 text-center text-gray-800">
      <CalendarDays className="h-8 w-8 text-gray-500" aria-hidden />
      <p className="text-base font-semibold">{t.titel}</p>
      <p className="max-w-md text-sm leading-relaxed text-gray-600">
        {t.text(anbieter)}
        {/* Im neuen Tab, damit der Weg zur Terminbuchung offen bleibt. */}
        <a
          href={mitSeitenSprache("/datenschutz", sprache)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          {t.datenschutz}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          freigegeben.add(anbieter);
          setGeladen(true);
        }}
        className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        {t.knopf}
      </button>
    </div>
  );
}
