import { useCallback, useMemo } from "react";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DokumenteAnsicht, type DokumentBereich } from "@/components/objektseite/DokumenteAnsicht";
import {
  alsUnterlage, dokumentSchluessel, hausUnterlagen, rotZurueckgehalten, wohnungsUnterlagen,
  type KundenDokument, type Zurueckgehalten,
} from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../../supabase/functions/get-kundenansicht/antwort.ts";
import { KARTE } from "./KundenBausteine";
import { useKundenTexte } from "./kundenansichtTexte";

/**
 * Die Unterlagen in der Kundenansicht: dieselbe Dokumentenansicht wie intern,
 * im Kundenmodus. Keine Kennzeichen, kein Sammelordner, keine Schalter.
 *
 * Die Liste kennt nur Namen. Die Datei holt `dateiLaden` erst beim Anklicken
 * vom Server, als Adresse für 15 Minuten, nach erneuter Prüfung.
 */
export function KundenDokumente({ dokumente, zurueckgehalten, wohnungId, dateiLaden, hausTitel }: {
  dokumente: KundenDokument[];
  zurueckgehalten: Zurueckgehalten[];
  /** Ohne Wohnung nur die Unterlagen des Hauses. */
  wohnungId: string | null;
  dateiLaden: (verweis: DokumentVerweis) => Promise<string | null>;
  hausTitel?: string;
}) {
  const { t } = useKundenTexte();
  const haus = useMemo(() => hausUnterlagen(dokumente), [dokumente]);
  const wohnung = useMemo(() => (wohnungId ? wohnungsUnterlagen(dokumente, wohnungId) : []), [dokumente, wohnungId]);
  const nachSchluessel = useMemo(() => {
    const karte = new Map<string, KundenDokument>();
    for (const d of [...haus, ...wohnung]) karte.set(dokumentSchluessel(d), d);
    return karte;
  }, [haus, wohnung]);

  const adresseLaden = useCallback(async ({ id }: { id: string }) => {
    const d = nachSchluessel.get(id);
    if (!d) return null;
    return dateiLaden({ bereich: d.bereich, wohnungId: d.wohnungId, id: d.id });
  }, [nachSchluessel, dateiLaden]);

  const rotHaus = rotZurueckgehalten(zurueckgehalten, "objekt");
  const rotWohnung = wohnungId ? rotZurueckgehalten(zurueckgehalten, "wohnung", wohnungId) : false;
  const bereiche: DokumentBereich[] = [
    { schluessel: "objekt", titel: hausTitel ?? t.dokumente.haus, eintraege: haus.map(alsUnterlage), rotZurueckgehalten: rotHaus },
    ...(wohnungId ? [{ schluessel: "wohnung", titel: t.dokumente.wohnung, eintraege: wohnung.map(alsUnterlage), rotZurueckgehalten: rotWohnung }] : []),
    // Ein Bereich ohne Datei bleibt, wenn Mietvertrag oder Grundbuch zurückgehalten
    // werden: Dann sagt die Ansicht dort, dass der Ansprechpartner sie persönlich gibt.
  ].filter((b) => b.eintraege.length > 0 || b.rotZurueckgehalten);

  if (bereiche.length === 0) {
    return (
      <div className={KARTE} data-testid="kunden-dokumente-leer">
        <EmptyState
          icon={FileText}
          title={t.dokumente.leerTitel}
          description={t.dokumente.leerText}
        />
      </div>
    );
  }
  return (
    <div className={KARTE} data-testid="kunden-dokumente">
      {/* Neu aufbauen, wenn die Wohnung wechselt: Auswahl und Vorschau gehören zur Wohnung. */}
      <DokumenteAnsicht key={wohnungId ?? "haus"} bereiche={bereiche} kundenModus adresseLaden={adresseLaden} />
    </div>
  );
}
