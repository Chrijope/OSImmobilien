import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkNichtMehrGueltig } from "@/components/expose/LinkNichtMehrGueltig";
import { ansprechpartnerAusAntwort } from "@/lib/exposePublicDaten";
import type { Person } from "@/lib/exposeInhalt";
import { useSeitenSprache, type Sprache } from "@/lib/seitenSprache";

/*
 * Öffentliche Seite des Vergleichslinks, /vergleich/<token> (25.10.2026).
 *
 * Zeigt zwei bis drei Einheiten nebeneinander, mit den Angaben, die auch das
 * jeweilige Exposé zeigt, und je einem Weg ins Exposé. Die Daten liefert
 * `kunden-vergleich` nur über die Positivlisten des Exposés. Gezählt wird nur
 * das erste Laden (`aufruf=1`), beim Partner aus dem Profil (`vorschau=1`)
 * gar nicht.
 */

interface Einheit {
  objekt: { titel?: string; ort?: string; plz?: string; adresse?: string };
  wohnung: { we_nr?: string; etage?: string; groesse?: number; zimmer?: number; miete_gesamt?: number; vk_gesamt?: number; rendite?: number };
  bild: string | null;
  exposeLink: string;
}

const TEXTE: Record<Sprache, {
  titel: string; einleitung: string; einheit: string; kaufpreis: string; flaeche: string; zimmer: string; miete: string; rendite: string;
  oeffnen: string; ansprechpartner: string; hinweis: string; fehler: string; leer: string;
}> = {
  de: {
    titel: "Deine Auswahl im Vergleich",
    einleitung: "Hier stehen die Wohnungen nebeneinander, die wir für dich ausgewählt haben. Alle Einzelheiten findest du im jeweiligen Exposé.",
    einheit: "Wohnung", kaufpreis: "Kaufpreis", flaeche: "Wohnfläche", zimmer: "Zimmer", miete: "Kaltmiete im Monat", rendite: "Bruttomietrendite",
    oeffnen: "Exposé öffnen", ansprechpartner: "Dein Ansprechpartner",
    hinweis: "Die Angaben stammen aus den Exposés und sind eine Übersicht. Maßgeblich sind das jeweilige Exposé und die Vertragsunterlagen.",
    fehler: "Der Vergleich konnte nicht geladen werden. Bitte versuch es später noch einmal.",
    leer: "Zu diesem Vergleich ist keine Wohnung mehr verfügbar.",
  },
  en: {
    titel: "Your selection side by side",
    einleitung: "Here are the apartments we selected for you, side by side. You will find all details in each exposé.",
    einheit: "Apartment", kaufpreis: "Purchase price", flaeche: "Living space", zimmer: "Rooms", miete: "Net cold rent per month", rendite: "Gross rental yield",
    oeffnen: "Open exposé", ansprechpartner: "Your contact",
    hinweis: "The figures are taken from the exposés and are an overview. The individual exposé and the contract documents are authoritative.",
    fehler: "The comparison could not be loaded. Please try again later.",
    leer: "No apartment from this comparison is available any more.",
  },
};

function zahl(wert: unknown): number | null {
  const n = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function VergleichPublic() {
  const { token } = useParams<{ token: string }>();
  const [suche] = useSearchParams();
  const vorschau = suche.get("vorschau") === "1";
  const [einheiten, setEinheiten] = useState<Einheit[] | null>(null);
  const [ansprechpartner, setAnsprechpartner] = useState<Person | undefined>(undefined);
  const [abgelaufen, setAbgelaufen] = useState<Person | null | undefined>(undefined);
  const [fehler, setFehler] = useState(false);
  const [serverSprache, setServerSprache] = useState<unknown>(undefined);
  const sprache = useSeitenSprache(serverSprache);
  const t = TEXTE[sprache] ?? TEXTE.de;
  const lokal = sprache === "en" ? "en-GB" : "de-DE";

  useEffect(() => {
    let aktiv = true;
    const controller = new AbortController();
    (async () => {
      try {
        const abfrage = new URLSearchParams({ token: token || "", aufruf: "1", ...(vorschau ? { vorschau: "1" } : {}) });
        const antwort = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kunden-vergleich?${abfrage}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal: controller.signal,
        });
        const daten = await antwort.json().catch(() => ({}));
        if (!aktiv) return;
        setServerSprache(daten?.sprache);
        if (antwort.status === 410) { setAbgelaufen(ansprechpartnerAusAntwort(daten?.ansprechpartner) ?? null); return; }
        if (!antwort.ok) { setFehler(true); return; }
        setEinheiten(Array.isArray(daten?.einheiten) ? daten.einheiten : []);
        setAnsprechpartner(ansprechpartnerAusAntwort(daten?.ansprechpartner));
      } catch {
        if (aktiv) setFehler(true);
      }
    })();
    return () => { aktiv = false; controller.abort(); };
  }, [token, vorschau]);

  if (abgelaufen !== undefined) return <LinkNichtMehrGueltig ansprechpartner={abgelaufen ?? undefined} sprache={sprache} />;
  if (fehler) return <p className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">{t.fehler}</p>;
  if (!einheiten) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const euro = (n: number | null) => (n === null ? "–" : n.toLocaleString(lokal, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
  const zeilen: Array<[string, (e: Einheit) => string]> = [
    [t.kaufpreis, (e) => euro(zahl(e.wohnung.vk_gesamt))],
    [t.flaeche, (e) => { const n = zahl(e.wohnung.groesse); return n === null ? "–" : `${n.toLocaleString(lokal, { maximumFractionDigits: 2 })} m²`; }],
    [t.zimmer, (e) => { const n = zahl(e.wohnung.zimmer); return n === null ? "–" : n.toLocaleString(lokal); }],
    [t.miete, (e) => euro(zahl(e.wohnung.miete_gesamt))],
    [t.rendite, (e) => { const n = zahl(e.wohnung.rendite); return n === null ? "–" : `${n.toLocaleString(lokal, { maximumFractionDigits: 2 })} %`; }],
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-lg="seite">
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t.titel}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t.einleitung}</p>
        </header>
        {einheiten.length === 0 ? <p className="text-sm text-muted-foreground">{t.leer}</p> : (
          <div className={`grid gap-4 ${einheiten.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`} data-testid="vergleich-einheiten">
            {einheiten.map((e) => (
              <article key={e.exposeLink} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {e.bild ? <img src={e.bild} alt="" className="h-44 w-full object-cover" loading="lazy" /> : <div className="h-44 w-full bg-muted" />}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="font-semibold">{e.objekt.titel || [e.objekt.plz, e.objekt.ort].filter(Boolean).join(" ")}</h2>
                    <p className="text-xs text-muted-foreground">
                      {[e.wohnung.we_nr ? `${t.einheit} ${e.wohnung.we_nr}` : "", e.wohnung.etage, e.objekt.ort].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <dl className="divide-y text-sm">
                    {zeilen.map(([label, wert]) => (
                      <div key={label} className="flex justify-between gap-3 py-1.5">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium tabular-nums">{wert(e)}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button asChild className="mt-auto w-full">
                    <a href={`${e.exposeLink}${vorschau ? "&vorschau=1" : ""}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-4 w-4" />{t.oeffnen}
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {ansprechpartner && (
          <section className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.ansprechpartner}</p>
            <p className="mt-1 font-semibold">{ansprechpartner.name}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {ansprechpartner.telefon && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${ansprechpartner.telefon}`}><Phone className="h-4 w-4" />{ansprechpartner.telefon}</a>}
              {ansprechpartner.email && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${ansprechpartner.email}`}><Mail className="h-4 w-4" />{ansprechpartner.email}</a>}
            </div>
          </section>
        )}
        <p className="text-xs text-muted-foreground">{t.hinweis}</p>
      </main>
    </div>
  );
}
