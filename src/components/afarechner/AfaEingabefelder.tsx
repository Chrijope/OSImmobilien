/**
 * Die Eingabefelder der AfA-Strecke, je Frage eines.
 *
 * Sie liegen bewusst getrennt von der Strecke, weil sie an ZWEI Stellen
 * gebraucht werden: in der Frage-Ansicht und noch einmal auf der Ergebnisseite,
 * wo sich jede Angabe nachtraeglich aendern laesst und sofort neu gerechnet
 * wird. Das Vorbild ist `steuerrechner/SteuerEingabefelder.tsx`.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EuroInput } from "@/components/ui/euro-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_MOD_PUNKTE,
  MOD_ELEMENTE,
  OBJEKTART_GND,
  RND_PARAMETER,
  ZEITRAUM_OPTIONEN,
} from "@/lib/restnutzungsdauer";
import {
  BUNDESLAND_NK,
  bundeslandFromPlz,
  createDefaultModZeitraeume,
  punkteFuerElement,
  type AfaRechnung,
} from "@/lib/afaRechnung";
import {
  BODENANTEIL_ANHALT,
  GEBAEUDEARTEN,
  fragtNachKernsanierung,
  nebenkosten,
  nebenkostensatz,
  quadratmeterpreis,
  type AfaAntworten,
} from "@/lib/afaStrecke";
import { Kachel, eurGenau } from "@/components/afarechner/bausteine";

export interface FeldProps {
  antworten: AfaAntworten;
  aendern: (teil: Partial<AfaAntworten>) => void;
}

const JETZT = new Date().getFullYear();

/* ── 1. Was fuer ein Objekt? ────────────────────────────────────────────── */

export function ObjektFeld({ antworten, aendern }: FeldProps) {
  // Das Gebäudealter stand in der Maske als eigenes Feld neben dem Baujahr. Es
  // ist keine Eingabe, sondern die Gegenprobe: Wer sich im Jahr vertippt, sieht
  // es hier sofort.
  const alter = antworten.baujahr > 1000 && antworten.baujahr <= JETZT ? JETZT - antworten.baujahr : null;
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {GEBAEUDEARTEN.map((g) => (
          <Kachel
            key={g.id}
            titel={g.titel}
            unterzeile={g.unterzeile}
            gewaehlt={antworten.gebaeudeart === g.id}
            onClick={() => {
              // Ein Neubau ist nicht kernsaniert. Der Schalter wuerde sonst als
              // Altlast einer vorherigen Antwort weiterwirken, obwohl die Frage
              // danach gar nicht mehr gestellt wird.
              const neubau = g.id === "neubau";
              aendern({
                gebaeudeart: g.id,
                ...(neubau ? { kernsaniert: false, kernsanierungJahr: undefined, erhaltungsaufwand: 0 } : {}),
                ...(neubau && !antworten.baujahr ? { baujahr: JETZT } : {}),
              });
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="afa-baujahr" className="text-xs">
            {antworten.gebaeudeart === "neubau" ? "Jahr der Fertigstellung" : "Baujahr"}
          </Label>
          <Input
            id="afa-baujahr"
            type="number"
            min={1800}
            max={JETZT}
            value={antworten.baujahr || ""}
            onChange={(e) => aendern({ baujahr: Number(e.target.value) || 0 })}
            placeholder="z. B. 1985"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {alter !== null
              ? `Gebäudealter: ${alter} ${alter === 1 ? "Jahr" : "Jahre"}. Bei einer Kernsanierung tritt später deren Jahr an diese Stelle.`
              : "Ohne Baujahr gibt es kein Gebäudealter und damit keine Restnutzungsdauer. Der Rechner erfindet an dieser Stelle nichts."}
          </p>
        </div>
        <div>
          <Label className="text-xs">Objektart</Label>
          <Select value={antworten.objektart} onValueChange={(v) => aendern({ objektart: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJEKTART_GND.map((o) => (
                <SelectItem key={o.value} value={o.label}>
                  {o.label} · GND {o.gnd} Jahre
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Bestimmt die Gesamtnutzungsdauer nach Anlage 1 ImmoWertV.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── 2. Was kostet es? ──────────────────────────────────────────────────── */

export function PreisFeld({ antworten, aendern }: FeldProps) {
  const qmPreis = quadratmeterpreis(antworten);
  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs">Kaufpreis ohne Nebenkosten (€)</Label>
        <EuroInput
          value={antworten.kaufpreis}
          onChange={(v) => aendern({ kaufpreis: v })}
          className="mt-1 h-14 text-2xl font-semibold"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Nur den Kaufpreis der Immobilie eintragen, ohne Erhaltungsaufwand und ohne Möbel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="afa-wohnflaeche" className="text-xs">Wohnfläche (m²)</Label>
          <Input
            id="afa-wohnflaeche"
            type="number"
            min={0}
            step="0.01"
            value={antworten.wohnflaeche || ""}
            onChange={(e) => aendern({ wohnflaeche: Math.round((Number(e.target.value) || 0) * 100) / 100 })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">oder Kaufpreis je m² (€)</Label>
          <EuroInput
            value={qmPreis}
            onChange={(v) => {
              if (antworten.wohnflaeche > 0) {
                aendern({ kaufpreis: Math.round(v * antworten.wohnflaeche * 100) / 100 });
              }
            }}
            disabled={antworten.wohnflaeche <= 0}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {antworten.wohnflaeche > 0
              ? `Bezugsgröße: ${antworten.wohnflaeche.toLocaleString("de-DE")} m²`
              : "Für den Quadratmeterpreis wird die Wohnfläche gebraucht."}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Die Wohnfläche ist für die AfA selbst ohne Bedeutung. Sie wird gebraucht, um die Sonderabschreibung nach § 7b
        EStG zu prüfen, denn dort gelten Obergrenzen je Quadratmeter. Stammen Kaufpreis und Fläche aus einem Objekt,
        bitte hier gegenprüfen.
      </p>
    </div>
  );
}

/* ── 3. Wo liegt es? ────────────────────────────────────────────────────── */

export function LageFeld({ antworten, aendern }: FeldProps) {
  const satz = nebenkostensatz(antworten);
  const betrag = nebenkosten(antworten);
  const eigenerSatz = antworten.nebenkostenPct !== null && antworten.nebenkostenPct > 0;
  const ausPlz = bundeslandFromPlz(antworten.plz);
  return (
    <div className="space-y-5">
      {/*
        Die Anschrift geht nicht in die Rechnung ein, mit einer Ausnahme: Die
        Postleitzahl setzt das Bundesland und damit die Grunderwerbsteuer. In
        der Maske war das genauso.
      */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label htmlFor="afa-strasse" className="text-xs">Straße</Label>
          <Input
            id="afa-strasse"
            value={antworten.strasse}
            onChange={(e) => aendern({ strasse: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="afa-hausnummer" className="text-xs">Hausnummer</Label>
          <Input
            id="afa-hausnummer"
            value={antworten.hausnummer}
            onChange={(e) => aendern({ hausnummer: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="afa-plz" className="text-xs">PLZ</Label>
          <Input
            id="afa-plz"
            inputMode="numeric"
            value={antworten.plz}
            onChange={(e) => {
              const plz = e.target.value;
              // Ein eindeutiger Bereich setzt das Bundesland. Uneindeutige
              // Bereiche geben nichts zurück, dann bleibt die Wahl unten stehen.
              const abgeleitet = bundeslandFromPlz(plz);
              aendern({ plz, ...(abgeleitet ? { bundesland: abgeleitet } : {}) });
            }}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="afa-ort" className="text-xs">Ort</Label>
          <Input
            id="afa-ort"
            value={antworten.ort}
            onChange={(e) => aendern({ ort: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Die Anschrift ist freiwillig, sie dient nur der Zuordnung. Aus der Postleitzahl ergibt sich das Bundesland,
        soweit der Bereich eindeutig ist. Ändern lässt es sich darunter jederzeit.
      </p>

      <div>
        <Label className="text-xs">Bundesland</Label>
        <Select
          value={antworten.bundesland}
          onValueChange={(v) => {
            // Die Wahl des Bundeslands setzt einen eigenen Satz und einen von
            // Hand eingetragenen Betrag zurueck, sonst waere die Auswahl
            // wirkungslos und der Nutzer sucht den Fehler.
            aendern({ bundesland: v, nebenkostenPct: null, nebenkostenManuell: null });
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUNDESLAND_NK.map((bl) => (
              <SelectItem key={bl.value} value={bl.value}>
                {bl.label}
                {bl.pct > 0
                  ? ` (${bl.pct.toLocaleString("de-DE")} %, davon ${bl.grEst.toLocaleString("de-DE")} % Grunderwerbsteuer)`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ausPlz && ausPlz === antworten.bundesland && (
          <p className="mt-1 text-[11px] text-muted-foreground">Aus der PLZ {antworten.plz} ermittelt.</p>
        )}
      </div>

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-xs text-muted-foreground">Kaufnebenkosten</p>
        <p className="text-lg font-bold">{eurGenau(betrag)}</p>
        <p className="text-[11px] text-muted-foreground">
          {satz > 0
            ? `${satz.toLocaleString("de-DE")} % von ${eurGenau(antworten.kaufpreis)}${eigenerSatz ? ", eigener Satz" : ""}`
            : "Ohne Bundesland steht hier nichts, bitte den Satz oder den Betrag selbst eintragen."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="afa-nk-satz" className="text-xs">Eigener Satz (%)</Label>
          <Input
            id="afa-nk-satz"
            type="number"
            step="0.1"
            min={0}
            max={20}
            value={antworten.nebenkostenPct ?? ""}
            placeholder="z. B. 11,07 mit Courtage"
            onChange={(e) => {
              const v = parseFloat(e.target.value.replace(",", "."));
              aendern({ nebenkostenPct: isFinite(v) && v > 0 ? v : null, nebenkostenManuell: null });
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">oder Betrag gesamt (€)</Label>
          <EuroInput
            value={antworten.nebenkostenManuell ?? betrag}
            onChange={(v) => aendern({ nebenkostenManuell: v })}
            className="mt-1"
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Enthalten sind Grunderwerbsteuer sowie rund 2 Prozent für Notar und Grundbuch, Stand Juli 2026. Eine
        Maklercourtage ist nicht enthalten, sie lässt sich über den eigenen Satz ergänzen. Der auf das Gebäude
        entfallende Anteil der Nebenkosten wird mit abgeschrieben.
      </p>
    </div>
  );
}

/* ── 4. Grundstuecksanteil ──────────────────────────────────────────────── */

/**
 * Der Wert, an dem die ganze Rechnung haengt.
 *
 * Boden nutzt sich nicht ab und wird deshalb nicht abgeschrieben. Ein zu
 * niedriger Ansatz vergroessert den Gebaeudeanteil und damit die ausgewiesene
 * AfA. Deshalb steht hier ausdruecklich, woher der Wert kommen sollte.
 */
export function GrundstueckFeld({ antworten, aendern }: FeldProps) {
  const boden = Math.max(0, antworten.kaufpreis * (antworten.bodenAnteilPct / 100));
  const gebaeude = Math.max(antworten.kaufpreis - boden, 0);
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="afa-bodenanteil" className="text-xs">Grundstücksanteil am Kaufpreis (%)</Label>
        <Input
          id="afa-bodenanteil"
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={antworten.bodenAnteilPct || ""}
          onChange={(e) => aendern({ bodenAnteilPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          className="mt-1 h-14 text-2xl font-semibold"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Boden, nicht abschreibbar</p>
          <p className="text-lg font-bold">{eurGenau(boden)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gebäude, abschreibbar</p>
          <p className="text-lg font-bold">{eurGenau(gebaeude)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold">Woher nimmst du diesen Wert?</p>
        <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">1. Aus dem Kaufvertrag.</strong> Steht dort eine Kaufpreisaufteilung,
            ist sie der Ausgangspunkt. Das Finanzamt folgt ihr, solange sie nicht offensichtlich daneben liegt.
          </li>
          <li>
            <strong className="text-foreground">2. Aus Bodenrichtwert und Fläche.</strong> Bodenrichtwert mal
            Grundstücksfläche mal Miteigentumsanteil ergibt den Bodenwert. Die Richtwerte veröffentlichen die
            Gutachterausschüsse, meist kostenlos im Netz.
          </li>
          <li>
            <strong className="text-foreground">3. Aus der Arbeitshilfe des Bundesfinanzministeriums.</strong> Das ist
            der Weg, den das Finanzamt selbst geht, wenn es die Aufteilung prüft.
          </li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {BODENANTEIL_ANHALT.map((b) => (
            <button
              key={b.lage}
              type="button"
              onClick={() => aendern({ bodenAnteilPct: b.vorschlag })}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              {b.lage}: {b.spanne}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Die Spannen sind Erfahrungswerte und keine Ableitung aus dem Bodenrichtwert. In gefragten Lagen liegt der
          Anteil bei einer Eigentumswohnung oft deutlich über 20 Prozent.
        </p>
      </div>

      <div>
        <Label htmlFor="afa-mea" className="text-xs">Miteigentumsanteil (‰)</Label>
        <Input
          id="afa-mea"
          type="number"
          min={0}
          max={1000}
          value={antworten.miteigentumsanteil || ""}
          onChange={(e) => aendern({ miteigentumsanteil: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
          className="mt-1"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Steht in der Teilungserklärung, 1000 Promille sind das ganze Haus. Der Wert geht nicht in die Abschreibung
          ein. Er hilft beim zweiten Weg oben: Bodenrichtwert mal Grundstücksfläche mal Miteigentumsanteil ergibt den
          Bodenwert der Wohnung.
        </p>
      </div>
    </div>
  );
}

/* ── 5. Sanierung ───────────────────────────────────────────────────────── */

export function SanierungFeld({ antworten, aendern }: FeldProps) {
  return (
    <div className="space-y-5">
      {fragtNachKernsanierung(antworten) && (
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">Das Gebäude wurde kernsaniert</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Dann gilt das Sanierungsjahr als fiktives Baujahr für die Restnutzungsdauer.
              </div>
            </div>
            <Switch
              checked={antworten.kernsaniert}
              onCheckedChange={(v) =>
                aendern({ kernsaniert: v, ...(v ? {} : { kernsanierungJahr: undefined, kernsanierungUmfang: "" }) })
              }
              aria-label="Kernsanierung"
            />
          </div>

          {antworten.kernsaniert && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="afa-ks-jahr" className="text-xs">Jahr der Kernsanierung</Label>
                <Input
                  id="afa-ks-jahr"
                  type="number"
                  min={1900}
                  max={JETZT}
                  value={antworten.kernsanierungJahr ?? ""}
                  onChange={(e) => aendern({ kernsanierungJahr: Number(e.target.value) || undefined })}
                  placeholder="z. B. 2020"
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Je länger die Sanierung zurückliegt, desto weniger Modernisierungspunkte bringt sie. Über 20 Jahre
                  bringt sie keine mehr.
                </p>
              </div>
              <div>
                <Label className="text-xs">Umfang der Kernsanierung</Label>
                <Textarea
                  value={antworten.kernsanierungUmfang}
                  onChange={(e) => aendern({ kernsanierungUmfang: e.target.value })}
                  placeholder="z. B. Dach, Fenster, Heizung, Leitungen, Bäder, Innenausbau"
                  rows={2}
                  className="mt-1 text-sm"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Nur zur Dokumentation. In die Rechnung geht der Umfang nicht ein, dafür ist die
                  Modernisierungsbewertung im nächsten Schritt zuständig.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label className="text-xs">Erhaltungsaufwand gesamt (€)</Label>
          <EuroInput
            value={antworten.erhaltungsaufwand}
            onChange={(v) => aendern({ erhaltungsaufwand: v })}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Reparaturen und Renovierungen in den ersten drei Jahren nach dem Kauf. Bis 15 Prozent der
            Gebäude-Anschaffungskosten sofort absetzbar, darüber werden sie zu anschaffungsnahen Herstellungskosten
            und erhöhen die AfA-Bemessungsgrundlage, § 6 Abs. 1 Nr. 1a EStG.
          </p>
        </div>
        {antworten.erhaltungsaufwand > 0 && (
          <div>
            <Label className="text-xs">Verteilung (Jahre)</Label>
            <Select
              value={String(antworten.erhaltungsaufwandJahre)}
              onValueChange={(v) => aendern({ erhaltungsaufwandJahre: Math.max(1, Math.min(5, parseInt(v, 10) || 1)) })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? "1 Jahr (voll)" : `${n} Jahre`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">§ 82b EStDV, Wahlrecht 1 bis 5 Jahre.</p>
          </div>
        )}
      </div>

      {antworten.gebaeudeart === "denkmal" && (
        <div>
          <Label className="text-xs">Davon begünstigter Sanierungsanteil (€)</Label>
          <EuroInput
            value={antworten.denkmalSanierungsanteil}
            onChange={(v) => aendern({ denkmalSanierungsanteil: v })}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Der von der Denkmalbehörde bescheinigte Anteil. Er wird nach § 7i beziehungsweise § 7h EStG gesondert
            abgeschrieben und erscheint auf der Ergebnisseite im Modellvergleich.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 6. Kuerzere Restnutzungsdauer ──────────────────────────────────────── */

export function GutachtenFeld({ antworten, aendern }: FeldProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Ein Gutachten liegt vor</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Dann zählen dessen Werte, und die Modernisierungsbewertung entfällt.
            </div>
          </div>
          <Switch
            checked={antworten.gutachtenVorhanden}
            onCheckedChange={(v) => aendern({ gutachtenVorhanden: v })}
            aria-label="Gutachten liegt vor"
          />
        </div>
      </div>

      {antworten.gutachtenVorhanden && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="afa-rnd" className="text-xs">Restnutzungsdauer (Jahre)</Label>
            <Input
              id="afa-rnd"
              type="number"
              min={1}
              max={100}
              step="1"
              value={antworten.rndManuell || ""}
              onChange={(e) => {
                const n = Number(e.target.value) || 0;
                aendern({ rndManuell: n, afaSatzManuell: n > 0 ? Math.round((100 / n) * 100) / 100 : 0 });
              }}
              placeholder="z. B. 17"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="afa-satz" className="text-xs">AfA-Satz (%)</Label>
            <Input
              id="afa-satz"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={antworten.afaSatzManuell || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                aendern({ afaSatzManuell: v, rndManuell: v > 0 ? Math.max(1, Math.round(100 / v)) : 0 });
              }}
              placeholder="z. B. 5,88"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="afa-gutachter" className="text-xs">Gutachter oder Quelle</Label>
            <Input
              id="afa-gutachter"
              value={antworten.gutachterQuelle}
              onChange={(e) => aendern({ gutachterQuelle: e.target.value })}
              placeholder="z. B. Sachverständigenbüro Müller"
              className="mt-1"
            />
          </div>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Eine kürzere tatsächliche Nutzungsdauer nach § 7 Abs. 4 Satz 2 EStG lässt sich mit jeder im Einzelfall
        geeigneten Methode darlegen. Das Modell der Anlage 2 ImmoWertV, mit dem dieser Rechner sonst arbeitet, trägt
        allein aber nicht, weil es nicht auf das konkrete Gebäude eingeht. Dafür braucht es eine objektbezogene
        Begutachtung, und ob das Finanzamt ihr folgt, entscheidet es im Einzelfall. Wer kein Gutachten hat, lässt den
        Schalter aus.
      </p>
    </div>
  );
}

/* ── 6. Modernisierungsbewertung ────────────────────────────────────────── */

/**
 * Die acht Elemente der Anlage 2 ImmoWertV.
 *
 * Sie bestimmen ueber die Modernisierungspunkte die Restnutzungsdauer und damit
 * unmittelbar den AfA-Satz. Wer sie nicht sieht, fuellt sie nicht aus und
 * bekommt stillschweigend das Ergebnis fuer ein unmodernisiertes Gebaeude.
 * Deshalb stehen sie in der Strecke und nicht nur auf der Ergebnisseite.
 *
 * Acht Auswahlfelder auf einen Schlag waeren trotzdem die groesste Huerde der
 * Strecke. Drei Dinge nehmen ihr die Schaerfe:
 *   1. Der Schritt erscheint nur, wenn er etwas bewirkt, siehe
 *      `modernisierungWirkt` in `afaStrecke.ts`.
 *   2. Vorne steht ein Schalter. Wer nichts modernisiert hat, ist mit einer
 *      Antwort fertig und bekommt genau das Ergebnis wie bisher.
 *   3. Wer Ja sagt, kann mit einem Klick alle acht auf einen Zeitraum setzen
 *      und danach die Ausreisser einzeln korrigieren.
 */
export function ModernisierungFeld({ antworten, aendern, rechnung }: FeldProps & { rechnung: AfaRechnung }) {
  const [tabelleOffen, setTabelleOffen] = useState(false);
  const alleSetzen = (wert: string) =>
    aendern({ modZeitraeume: Object.fromEntries(MOD_ELEMENTE.map((el) => [el.key, wert])) });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Am Gebäude wurde modernisiert</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Dach, Fenster, Leitungen, Heizung, Dämmung, Bäder, Innenausbau oder Grundriss. Bleibt der Schalter aus,
              rechnet der Rechner mit einem unmodernisierten Gebäude.
            </div>
          </div>
          <Switch
            checked={antworten.modernisiert}
            onCheckedChange={(v) =>
              // Aus heisst zurueck auf den Startwert. Sonst wirkten die
              // Eingaben als Altlast weiter, obwohl der Schalter Nein sagt.
              aendern({ modernisiert: v, ...(v ? {} : { modZeitraeume: createDefaultModZeitraeume() }) })
            }
            aria-label="Modernisierung"
          />
        </div>
      </div>

      {antworten.modernisiert && (
        <>
          <div>
            <p className="text-xs font-medium text-foreground">Alle acht auf einmal setzen</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ZEITRAUM_OPTIONEN.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => alleSetzen(o.value)}
                  className="rounded-full border border-border px-3 py-1.5 text-[11px] transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Damit ist der Rahmen gesetzt, und darunter lassen sich einzelne Punkte korrigieren.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MOD_ELEMENTE.map((el) => {
              const zeitraum = antworten.modZeitraeume[el.key] || "keine";
              return (
                <div key={el.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium leading-snug text-foreground">{el.label}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {punkteFuerElement(el.maxPunkte, zeitraum)} von {el.maxPunkte}
                    </Badge>
                  </div>
                  <Select
                    value={zeitraum}
                    onValueChange={(v) => aendern({ modZeitraeume: { ...antworten.modZeitraeume, [el.key]: v } })}
                  >
                    <SelectTrigger className="mt-2 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ZEITRAUM_OPTIONEN.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <div>
          <p className="text-sm font-semibold">Modernisierungspunkte gesamt</p>
          <p className="text-xs text-muted-foreground">
            höchstens {MAX_MOD_PUNKTE} Punkte
            {rechnung.kernsaniert ? ", die Kernsanierung hebt sie auf das damals Erreichbare" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{rechnung.modPunkte}</p>
          <p className="text-[10px] text-muted-foreground">Formel ab {rechnung.params.abRelativemAlter} % rel. Alter</p>
        </div>
      </div>

      {rechnung.baujahrBekannt && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Dieses Gebäude liegt bei {rechnung.rndErgebnis.relativesAlter.toFixed(0)} % relativem Alter
          ({rechnung.alter} von {rechnung.gnd} Jahren).{" "}
          {rechnung.rndErgebnis.unterSchwelle
            ? `Damit bleibt es unter der Schwelle von ${rechnung.rndErgebnis.schwelle} %, ab der die Modernisierung auf die Restnutzungsdauer wirkt. Zurzeit gilt Gesamtnutzungsdauer minus Alter.`
            : `Die Schwelle von ${rechnung.rndErgebnis.schwelle} % ist erreicht, die Modernisierung wirkt sich auf die Restnutzungsdauer aus.`}
        </p>
      )}

      <div>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setTabelleOffen(!tabelleOffen)}
        >
          Parameter-Tabelle {tabelleOffen ? "ausblenden" : "anzeigen"}
        </button>
        {tabelleOffen && (
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="px-2 py-1 text-left">Punkte</th>
                  <th className="px-2 py-1 text-right">a</th>
                  <th className="px-2 py-1 text-right">b</th>
                  <th className="px-2 py-1 text-right">c</th>
                  <th className="px-2 py-1 text-right">ab rel. Alter</th>
                </tr>
              </thead>
              <tbody>
                {RND_PARAMETER.map((row) => (
                  <tr key={row.punkte} className={row.punkte === rechnung.modPunkte ? "bg-primary/10 font-semibold" : ""}>
                    <td className="px-2 py-0.5">{row.punkte}</td>
                    <td className="px-2 py-0.5 text-right">{row.a}</td>
                    <td className="px-2 py-0.5 text-right">{row.b}</td>
                    <td className="px-2 py-0.5 text-right">{row.c}</td>
                    <td className="px-2 py-0.5 text-right">{row.abRelativemAlter} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Die acht Elemente und ihre Punkte stehen so in der Anlage 2 ImmoWertV. Wie stark zurückliegende Maßnahmen
        abgewertet werden, gibt die Verordnung nicht vor, das überlässt sie der sachverständigen Würdigung. Die Staffel
        100, 85, 60, 35 und 10 Prozent ist eine Annahme dieses Rechners.
      </p>
    </div>
  );
}
