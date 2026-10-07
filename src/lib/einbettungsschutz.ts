/**
 * Schutz gegen Einbetten in fremde Seiten (Clickjacking).
 *
 * Eine fremde Seite könnte das Portal unsichtbar in einen Rahmen legen und
 * den Nutzer dazu bringen, darin zu klicken, ohne es zu merken. Üblich ist
 * dagegen der HTTP-Header `X-Frame-Options` oder `frame-ancestors` in der
 * Content-Security-Policy. Beides geht hier nicht: Lovable sendet keine
 * eigenen Header (public/_headers wird nicht ausgewertet), und als meta-Tag
 * ignoriert der Browser beide. Deshalb prüft das Programm selbst, bevor React
 * zeichnet, ob es in einem fremden Rahmen läuft, und zeigt dann statt des
 * Portals nur einen Hinweis mit Link in ein eigenes Fenster (siehe main.tsx).
 *
 * Ein Verstecken per CSS bis zur Prüfung braucht es nicht: Ohne Skript bleibt
 * `#root` leer, es gibt also nichts, worauf jemand klicken könnte. Das deckt
 * auch einen Rahmen mit `sandbox` ohne `allow-scripts` ab. Mit Skript läuft
 * die Prüfung vor dem ersten Zeichnen. Einen Sprung aus dem Rahmen
 * (`top.location = ...`) gibt es bewusst nicht, ein `sandbox`-Rahmen würde ihn
 * ohnehin verhindern.
 */

/** Wer das Portal in einem Rahmen zeigen darf. Die EINZIGE Liste dafür. */
export const ERLAUBTE_EINBETTER: ReadonlyArray<{
  host: string;
  /** Auch Unterdomains, etwa `app.lovable.dev`. */
  unterdomains: boolean;
  /**
   * Nur wenn das Portal selbst auf einer Lovable-Vorschauadresse läuft.
   * Unter lovable.app und lovableproject.com kann jeder Lovable-Kunde eigene
   * Seiten veröffentlichen. Dürften die das Live-Portal einbetten, wäre der
   * Schutz wertlos.
   */
  nurVorschau?: boolean;
  warum: string;
}> = [
  { host: "lovable.dev", unterdomains: true, warum: "Lovable-Editor, zeigt die Vorschau in einem Rahmen" },
  { host: "gptengineer.app", unterdomains: true, warum: "früherer Name des Lovable-Editors" },
  { host: "lovable.app", unterdomains: true, nurVorschau: true, warum: "Lovable-Vorschau, falls der Editor sie verschachtelt" },
  { host: "lovableproject.com", unterdomains: true, nurVorschau: true, warum: "Lovable-Vorschau, falls der Editor sie verschachtelt" },
  { host: "osimmobilien.netlify.app", unterdomains: false, warum: "eigene Website" },
  { host: "osimmobilien.netlify.app", unterdomains: false, warum: "eigene Website" },
];

/** Läuft das Portal selbst gerade in einer Lovable-Vorschau? */
export function istVorschauHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com") ||
    (h.endsWith(".lovable.app") && /^(id-preview|preview)(-[a-z0-9]+)?--/.test(h))
  );
}

function hostPasst(host: string, eintrag: { host: string; unterdomains: boolean }): boolean {
  return host === eintrag.host || (eintrag.unterdomains && host.endsWith(`.${eintrag.host}`));
}

/** Darf diese Herkunft das Portal einbetten? */
export function istErlaubterEinbetter(herkunft: string, eigeneHerkunft: string): boolean {
  if (herkunft === eigeneHerkunft) return true;
  let url: URL;
  try {
    url = new URL(herkunft);
  } catch {
    // Auch "null", die Herkunft eines sandbox- oder data:-Rahmens.
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  let vorschau = false;
  try {
    vorschau = istVorschauHost(new URL(eigeneHerkunft).hostname);
  } catch {
    vorschau = false;
  }
  return ERLAUBTE_EINBETTER.some((e) => hostPasst(host, e) && (!e.nurVorschau || vorschau));
}

/** Was sich aus dem Fenster über die Einbettung ablesen lässt. */
export interface RahmenLage {
  eigeneHerkunft: string;
  imRahmen: boolean;
  /** `location.ancestorOrigins`, alle Rahmen bis oben. `null`, wo der Browser es nicht kennt (Firefox). */
  vorfahren: string[] | null;
  /** Herkunft des direkten Elternfensters, nur lesbar, wenn es unsere eigene ist. */
  elternHerkunft: string | null;
  referrer: string;
}

export type RahmenUrteil =
  | { erlaubt: true; grund: "eigenes Fenster" | "erlaubter Rahmen" | "Vorschau ohne Angabe" }
  | { erlaubt: false; einbetter: string | null };

export function beurteileRahmen(lage: RahmenLage): RahmenUrteil {
  if (!lage.imRahmen) return { erlaubt: true, grund: "eigenes Fenster" };

  let herkuenfte: string[] = [];
  if (lage.vorfahren && lage.vorfahren.length > 0) {
    herkuenfte = lage.vorfahren;
  } else if (lage.elternHerkunft) {
    // Eigene Seite im eigenen Rahmen, etwa die Präsentation im
    // Trainingscockpit. Das Elternfenster hat diese Prüfung selbst gemacht.
    herkuenfte = [lage.elternHerkunft];
  } else if (lage.referrer) {
    try {
      herkuenfte = [new URL(lage.referrer).origin];
    } catch {
      herkuenfte = [];
    }
  }

  if (herkuenfte.length === 0) {
    /*
     * Keine Angabe, wer einbettet: Firefox kennt ancestorOrigins nicht, und
     * die einbettende Seite kann den Referrer unterdrücken. In der
     * Lovable-Vorschau lassen wir das durch, damit Christian dort nicht vor
     * dem Hinweis steht. Auf der echten Adresse wäre genau das der Trick,
     * den Schutz zu umgehen.
     */
    let vorschau = false;
    try {
      vorschau = istVorschauHost(new URL(lage.eigeneHerkunft).hostname);
    } catch {
      vorschau = false;
    }
    return vorschau ? { erlaubt: true, grund: "Vorschau ohne Angabe" } : { erlaubt: false, einbetter: null };
  }

  const fremd = herkuenfte.find((h) => !istErlaubterEinbetter(h, lage.eigeneHerkunft));
  return fremd === undefined ? { erlaubt: true, grund: "erlaubter Rahmen" } : { erlaubt: false, einbetter: fremd };
}

export function leseRahmenLage(w: Window): RahmenLage {
  let imRahmen = true;
  try {
    imRahmen = w.top !== w.self;
  } catch {
    imRahmen = true;
  }

  let vorfahren: string[] | null = null;
  try {
    const liste = w.location.ancestorOrigins;
    if (liste) vorfahren = Array.from(liste);
  } catch {
    vorfahren = null;
  }

  let elternHerkunft: string | null = null;
  if (imRahmen) {
    try {
      // Wirft bei fremder Herkunft, das ist hier die Prüfung.
      elternHerkunft = w.parent.location.origin;
    } catch {
      elternHerkunft = null;
    }
  }

  let referrer = "";
  try {
    referrer = w.document.referrer || "";
  } catch {
    referrer = "";
  }

  return { eigeneHerkunft: w.location.origin, imRahmen, vorfahren, elternHerkunft, referrer };
}

/** Darf das Portal in diesem Fenster zeichnen? Im Zweifel nein, dann erscheint der Hinweis. */
export function einbettungErlaubt(w: Window = window): boolean {
  let urteil: RahmenUrteil;
  try {
    urteil = beurteileRahmen(leseRahmenLage(w));
  } catch {
    // Sollte nie passieren. Im eigenen Fenster trotzdem zeichnen: Ein Fehler
    // in dieser Prüfung darf nicht das ganze Portal für alle abschalten.
    let oben = false;
    try {
      oben = w.top === w.self;
    } catch {
      oben = false;
    }
    urteil = oben ? { erlaubt: true, grund: "eigenes Fenster" } : { erlaubt: false, einbetter: null };
  }
  // Mit `in` statt über `erlaubt`: Ohne strictNullChecks engt TypeScript
  // die Vereinigung über einen booleschen Schlüssel nicht ein.
  if ("einbetter" in urteil) {
    // Für die Fehlersuche: Wird eine gewollte Einbettung blockiert, steht hier,
    // welche Herkunft in ERLAUBTE_EINBETTER fehlt.
    console.warn("[Einbettungsschutz] Portal in fremdem Rahmen, zeige Hinweis. Einbettende Seite:", urteil.einbetter ?? "unbekannt");
  }
  return urteil.erlaubt;
}
