import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Person } from "@/lib/exposeInhalt";
import type { KundenansichtDaten } from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../../supabase/functions/get-kundenansicht/antwort.ts";
import { ExposeHerunterladen } from "./ExposeHerunterladen";
import { Hausebene } from "./Hausebene";
import { ExposeRahmen, KundenFuss } from "./KundenBausteine";
import { Partnerkasten } from "./Partnerkasten";
import { Wohnungsebene, type KundenReiter } from "./Wohnungsebene";
import { useKundenTexte } from "./kundenansichtTexte";

/**
 * Die Kundenansicht („Objektübersicht“), dieselbe Seite für den Kundenlink
 * und für „Als Kunde ansehen“ im CRM (Bauplan vom 23.09.2026).
 *
 * Oben die Kopfleiste mit Logo und „Exposé herunterladen“, darunter der
 * Kasten „Dein Ansprechpartner“ über die ganze Breite, dann die Wohnung oder
 * das Haus, unten der Fuß. Keine CRM-Leiste, kein Hinweisband: Im Termin
 * lässt sich die Seite dem Kunden direkt zeigen.
 *
 * Welche Ebene erscheint, entscheidet `wohnungId` aus der Adresse:
 *
 *   - Globalobjekt: immer das Haus, verkauft wird es als Ganzes.
 *   - Einzelobjekt: immer die eine Wohnung, ohne Wechsel und Hausübersicht.
 *   - Haus mit Wohnungen: mit freier `wohnungId` die Wohnung, sonst das Haus.
 *     Ist die gewünschte Wohnung nicht (mehr) frei, steht über dem Haus der
 *     Hinweis, dass sie vergeben ist.
 *
 * Der Wechsel zwischen Wohnungen lädt nichts nach, die Daten aller freien
 * Wohnungen sind schon da. Der gewählte Reiter bleibt beim Wechsel stehen.
 */
export function KundenansichtSeite({ daten, wohnungId, einstiegVergeben, dateiLaden, onWohnung, onHaus }: {
  daten: KundenansichtDaten;
  /** Die Wohnung aus der Adresse, `null` für das Haus. */
  wohnungId: string | null;
  /** Die Seite steht auf dem Haus, weil die Wohnung aus dem Link vergeben ist. */
  einstiegVergeben?: boolean;
  dateiLaden: (verweis: DokumentVerweis) => Promise<string | null>;
  onWohnung: (wohnungId: string) => void;
  onHaus: () => void;
}) {
  const [reiter, setReiter] = useState<KundenReiter>("uebersicht");
  const { objekt, struktur } = daten;

  const einzel = struktur === "einzelwohnung" ? objekt.wohnungen[0] : undefined;
  const gewuenscht = wohnungId ? objekt.wohnungen.find((w) => w.id === wohnungId) : undefined;
  const wohnung = struktur === "globalobjekt" ? undefined : einzel ?? gewuenscht;
  const vergebenHinweis = struktur === "mehrere_einheiten" && !wohnung && ((!!wohnungId && !gewuenscht) || !!einstiegVergeben);

  /*
   * Beim Wechsel zwischen Haus und Wohnung nach oben, sonst landet man mitten
   * in der neuen Seite. Der Wechsel von Wohnung zu Wohnung bleibt, wo er ist:
   * Die Leiste dafür steht ohnehin oben.
   */
  const ebene = wohnung ? "wohnung" : "haus";
  const vorherigeEbene = useRef(ebene);
  useEffect(() => {
    if (vorherigeEbene.current === ebene) return;
    vorherigeEbene.current = ebene;
    try {
      window.scrollTo({ top: 0 });
    } catch {
      // Ohne Scrollen geht es auch, etwa in einer Umgebung ohne Fenster.
    }
  }, [ebene]);

  const expose = struktur === "globalobjekt"
    ? <ExposeHerunterladen objekt={objekt} wohnung={null} partner={daten.partner} />
    : wohnung ? <ExposeHerunterladen objekt={objekt} wohnung={wohnung} partner={daten.partner} /> : null;

  return (
    <KundenRahmen kopfRechts={expose} partner={daten.partner} stand={daten.stand}>
      {wohnung ? (
        <Wohnungsebene
          objekt={objekt}
          wohnung={wohnung}
          struktur={struktur}
          einheitRoh={daten.einheitenRoh[wohnung.id] ?? null}
          fuerDich={daten.fuerDichId === wohnung.id}
          fuerDichId={daten.fuerDichId}
          partner={daten.partner}
          dokumente={daten.dokumente}
          zurueckgehalten={daten.zurueckgehalten}
          dateiLaden={dateiLaden}
          reiter={reiter}
          onReiter={setReiter}
          onWohnung={onWohnung}
          onHaus={struktur === "mehrere_einheiten" ? onHaus : undefined}
        />
      ) : (
        <Hausebene
          objekt={objekt}
          global={struktur === "globalobjekt"}
          fuerDich={struktur === "globalobjekt" && daten.einstieg.zustand === "fuer_dich_reserviert"}
          fuerDichId={daten.fuerDichId}
          partner={daten.partner}
          dokumente={daten.dokumente}
          zurueckgehalten={daten.zurueckgehalten}
          dateiLaden={dateiLaden}
          onWohnung={onWohnung}
          vergebenHinweis={vergebenHinweis}
        />
      )}
    </KundenRahmen>
  );
}

/** Kopfleiste, Partnerkasten und Fuß: der Rahmen um jede Fassung der Seite. */
export function KundenRahmen({ children, kopfRechts, partner, stand }: {
  children: ReactNode;
  kopfRechts?: ReactNode;
  partner?: Person;
  stand?: Date;
}) {
  return (
    <div className="min-h-screen bg-background" data-testid="kundenansicht">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <img src="/images/moreimmo-logo.png" alt="MOREImmo" className="h-7 w-auto sm:h-8" />
          {kopfRechts}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        {partner && (
          <ExposeRahmen className="mb-5">
            <Partnerkasten person={partner} />
          </ExposeRahmen>
        )}
        {children}
        {stand && <KundenFuss stand={stand} />}
      </main>
    </div>
  );
}

/** Laden: eine ruhige Zeile statt eines leeren Rahmens. */
export function KundenLaden() {
  const { t } = useKundenTexte();
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground" data-testid="kundenansicht-laedt">
      <Loader2 className="h-5 w-5 animate-spin" /> {t.seite.laedt}
    </div>
  );
}

/**
 * Ein Hinweis statt der Seite: vergeben, nicht gefunden, nicht erreichbar.
 * Immer mit einem Weg zum Ansprechpartner, nie ohne Ausweg.
 */
export function KundenHinweisSeite({ titel, text, partner, onErneut }: { titel: string; text: string; partner?: Person; onErneut?: () => void }) {
  const { t } = useKundenTexte();
  const mail = partner?.email || "office@more.immo";
  return (
    <KundenRahmen partner={partner}>
      <div className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-card p-6 text-center shadow-sm" data-testid="kundenansicht-hinweis">
        <h1 className="text-xl font-semibold text-foreground">{titel}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onErneut && (
            <Button type="button" variant="outline" className="gap-1.5" onClick={onErneut}><RefreshCw className="h-4 w-4" /> {t.seite.erneutLaden}</Button>
          )}
          {!partner && (
            <Button asChild className="gap-1.5"><a href={`mailto:${mail}`}><Mail className="h-4 w-4" /> {mail}</a></Button>
          )}
        </div>
      </div>
    </KundenRahmen>
  );
}
