/**
 * Globale Suche über das ganze CRM.
 *
 * Der Anlass: Die häufigste Aufgabe im Alltag ist "diesen einen Kunden
 * öffnen", und die kostete bisher vier bis fünf Interaktionen. Sidebar
 * aufklappen, Alle Kontakte, Seite laden, Suchfeld, Zeile klicken. Am Telefon,
 * während der Kunde wartet.
 *
 * Jetzt: tippen, Enter. Erreichbar über das Feld in der Kopfleiste oder über
 * Strg+K beziehungsweise Cmd+K.
 *
 * Seit dem 28.09.2026 findet sie außer Kontakten und Objekten jede Seite, die
 * die Seitenleiste der aktiven Rolle zeigt, samt Reitern mit eigener Adresse
 * („Statistiken > Umsatz & Provisionen", „Einstellungen > Sicherheit").
 * Partner hatten gemeldet, dass sie sich im umfangreichen CRM schwer
 * zurechtfinden. Die Seiten kommen aus derselben Quelle wie die Leiste, siehe
 * `src/lib/sucheZiele.ts`, und werden lokal gerechnet, ohne Netz.
 *
 * Gesucht wird unscharf, "ott hns" findet also Otto Hans. Seiten verzeihen
 * zusätzlich Umlaute und einen kleinen Tippfehler.
 *
 * Alle Treffer werden gegen die aktive Rolle geprüft. Wer eine Seite nicht
 * öffnen darf, bekommt sie auch nicht als Vorschlag.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Users, Building2, FileText, Zap, Clock, X } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { objektbereichGesperrt } from "@/lib/sidebarNavigation";
import { getKontakte } from "@/lib/kundenStore";
import { getObjekte } from "@/lib/objekteStore";
import { zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { objektSichtbarFuer } from "@/lib/objektZugang";
import { SUCHE_AKTIONEN, seitenFuerSuche, seitenWert, trefferWert } from "@/lib/sucheZiele";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { tarnFreitext, tarnName } from "@/lib/vorfuehrmodus";
import { getUserSetting } from "@/lib/userSettingsCache";
import { handbuchPartnerFreigeschaltet } from "@/lib/handbuch/zugang";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useLiveVersion } from "@/hooks/useLiveData";

const ZULETZT_KEY = "mi_suche_zuletzt";
const MAX_JE_GRUPPE = 6;
const MAX_ZULETZT = 5;

type Icon = React.ComponentType<{ className?: string }>;

interface Treffer {
  id: string;
  titel: string;
  hinweis?: string;
  url: string;
  /** Eigenes Symbol, etwa das der Seitenleiste. Sonst das der Gruppe. */
  icon?: Icon;
}

interface Bewertet extends Treffer {
  wert: number;
}

/** Die zuletzt geöffneten Treffer liegen je Nutzer, nicht je Browser. */
function zuletztSchluessel(userId?: string): string {
  return userId ? `${ZULETZT_KEY}:${userId}` : ZULETZT_KEY;
}

/** Merkt sich die zuletzt geöffneten Treffer, damit die Suche auch leer nützt. */
function ladeZuletzt(schluessel: string): Treffer[] {
  try {
    const roh = localStorage.getItem(schluessel);
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? (liste as Treffer[]).slice(0, MAX_ZULETZT) : [];
  } catch {
    return [];
  }
}

function merkeZuletzt(schluessel: string, treffer: Treffer) {
  try {
    // Ohne Symbol: Eine Komponente laesst sich nicht speichern, sie wird
    // beim Anzeigen wieder aus der Seitenliste geholt.
    const eintrag = { id: treffer.id, titel: treffer.titel, hinweis: treffer.hinweis, url: treffer.url };
    const bisher = ladeZuletzt(schluessel).filter((t) => t.url !== treffer.url);
    localStorage.setItem(schluessel, JSON.stringify([eintrag, ...bisher].slice(0, MAX_ZULETZT)));
  } catch {
    // Voller oder gesperrter Speicher darf die Suche nicht blockieren.
  }
}

export function SuchFeld() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authUser } = useUser();
  const { darf: videocallFreigabe } = useVideocallFreigabe();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const [zuletzt, setZuletzt] = useState<Treffer[]>([]);
  const feldRef = useRef<HTMLInputElement>(null);
  const huelleRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const schluessel = zuletztSchluessel(authUser?.id);

  /*
   * Die Seiten, die die aktive Rolle öffnen darf. Individuelle Freigaben und
   * Karrierestufe liest die Seitenleiste aus `user_settings`, hier kommen sie
   * aus demselben Datensatz im Zwischenspeicher. Ändert sich einer davon,
   * rechnet die Liste neu.
   */
  useLiveVersion(["user_settings", "app_config"]);
  const customPermissions = getUserSetting<string[]>("custom_permissions", []) || [];
  const stufeRoh = getUserSetting<boolean>("karriere_gating_active", false)
    ? getUserSetting<string | null>("karriere_override", null)
    : null;
  const vpStufeId = typeof stufeRoh === "string" && stufeRoh.trim() ? stufeRoh.trim() : null;
  const handbuchFrei = handbuchPartnerFreigeschaltet();
  const rechteSchluessel = customPermissions.join("|");
  const seitenIndex = useMemo(
    () =>
      seitenFuerSuche({
        rolle: user.role,
        customPermissions,
        vpStufeId,
        identitaet: { email: authUser?.email, userId: authUser?.id },
        videocallFreigabe,
        handbuchFrei,
      }),
    // `customPermissions` ist bei jedem Aufruf ein neues Feld, verglichen
    // wird deshalb sein Inhalt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.role, rechteSchluessel, vpStufeId, authUser?.id, authUser?.email, videocallFreigabe, handbuchFrei],
  );
  const seiteZuUrl = useMemo(() => new Map(seitenIndex.map((z) => [z.url, z])), [seitenIndex]);

  useEffect(() => {
    if (offen) setZuletzt(ladeZuletzt(schluessel));
  }, [offen, schluessel]);

  /*
   * Besuchte Seiten merken, auch wenn sie über die Seitenleiste kamen. So
   * zeigt die leere Suche, wo man zuletzt war. Gemerkt wird nur, was in der
   * Seitenliste steht, also nie ein Kundenprofil über seine Adresse.
   */
  useEffect(() => {
    const ziel = seiteZuUrl.get(location.pathname + location.search) ?? seiteZuUrl.get(location.pathname);
    if (ziel) merkeZuletzt(schluessel, { id: `seite-${ziel.url}`, titel: ziel.titel, hinweis: ziel.gruppe, url: ziel.url });
  }, [location.pathname, location.search, seiteZuUrl, schluessel]);

  // Strg+K beziehungsweise Cmd+K setzt den Fokus ins Feld. Bewusst kein
  // Dialog: Ein Dialog legt eine Abdunklung ueber die Seite, und dabei
  // verschwindet die Sidebar aus dem Blick. Das soll nie passieren.
  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        feldRef.current?.focus();
        feldRef.current?.select();
        setOffen(true);
      }
    };
    document.addEventListener("keydown", aufTaste);
    return () => document.removeEventListener("keydown", aufTaste);
  }, []);

  // Klick ausserhalb schliesst die Liste, das Feld selbst bleibt stehen.
  useEffect(() => {
    if (!offen) return;
    const aufKlick = (e: MouseEvent) => {
      if (!huelleRef.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", aufKlick);
    return () => document.removeEventListener("mousedown", aufKlick);
  }, [offen]);

  // Kontakte, Objekte und Aktionen pruefen wie bisher. Die Seiten haben ihre
  // Pruefung schon in `seitenIndex`. Der Objektbereich folgt zusaetzlich dem
  // Eintrag „Objekte" der Seitenleiste, wie der Routenschutz in `AppShell`:
  // Damit fallen Objekttreffer, „Neues Objekt anlegen" und alte Objekte im
  // Verlauf zusammen weg.
  const darfOeffnen = useCallback(
    (url: string) =>
      isUrlAllowedForRole(url, user.role as any, (user as any).customPermissions, (user as any).vpStufeId) &&
      !objektbereichGesperrt(url, {
        rolle: user.role,
        customPermissions,
        vpStufeId,
        identitaet: { email: authUser?.email, userId: authUser?.id },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, rechteSchluessel, vpStufeId, authUser?.id, authUser?.email],
  );

  const schliessen = () => {
    setOffen(false);
    feldRef.current?.blur();
  };

  const oeffne = (treffer: Treffer) => {
    merkeZuletzt(schluessel, treffer);
    setOffen(false);
    setSuche("");
    feldRef.current?.blur();
    /*
     * Die Suche ist ein Sprung, kein Weg.
     *
     * Christian hat am 16.09.2026 gemeldet, dass der Zurueck-Knopf im
     * Kundenprofil ihn in die Pipeline bringt, wenn er ueber die Suche
     * gekommen ist. Das ist technisch richtig, denn der Knopf geht einen
     * Schritt in der Verlaufsgeschichte zurueck, und dort stand zufaellig die
     * Pipeline. Nur hat diese Seite mit dem Kunden nichts zu tun: Er haette
     * genauso in den Einstellungen sein koennen.
     *
     * Deshalb vermerkt die Suche ihren Sprung. Das Ziel wertet den Vermerk
     * aus und fuehrt dann in die vollstaendige Liste zurueck, statt in eine
     * zufaellige Vorgeschichte. Wer regulaer aus einer Liste kommt, traegt
     * den Vermerk nicht und landet unveraendert wieder dort, wo er war.
     */
    navigate(treffer.url, { state: { ausSuche: true } });
  };

  /* ── Seiten und Aktionen ── */
  const seiten = useMemo((): Bewertet[] => {
    if (!suche.trim()) return [];
    return seitenIndex
      .map((z) => ({ z, wert: seitenWert(suche, z.titel, z.begriffe) }))
      .filter((x) => x.wert > 0)
      .sort((a, b) => b.wert - a.wert)
      .slice(0, MAX_JE_GRUPPE)
      .map(({ z, wert }) => ({ id: `seite-${z.url}`, titel: z.titel, hinweis: z.gruppe, url: z.url, icon: z.icon, wert }));
  }, [suche, seitenIndex]);

  const aktionen = useMemo((): Bewertet[] => {
    if (!suche.trim()) return [];
    return SUCHE_AKTIONEN.filter((a) => darfOeffnen(a.url.split("?")[0]))
      .map((a) => ({ a, wert: seitenWert(suche, a.titel, a.begriffe) }))
      .filter((x) => x.wert > 0)
      .sort((a, b) => b.wert - a.wert)
      .slice(0, 3)
      .map(({ a, wert }) => ({ id: `aktion-${a.url}`, titel: a.titel, url: a.url, wert }));
  }, [suche, darfOeffnen]);

  /* ── Kontakte ── */
  const kontakte = useMemo((): Bewertet[] => {
    const s = suche.trim();
    if (s.length < 2 || !darfOeffnen("/alle-kontakte")) return [];
    let alle: ReturnType<typeof getKontakte> = [];
    try {
      alle = getKontakte();
    } catch {
      return [];
    }
    return alle
      .map((k) => {
        const name = `${k.vorname || ""} ${k.nachname || ""}`.trim();
        const wert = Math.max(
          trefferWert(s, name),
          trefferWert(s, k.email || "") * 0.9,
          trefferWert(s, (k.telefon || "").replace(/\s/g, "")) * 0.9,
          k.moreId ? trefferWert(s, `MI-${String(k.moreId).padStart(5, "0")}`) : 0,
        );
        return { k, name, wert };
      })
      .filter((x) => x.wert > 0 && x.name)
      .sort((a, b) => b.wert - a.wert)
      .slice(0, MAX_JE_GRUPPE)
      .map(({ k, name, wert }) => ({
        id: `kontakt-${k.id}`,
        // Gesucht wird weiter im echten Namen, angezeigt wird im
        // Vorfuehrmodus nur das Kuerzel.
        titel: tarnName(name),
        // Die Stufe steht dabei, damit man bei zwei gleichen Namen den
        // richtigen trifft, ohne beide zu oeffnen.
        hinweis: [PIPELINE_STUFEN.find((st) => st.key === k.pipelineStufe)?.label, tarnFreitext(k.ort, "Ort verborgen")].filter(Boolean).join(" · "),
        url: `/kunden/${k.id}`,
        wert,
      }));
  }, [suche, darfOeffnen]);

  /* ── Objekte ── */
  const objekte = useMemo((): Bewertet[] => {
    const s = suche.trim();
    if (s.length < 2 || !darfOeffnen("/objekte")) return [];
    let alle: ReturnType<typeof getObjekte> = [];
    try {
      alle = getObjekte();
    } catch {
      return [];
    }
    // Ausgeblendete und fremde Exklusivobjekte findet nur, wer Objekte pflegt (05.10.2026).
    const nutzer = { rolle: user.role, benutzerId: authUser?.id, name: user.name };
    return alle
      .filter((o) => objektSichtbarFuer(o, nutzer))
      .map((o) => {
        const adresse = [o.adresse, o.plz, o.ort].filter(Boolean).join(" ");
        const wert = Math.max(trefferWert(s, o.titel || ""), trefferWert(s, adresse) * 0.9);
        return { o, adresse, wert };
      })
      .filter((x) => x.wert > 0)
      .sort((a, b) => b.wert - a.wert)
      .slice(0, MAX_JE_GRUPPE)
      .map(({ o, adresse, wert }) => ({
        id: `objekt-${o.id}`,
        titel: o.titel || adresse || "Objekt",
        hinweis: adresse || undefined,
        url: zielRouteFuerObjekt(o),
        wert,
      }));
  }, [suche, darfOeffnen, user.role, user.name, authUser?.id]);

  /* ── Alles in einer Liste, damit die Pfeiltasten durchlaufen können ── */
  const gruppen = useMemo((): { name: string; icon: Icon; eintraege: Treffer[] }[] => {
    if (!suche.trim()) {
      // Was die Rolle heute nicht mehr darf, faellt auch aus dem Verlauf.
      // Seiten muessen in der aktuellen Seitenliste stehen, der Rest besteht
      // dieselbe Pruefung wie seine Treffer.
      const verlauf = zuletzt
        .filter((t) => (t.id.startsWith("seite-") ? seiteZuUrl.has(t.url) : darfOeffnen(t.url.split("?")[0])))
        .map((t) => ({ ...t, icon: seiteZuUrl.get(t.url)?.icon }));
      // Ohne Verlauf helfen die ersten Seiten der eigenen Leiste weiter.
      const wichtig: Treffer[] = verlauf.length
        ? []
        : seitenIndex.slice(0, MAX_JE_GRUPPE).map((z) => ({ id: `seite-${z.url}`, titel: z.titel, hinweis: z.gruppe, url: z.url, icon: z.icon }));
      const schnell: Treffer[] = SUCHE_AKTIONEN.filter((a) => darfOeffnen(a.url.split("?")[0])).map((a) => ({
        id: `aktion-${a.url}`,
        titel: a.titel,
        url: a.url,
      }));
      return [
        { name: "Zuletzt geöffnet", icon: Clock, eintraege: verlauf },
        { name: "Seiten", icon: FileText, eintraege: wichtig },
        { name: "Schnellzugriff", icon: Zap, eintraege: schnell },
      ].filter((g) => g.eintraege.length > 0);
    }
    /*
     * Die Gruppe mit dem besten Treffer steht oben, damit Enter ihn oeffnet.
     * „chat" soll den Chat finden und nicht eine Charlotte, die die
     * Buchstaben nur verstreut enthaelt. Bei Gleichstand bleibt die alte
     * Reihenfolge, Kontakte zuerst.
     */
    return [
      { name: "Kontakte", icon: Users, eintraege: kontakte },
      { name: "Objekte", icon: Building2, eintraege: objekte },
      { name: "Seiten", icon: FileText, eintraege: seiten },
      { name: "Aktionen", icon: Zap, eintraege: aktionen },
    ]
      .filter((g) => g.eintraege.length > 0)
      .sort((a, b) => Math.max(...b.eintraege.map((t) => t.wert)) - Math.max(...a.eintraege.map((t) => t.wert)));
  }, [suche, zuletzt, kontakte, objekte, seiten, aktionen, darfOeffnen, seitenIndex, seiteZuUrl]);

  const flach = useMemo(() => gruppen.flatMap((g) => g.eintraege), [gruppen]);

  useEffect(() => {
    setMarkiert(0);
  }, [suche]);

  // Der markierte Eintrag bleibt sichtbar, auch wenn die Liste scrollt.
  useEffect(() => {
    listeRef.current?.querySelector(`[data-nr="${markiert}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [markiert]);

  const aufTasteImFeld = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      schliessen();
      return;
    }
    if (!offen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarkiert((i) => (flach.length ? (i + 1) % flach.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarkiert((i) => (flach.length ? (i - 1 + flach.length) % flach.length : 0));
    } else if (e.key === "Enter") {
      const treffer = flach[markiert];
      if (treffer) {
        e.preventDefault();
        oeffne(treffer);
      }
    }
  };

  const nichtsGefunden = offen && suche.trim().length > 0 && flach.length === 0;
  const listeSichtbar = offen && (gruppen.length > 0 || nichtsGefunden);
  let laufnummer = -1;

  return (
    <div ref={huelleRef} className="relative w-full">
      <div className="flex w-full items-center gap-2 h-8 rounded-lg border border-border/60 bg-muted/40 px-2.5 focus-within:bg-background focus-within:border-primary/50 transition-colors sm:min-w-[264px]">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={feldRef}
          value={suche}
          onChange={(e) => {
            setSuche(e.target.value);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
          onKeyDown={aufTasteImFeld}
          placeholder="Seiten, Kontakte, Objekte …"
          aria-label="Globale Suche"
          role="combobox"
          aria-expanded={listeSichtbar}
          aria-controls="globale-suche-liste"
          aria-activedescendant={listeSichtbar && flach[markiert] ? `globale-suche-${markiert}` : undefined}
          aria-autocomplete="list"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
        />
        {!suche && (
          <kbd className="hidden md:inline text-[10px] font-medium text-muted-foreground/70 border border-border/60 rounded px-1 py-0.5">
            ⌘K
          </kbd>
        )}
      </div>

      {listeSichtbar && (
        /*
          Auf dem Schreibtisch beginnt die Trefferliste am linken Rand des
          Feldes, nicht am rechten. Seit das Feld ueber die freie Breite
          laeuft, waere ein rechtsbuendiges Fenster weit weg von der Stelle,
          an der man tippt. Breiter als 28rem wird sie trotzdem nicht: Eine
          Trefferzeile ueber die halbe Bildschirmbreite liest sich
          schlechter, nicht besser.

          Auf dem Handy geht das nicht ueber die Feldbreite. Christian hat am
          17.09.2026 gemeldet, dass die Liste nur ein Drittel des Schirms
          einnimmt und jeder Eintrag auf "Ot…" zusammenschnurrt. Der Grund:
          Das Feld haengt in der Kopfleiste in einem `flex-1 min-w-0`, und
          links und rechts davon stehen Knoepfe mit fester Breite. Bei 375
          Pixeln bleiben dem Feld gut 120 Pixel, und `w-full` gab genau diese
          120 Pixel an die Liste weiter.

          Deshalb loest sie sich unterhalb von `sm` aus der Feldbreite. Seit
          dem 28.09.2026 fuellt sie dort den ganzen Schirm unter der
          Kopfleiste, weil die Suche jetzt auch Seiten findet und die Liste
          laenger wird. Das Feld bleibt oben in der Leiste stehen, man tippt
          also weiter, waehrend die Treffer darunter wechseln. `top-20` ist die
          Hoehe der Kopfleiste. Wer die Leistenhoehe aendert, aendert diesen
          Wert und die `5rem` in der Hoehe mit. Ab `sm` bleibt alles beim
          Alten.

          Nebenbei: Die Kopfleiste traegt `backdrop-blur`, und das macht sie
          zum Bezugsrahmen fuer `fixed`. Gemessen wird also ab der Leiste und
          nicht ab dem Fenster. Deshalb steht unten kein `bottom-0`, das
          waere der untere Rand der Leiste; die Hoehe ist ausdruecklich
          gerechnet. Wer die Leiste einrueckt, muss diese Stelle nachmessen.
        */
        <div
          ref={listeRef}
          id="globale-suche-liste"
          role="listbox"
          aria-label="Suchtreffer"
          className="fixed inset-x-0 top-20 h-[calc(100dvh-5rem)] w-auto border-t border-border sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:h-auto sm:w-full sm:max-w-[28rem] sm:max-h-[70vh] sm:mt-1.5 sm:rounded-xl sm:border overflow-y-auto bg-popover shadow-lg z-[70] py-1.5"
        >
          <div className="flex justify-end px-3 pb-1 sm:hidden">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                schliessen();
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60"
            >
              <X className="h-4 w-4" />
              Schließen
            </button>
          </div>
          {nichtsGefunden && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Nichts gefunden. Versuch einen Namen, eine Adresse, eine Seite wie „Statistik“ oder ein Stichwort wie „Provision“.
            </p>
          )}
          {gruppen.map((gruppe) => (
            <div key={gruppe.name} role="presentation">
              <p role="presentation" className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {gruppe.name}
              </p>
              {gruppe.eintraege.map((t) => {
                laufnummer += 1;
                const aktiv = laufnummer === markiert;
                const nr = laufnummer;
                const Icon = t.icon ?? gruppe.icon;
                return (
                  <button
                    key={t.id}
                    id={`globale-suche-${nr}`}
                    data-nr={nr}
                    type="button"
                    role="option"
                    aria-selected={aktiv}
                    // Mit onMouseDown statt onClick, sonst verliert das Feld
                    // vorher den Fokus und die Liste ist schon zu.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      oeffne(t);
                    }}
                    onMouseEnter={() => setMarkiert(nr)}
                    // `py-2.5` auf dem Handy statt `py-2`: Damit ist die
                    // Zeile 40 Pixel hoch und laesst sich mit dem Daumen
                    // treffen, ohne den Nachbarn zu erwischen.
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-left text-sm transition-colors ${
                      aktiv ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate min-w-0">{t.titel}</span>
                    {t.hinweis && (
                      /*
                        Der Name ist das Wichtige, der Hinweis nur die
                        Einordnung. `shrink-0` hielt den Hinweis aber in
                        voller Laenge und liess den Namen zusammenfallen,
                        aus einem langen Namen wurde "Ch…" neben einem
                        vollstaendigen "Finanzierung". Unterhalb von `sm`
                        gibt der Hinweis deshalb zuerst nach.
                      */
                      <span className="ml-auto pl-2 text-xs text-muted-foreground truncate shrink sm:shrink-0 max-w-[45%]">
                        {t.hinweis}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
