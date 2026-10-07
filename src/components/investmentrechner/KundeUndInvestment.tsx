import { useEffect, useMemo, useState } from "react";
import { Search, User, X } from "lucide-react";
import { kundenZurAuswahl } from "@/lib/objektExposeStore";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { onCacheChange } from "@/lib/dataCache";
import { einheitHinweisText, investmentBeschriftung, investmentBezugZurEinheit, type RechnerEinheit } from "@/lib/investmentAuswahl";
import { Auswahlfeld } from "./Felder";

/*
 * Kunde und Investment im Bereich „Kunde & Einkommen".
 *
 * Beides ist freiwillig. Ohne Kunde rechnet der Rechner wie bisher, nur
 * speichern lässt sich dann nichts: Eine Berechnung hängt immer an einem
 * Investment.
 *
 * Die Kundenliste kommt aus `kundenZurAuswahl` im Exposé-Datensatz, dieselbe
 * Quelle wie im Dialog „Exposé je Einheit erzeugen". Sie liest den
 * Zwischenspeicher, nicht Supabase, und lässt Gelöschte und Archivierte weg.
 * Auch das Suchfeld ist dasselbe, damit sich beide Stellen gleich anfühlen.
 */

export interface KundenwahlKunde {
  id: string;
  name: string;
}

interface KundeUndInvestmentProps {
  kundeId: string | null;
  investmentId: string | null;
  onKundeWaehlen: (kunde: KundenwahlKunde | null) => void;
  onInvestmentWaehlen: (investmentId: string | null) => void;
  /**
   * Die Einheit, wenn der Rechner auf einer Einheitenseite steht. Dann sind
   * nur Investments dieser Wohnung und solche ohne Objekt wählbar, siehe
   * `investmentBezugZurEinheit`.
   */
  einheit?: RechnerEinheit | null;
}

/*
 * Die Beschriftung steht in `src/lib/investmentAuswahl.ts`, damit sie hier und
 * in der gemeinsamen Investmentwahl der Rechner dieselbe ist.
 */
export { investmentBeschriftung };

export function KundeUndInvestment({ kundeId, investmentId, onKundeWaehlen, onInvestmentWaehlen, einheit }: KundeUndInvestmentProps) {
  const [suche, setSuche] = useState("");
  /*
   * Der Zwischenspeicher füllt sich beim Start nach und nach. Ohne dieses
   * Mitzählen bliebe die Liste leer, wenn der Rechner die erste Seite ist, die
   * jemand öffnet, und es sähe aus, als gäbe es keine Kunden.
   */
  const [stand, setStand] = useState(0);
  useEffect(() => onCacheChange((tabelle) => {
    if (tabelle === "kontakte" || tabelle === "investments") setStand((n) => n + 1);
  }), []);

  const kunden = useMemo(() => {
    try {
      return kundenZurAuswahl();
    } catch {
      // Ein noch leerer Zwischenspeicher ist kein Fehler, nur eine leere Liste.
      return [];
    }
    // `stand` ist bewusst dabei: Es zwingt das Neulesen des Zwischenspeichers.
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const gewaehlt = kunden.find((k) => k.id === kundeId) || null;

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (s ? kunden.filter((k) => k.name.toLowerCase().includes(s)) : kunden).slice(0, 8);
  }, [kunden, suche]);

  const investments = useMemo(() => {
    if (!kundeId) return [];
    try {
      return getInvestmentsByKontakt(kundeId);
    } catch {
      return [];
    }
  }, [kundeId, stand]); // eslint-disable-line react-hooks/exhaustive-deps

  const einheitHinweis = einheit && gewaehlt
    ? einheitHinweisText(gewaehlt.name, investments.map((inv) => ({
        bezug: investmentBezugZurEinheit(inv, einheit),
        gewaehlt: inv.id === investmentId,
      })))
    : "";

  return (
    <div className="rechner-kundenwahl">
      <div className="field">
        <span className="field-label">Kunde aus dem CRM</span>
        {gewaehlt ? (
          <div className="rechner-kundenwahl-treffer">
            <span>
              <User size={14} /> <b>{gewaehlt.name}</b>
              {gewaehlt.hatSelbstauskunft && <em>Selbstauskunft</em>}
            </span>
            <button type="button" onClick={() => { onKundeWaehlen(null); setSuche(""); }} aria-label="Kunden entfernen">
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <span className="input-shell">
              <Search size={14} className="rechner-kundenwahl-lupe" />
              <input
                type="text"
                value={suche}
                autoComplete="off"
                placeholder="Namen tippen, um zu suchen …"
                onChange={(e) => setSuche(e.target.value)}
              />
            </span>
            {suche.trim().length > 0 && (
              <ul className="rechner-kundenwahl-liste">
                {treffer.length === 0 ? (
                  <li className="leer">{kunden.length === 0 ? "Keine Kontakte geladen." : "Kein Treffer."}</li>
                ) : (
                  treffer.map((k) => (
                    <li key={k.id}>
                      <button type="button" onClick={() => { onKundeWaehlen({ id: k.id, name: k.name }); setSuche(""); }}>
                        <span>{k.name}</span>
                        {k.hatSelbstauskunft && <em>Selbstauskunft</em>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <span className="field-hint">
              Freiwillig. Ohne Kunden rechnet der Rechner wie bisher, gespeichert wird dann nichts.
            </span>
          </>
        )}
      </div>

      {kundeId && (
        investments.length === 0 ? (
          <div className="field">
            <span className="field-label">Investment</span>
            <span className="field-hint">
              Für diesen Kunden gibt es noch kein Investment. Angelegt wird es im Kundenprofil, danach lässt sich die
              Berechnung dort speichern.
            </span>
          </div>
        ) : (
          <>
            <Auswahlfeld
              label="Investment"
              value={investmentId || ""}
              onChange={(wert) => onInvestmentWaehlen(wert || null)}
              hint="Hier landet die Berechnung, wenn du sie speicherst."
            >
              <option value="">Kein Investment gewählt</option>
              {investments.map((inv) => {
                const bezug = investmentBezugZurEinheit(inv, einheit);
                return (
                  <option key={inv.id} value={inv.id} disabled={bezug === "andereEinheit"}>
                    {investmentBeschriftung(inv)}
                    {bezug === "ohneObjekt" ? " (noch kein Objekt)" : ""}
                    {bezug === "andereEinheit" ? " (andere Einheit, hier nicht wählbar)" : ""}
                  </option>
                );
              })}
            </Auswahlfeld>
            {einheitHinweis && (
              <p className="field-hint rechner-einheit-hinweis" data-testid="rechner-einheit-hinweis">{einheitHinweis}</p>
            )}
          </>
        )
      )}
    </div>
  );
}

