import { useCallback, useMemo, useState } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Info, RotateCcw } from "lucide-react";
import AfaStrecke from "@/components/afarechner/AfaStrecke";
import { bundeslandFromPlz, type AfaRechnung } from "@/lib/afaRechnung";
import type { AfaAntworten, AfaVorbelegung } from "@/lib/afaStrecke";
import { getObjektById } from "@/lib/objekteStore";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { setUserSetting } from "@/lib/userSettingsCache";
import { useUser } from "@/contexts/UserContext";

const AFA_INFO_ROLES = ["objektpartner", "admin", "vertriebsleiter", "inhaber"];

/**
 * Der AfA-Rechner als Fragestrecke.
 *
 * Die Fragen der bisherigen Maske, verteilt auf bis zu sieben Schritte, wobei
 * zwei davon entfallen, wenn sie nichts bewirken. Gerechnet wird
 * ausschließlich in `src/lib/afaRechnung.ts`, die Reihenfolge der Fragen steht
 * in `src/lib/afaStrecke.ts`.
 *
 * Der Rechner bleibt intern. Es gibt keine öffentliche Fassung und keinen
 * Partner-Link, anders als beim Steuerrechner.
 */
const AfaRechner = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const objektId = searchParams.get("objektId");
  const weId = searchParams.get("weId");

  /**
   * Vorbefüllung aus einem Objekt beziehungsweise einer Wohnung.
   *
   * Unverändert gegenüber der vorherigen Fassung: Bei einer Wohnung zählen
   * deren Verkaufspreis und Größe, sonst die Summe über alle Wohnungen
   * beziehungsweise der Verkaufspreis des Globalobjekts. Der Erhaltungsaufwand
   * wird bei einer einzelnen Wohnung nach Quadratmetern anteilig verteilt.
   */
  // Objekte kommen in der zweiten Ladewelle; die Vorbelegung muss nachziehen.
  const objekteVersion = useLiveVersion(["objekte", "wohnungen"]);
  const prefill = useMemo(() => {
    if (!objektId) return null;
    const objekt = getObjektById(objektId);
    if (!objekt) return null;
    const wohnung = weId ? objekt.wohnungen.find(w => w.id === weId) : null;
    const isWohnung = !!wohnung;
    const objektGesamtKp = objekt.globalDaten?.verkaufspreis || objekt.wohnungen.reduce((s, w) => s + w.vkGesamt, 0);
    const kp = isWohnung ? wohnung!.vkGesamt : objektGesamtKp;
    const totalSan = objekt.sanierungskosten || 0;
    const gesamtQm = objekt.wohnungen.reduce((s, w) => s + (w.groesse || 0), 0);
    const san = isWohnung && gesamtQm > 0 ? Math.round(totalSan * ((wohnung!.groesse || 0) / gesamtQm)) : totalSan;
    return {
      strasse: objekt.adresse || "",
      plz: objekt.plz || "",
      ort: objekt.ort || "",
      kaufpreis: kp,
      baujahr: objekt.globalDaten?.baujahr || 0,
      wohnflaeche: isWohnung ? (wohnung!.groesse || 0) : (objekt.globalDaten?.gesamtQm || gesamtQm),
      sanierungskosten: san,
      objektTitel: objekt.titel,
      wohnungsbezeichnung: wohnung ? `WE ${wohnung.weNr}` : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektId, weId, objekteVersion]);

  // Zurücksetzen hängt die Strecke über einen neuen Schlüssel komplett neu ein.
  // Das ist verlässlicher, als jede Antwort einzeln zu leeren.
  const [rechnerSchluessel, setRechnerSchluessel] = useState(0);
  const [geleert, setGeleert] = useState(false);

  const vorbelegung = useMemo<AfaVorbelegung>(() => {
    if (!prefill || geleert) return {};
    // Die Anschrift steht in den Basisdaten meist als eine Zeile, also Straße
    // und Hausnummer zusammen. Getrennt wird an der ersten Ziffer.
    const teile = prefill.strasse.match(/^(.+?)\s+(\d+.*)$/);
    return {
      kaufpreis: prefill.kaufpreis,
      baujahr: prefill.baujahr,
      wohnflaeche: prefill.wohnflaeche,
      erhaltungsaufwand: prefill.sanierungskosten,
      bundesland: bundeslandFromPlz(prefill.plz) || "andere",
      strasse: teile?.[1] ?? prefill.strasse,
      hausnummer: teile?.[2] ?? "",
      plz: prefill.plz,
      ort: prefill.ort,
    };
  }, [prefill, geleert]);

  const zuruecksetzen = (mitObjektwerten: boolean) => {
    setGeleert(!mitObjektwerten);
    setRechnerSchluessel((k) => k + 1);
  };

  /**
   * Das Ergebnis am Objekt merken.
   *
   * Unverändert gegenüber der vorherigen Fassung, damit die Objektseite dieselben
   * Werte wiederfindet: dieselben Schlüssel, dieselben Felder.
   */
  const handleErgebnis = useCallback((rechnung: AfaRechnung, _antworten: AfaAntworten) => {
    if (!objektId || !rechnung.rnd) return;
    const data = {
      rnd: rechnung.rnd,
      afaSatz: rechnung.afaSatz,
      gebaeudePct: rechnung.gebaeudePct,
      bodenPct: rechnung.bodenPct,
      savedAt: new Date().toISOString(),
    };
    if (isTestAccount()) {
      const key = weId ? `mi_afa_rnd_${objektId}_${weId}` : `mi_afa_rnd_${objektId}`;
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      const key = weId ? `afa_rnd_${objektId}_${weId}` : `afa_rnd_${objektId}`;
      setUserSetting(key, data);
    }
  }, [objektId, weId]);

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        {objektId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(weId ? `/objekte/${objektId}/wohnung/${weId}` : `/objekte/${objektId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {weId ? "Zurück zur Wohnung" : "Zurück zum Objekt"}
          </Button>
        )}
        <PageHeader
          title="AfA-Rechner"
          subtitle={prefill?.objektTitel && !geleert
            ? `Vorausgefüllt aus: ${prefill.objektTitel}${prefill.wohnungsbezeichnung ? ` · ${prefill.wohnungsbezeichnung}` : ""}. Werte können angepasst werden.`
            : "Restnutzungsdauer nach Anlage 2 ImmoWertV, Kaufpreisaufteilung und AfA-Satz mit gesetzlicher Untergrenze."}
        >
          {prefill && geleert && (
            <Button variant="outline" size="sm" onClick={() => zuruecksetzen(true)}>
              Objektwerte wieder laden
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => zuruecksetzen(false)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Zurücksetzen
          </Button>
        </PageHeader>

        {!objektId && AFA_INFO_ROLES.includes(user.role) && (
          <Card className="p-4 border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-[hsl(var(--info))] mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Eigenständige AfA-Berechnung mit derselben Rechnung wie im Schritt 4 „AfA-Rechner" beim Anlegen oder
                Bearbeiten eines Objekts. Dort steht die kompakte Maske, hier die Fragestrecke.
              </p>
            </div>
          </Card>
        )}

        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Wofür dieser Rechner taugt.</strong> Die Restnutzungsdauer stammt aus
              dem Modell der Anlage 2 ImmoWertV. Das ist ein Werkzeug der Wertermittlung, kein Nachweis einer kürzeren
              tatsächlichen Nutzungsdauer im Sinne des § 7 Abs. 4 Satz 2 EStG. Für die Steuererklärung braucht es eine
              objektbezogene Begutachtung. Die Einschränkungen aus dem BMF-Schreiben vom 22. Februar 2023 sind mit
              Schreiben vom 1. Dezember 2025 aufgehoben worden, seither gilt wieder die Rechtsprechung des
              Bundesfinanzhofs: Jede im Einzelfall geeignete Darlegungsmethode ist zulässig. Die Zahlen hier sind eine
              belastbare Indikation für das Gespräch, nicht mehr.
            </p>
          </div>
        </Card>

        <AfaStrecke
          key={rechnerSchluessel}
          vorbelegung={vorbelegung}
          neustartSchluessel={rechnerSchluessel}
          onErgebnis={handleErgebnis}
        />
      </div>
    </DashboardLayout>
  );
};

export default AfaRechner;
