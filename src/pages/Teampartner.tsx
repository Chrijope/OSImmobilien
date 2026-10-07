import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, UserPlus, ChevronRight, ChevronDown, GitBranch, List, MapPin, Users, Trash2, KeyRound, ShieldCheck, Minus, Plus, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { cacheGet } from "@/lib/dataCache";
import { useLiveVersion } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/PageHeader";
import { useUser } from "@/contexts/UserContext";
import { ROLES } from "@/types/user";
import { rollenLabel, rollenVarianteVonProfil, LEAD_BERATER_LABEL, ROLLEN_VARIANTE_LEAD_BERATER } from "@/lib/rollenLabel";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  buildTree,
  istCLevel,
  type TeamMitglied,
  type Strukturknoten,
} from "@/lib/strukturBaum";


const statusColors: Record<string, string> = {
  aktiv: "bg-green-100 text-green-700",
  ausstehend: "bg-orange-100 text-orange-700",
  inaktiv: "bg-red-100 text-red-700",
};

const rolleColorMap: Record<string, string> = {
  inhaber: "bg-yellow-400 text-white",
  admin: "bg-red-500 text-white",
  vertriebspartner: "bg-green-500 text-white",
  objektpartner: "bg-amber-500 text-white",
  finanzierungspartner: "bg-cyan-500 text-white",
  buchhaltung: "bg-orange-500 text-white",
  hausverwaltung: "bg-amber-600 text-white",
  setterin: "bg-purple-400 text-white",
  bewerber: "bg-pink-500 text-white",
  kunde: "bg-teal-500 text-white",
  testaccount: "bg-orange-400 text-white",
  individuell: "bg-gray-500 text-white",
};

/**
 * Rollen, die im Strukturbaum unter "Struktur von" waehlbar sind.
 * Bewusst die technischen Bezeichner aus `user_roles` und nicht die
 * Anzeigenamen: wird ein Label in `src/types/user.ts` umbenannt, faellt die
 * betroffene Rolle sonst stillschweigend aus dem Filter.
 * Die Reihenfolge in der Auswahlliste kommt aus `ROLES`.
 */
const STRUKTUR_FILTER_ROLLEN = [
  "inhaber",
  "admin",
  "vertriebsleiter",
  "vertriebspartner",
  "objektpartner",
  "versicherungsexperte",
];

/**
 * Feste Breite einer Karte im Organigramm. Alle Karten sind gleich breit,
 * sonst sitzen die Verbindungslinien schief: die kurze Senkrechte zu einem
 * Kind liegt in der Mitte seiner Spalte, und die Spalte ist genau so breit wie
 * die Karte darin.
 */
const KARTE_BREITE = "w-56";

/**
 * Die direkten Kinder der Wurzel, aufgeteilt in die festen Ebenen des vollen
 * Baums. Reine Anzeigefrage: `buildTree` liefert sie als eine einzige Reihe,
 * geteilt wird erst hier.
 */
type FesteEbenenAufteilung = {
  /** Ebene 2, Schild "C-Level". */
  cLevel: Strukturknoten[];
  /** Ebene 2, eigene Gruppe: Tippgeber, die direkt an der Spitze haengen. */
  wurzelTippgeber: Strukturknoten[];
  /** Ebene 3, Schild "Vertriebspartner". Alle uebrigen direkten Kinder. */
  partner: Strukturknoten[];
};

/**
 * Status als kleiner farbiger Punkt statt als Textetikett. Bei vielen Karten
 * nebeneinander sind Etiketten optisch lauter als die Namen. Die Farbe allein
 * traegt die Bedeutung nicht, jeder Punkt hat zusaetzlich `title` und
 * `aria-label`, und unter dem Baum steht eine Legende.
 * `--alert-green` und `--alert-orange` sind fuer die dunkle Darstellung eigens
 * abgestimmt, anders als `--success` und `--warning`.
 */
const statusPunkte: Record<string, { punkt: string; text: string }> = {
  aktiv: { punkt: "bg-alert-green", text: "Aktiv" },
  ausstehend: { punkt: "bg-alert-orange", text: "Ausstehend" },
  inaktiv: { punkt: "bg-muted-foreground/40", text: "Inaktiv" },
};

/** Reihenfolge der Legendeneintraege. */
const statusReihenfolge = ["aktiv", "ausstehend", "inaktiv"];

/**
 * Laedt eine Tabelle vollstaendig, in Bloecken von 1000 Zeilen.
 *
 * Supabase gibt je Abfrage hoechstens so viele Zeilen zurueck, wie in den
 * API-Einstellungen als Obergrenze stehen (Standard 1000), und meldet das
 * Abschneiden nicht. Genau das ist hier gefaehrlich: Fehlt die Zeile einer
 * Person aus `user_settings`, kennt der Baum ihren Teamleiter nicht, und sie
 * haengt als "Ohne Teamleiter" direkt unter der Wurzel. Bei abgeschnittenen
 * `profiles` verschwindet sie sogar ganz. Beides sieht auf dem Bildschirm wie
 * eine Datenluecke aus, ist aber ein Ladefehler.
 *
 * Sortiert wird nach `id`, sonst kann dieselbe Zeile in zwei Bloecken
 * auftauchen oder ganz durchfallen.
 */
async function ladeAlleZeilen<T = any>(tabelle: string, spalten: string): Promise<T[]> {
  const BLOCK = 1000;
  /** Notbremse, damit ein Fehler nicht endlos blaettert. */
  const MAX_BLOECKE = 50;
  const alle: T[] = [];
  for (let block = 0; block < MAX_BLOECKE; block++) {
    const von = block * BLOCK;
    const { data, error } = await (supabase as any)
      .from(tabelle)
      .select(spalten)
      .order("id", { ascending: true })
      .range(von, von + BLOCK - 1);
    if (error) {
      console.error(`Teampartner: ${tabelle} konnte nicht vollständig geladen werden.`, error);
      // Erster Block fehlgeschlagen: es gibt nichts, worauf man aufbauen kann.
      return block === 0 ? [] : alle;
    }
    const zeilen = (data || []) as T[];
    alle.push(...zeilen);
    if (zeilen.length < BLOCK) break;
  }
  return alle;
}

function getInitials(v: string, n: string) { return `${v[0]}${n[0]}`.toUpperCase(); }
function getAvatarColor(rolle: string) {
  const key = rolle.toLowerCase();
  return rolleColorMap[key]?.split(" ")[0] || "bg-primary";
}


/**
 * Sammelt alle Status, die im Baum tatsaechlich vorkommen. Die Legende unter
 * dem Baum zeigt nur diese, damit dort keine Farbe erklaert wird, die auf
 * dem Bildschirm gar nicht auftaucht.
 */
function sammleStatus(knoten: Strukturknoten, gesammelt = new Set<string>()): Set<string> {
  gesammelt.add(knoten.status);
  (knoten.children || []).forEach(kind => sammleStatus(kind, gesammelt));
  return gesammelt;
}

/**
 * Eine Karte im Organigramm.
 *
 * Bedienung, bewusst getrennt:
 * - Klick auf die Karte klappt den Ast darunter auf oder zu. Nur Karten mit
 *   Untergebenen sind anklickbar, `ausgewaehlt` bedeutet hier "aufgeklappt".
 * - Der Pfeil unten rechts oeffnet das Profil. Das ist der einzige Weg zur
 *   Navigation, damit Auf- und Zuklappen und Oeffnen sich nicht in die Quere
 *   kommen.
 */
function StrukturKarte({
  knoten,
  ausgewaehlt = false,
  auswaehlbar = false,
  betont = false,
  onAuswaehlen,
  onOeffnen,
}: {
  knoten: Strukturknoten;
  ausgewaehlt?: boolean;
  auswaehlbar?: boolean;
  betont?: boolean;
  onAuswaehlen?: () => void;
  onOeffnen: (id: string) => void;
}) {
  const name = `${knoten.vorname} ${knoten.nachname}`.trim();
  const status = statusPunkte[knoten.status] || statusPunkte.inaktiv;

  // Traegt jemand mehrere Rollen, entscheidet die hoechste, in welchem Feld die
  // Karte steht. Die uebrigen stehen klein unter dem Namen, sonst waere nicht
  // erkennbar, dass die Person mehr als eine Rolle hat.
  const weitereRollen = (knoten.alleRollen || [])
    .map(r => r.label)
    .filter(label => label !== knoten.rolle);

  const kinder = knoten.children || [];
  const anzahlPartner = kinder.filter(k => !k.istTippgeber).length;
  const anzahlTippgeber = kinder.length - anzahlPartner;
  const zaehlung: string[] = [];
  if (anzahlPartner > 0) zaehlung.push(`${anzahlPartner} Partner`);
  if (anzahlTippgeber > 0) zaehlung.push(`${anzahlTippgeber} Tippgeber`);

  const provision = knoten.istTippgeber && knoten.provisionswert
    ? knoten.provisionstyp === "euro"
      ? `${knoten.provisionswert} € je Abschluss`
      : `${knoten.provisionswert} % je Abschluss`
    : "";
  const fusstext = zaehlung.length > 0 ? zaehlung.join(" · ") : provision;

  return (
    <div
      role={auswaehlbar ? "button" : undefined}
      tabIndex={auswaehlbar ? 0 : undefined}
      aria-expanded={auswaehlbar ? ausgewaehlt : undefined}
      onClick={auswaehlbar ? onAuswaehlen : undefined}
      onKeyDown={auswaehlbar ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAuswaehlen?.(); }
      } : undefined}
      className={`relative flex h-full flex-col rounded-lg border bg-card p-3 transition-colors duration-200 ${
        // `cursor-default` ist hier kein Schmuck: Der Rollbereich um den Baum
        // traegt `cursor-grab`, weil man dort die Ansicht verschieben kann.
        // Ohne eigene Angabe wuerde eine nicht aufklappbare Karte diese Hand
        // erben und Verschieben versprechen, wo nichts zu verschieben ist.
        auswaehlbar ? "cursor-pointer hover:border-primary/40 hover:bg-accent/40" : "cursor-default"
      } ${
        ausgewaehlt
          // Aufgeklappt. Bewusst ohne den frueheren kraeftigen Ring: im
          // Organigramm sind mehrere Aeste gleichzeitig offen, sieben leuchtende
          // Karten waeren lauter als der Baum selbst.
          ? "border-primary/60 bg-primary/5"
          : betont
            // Der Inhaber steht etwas kraeftiger da. Ueber die Schriftfarbe
            // abgeleitet, damit der Rahmen hell wie dunkel gleich gut sitzt.
            ? "border-foreground/20 shadow-sm"
            : knoten.istTippgeber
              // Tippgeber ohne neue Farbe unterscheidbar: gestrichelter Rahmen
              // in derselben Rahmenfarbe wie alle anderen Karten.
              ? "border-dashed border-border"
              : "border-border"
      }`}
    >
      <span
        role="img"
        title={`Status: ${status.text}`}
        aria-label={`Status: ${status.text}`}
        className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full ${status.punkt}`}
      />
      <div className="flex items-start gap-2.5 pr-4">
        <Avatar className="h-9 w-9 shrink-0">
          {knoten.avatarUrl && <AvatarImage src={knoten.avatarUrl} alt={name} />}
          <AvatarFallback className={`${getAvatarColor(knoten.rolleId || knoten.rolle)} text-white text-xs font-medium`}>
            {getInitials(knoten.vorname, knoten.nachname)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug" title={name}>{name}</p>
          <p className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">{knoten.rolle}</p>
          {/*
            Frueher stand "Ohne Teamleiter" als eigenes Rollenfeld ueber einem
            Raster. Im Organigramm gibt es keine Felder mehr, deshalb steht der
            Hinweis jetzt an der Karte selbst. Ohne ihn saehe die Notloesung
            "haengt unter der Wurzel" wie eine gewollte Zuordnung zum Inhaber
            aus.
          */}
          {knoten.ohneTeamleiter && (
            <p className="mt-1 inline-block rounded border border-border px-1.5 py-px text-[10px] leading-tight text-muted-foreground">
              Ohne Teamleiter
            </p>
          )}
          {weitereRollen.length > 0 && (
            <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground/70">
              auch {weitereRollen.join(" · ")}
            </p>
          )}
          {knoten.imonduId && (
            <p className="mt-0.5 text-[11px] leading-snug tracking-wide text-muted-foreground/80">{knoten.imonduId}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {/*
            Statt des frueheren Personen-Symbols zeigt hier ein Pfeil, ob der
            Ast offen ist. Die Zaehlung daneben bleibt unveraendert stehen, sie
            ist bei zugeklapptem Ast die einzige Auskunft darueber, wie viele
            Leute darunter haengen.
          */}
          {auswaehlbar ? (
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${ausgewaehlt ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          ) : (
            zaehlung.length > 0 && <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          {knoten.istTippgeber && knoten.portalAktiv && (
            <ShieldCheck className="h-3 w-3 shrink-0 text-alert-green" aria-label="Portal-Zugang aktiv" />
          )}
          <span className="truncate">{fusstext}</span>
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOeffnen(knoten.id); }}
          title="Profil öffnen"
          aria-label={`Profil von ${name} öffnen`}
          className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Ein Knoten des Organigramms samt allem, was darunter haengt.
 *
 * Aufbau je Knoten: die Karte, darunter ein kurzer Stiel, darunter die Kinder
 * nebeneinander in einer Reihe. Jedes Kind bekommt eine eigene Spalte, in der
 * es genauso weitergeht. Tippgeber sind dabei ganz normale Kinder und stehen
 * als eigene Kaesten in derselben Reihe wie die Partner, ohne Zusatzklick.
 *
 * Die Linien sind schlichte Kaesten in der Rahmenfarbe `border-border`, weder
 * Bibliothek noch von Hand gerechneter SVG-Pfad:
 * - der Stiel unter der Karte, 20 Pixel hoch und ein Pixel breit,
 * - je Kindspalte ein waagerechtes Stueck am oberen Rand. Es beginnt beim
 *   ersten Kind erst in der Spaltenmitte und endet beim letzten Kind dort.
 *   Zusammen ergeben die Stuecke aller Geschwister genau einen durchgehenden
 *   Balken von der ersten bis zur letzten Kartenmitte,
 * - je Kindspalte eine kurze Senkrechte von diesem Balken auf die Karte.
 * Bei einem einzigen Kind faellt der Balken auf die Breite null zusammen, es
 * bleibt eine gerade Linie von oben nach unten.
 *
 * Unterhalb von 768 Pixeln (`md`) faellt das Nebeneinander weg: dort stehen die
 * Kinder untereinander, eingerueckt an einer senkrechten Fuehrungslinie. Ein
 * Organigramm mit Dutzenden Karten nebeneinander ist auf einem Handy nicht
 * lesbar, die eingerueckte Liste zeigt dieselbe Verschachtelung mit denselben
 * Karten und demselben Auf- und Zuklappen.
 */
function OrgKnoten({
  knoten,
  betont = false,
  offeneIds,
  onUmschalten,
  onOeffnen,
}: {
  knoten: Strukturknoten;
  betont?: boolean;
  offeneIds: Set<string>;
  onUmschalten: (id: string) => void;
  onOeffnen: (id: string) => void;
}) {
  const kinder = knoten.children || [];
  const offen = offeneIds.has(knoten.id);

  return (
    <div className="flex flex-col md:items-center">
      <div className={`${KARTE_BREITE} shrink-0`}>
        <StrukturKarte
          knoten={knoten}
          betont={betont}
          auswaehlbar={kinder.length > 0}
          ausgewaehlt={offen}
          onAuswaehlen={() => onUmschalten(knoten.id)}
          onOeffnen={onOeffnen}
        />
      </div>
      {offen && kinder.length > 0 && (
        <>
          {/*
            Stiel von der Karte nach unten. Auf schmalen Bildschirmen uebernimmt
            die Fuehrungslinie der eingerueckten Liste seine Aufgabe.
          */}
          <div aria-hidden="true" className="hidden h-5 w-px bg-border md:block" />
          <KinderReihe
            kinder={kinder}
            offeneIds={offeneIds}
            onUmschalten={onUmschalten}
            onOeffnen={onOeffnen}
          />
        </>
      )}
    </div>
  );
}

/**
 * Eine Reihe gleichrangiger Knoten samt der Linien, die sie an die Ebene
 * darueber binden.
 *
 * Eigene Komponente, weil dieselbe Reihe an zwei Stellen gebraucht wird: im
 * normalen Baum unter einer Karte und in der festen Ebenen-Darstellung unter
 * einem Schild. Ohne die Trennung stuende der Linienaufbau zweimal im Code und
 * liefe frueher oder spaeter auseinander.
 *
 * Schmale Bildschirme: eingerueckte Liste an einer Fuehrungslinie. Bewusst nur
 * 32 Pixel Einzug je Ebene, damit auch die vierte Ebene neben eine 224 Pixel
 * breite Karte auf ein Handy passt.
 */
function KinderReihe({
  kinder,
  offeneIds,
  onUmschalten,
  onOeffnen,
}: {
  kinder: Strukturknoten[];
  offeneIds: Set<string>;
  onUmschalten: (id: string) => void;
  onOeffnen: (id: string) => void;
}) {
  return (
    <div className="ml-4 mt-2 flex flex-col gap-2 border-l border-border pl-4 md:ml-0 md:mt-0 md:flex-row md:items-start md:gap-0 md:border-l-0 md:pl-0">
      {kinder.map((kind, i) => (
        <div key={kind.id} className="relative flex flex-col md:items-center md:px-2 md:pt-5">
          <span
            aria-hidden="true"
            className="absolute top-0 hidden h-px bg-border md:block"
            style={{
              left: i === 0 ? "50%" : 0,
              right: i === kinder.length - 1 ? "50%" : 0,
            }}
          />
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 hidden h-5 w-px -translate-x-1/2 bg-border md:block"
          />
          <OrgKnoten
            knoten={kind}
            offeneIds={offeneIds}
            onUmschalten={onUmschalten}
            onOeffnen={onOeffnen}
          />
        </div>
      ))}
    </div>
  );
}

/** Beschriftung einer festen Ebene, zum Beispiel "C-Level". */
function EbenenSchild({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {text}
    </span>
  );
}

/**
 * Die drei festen, beschrifteten Ebenen des vollen Baums.
 *
 * Warum es diese Darstellung ueberhaupt braucht: `buildTree` haengt die
 * C-Level-Personen **und** jeden Partner ohne gepflegten Teamleiter als
 * Geschwister direkt unter die Wurzel. Beide Gruppen standen damit in
 * derselben Reihe, und weil heute kaum jemand einen Teamleiter im Profil hat,
 * verschwand das C-Level optisch in einer Reihe aus siebzig Partnern. Die
 * Baumlogik bleibt unangetastet, geteilt wird erst hier in der Darstellung.
 *
 * Aufbau:
 *   Ebene 1   die Spitze, allein
 *   Ebene 2   Schild "C-Level", alle direkten Kinder mit C-Level-Rolle
 *   Ebene 3   Schild "Vertriebspartner", alle uebrigen direkten Kinder
 *   ab Ebene 4 wieder der ganz normale Baum je Person
 *
 * Ebene 3 haengt an der **ganzen** Ebene 2, nicht an einer einzelnen Person
 * darin: unter der C-Level-Reihe liegt ein durchgehender waagerechter Balken,
 * aus dessen Mitte der Stiel zur Partnerreihe hervorgeht. Gibt es kein
 * C-Level, faellt Ebene 2 samt Balken weg und Ebene 3 haengt direkt an der
 * Spitze.
 */
function FesteEbenen({
  wurzel,
  ebenen,
  offeneIds,
  onUmschalten,
  onOeffnen,
}: {
  wurzel: Strukturknoten;
  ebenen: FesteEbenenAufteilung;
  offeneIds: Set<string>;
  onUmschalten: (id: string) => void;
  onOeffnen: (id: string) => void;
}) {
  const kinder = wurzel.children || [];
  const offen = offeneIds.has(wurzel.id);

  /*
   * Tippgeber, die direkt der Spitze zugeordnet sind, bekommen in Ebene 2 eine
   * eigene Gruppe mit eigenem Schild neben dem C-Level. Sie gehoeren nicht in
   * die Partnerreihe, dort saehen sie wie Vertriebspartner aus. Und sie
   * gehoeren nicht unter das Schild "C-Level", das waere schlicht falsch. Ihre
   * einzige echte Aussage ist "haengt persoenlich an der Spitze", und die
   * bleibt genau dann lesbar, wenn sie unmittelbar unter der Spitzenkarte
   * stehen. Im Regelfall ist die Gruppe leer und gar nicht zu sehen.
   */
  const ebeneZwei = [
    { titel: "C-Level", knoten: ebenen.cLevel },
    { titel: "Tippgeber", knoten: ebenen.wurzelTippgeber },
  ].filter(gruppe => gruppe.knoten.length > 0);

  return (
    <div className="flex flex-col md:items-center">
      <div className={`${KARTE_BREITE} shrink-0`}>
        <StrukturKarte
          knoten={wurzel}
          betont
          auswaehlbar={kinder.length > 0}
          ausgewaehlt={offen}
          onAuswaehlen={() => onUmschalten(wurzel.id)}
          onOeffnen={onOeffnen}
        />
      </div>

      {offen && ebeneZwei.length > 0 && (
        <div className="mt-3 flex flex-col md:mt-0 md:items-center">
          <div aria-hidden="true" className="hidden h-5 w-px bg-border md:block" />
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-10">
            {ebeneZwei.map(gruppe => (
              <div key={gruppe.titel} className="flex flex-col md:items-center">
                <EbenenSchild text={gruppe.titel} />
                <div aria-hidden="true" className="hidden h-2.5 w-px bg-border md:block" />
                <KinderReihe
                  kinder={gruppe.knoten}
                  offeneIds={offeneIds}
                  onUmschalten={onUmschalten}
                  onOeffnen={onOeffnen}
                />
              </div>
            ))}
          </div>
          {/*
            Der durchgehende Balken unter der ganzen Ebene 2. `w-full` ist hier
            genau die Breite dieser Ebene: der umgebende Kasten ist so breit wie
            die Reihe darin, und ein Element mit Prozentbreite zaehlt bei dieser
            Berechnung nicht mit. Der Balken kann die Ebene also nicht selbst
            breiter machen.
          */}
          {ebenen.partner.length > 0 && (
            <div aria-hidden="true" className="mt-5 hidden h-px w-full bg-border md:block" />
          )}
        </div>
      )}

      {offen && ebenen.partner.length > 0 && (
        <div className="mt-3 flex flex-col md:mt-0 md:items-center">
          <div aria-hidden="true" className="hidden h-5 w-px bg-border md:block" />
          <EbenenSchild text="Vertriebspartner" />
          <div aria-hidden="true" className="hidden h-2.5 w-px bg-border md:block" />
          <KinderReihe
            kinder={ebenen.partner}
            offeneIds={offeneIds}
            onUmschalten={onUmschalten}
            onOeffnen={onOeffnen}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Was beim Oeffnen aufgeklappt ist: **nur die Wurzel**.
 *
 * Damit steht die C-Level-Ebene sichtbar darunter, jede dieser Karten aber
 * zugeklappt, mit der Zaehlung "12 Partner, 3 Tippgeber" daran. Genau diese
 * zwei Ebenen sind die Frage, mit der jemand die Seite oeffnet.
 *
 * Zuvor waren auch die C-Level-Knoten offen. Das hiess: deren Kinder sind die
 * Vertriebspartner, und die standen damit alle nebeneinander. Bei rund 75
 * Partnern an einer einzigen C-Level-Person wird die Reihe mehrere tausend
 * Pixel breit, und die Startansicht ist unbrauchbar. Eine Ebene tiefer klappt
 * man selbst auf, das kostet einen Klick und ist immer noch da.
 */
function standardOffeneKnoten(wurzel: Strukturknoten): Set<string> {
  return new Set<string>([wurzel.id]);
}

/** Alle Knoten, unter denen ueberhaupt jemand haengt. Fuer "Alles aufklappen". */
function alleAufklappbaren(knoten: Strukturknoten, gesammelt = new Set<string>()): Set<string> {
  const kinder = knoten.children || [];
  if (kinder.length > 0) {
    gesammelt.add(knoten.id);
    kinder.forEach(kind => alleAufklappbaren(kind, gesammelt));
  }
  return gesammelt;
}

/**
 * Grenzen und Schrittweite des Zooms.
 *
 * Unter 40 Prozent sind die Namen auf den Karten nicht mehr lesbar, ueber 150
 * Prozent passt kaum noch ein Ast nebeneinander in den Kasten. Gezoomt wird
 * ueber `transform: scale()` auf dem ganzen Bauminhalt und ausdruecklich nicht
 * ueber die Schriftgroesse: Karten fester Breite wuerden sonst unterschiedlich
 * umbrechen, unterschiedlich hoch werden, und die von Hand gesetzten
 * Verbindungslinien passten nicht mehr dazu.
 */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_SCHRITT = 0.1;

/**
 * Haelt einen Zoomwert in den Grenzen und raeumt Rundungsreste weg.
 *
 * Bewusst auf drei Nachkommastellen und nicht auf zwei: ein Trackpad meldet
 * sehr kleine Radschritte, die auf zwei Stellen gerundet gar keine Aenderung
 * ergeben haetten. Der Zoom waere dann bei feiner Bedienung stehen geblieben.
 */
function zoomBegrenzen(wert: number): number {
  const gerundet = Math.round(wert * 1000) / 1000;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, gerundet));
}

/**
 * Das Organigramm samt Bedienleiste und Legende.
 *
 * Welche Aeste offen sind, haelt diese Stelle als Menge von Kennungen. Bewusst
 * hier und nicht im einzelnen Knoten: "Alles aufklappen" und "Alles zuklappen"
 * muessen alle Knoten auf einmal erreichen.
 *
 * Der Baum bekommt einen **eigenen Rollbereich mit fester Hoehe**, in dem er
 * waagerecht und senkrecht rollt. Das ist keine Optik, sondern Bedingung fuer
 * den Radzoom: ein Mausrad, das hier zoomt, scrollt hier nicht mehr, und ohne
 * eigenen Rollbereich waere ein aufgeklappter Ast unterhalb des Randes nicht
 * mehr erreichbar. Ausserhalb des Kastens scrollt die Seite ganz normal.
 *
 * Die Hoehe kommt ueber `flex-1` aus dem Kasten und ist damit **unabhaengig vom
 * Inhalt**. Frueher stand hier `max-h-[70vh]`: der Rollbereich war dann so hoch
 * wie sein Inhalt, hoechstens 70 Prozent der Fensterhoehe. Der Platzhalter im
 * Inneren fuehrt aber die gezoomte Groesse mit, also aenderte jeder Zoomschritt
 * und jedes Auf- und Zuklappen die Hoehe des Rollbereichs und damit die Hoehe
 * des ganzen Kastens. Genau das ist das Verziehen des Rahmens beim Scrollen mit
 * dem Mausrad.
 *
 * `w-max` laesst den Inhalt so breit werden wie noetig, `min-w-full` haelt ihn
 * mindestens so breit wie der Kasten, damit ein schmaler Baum mittig steht
 * statt links zu kleben.
 */
function StrukturOrganigramm({
  wurzel,
  festeEbenen,
  onOeffnen,
}: {
  wurzel: Strukturknoten;
  /**
   * Aufteilung der direkten Kinder in die festen Ebenen "C-Level" und
   * "Vertriebspartner". Fehlt sie, wird der reine Baum ohne Schilder
   * gezeichnet. Genau das ist der Fall, wenn unter "Struktur von" eine
   * einzelne Person gewaehlt ist.
   */
  festeEbenen?: FesteEbenenAufteilung;
  onOeffnen: (id: string) => void;
}) {
  const [offeneIds, setOffeneIds] = useState<Set<string>>(() => standardOffeneKnoten(wurzel));

  const umschalten = (id: string) =>
    setOffeneIds(vorher => {
      const naechste = new Set(vorher);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });

  const statusImBaum = sammleStatus(wurzel);

  // Wer nur deshalb ganz oben haengt, weil im Profil kein Teamleiter steht.
  // Eine einzelne Karte traegt dafuer nur ein kleines Etikett; sind es
  // siebzig, sieht das wie eine gewollte Struktur aus. Deshalb die Zeile ueber
  // dem Baum.
  const ohneTeamleiter = (wurzel.children || []).filter(k => k.ohneTeamleiter).length;

  // ── Zoom ────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  // Derselbe Wert noch einmal als Ref: der Radzeiger haengt direkt am Element
  // und wird nur einmal angemeldet, er saehe sonst immer den Startwert.
  const zoomRef = useRef(1);
  const rollbereichRef = useRef<HTMLDivElement>(null);
  const inhaltRef = useRef<HTMLDivElement>(null);
  // Groesse des Bauminhalts *ohne* Zoom. `transform` aendert die Groesse im
  // Seitenaufbau nicht, deshalb bekommt der Rollbereich einen Platzhalter in
  // der gezoomten Groesse. Ohne ihn bliebe beim Herauszoomen leerer Raum
  // stehen und beim Hineinzoomen waere der Rand nicht erreichbar.
  const [inhaltMass, setInhaltMass] = useState({ breite: 0, hoehe: 0 });
  // Wohin nach einem Zoomschritt gerollt werden soll. Wird erst angewendet,
  // wenn die neue Groesse im Seitenaufbau steht.
  const rollZielRef = useRef<{ links: number; oben: number } | null>(null);

  useLayoutEffect(() => {
    const el = inhaltRef.current;
    if (!el) return;
    const messen = () => setInhaltMass({ breite: el.offsetWidth, hoehe: el.offsetHeight });
    messen();
    if (typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  /**
   * Setzt den Zoom und haelt dabei den Punkt fest, ueber dem der Mauszeiger
   * steht. `ankerX`/`ankerY` sind Pixel innerhalb des Rollbereichs; ohne
   * Angabe wird die Mitte des sichtbaren Ausschnitts festgehalten, das ist
   * bei den Knoepfen das Erwartete.
   */
  const zoomSetzen = useCallback((neuerWert: number, ankerX?: number, ankerY?: number) => {
    const vorher = zoomRef.current;
    const neu = zoomBegrenzen(neuerWert);
    if (neu === vorher) return;
    const el = rollbereichRef.current;
    if (el) {
      const ax = ankerX ?? el.clientWidth / 2;
      const ay = ankerY ?? el.clientHeight / 2;
      const faktor = neu / vorher;
      rollZielRef.current = {
        links: (el.scrollLeft + ax) * faktor - ax,
        oben: (el.scrollTop + ay) * faktor - ay,
      };
    }
    zoomRef.current = neu;
    setZoom(neu);
  }, []);

  useLayoutEffect(() => {
    const ziel = rollZielRef.current;
    const el = rollbereichRef.current;
    if (!ziel || !el) return;
    rollZielRef.current = null;
    el.scrollLeft = Math.max(0, ziel.links);
    el.scrollTop = Math.max(0, ziel.oben);
  }, [zoom]);

  useEffect(() => {
    const el = rollbereichRef.current;
    if (!el) return;
    // React meldet `onWheel` passiv an, ein `preventDefault` darin waere
    // wirkungslos und wuerde nur eine Warnung in der Konsole erzeugen. Deshalb
    // haengt der Zeiger hier von Hand am Element, mit `passive: false`.
    const beiRad = (e: WheelEvent) => {
      e.preventDefault();
      // Manche Browser melden das Rad in Zeilen statt in Pixeln.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const kasten = el.getBoundingClientRect();
      zoomSetzen(
        zoomRef.current * Math.exp(-delta * 0.0015),
        e.clientX - kasten.left,
        e.clientY - kasten.top,
      );
    };
    el.addEventListener("wheel", beiRad, { passive: false });
    return () => el.removeEventListener("wheel", beiRad);
  }, [zoomSetzen]);

  // ── Anfangsansicht: gesamte Struktur ins Sichtfeld ruecken ──────────────
  //
  // Beim Oeffnen steht der Zoom auf 100 %. Bei einem breiten oder tiefen Baum
  // ist damit nur ein Ausschnitt zu sehen, und die Darstellung wirkt
  // verzerrt. Einmalig wird deshalb ein Zoom berechnet, der die ganze
  // Struktur in den Rollbereich passt, und die Ansicht darauf zentriert.
  // Danach kann der Nutzer wie gewohnt zoomen und verschieben; dieser
  // Schritt greift nur beim ersten Aufbau des jeweiligen Baums. Wechselt
  // "Struktur von" oder laden die Daten nach, wird die Komponente neu
  // gemountet (key am Baum-Kasten) und die Anpassung läuft erneut.
  const anfangsAngepasstRef = useRef(false);
  useLayoutEffect(() => {
    if (anfangsAngepasstRef.current) return;
    const el = rollbereichRef.current;
    if (!el) return;
    const { breite, hoehe } = inhaltMass;
    if (breite <= 0 || hoehe <= 0) return;
    const sichtW = el.clientWidth;
    const sichtH = el.clientHeight;
    if (sichtW <= 0 || sichtH <= 0) return;
    anfangsAngepasstRef.current = true;
    // Etwas Luft zum Rand, damit die aeusseren Karten nicht am Rahmen kleben.
    const POLSTER = 64;
    const passZoom = Math.min(
      (sichtW - POLSTER) / breite,
      (sichtH - POLSTER) / hoehe,
      1,
    );
    const ziel = zoomBegrenzen(passZoom);
    zoomRef.current = ziel;
    setZoom(ziel);
    // Nach dem Rendern zentrieren: der gezoomte Inhalt soll mittig sitzen.
    requestAnimationFrame(() => {
      const el2 = rollbereichRef.current;
      if (!el2) return;
      const inhaltW = breite * ziel;
      const inhaltH = hoehe * ziel;
      el2.scrollLeft = Math.max(0, (inhaltW - el2.clientWidth) / 2);
      el2.scrollTop = Math.max(0, (inhaltH - el2.clientHeight) / 2);
    });
  }, [inhaltMass.breite, inhaltMass.hoehe]);

  // ── Verschieben mit gedrueckter Maustaste ───────────────────────────────
  //
  // Bewusst ueber `pointer`-Ereignisse statt ueber Mausereignisse: damit sind
  // Maus, Trackpad und Stift mit demselben Code abgedeckt. Verschoben wird
  // nicht der Inhalt, sondern der Rollbereich selbst, also `scrollLeft` und
  // `scrollTop`. So bleiben Zoom, Bildlaufleisten und Tastaturbedienung
  // unveraendert, und es gibt keinen zweiten Versatz, der mit dem Zoom
  // verrechnet werden muesste.
  //
  // Verschoben wird nur mit einem echten Zeigergeraet, also Maus oder
  // Trackpad. Finger und Stift rollen den Bereich ohnehin schon von sich aus;
  // wuerde hier zusaetzlich verschoben, liefe der Baum bei jedem Wischen
  // doppelt so weit.
  const [zieht, setZieht] = useState(false);
  const panRef = useRef<{
    zeigerId: number;
    startX: number;
    startY: number;
    rollLinks: number;
    rollOben: number;
    bewegt: boolean;
  } | null>(null);
  // Merkt sich, dass gerade gezogen wurde. Der Browser schickt nach dem
  // Loslassen trotzdem noch einen Klick; ohne dieses Kennzeichen wuerde jedes
  // Verschieben, das zufaellig auf einer Karte endet, einen Ast auf- oder
  // zuklappen.
  const gezogenRef = useRef(false);

  /** Ab dieser Strecke in Pixeln gilt eine Zeigerbewegung als Ziehen. */
  const ZIEH_SCHWELLE = 4;

  const beiZeigerStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = rollbereichRef.current;
    if (!el) return;
    gezogenRef.current = false;
    panRef.current = {
      zeigerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rollLinks: el.scrollLeft,
      rollOben: el.scrollTop,
      bewegt: false,
    };
  };

  const beiZeigerBewegung = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const el = rollbereichRef.current;
    if (!pan || !el || pan.zeigerId !== e.pointerId) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.bewegt) {
      // Unterhalb der Schwelle bleibt es ein Klick. Ohne diese Schwelle wuerde
      // schon das winzige Wackeln beim Klicken als Ziehen gelten.
      if (Math.abs(dx) < ZIEH_SCHWELLE && Math.abs(dy) < ZIEH_SCHWELLE) return;
      pan.bewegt = true;
      gezogenRef.current = true;
      setZieht(true);
      // Ab jetzt gehen alle Zeigerereignisse an den Rollbereich, auch wenn die
      // Maus ueber eine Karte oder aus dem Kasten heraus wandert.
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* nicht kritisch */ }
    }
    el.scrollLeft = pan.rollLinks - dx;
    el.scrollTop = pan.rollOben - dy;
  };

  const beiZeigerEnde = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.zeigerId !== e.pointerId) return;
    panRef.current = null;
    setZieht(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {ohneTeamleiter > 0 && (
        <Alert className="shrink-0">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {ohneTeamleiter === 1
              ? "1 Person hat keinen Teamleiter im Profil"
              : `${ohneTeamleiter} Personen haben keinen Teamleiter im Profil`}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Sie {ohneTeamleiter === 1 ? "hängt" : "hängen"} deshalb hier oben direkt unter der obersten
            Karte und {ohneTeamleiter === 1 ? "ist" : "sind"} mit „Ohne Teamleiter“ gekennzeichnet. Das
            ist keine gewollte Struktur. Der Teamleiter wird im Profil der jeweiligen Person gepflegt,
            danach rückt sie im Baum an die richtige Stelle.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <div className="mr-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Ansicht verkleinern"
            title="Ansicht verkleinern"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => zoomSetzen(zoomRef.current - ZOOM_SCHRITT)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span
            role="status"
            aria-live="polite"
            aria-label={`Ansicht ${Math.round(zoom * 100)} Prozent`}
            className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground"
          >
            {Math.round(zoom * 100)} %
          </span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Ansicht vergrößern"
            title="Ansicht vergrößern"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => zoomSetzen(zoomRef.current + ZOOM_SCHRITT)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Ansicht auf 100 Prozent zurücksetzen"
            title="Ansicht auf 100 Prozent zurücksetzen"
            onClick={() => zoomSetzen(1)}
          >
            100 %
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOffeneIds(alleAufklappbaren(wurzel))}>
          Alles aufklappen
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOffeneIds(new Set())}>
          Alles zuklappen
        </Button>
      </div>
      <div
        ref={rollbereichRef}
        onPointerDown={beiZeigerStart}
        onPointerMove={beiZeigerBewegung}
        onPointerUp={beiZeigerEnde}
        onPointerCancel={beiZeigerEnde}
        onClickCapture={(e) => {
          // Der Klick nach einem Ziehen wird hier abgefangen, bevor er eine
          // Karte oder den Profilknopf erreicht.
          if (!gezogenRef.current) return;
          gezogenRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain pb-3 pt-1 ${
          zieht ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        <div className="flex w-max min-w-full justify-center">
          <div
            className="shrink-0"
            style={
              inhaltMass.breite > 0
                ? { width: inhaltMass.breite * zoom, height: inhaltMass.hoehe * zoom }
                : undefined
            }
          >
            <div
              ref={inhaltRef}
              className="w-max"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
              {festeEbenen ? (
                <FesteEbenen
                  wurzel={wurzel}
                  ebenen={festeEbenen}
                  offeneIds={offeneIds}
                  onUmschalten={umschalten}
                  onOeffnen={onOeffnen}
                />
              ) : (
                <OrgKnoten
                  knoten={wurzel}
                  betont
                  offeneIds={offeneIds}
                  onUmschalten={umschalten}
                  onOeffnen={onOeffnen}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="shrink-0 text-center text-[11px] text-muted-foreground">
        Mit gedrückter Maustaste auf freier Fläche verschieben, mit dem Mausrad zoomen. Der Kasten
        selbst bleibt dabei stehen.
      </p>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
        {statusReihenfolge
          .filter(s => statusImBaum.has(s))
          .map(s => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusPunkte[s].punkt}`} aria-hidden="true" />
              {statusPunkte[s].text}
            </span>
          ))}
      </div>
    </div>
  );
}

export default function Teampartner() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const [view, setView] = useState<"struktur" | "liste">("liste");
  const [search, setSearch] = useState("");
  const [rolleFilter, setRolleFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [strukturVon, setStrukturVon] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Highlight des Anlegen-Buttons für 3 s nach Schnellzugriff vom Dashboard.
  const [tpSearchParams, setTpSearchParams] = useSearchParams();
  const [highlightAnlegen, setHighlightAnlegen] = useState(false);
  useEffect(() => {
    if (tpSearchParams.get("highlight") === "anlegen") {
      setHighlightAnlegen(true);
      setTpSearchParams({}, { replace: true });
      const t = setTimeout(() => setHighlightAnlegen(false), 3000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Live data from DB
  const [nutzerList, setNutzerList] = useState<TeamMitglied[]>([]);
  const [tippgeberList, setTippgeberList] = useState<TeamMitglied[]>([]);
  const [userSettings, setUserSettings] = useState<any[]>([]);
  // Live-Version: bei Änderungen an user_settings (Teamleiter-Zuweisung)
  // soll der Strukturbaum sich sofort aktualisieren.
  const settingsVersion = useLiveVersion(["user_settings", "profiles", "user_roles"]);

  const loadTippgeber = async () => {
    const { data } = await (supabase as any).from("tippgeber").select("*").order("erstellt_am", { ascending: false });
    const mapped: TeamMitglied[] = (data || []).map((t: any) => ({
      id: t.id,
      vorname: t.vorname,
      nachname: t.nachname,
      imonduId: "",
      rolle: "Tippgeber",
      rolleColor: "bg-gray-400 text-white",
      email: t.email || "",
      telefon: t.telefon || "",
      status: (t.status || "aktiv") as any,
      istTippgeber: true,
      zugeordnet: t.zugeordnet_name || "",
      zugeordnetId: t.zugeordnet_id || "",
      provisionstyp: t.provisionstyp || "euro",
      provisionswert: t.provisionswert || "",
      portalAktiv: !!t.portal_aktiv,
      strasse: t.strasse,
      hausnummer: t.hausnummer,
      plz: t.plz,
      ort: t.ort,
      land: t.land,
      notizen: t.notizen,
    }));

    // Zusätzlich: Kunden mit aktivem Empfehlungsprogramm als virtuelle Tippgeber anzeigen
    try {
      const { data: progRows } = await supabase
        .from("empfehlungsprogramme")
        .select("id, name, aktiv, meta, erstellt_am")
        .eq("aktiv", true);

      if (progRows && progRows.length > 0) {
        const kontaktIds = Array.from(new Set(
          progRows.map((p: any) => p.meta?.kontaktId).filter(Boolean)
        ));

        if (kontaktIds.length > 0) {
          const { data: kontakte } = await supabase
            .from("kontakte")
            .select("id, vorname, nachname, email, telefon, berater, zustaendig_id, meta")
            .in("id", kontaktIds)
            .eq("geloescht", false);

          (kontakte || []).forEach((k: any) => {
            const moreId = k.meta?.moreId || k.meta?.kundenNr || "";
            mapped.push({
              id: `prog-${k.id}`,
              vorname: k.vorname || "",
              nachname: k.nachname || "",
              imonduId: moreId ? String(moreId) : "",
              rolle: "Tippgeber",
              rolleColor: "bg-gray-400 text-white",
              email: k.email || "",
              telefon: k.telefon || "",
              status: "aktiv" as const,
              istTippgeber: true,
              zugeordnet: k.berater || "",
              zugeordnetId: k.zustaendig_id || "",
              provisionstyp: "euro",
              provisionswert: "",
              notizen: `Kunde mit aktivem Empfehlungsprogramm · Kunden-ID ${moreId || k.id.slice(0, 8)}`,
            });
          });
        }
      }
    } catch (err) {
      console.error("Fehler beim Laden der Empfehlungsprogramm-Tippgeber:", err);
    }

    setTippgeberList(mapped);
  };

  useEffect(() => {
    const loadTeam = async () => {
      // select("*") statt fester Spaltenliste: rollen_variante darf fehlen,
      // solange die Migration nicht gelaufen ist, und die Abfrage soll dann
      // trotzdem funktionieren.
      //
      // Alle drei Tabellen werden geblaettert geladen, siehe `ladeAlleZeilen`.
      // Eine einzelne Abfrage haette ab der Obergrenze von Supabase still
      // abgeschnitten, und fehlende `user_settings` sehen im Baum genauso aus
      // wie ein nicht gepflegter Teamleiter.
      const [profiles, roles, settings, sessionsErgebnis] = await Promise.all([
        ladeAlleZeilen("profiles", "*"),
        ladeAlleZeilen("user_roles", "user_id, role"),
        ladeAlleZeilen("user_settings", "user_id, einstellungen"),
        supabase.rpc("get_user_login_summary" as any),
      ]);
      const sessions = sessionsErgebnis.data;

      if (profiles.length === 0 || roles.length === 0) return;
      setUserSettings(settings);

      // Status-Berechnung 1:1 wie in Nutzerverwaltung:
      // - "aktiv"      → aktuell online (Session aktiv & last_seen < 15 Min)
      // - "inaktiv"    → hat sich schon eingeloggt, ist aber nicht online
      // - "ausstehend" → Einladung noch nicht angenommen (nie eingeloggt)
      const hasEverLoggedIn = new Set<string>();
      const isOnlineMap = new Map<string, boolean>();
      for (const s of (sessions || []) as any[]) {
        if (!s?.user_id) continue;
        hasEverLoggedIn.add(s.user_id);
        if (s.aktiv) isOnlineMap.set(s.user_id, true);
      }

      // Build a map of user_id -> all roles
      const roleMultiMap = new Map<string, string[]>();
      roles.forEach(r => {
        const existing = roleMultiMap.get(r.user_id) || [];
        existing.push(r.role);
        roleMultiMap.set(r.user_id, existing);
      });

      // Role priority for primary display
      const ROLE_PRIORITY = ROLES.map(r => r.id);

      /*
       * Wer im Strukturbaum ueberhaupt vorkommen kann.
       *
       * Die Liste muss alle C-Level-Rollen enthalten (`C_LEVEL_ROLLEN` in
       * `src/lib/strukturBaum.ts`), sonst laedt die Seite eine Person gar nicht
       * erst, und sie fehlt still auf der zweiten Ebene. Genau das war bei `hr`,
       * `buchhaltung` und `finanzierungspartner` der Fall.
       *
       * Nebenwirkung, die gewollt ist: Dieselbe Liste speist auch die
       * Tabellenansicht der Seite. Dort stehen damit jetzt ebenfalls HR,
       * Buchhaltung und Finanzierungspartner.
       */
      const allowedRoles = [
        "inhaber", "admin", "vertriebsleiter", "vertriebspartner",
        "versicherungsexperte", "objektpartner", "hr", "buchhaltung",
        "finanzierungspartner",
      ];
      const mapped: TeamMitglied[] = profiles
        .map(p => {
          const userRoles = roleMultiMap.get(p.id) || ["kunde"];
          // Pick highest-priority role as primary
          const primaryRole = ROLE_PRIORITY.find(r => userRoles.includes(r)) || userRoles[0];
          // Defensiv gelesen: Spalte fehlt, solange die Migration nicht gelaufen ist.
          const rollenVariante = rollenVarianteVonProfil(p);
          const nameParts = (p.name || "").split(" ");
          const vorname = nameParts[0] || "";
          const nachname = nameParts.slice(1).join(" ") || "";
          const alleRollen = userRoles.map(r => ({
            label: rollenLabel(r, rollenVariante),
            color: rolleColorMap[r] || "bg-primary text-white",
          }));
          return {
            id: p.id,
            vorname,
            nachname,
            imonduId: p.more_id || "",
            rolle: rollenLabel(primaryRole, rollenVariante),
            rolleId: primaryRole,
            rollenVariante,
            rolleColor: rolleColorMap[primaryRole] || "bg-primary text-white",
            alleRollen,
            email: p.email || "",
            telefon: "",
            // Status spiegelt die Einladung wider (wie Nutzerverwaltung-Badge):
            //   "aktiv"      = Einladung angenommen (mind. 1× eingeloggt)
            //   "ausstehend" = Einladung noch offen
            status: (hasEverLoggedIn.has(p.id) ? "aktiv" : "ausstehend") as
              "aktiv" | "inaktiv" | "ausstehend",
            avatarUrl: p.avatar_url || undefined,
            _userRoles: userRoles,
          } as TeamMitglied & { _userRoles: string[] };
        })
        .filter(m => (m as any)._userRoles.some((r: string) => allowedRoles.includes(r)))
        .sort((a, b) => {
          // Inhaber zuerst, dann Admin, dann Rest
          const priority = (m: TeamMitglied & { _userRoles?: string[] }) => {
            const r = (m as any)._userRoles || [];
            if (r.includes("inhaber")) return 0;
            if (r.includes("admin")) return 1;
            return 2;
          };
          const diff = priority(a) - priority(b);
          if (diff !== 0) return diff;
          return (a.nachname || "").localeCompare(b.nachname || "");
        });

      setNutzerList(mapped);
    };

    loadTeam();
    loadTippgeber();
  }, [settingsVersion]);

  // Form state
  const [formVorname, setFormVorname] = useState("");
  const [formNachname, setFormNachname] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTelefon, setFormTelefon] = useState("");
  const [formStrasse, setFormStrasse] = useState("");
  const [formHausnummer, setFormHausnummer] = useState("");
  const [formPlz, setFormPlz] = useState("");
  const [formOrt, setFormOrt] = useState("");
  const [formLand, setFormLand] = useState("Deutschland");
  
  const [formProvisionstyp, setFormProvisionstyp] = useState("euro");
  const [formProvisionswert, setFormProvisionswert] = useState("");
  const [formNotizen, setFormNotizen] = useState("");
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formPortalAktiv, setFormPortalAktiv] = useState(true);
  const [savingTippgeber, setSavingTippgeber] = useState(false);

  const canEdit = ["admin", "inhaber"].includes(user.role);
  const isVP = user.role === "vertriebspartner";

  // VP sieht sich selbst + alle untergeordneten Teampartner (rekursiv über teamleader_id).
  const ownUserId = authUser?.id || (() => {
    const treffer = nutzerList.filter(n => `${n.vorname} ${n.nachname}`.trim() === user.name);
    return treffer.length === 1 ? treffer[0].id : undefined;
  })();
  const downlineIds = (() => {
    if (!isVP || !ownUserId) return null;
    const teamleaderMap = new Map<string, string>();
    (userSettings || []).forEach((s: any) => {
      const tlId = s.einstellungen?.teamleader_id;
      if (tlId) teamleaderMap.set(s.user_id, tlId);
    });
    const ids = new Set<string>([ownUserId]);
    let changed = true;
    while (changed) {
      changed = false;
      nutzerList.forEach(n => {
        const tl = teamleaderMap.get(n.id);
        if (tl && ids.has(tl) && !ids.has(n.id)) {
          ids.add(n.id);
          changed = true;
        }
      });
    }
    return ids;
  })();

  const visibleNutzer = downlineIds
    ? nutzerList.filter(n => downlineIds.has(n.id))
    : nutzerList;

  const visibleTippgeber = downlineIds
    ? tippgeberList.filter(t => t.zugeordnetId && downlineIds.has(t.zugeordnetId))
    : tippgeberList;

  const allMembers = [...visibleNutzer, ...visibleTippgeber];
  // Deduplicate by id
  const uniqueMembers = allMembers.filter((m, i, arr) => arr.findIndex(a => a.id === m.id) === i);

  const filteredMembers = uniqueMembers.filter((n) => {
    const q = search.toLowerCase();
    const matchSearch = !q || n.vorname.toLowerCase().includes(q) || n.nachname.toLowerCase().includes(q) || n.email.toLowerCase().includes(q) || n.imonduId.toLowerCase().includes(q);
    // Nach Rollen-KENNUNG filtern, nicht nach Anzeigename: Der Filter
    // "Vertriebspartner" soll auch Lead-Berater zeigen. "Lead-Berater" ist ein
    // eigener Zusatzfilter auf die Anzeige-Variante. Tippgeber haben keine
    // rolleId und werden weiter ueber ihr Label gefunden.
    const matchRolle =
      rolleFilter === "alle" ||
      (rolleFilter === LEAD_BERATER_LABEL
        ? n.rolleId === "vertriebspartner" && n.rollenVariante === ROLLEN_VARIANTE_LEAD_BERATER
        : n.rolleId
          ? ROLES.find((r) => r.label === rolleFilter)?.id === n.rolleId
          : n.rolle === rolleFilter);
    const matchStatus = statusFilter === "alle" || n.status === statusFilter;
    return matchSearch && matchRolle && matchStatus;
  });

  // Custom sort: Gianluca first, then Julios Shoreij & Christian Peetz, then rest
  const hierarchySort = (a: TeamMitglied, b: TeamMitglied) => {
    const fullA = `${a.vorname} ${a.nachname}`.toLowerCase();
    const fullB = `${b.vorname} ${b.nachname}`.toLowerCase();
    const getPriority = (name: string) => {
      if (name.startsWith("gianluca")) return 0;
      if (name.startsWith("julios") || name.startsWith("christian peetz")) return 1;
      return 2;
    };
    const pA = getPriority(fullA);
    const pB = getPriority(fullB);
    if (pA !== pB) return pA - pB;
    return fullA.localeCompare(fullB, "de");
  };

  const displayedNutzer = filteredMembers.filter(m => !m.istTippgeber).sort(hierarchySort);
  const displayedTippgeber = filteredMembers.filter(m => m.istTippgeber);

  const handleClickPartner = (id: string) => {
    navigate(`/teampartner/${id}`);
  };

  const resetForm = () => {
    setFormVorname(""); setFormNachname(""); setFormEmail(""); setFormTelefon("");
    setFormStrasse(""); setFormHausnummer(""); setFormPlz(""); setFormOrt("");
    setFormLand("Deutschland"); setFormProvisionstyp("euro");
    setFormProvisionswert(""); setFormNotizen(""); setFormSubmitted(false);
    setFormPortalAktiv(true);
  };

  // Auswahlliste fuer "Struktur von".
  // Gefiltert wird ueber die technischen Rollen aus `user_roles`, nicht ueber
  // die Anzeigenamen. `some` sorgt dafuer, dass jemand mit mehreren Rollen nur
  // einmal in der Liste steht.
  // Sortiert wird nach der hoechsten Rolle in der Reihenfolge aus `ROLES`,
  // danach nach Nachname und Vorname.
  const filterablePartners = useMemo(() => {
    const rollenRang = (n: TeamMitglied) => {
      const raenge = (n._userRoles || [])
        .map(r => ROLES.findIndex(rolle => rolle.id === r))
        .filter(i => i >= 0);
      return raenge.length > 0 ? Math.min(...raenge) : ROLES.length;
    };
    return nutzerList
      .filter(n => (n._userRoles || []).some(r => STRUKTUR_FILTER_ROLLEN.includes(r)))
      .sort((a, b) => {
        const diff = rollenRang(a) - rollenRang(b);
        if (diff !== 0) return diff;
        const nach = (a.nachname || "").localeCompare(b.nachname || "", "de");
        if (nach !== 0) return nach;
        return (a.vorname || "").localeCompare(b.vorname || "", "de");
      });
  }, [nutzerList]);

  // For VP, restrict tree to own structure
  // Die eigene Kennung zuerst; der Name nur, wenn sie fehlt und er eindeutig ist.
  const treeRootId = isVP ? ownUserId || "all" : strukturVon;

  // Baum einmal je Datenstand berechnen, damit unten auch der Hinweis auf eine
  // Person ohne Untergebene auf dieselbe Berechnung zugreifen kann.
  const strukturBaum = useMemo(
    () => buildTree(nutzerList, tippgeberList, treeRootId, userSettings),
    [nutzerList, tippgeberList, treeRootId, userSettings],
  );
  const baumOhneKinder = nutzerList.length > 0 && !(strukturBaum.children && strukturBaum.children.length > 0);

  /*
   * Die festen, beschrifteten Ebenen gibt es nur im vollen Baum. Ist unter
   * "Struktur von" eine einzelne Person gewaehlt, zeigt der Baum deren
   * Teilbaum: dort gibt es weder eine C-Level- noch eine Partnerebene, und die
   * Schilder waeren schlicht falsch. Dann bleibt es beim reinen Baum.
   *
   * `buildTree` liefert C-Level, Teams des Inhabers, Personen ohne Teamleiter
   * und Tippgeber der Spitze als **eine** Reihe direkter Kinder. Geteilt wird
   * erst hier, die Baumlogik bleibt unberuehrt. Die Schilder haengen dabei
   * allein an der Rolle, nicht daran, ob ein Teamleiter gepflegt ist: eine
   * Ebene aus lauter Personen ohne Teamleiter ist trotzdem die Partnerebene.
   */
  const festeEbenen = useMemo<FesteEbenenAufteilung | undefined>(() => {
    if (treeRootId !== "all") return undefined;
    const kinder = strukturBaum.children || [];
    return {
      cLevel: kinder.filter(k => istCLevel(k)),
      wurzelTippgeber: kinder.filter(k => !istCLevel(k) && k.istTippgeber),
      partner: kinder.filter(k => !istCLevel(k) && !k.istTippgeber),
    };
  }, [treeRootId, strukturBaum]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Teampartner"
            subtitle={`${nutzerList.length} Nutzer · ${visibleTippgeber.length} Tippgeber`}
          />
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              {/* Hauptaktion der Seite Teampartner, deshalb Marken-Orange. */}
              <Button variant="brand" className={highlightAnlegen ? "ring-2 ring-brand-orange ring-offset-2 ring-offset-background animate-pulse" : ""}>
                <UserPlus className="h-4 w-4 mr-2" /> Tippgeber anlegen
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-lg max-h-[90vh] overflow-y-auto md:left-[calc(50%+var(--app-sidebar-offset,0px)/2)]"
              overlayClassName="md:left-[var(--app-sidebar-offset,0px)]"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" /> Tippgeber anlegen
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Kontaktdaten */}
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4" /> Kontaktdaten
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">Vorname <span className="text-destructive">*</span></Label>
                      <Input placeholder="Max" value={formVorname} onChange={e => setFormVorname(e.target.value)} className={formSubmitted && !formVorname.trim() ? "border-destructive ring-destructive" : ""} />
                      {formSubmitted && !formVorname.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">Nachname <span className="text-destructive">*</span></Label>
                      <Input placeholder="Mustermann" value={formNachname} onChange={e => setFormNachname(e.target.value)} className={formSubmitted && !formNachname.trim() ? "border-destructive ring-destructive" : ""} />
                      {formSubmitted && !formNachname.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">E-Mail <span className="text-destructive">*</span></Label>
                      <Input type="email" placeholder="email@beispiel.de" value={formEmail} onChange={e => setFormEmail(e.target.value)} className={formSubmitted && !formEmail.trim() ? "border-destructive ring-destructive" : ""} />
                      {formSubmitted && !formEmail.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">Telefon <span className="text-destructive">*</span></Label>
                      <PhoneInput value={formTelefon} onChange={v => setFormTelefon(v)} className={formSubmitted && !formTelefon.trim() ? "border-destructive ring-destructive" : ""} />
                      {formSubmitted && !formTelefon.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                    </div>
                  </div>
                </div>

                {/* Adresse */}
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4" /> Adresse
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label>Straße</Label><Input placeholder="Musterstraße" value={formStrasse} onChange={e => setFormStrasse(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Hausnummer</Label><Input placeholder="1" value={formHausnummer} onChange={e => setFormHausnummer(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="space-y-1.5"><Label>PLZ</Label><Input placeholder="10115" value={formPlz} onChange={e => setFormPlz(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Ort</Label><Input placeholder="Berlin" value={formOrt} onChange={e => setFormOrt(e.target.value)} /></div>
                  </div>
                  <div className="mt-3 w-1/2 space-y-1.5">
                    <Label>Land</Label>
                    <Select value={formLand} onValueChange={setFormLand}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Deutschland">🇩🇪 Deutschland</SelectItem>
                        <SelectItem value="Österreich">🇦🇹 Österreich</SelectItem>
                        <SelectItem value="Schweiz">🇨🇭 Schweiz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Zuordnung & Provision */}
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    💼 Zuordnung & Tippgeberprovision
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <Label className="text-muted-foreground text-xs">Zugeordnet an</Label>
                    <p className="font-medium mt-1">{user.name}</p>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label className="flex items-center gap-1">Provisionsmodell <span className="text-destructive">*</span></Label>
                    <Select value={formProvisionstyp} onValueChange={setFormProvisionstyp}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="euro">Festbetrag pro Abschluss (€)</SelectItem>
                        <SelectItem value="prozent">Prozentuale Tippgeberprovision (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label className="flex items-center gap-1">{formProvisionstyp === "euro" ? "Betrag pro Abschluss (€)" : "Provision pro Abschluss (%)"} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder={formProvisionstyp === "euro" ? "z.B. 500" : "z.B. 3"}
                        value={formProvisionswert}
                        onChange={e => setFormProvisionswert(e.target.value)}
                        className={formSubmitted && !formProvisionswert.trim() ? "border-destructive ring-destructive" : ""}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {formProvisionstyp === "euro" ? "€" : "%"}
                      </span>
                    </div>
                    {formSubmitted && !formProvisionswert.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                  </div>
                </div>

                {/* Notizen */}
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    📝 Notizen
                  </h3>
                  <Textarea
                    placeholder="Interne Notizen zur Zusammenarbeit, besondere Vereinbarungen..."
                    value={formNotizen}
                    onChange={e => setFormNotizen(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Portal-Zugang */}
                <div className="rounded-lg border p-3 space-y-3">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="h-4 w-4" /> Portal-Zugang wird automatisch eingerichtet
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Der Tippgeber erhält eine Einladung per E-Mail und kann sich in sein eigenes Portal einloggen, um neue Kontakte zu vermitteln und den Status seiner Empfehlungen zu sehen.
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Abbrechen</Button>
                  <Button
                    disabled={savingTippgeber}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={async () => {
                    setFormSubmitted(true);
                    if (!formVorname.trim() || !formNachname.trim() || !formEmail.trim() || !formTelefon.trim() || !formProvisionswert.trim()) {
                      toast.error("Bitte alle Pflichtfelder ausfüllen.");
                      return;
                    }
                    setSavingTippgeber(true);
                    const { data: insertedRow, error } = await (supabase as any).from("tippgeber").insert({
                      vorname: formVorname.trim(),
                      nachname: formNachname.trim(),
                      email: formEmail.trim(),
                      telefon: formTelefon.trim() || null,
                      strasse: formStrasse.trim() || null,
                      hausnummer: formHausnummer.trim() || null,
                      plz: formPlz.trim() || null,
                      ort: formOrt.trim() || null,
                      land: formLand,
                      zugeordnet_id: authUser?.id || null,
                      zugeordnet_name: user.name,
                      provisionstyp: formProvisionstyp,
                      provisionswert: formProvisionswert.trim(),
                      notizen: formNotizen.trim() || null,
                      benutzer_id: null,
                    }).select("id").single();
                    if (error) {
                      toast.error("Fehler beim Speichern: " + error.message);
                      setSavingTippgeber(false);
                      return;
                    }

                    // UI sofort schließen — Einladung & Reload laufen im Hintergrund
                    const invitePayload = formPortalAktiv ? {
                      email: formEmail.trim(),
                      name: `${formVorname.trim()} ${formNachname.trim()}`.trim(),
                      role: "tippgeber" as const,
                      vorname: formVorname.trim(),
                      nachname: formNachname.trim(),
                      telefon: formTelefon.trim() || undefined,
                      tippgeberId: insertedRow?.id,
                    } : null;

                    toast.success(formPortalAktiv
                      ? "Tippgeber angelegt – Einladung wird versendet…"
                      : "Tippgeber erfolgreich angelegt!");
                    setDialogOpen(false);
                    resetForm();
                    setSavingTippgeber(false);
                    loadTippgeber();

                    if (invitePayload) {
                      supabase.functions.invoke("invite-user", { body: invitePayload })
                        .then(async ({ error: invErr }) => {
                          if (invErr) {
                            const grund = await edgeFehlerMitGrund(invErr, { functionName: "invite-user" }) as Error;
                            toast.error("Einladung fehlgeschlagen: " + (grund?.message || String(grund)));
                          } else {
                            toast.success("Einladung an " + invitePayload.email + " verschickt.");
                          }
                        })
                        .catch((e: any) => {
                          toast.error("Einladung fehlgeschlagen: " + (e?.message || String(e)));
                        });
                    }
                  }}>
                    <Users className="h-4 w-4 mr-2" /> Tippgeber anlegen
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant={view === "struktur" ? "default" : "outline"} onClick={() => setView("struktur")}>
            <GitBranch className="h-4 w-4 mr-1" /> Strukturbaum
          </Button>
          <Button size="sm" variant={view === "liste" ? "default" : "outline"} onClick={() => setView("liste")}>
            <List className="h-4 w-4 mr-1" /> Listenansicht
          </Button>
        </div>

        {view === "liste" ? (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Suche nach Name, E-Mail oder ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={rolleFilter} onValueChange={setRolleFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Alle Rollen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Rollen</SelectItem>
                  {ROLES.flatMap((r) => [
                    <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>,
                    // Zusatzfilter direkt unter Vertriebspartner: nur die Anzeige-Variante.
                    ...(r.id === "vertriebspartner"
                      ? [<SelectItem key="lead-berater" value={LEAD_BERATER_LABEL}>{LEAD_BERATER_LABEL}</SelectItem>]
                      : []),
                  ])}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Alle Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="ausstehend">Ausstehend</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Nutzer Table */}
            <div data-ui="card" className="bg-card border rounded-lg">
              <div className="px-4 py-3 border-b">
                <h3 className="font-semibold text-sm">Nutzer ({displayedNutzer.length})</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nutzer</TableHead>
                    <TableHead>IMONDU-ID</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Teamleiter</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedNutzer.length > 0 ? displayedNutzer.map((n) => {
                    /*
                      Bewusst dieselbe Quelle wie der Strukturbaum: die frisch
                      und vollstaendig geladenen `userSettings`. Vorher las die
                      Spalte aus `cacheGet("user_settings")`. Der Cache holt
                      die Tabelle in einer einzigen Abfrage, wird also von
                      derselben Obergrenze abgeschnitten wie frueher der Baum.
                      Zwei Quellen fuer dieselbe Frage heisst: Tabelle und Baum
                      koennen Verschiedenes behaupten, und wer die Luecke sucht,
                      sucht an der falschen Stelle.
                    */
                    const tlId = userSettings.find((s: any) => s.user_id === n.id)
                      ?.einstellungen?.teamleader_id || null;
                    const tlProfile = tlId
                      ? nutzerList.find(p => p.id === tlId) || cacheGet<any>("profiles").find((p: any) => p.id === tlId)
                      : null;
                    const tlName = tlProfile
                      ? (tlProfile as any).name || `${tlProfile.vorname || ""} ${tlProfile.nachname || ""}`.trim()
                      : "";
                    return (
                    <TableRow key={n.id} className="cursor-pointer hover:bg-accent" onClick={() => handleClickPartner(n.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {n.avatarUrl && <AvatarImage src={n.avatarUrl} alt={`${n.vorname} ${n.nachname}`} />}
                            <AvatarFallback className={`${getAvatarColor(n.rolleId || n.rolle)} text-white text-xs`}>
                              {getInitials(n.vorname, n.nachname)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{n.vorname} {n.nachname}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{n.imonduId}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {n.alleRollen && n.alleRollen.length > 1 ? (
                            n.alleRollen.map((r, i) => (
                              <Badge key={i} className={`${r.color} text-[10px] px-1.5 py-0`} variant="secondary">{r.label}</Badge>
                            ))
                          ) : (
                            <Badge className={n.rolleColor} variant="secondary">{n.rolle}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {tlName ? (
                          <div className="flex items-center gap-1.5">
                            <GitBranch className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">{tlName}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">–</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{n.email}</TableCell>
                      <TableCell className="text-sm">{n.telefon}</TableCell>
                      <TableCell><Badge className={statusColors[n.status]} variant="secondary">{n.status === "aktiv" ? "Aktiv" : n.status === "ausstehend" ? "Ausstehend" : "Inaktiv"}</Badge></TableCell>
                    </TableRow>);
                  }
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Nutzer gefunden</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Tippgeber Table */}
            {(() => {
              const hideTippgeberByDefault = ["inhaber", "admin", "vertriebsleiter"].includes(user.role);
              if (hideTippgeberByDefault && rolleFilter !== "Tippgeber") return null;
              return (
            <div data-ui="card" className="bg-card border rounded-lg">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Tippgeber ({displayedTippgeber.length})</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Tippgeber</TableHead>
                    <TableHead>Zugeordnet</TableHead>
                    <TableHead>Provision</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Portal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedTippgeber.length > 0 ? displayedTippgeber.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-accent" onClick={() => handleClickPartner(t.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {t.avatarUrl && <AvatarImage src={t.avatarUrl} alt={`${t.vorname} ${t.nachname}`} />}
                            <AvatarFallback className="bg-gray-400 text-white text-xs">
                              {getInitials(t.vorname, t.nachname)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{t.vorname} {t.nachname}</span>
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-sm">{t.zugeordnet}</TableCell>
                      <TableCell>
                        <div className="text-xs bg-muted rounded px-2 py-1 text-center font-medium">
                          {t.provisionstyp === "euro" ? `${t.provisionswert} € / Abschluss` : `${t.provisionswert} % / Abschluss`}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{t.email}</TableCell>
                      <TableCell className="text-sm">{t.telefon}</TableCell>
                      <TableCell>
                        {t.portalAktiv ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px]">
                            <ShieldCheck className="h-3 w-3 mr-1" /> Login aktiv
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!t.email) {
                                toast.error("Tippgeber hat keine E-Mail – bitte zuerst hinterlegen.");
                                return;
                              }
                              try {
                                const { error } = await supabase.functions.invoke("invite-user", {
                                  body: {
                                    email: t.email,
                                    name: `${t.vorname} ${t.nachname}`.trim(),
                                    role: "tippgeber",
                                    vorname: t.vorname,
                                    nachname: t.nachname,
                                    telefon: t.telefon || undefined,
                                    tippgeberId: t.id,
                                  },
                                });
                                if (error) throw await edgeFehlerMitGrund(error, { functionName: "invite-user" });
                                toast.success("Einladung verschickt.");
                                loadTippgeber();
                              } catch (err: any) {
                                toast.error("Fehler: " + (err?.message || String(err)));
                              }
                            }}
                          >
                            <KeyRound className="h-3 w-3 mr-1" /> Portal-Zugang einrichten
                          </Button>
                        )}
                      </TableCell>
                      <TableCell><Badge className={statusColors[t.status]} variant="secondary">{t.status === "aktiv" ? "Aktiv" : "Inaktiv"}</Badge></TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Tippgeber löschen"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await confirmDialog({
                              title: `Tippgeber „${t.vorname} ${t.nachname}“ wirklich löschen?`,
                              description: "Der Eintrag wird aus der Tippgeberliste entfernt.",
                              confirmText: "Löschen",
                              cancelText: "Behalten",
                              variant: "destructive",
                            });
                            if (!ok) return;
                            const { error } = await (supabase as any).from("tippgeber").delete().eq("id", t.id);
                            if (error) { toast.error("Fehler: " + error.message); return; }
                            toast.success("Tippgeber gelöscht");
                            loadTippgeber();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Keine Tippgeber gefunden</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
              );
            })()}
          </div>
        ) : (
          /*
            Strukturbaum als Organigramm. Der Baum rollt in seinem eigenen
            Kasten, waagerecht wie senkrecht, und das Mausrad zoomt dort. Ein
            frueherer Anlauf hatte das Rad an den Zoom gehaengt, ohne dem Baum
            einen eigenen Rollbereich zu geben: senkrecht liess sich dann gar
            nichts mehr bewegen und ein neu aufgeklappter Ast unterhalb des
            Rands war nicht erreichbar. Deshalb gehoert beides zusammen.

            Der Kasten selbst steht fest.

            `h-[...]` statt einer Hoehe aus dem Inhalt: Vorher wuchs und schrumpfte
            der Kasten bei jedem Zoomschritt und bei jedem Auf- und Zuklappen mit,
            weil der Platzhalter im Rollbereich die gezoomte Groesse mitfuehrt.
            Der Rahmen "verzog" sich also nicht optisch, er wurde tatsaechlich
            groesser und kleiner. Jetzt haengt die Hoehe allein am Fenster.

            `md:sticky md:top-0` haelt den Kasten beim Scrollen der Seite im Blick.
            Bewusst `sticky` und nicht `fixed`: der Kasten bleibt Teil des
            Seitenaufbaus, Kopfzeile und Seitenleiste bleiben unberuehrt. Der
            Rollbereich der Seite ist das `main`-Element der Huelle, deshalb klebt
            der Kasten genau unter der Kopfzeile und nicht am Fensterrand.
            Auf schmalen Bildschirmen bleibt er normal in der Seite stehen, dort
            waere ein klebender Kasten mehr im Weg als hilfreich.

            Die Hoehe ist so gewaehlt, dass Kopfbereich, Ansichtsumschalter und
            der Kasten zusammen in den Sichtbereich passen. Waere der Kasten
            hoeher als das Fenster, bliebe seine Unterkante mit Legende beim
            Scrollen unerreichbar.
          */
          <div className="flex h-[calc(100vh-17rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border bg-card md:sticky md:top-0 md:z-10">
            {canEdit && (
              <div className="flex shrink-0 items-center gap-4 border-b p-4">
                <span className="text-sm text-muted-foreground">Struktur von:</span>
                <Select value={strukturVon} onValueChange={setStrukturVon}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Alle anzeigen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle anzeigen</SelectItem>
                    {filterablePartners.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.vorname} {p.nachname} ({p.rolle})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/*
              Der key haengt am gewaehlten Wurzelknoten. Wechselt "Struktur
              von", wird der Baum neu aufgebaut und offene Aeste der alten
              Struktur fallen weg, statt als leerer Rest stehen zu bleiben.
              Die Kennung der Wurzel steht mit im key, weil die Daten erst nach
              dem ersten Zeichnen eintreffen. Ohne sie haette das Organigramm
              seine Voreinstellung "Wurzel und C-Level offen" auf dem noch
              leeren Baum gebildet und alles bliebe zugeklappt.
            */}
            <div
              key={`${treeRootId}:${strukturBaum.id}`}
              className="flex min-h-0 flex-1 flex-col bg-muted/30 p-4 sm:p-6"
            >
              {baumOhneKinder ? (
                <div className="flex flex-col items-center">
                  <div className={KARTE_BREITE}>
                    <StrukturKarte
                      knoten={strukturBaum}
                      betont
                      onOeffnen={handleClickPartner}
                    />
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Dieser Person ist bisher niemand zugeordnet.
                  </p>
                </div>
              ) : (
                <StrukturOrganigramm
                  wurzel={strukturBaum}
                  festeEbenen={festeEbenen}
                  onOeffnen={handleClickPartner}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
