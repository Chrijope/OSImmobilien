import { useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rollenLabel } from "@/lib/rollenLabel";
import type { ExklusivKandidat } from "@/lib/exklusivZuweisung";

/*
 * „Exklusive Freischaltung“ im Wizard (Inhaber, 18.10.2026): das ganze Objekt
 * oder einzelne Einheiten angelegten Vertriebspartnern und Vertriebsleitern
 * zuweisen. Gewählt wird nur aus echten Nutzern; Altnamen ohne Nutzer bleiben
 * als Eintrag sichtbar und lassen sich entfernen.
 */

function NutzerWahl({ kandidaten, gewaehlt, onWaehlen, onEntfernen, label, id }: {
  kandidaten: ExklusivKandidat[];
  /** Angezeigte Einträge: Kennung (oder Altname) und Name. */
  gewaehlt: Array<{ schluessel: string; name: string }>;
  onWaehlen: (k: ExklusivKandidat) => void;
  onEntfernen: (schluessel: string) => void;
  label: string;
  id: string;
}) {
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState(false);
  const schon = new Set(gewaehlt.map((g) => g.schluessel));
  const q = suche.trim().toLowerCase();
  const treffer = kandidaten.filter((k) => !schon.has(k.id) && (!q || k.name.toLowerCase().includes(q) || rollenLabel(k.rolle).toLowerCase().includes(q)));
  return (
    <div>
      {gewaehlt.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {gewaehlt.map((g) => (
            <Badge key={g.schluessel} variant="secondary" className="text-xs gap-1">
              {g.name}
              <button type="button" className="ml-1 text-destructive" aria-label={`${g.name} entfernen`} onClick={() => onEntfernen(g.schluessel)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          id={id}
          aria-label={label}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onFocus={() => setOffen(true)}
          onBlur={() => setTimeout(() => setOffen(false), 200)}
          placeholder="Nutzer suchen (Name oder Rolle)…"
          className="h-[40px] text-xs pl-7 sm:h-8"
        />
        {offen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-56 overflow-y-auto" role="listbox">
            {treffer.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {kandidaten.length === 0 ? "Keine aktiven Vertriebspartner oder Vertriebsleiter angelegt." : "Kein weiterer Treffer."}
              </p>
            ) : treffer.map((k) => (
              <button
                key={k.id}
                type="button"
                role="option"
                aria-selected={false}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-xs"
                onMouseDown={(e) => { e.preventDefault(); onWaehlen(k); setSuche(""); }}
              >
                <span className="font-medium">{k.name}</span>
                <Badge variant="outline" className="text-[10px]">{rollenLabel(k.rolle)}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ExklusivEinheit {
  id: string;
  bezeichnung: string;
  exklusivNutzer: string[];
}

export function ExklusivZuweisung({ kandidaten, objektNamen, objektKennungen, onObjekt, einheiten, onEinheit }: {
  kandidaten: ExklusivKandidat[];
  /** `exklusivPartner` am Objekt: Namen, wie seit jeher gespeichert. */
  objektNamen: string[];
  /** Name zu Kennung, `meta.exklusivPartnerKennung`. */
  objektKennungen: Record<string, string>;
  onObjekt: (namen: string[], kennungen: Record<string, string>) => void;
  einheiten: ExklusivEinheit[];
  onEinheit: (einheitId: string, nutzerIds: string[]) => void;
}) {
  const nameZu = (id: string) => kandidaten.find((k) => k.id === id)?.name ?? "Unbekannter Nutzer";
  return (
    <div className="mt-4 space-y-3" data-testid="exklusiv-zuweisung">
      <div>
        <Label className="text-xs font-semibold" htmlFor="exklusiv-objekt">Exklusive Freischaltung (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Ohne Auswahl sehen alle Vertriebspartner das Objekt. Mit Auswahl sehen es nur die gewählten Nutzer, dazu Admin, Inhaber und Objektpartner.
        </p>
      </div>
      <div>
        <p className="text-xs font-medium mb-1">Ganzes Objekt</p>
        <NutzerWahl
          id="exklusiv-objekt"
          label="Nutzer für das ganze Objekt suchen"
          kandidaten={kandidaten}
          gewaehlt={objektNamen.map((n) => ({ schluessel: objektKennungen[n] || n, name: n }))}
          onWaehlen={(k) => onObjekt([...objektNamen, k.name], { ...objektKennungen, [k.name]: k.id })}
          onEntfernen={(s) => {
            const name = objektNamen.find((n) => (objektKennungen[n] || n) === s);
            if (!name) return;
            const { [name]: _weg, ...rest } = objektKennungen;
            onObjekt(objektNamen.filter((n) => n !== name), rest);
          }}
        />
      </div>
      <div>
        <p className="text-xs font-medium mb-1">Einzelne Wohneinheiten</p>
        {einheiten.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Sobald Einheiten angelegt sind, lassen sie sich hier einzeln zuweisen. Die Einheit sieht dann nur der gewählte Nutzer.</p>
        ) : (
          <div className="space-y-2">
            {einheiten.map((e) => (
              <div key={e.id} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-start">
                <span className="text-xs pt-1.5">{e.bezeichnung}</span>
                <NutzerWahl
                  id={`exklusiv-einheit-${e.id}`}
                  label={`Nutzer für ${e.bezeichnung} suchen`}
                  kandidaten={kandidaten}
                  gewaehlt={e.exklusivNutzer.map((id) => ({ schluessel: id, name: nameZu(id) }))}
                  onWaehlen={(k) => onEinheit(e.id, [...e.exklusivNutzer, k.id])}
                  onEntfernen={(id) => onEinheit(e.id, e.exklusivNutzer.filter((x) => x !== id))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
