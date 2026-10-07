import { cacheGet } from "@/lib/dataCache";
import { formatDatum } from "@/lib/utils";
import {
  OHNE_KAMPAGNE,
  darfKampagneSehen,
  kampagneAusKontakt,
  kampagnenDetails,
  kampagnenName,
} from "@/lib/kampagnenKennung";

/**
 * Die Kampagnenkennung im Kundenprofil, direkt unter der Quelle.
 *
 * Quelle und Kampagne sind zwei Ebenen: Die Quelle ist der Kanal ("Meta",
 * "Website", "Empfehlung"), die Kampagne die einzelne Anzeige oder Aktion
 * dahinter. Sie kommt aus dem Werbelink (`utm_campaign` und Geschwister) oder
 * aus einem Meta-Formularlead über Zapier und steht in `meta.kampagne`.
 *
 * Nur lesbar, denn sie beschreibt, woher der Lead kam, und das ändert sich
 * nachträglich nicht. Sichtbar nur für die Rollen aus `darfKampagneSehen`.
 *
 * Zwei Zellen im Raster der Lead- und Verwaltungsdaten, wie `BeraterVerlauf`.
 * Gelesen wird aus dem Zwischenspeicher, weil `KundeData` kein `meta` trägt.
 */
export function KampagnenZeile({ kontaktId, rolle }: { kontaktId: string; rolle: string | null | undefined }) {
  if (!darfKampagneSehen(rolle)) return null;
  const zeile = cacheGet("kontakte").find((r: { id?: string }) => r.id === kontaktId);
  const kennung = kampagneAusKontakt(zeile);
  const zuletzt = kennung?.zuletzt && typeof kennung.zuletzt === "object" ? kennung.zuletzt : undefined;

  return (
    <>
      <span className="font-semibold align-top">Kampagne:</span>
      <span className="text-sm" data-testid="kampagnenkennung">
        {kennung ? (
          <>
            <span>{kampagnenName(kennung)}</span>
            {kampagnenDetails(kennung).map((z) => (
              <span key={z} className="block text-xs text-muted-foreground">
                {z}
              </span>
            ))}
            {kennung.erfasstAm && (
              <span className="block text-xs text-muted-foreground">Erster Aufruf: {formatDatum(kennung.erfasstAm)}</span>
            )}
            {zuletzt && (
              <span className="block text-xs text-muted-foreground">
                Zuletzt über: {kampagnenName(zuletzt)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground" title={OHNE_KAMPAGNE}>
            –
          </span>
        )}
      </span>
    </>
  );
}
