/**
 * Kopplung der zwei Fenster im Videocall: Moderation (im CRM, nur HR) und
 * Präsentation (Bildschirmfreigabe, sieht der Bewerber).
 *
 * Beide Fenster laufen im selben Browser unter derselben Herkunft und reden
 * über einen BroadcastChannel je Bewerber. Es gibt keinen Server und keine
 * Datenbank dazwischen. Ausgetauscht werden Folien-Ids, nie Indizes: Die
 * Moderation zählt den Zwischenstopp mit, die Präsentation nicht, und bei
 * teil=2 fehlen in der Präsentation die Teil-1-Folien. Ids sind in beiden
 * Listen stabil, Positionen nicht.
 *
 * Nachrichten:
 *   Moderation an Präsentation: "gehe-zu" (bitte auf diese Folie springen),
 *     "zustand" (Antwort auf eine Anfrage, dieselbe Bedeutung), "ping".
 *   Präsentation an Moderation: "folie" (ich zeige jetzt diese Folie, auch
 *     wenn jemand direkt im Präsentationsfenster geblättert hat), "regler"
 *     (die Reglerwerte des Rechners), "umschalter" (Stand eines Umschalters
 *     auf einer Folie, etwa Alleine/Mit OS Immobilien auf der Chaos-Folie),
 *     "anfrage" (ich bin neu da, wo stehen wir?), "pong".
 *   Nur in der Übungsansicht (praesentationsUebung.ts), Moderation an
 *     Präsentation: "stand" (Ablauf, Einstieg, Weg, Module und Folie auf
 *     einmal). Dort wechselt nicht nur die Folie, sondern auch der ganze
 *     Ablauf, und das Fenster muss jedem Wechsel folgen.
 *
 * Regler und Umschalter bedient die HR-Managerin im Präsentationsfenster
 * (es ist ihr Fenster, im Videocall wird es nur geteilt). Die Moderation
 * spiegelt den Stand in ihrer Vorschau, damit sie sieht, was der Bewerber
 * sieht.
 *
 * Rückfall: Ohne gekoppeltes Fenster oder ohne BroadcastChannel (alte
 * Browser, Testumgebung) arbeitet jede Seite für sich weiter, ohne Fehler.
 */

export type KopplungsNachricht =
  | { typ: "gehe-zu"; folieId: string }
  | { typ: "zustand"; folieId: string }
  | { typ: "folie"; folieId: string }
  | { typ: "regler"; abschluesse: number; kaufpreis: number }
  | { typ: "umschalter"; id: string; an: boolean }
  | { typ: "anfrage" }
  | { typ: "ping" }
  | { typ: "pong" }
  | UebungsStandNachricht;

/**
 * Der ganze Stand der Übungsansicht in einer Nachricht. Weg und Module
 * reisen als reine Zeichenketten; ob sie gültig sind, prüft die Übungsseite
 * beim Lesen (leseWeg, leseModule), damit dieses Modul die Folienlogik
 * nicht kennen muss.
 */
export type UebungsStandNachricht = {
  typ: "stand";
  art: "vorabbogen" | "kennenlernbogen" | "rechner";
  teil: 1 | 2;
  weg: string;
  module: string[];
  /** Leer heißt: die erste Folie des Ablaufs. */
  folieId: string;
};

/** Name des Kanals je Bewerber. Ohne Id ein gemeinsamer Übungskanal. */
export function kanalName(bewerberId: string | null | undefined): string {
  const id = (bewerberId ?? "").trim();
  return `closing-praesentation-${id || "ohne-bewerber"}`;
}

/**
 * Zurück zu genau diesem Bewerber, in den Reiter, aus dem man kam.
 *
 * Beide Moderationsansichten öffnen in einem eigenen Tab und kennen nur die
 * Kennung aus ihrer eigenen Adresse. Genau die reicht: `BewerberArbeitsplatz`
 * öffnet mit `openBewerber` das Profil und mit `detailTab` den Reiter. Der
 * Reiter heißt im neuen Ablauf „Videocall", sein Wert blieb aber
 * „erstgespraech". Ohne ihn landet man auf der Übersicht und muss den Reiter
 * erneut suchen, aus dem man gerade gekommen ist.
 *
 * Steht hier und nicht in einer der beiden Seiten, weil beide denselben Weg
 * zurück brauchen und zwei Fassungen davon auseinanderlaufen wuerden.
 */
export function bewerberprofilUrl(bewerberId: string): string {
  return `/bewerberprozess?openBewerber=${encodeURIComponent(bewerberId)}&detailTab=erstgespraech`;
}

/*
 * Die beiden Adressen des Bewerber-Videocalls.
 *
 * Sie tragen noch den Namen aus der Zeit der alten Closing-Präsentation, weil
 * offene Tabs und Lesezeichen darauf zeigen. Seit dem 23.09.2026 steht hinter
 * beiden immer der Videocall mit den fünf Wegen (BewerberVideocallModeration,
 * BewerberVideocallPraesentation), für jeden Bewerber, ob im alten oder im
 * neuen Ablauf. Die frühere Weiche `ablauf=neu` gibt es nicht mehr; steht sie
 * noch in einer alten Adresse, wird sie nicht gelesen.
 *
 * `teil` und `name` reisen weiter mit, die beiden Seiten lesen aber nur die
 * Kennung des Bewerbers.
 */

/** Adresse der Moderationsansicht für einen Bewerber. */
export function moderationsUrl(bewerberId: string, teil: 1 | 2): string {
  return `/closing-moderation?bewerberId=${encodeURIComponent(bewerberId)}&teil=${teil}`;
}

/** Adresse der Präsentation, wie die Moderation sie im zweiten Fenster öffnet. */
export function praesentationsUrl(bewerberId: string, teil: 1 | 2, name?: string): string {
  const teile = [`bewerberId=${encodeURIComponent(bewerberId)}`];
  if (name?.trim()) teile.push(`name=${encodeURIComponent(name.trim())}`);
  teile.push(`teil=${teil}`);
  return `/closing-praesentation-entwurf?${teile.join("&")}`;
}

/**
 * Prüft eine empfangene Nachricht. Alles, was nicht dem Format entspricht,
 * wird still verworfen; ein fremdes Fenster darf die Präsentation nicht
 * zerlegen.
 */
export function leseNachricht(daten: unknown): KopplungsNachricht | null {
  if (!daten || typeof daten !== "object") return null;
  const n = daten as Record<string, unknown>;
  switch (n.typ) {
    case "gehe-zu":
    case "zustand":
    case "folie":
      return typeof n.folieId === "string" && n.folieId.trim() !== ""
        ? { typ: n.typ, folieId: n.folieId }
        : null;
    case "regler":
      return typeof n.abschluesse === "number" && typeof n.kaufpreis === "number"
        && Number.isFinite(n.abschluesse) && Number.isFinite(n.kaufpreis)
        ? { typ: "regler", abschluesse: n.abschluesse, kaufpreis: n.kaufpreis }
        : null;
    case "umschalter":
      return typeof n.id === "string" && n.id.trim() !== "" && typeof n.an === "boolean"
        ? { typ: "umschalter", id: n.id, an: n.an }
        : null;
    case "anfrage":
    case "ping":
    case "pong":
      return { typ: n.typ };
    case "stand": {
      const art = n.art;
      if (art !== "vorabbogen" && art !== "kennenlernbogen" && art !== "rechner") return null;
      const teil = n.teil === 2 ? 2 : n.teil === 1 ? 1 : null;
      if (teil === null) return null;
      if (typeof n.weg !== "string" || n.weg.trim() === "") return null;
      if (!Array.isArray(n.module) || typeof n.folieId !== "string") return null;
      const module = n.module.filter((m): m is string => typeof m === "string");
      return { typ: "stand", art, teil, weg: n.weg, module, folieId: n.folieId };
    }
    default:
      return null;
  }
}

/**
 * Position einer Folien-Id in einer Folienliste, -1 wenn sie dort nicht
 * vorkommt. Nicht vorkommen ist normal: Die Präsentation mit teil=2 kennt
 * keine Teil-1-Folien, und die Moderation ohne eingeschalteten Teil 2 kennt
 * keine Teil-2-Folien. Dann bleibt die Seite, wo sie ist.
 */
export function findeFolienIndex(folien: ReadonlyArray<{ id: string }>, folieId: string): number {
  return folien.findIndex((f) => f.id === folieId);
}

export type Kanal = {
  senden: (nachricht: KopplungsNachricht) => void;
  /** Meldet jede gültige Nachricht; liefert die Abmeldefunktion. */
  empfangen: (aufNachricht: (n: KopplungsNachricht) => void) => () => void;
  schliessen: () => void;
};

/**
 * Öffnet den Kanal für einen Bewerber. Liefert null, wenn der Browser keinen
 * BroadcastChannel hat; die Aufrufer arbeiten dann ungekoppelt weiter.
 */
export function oeffneKanal(bewerberId: string | null | undefined): Kanal | null {
  if (typeof BroadcastChannel === "undefined") return null;
  let kanal: BroadcastChannel;
  try {
    kanal = new BroadcastChannel(kanalName(bewerberId));
  } catch {
    return null;
  }
  return {
    senden: (nachricht) => {
      try { kanal.postMessage(nachricht); } catch { /* Kanal schon zu: egal */ }
    },
    empfangen: (aufNachricht) => {
      const handler = (e: MessageEvent) => {
        const n = leseNachricht(e.data);
        if (n) aufNachricht(n);
      };
      kanal.addEventListener("message", handler);
      return () => kanal.removeEventListener("message", handler);
    },
    schliessen: () => {
      try { kanal.close(); } catch { /* noop */ }
    },
  };
}

/** Nach so vielen Millisekunden ohne Antwort gilt die Präsentation als nicht verbunden. */
export const VERBINDUNG_TIMEOUT_MS = 5000;
/** Abstand der Lebenszeichen, die die Moderation schickt. */
export const PING_INTERVALL_MS = 2000;

/**
 * Ist die Verbindung frisch genug? Reine Funktion, damit der Status ohne
 * Browser testbar ist.
 */
export function istVerbunden(letztesLebenszeichen: number | null, jetzt: number): boolean {
  return letztesLebenszeichen != null && jetzt - letztesLebenszeichen <= VERBINDUNG_TIMEOUT_MS;
}
