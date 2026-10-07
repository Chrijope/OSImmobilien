/**
 * Provisionsbedingungen beim Einladen nur von Admin und Inhaber (seit 30.09.2026).
 *
 * invite-user schreibt Karrierestufe, eigene Provisionssätze, Teamleiter und
 * Karriere-Sperre mit dem Dienstschlüssel in `user_settings`. Der Wächter
 * `user_settings_provision_schuetzen` sieht diesen Weg nicht, weil ohne
 * angemeldeten Nutzer alles erlaubt ist. Vertriebspartner und
 * Vertriebsleitung dürfen die Function aufrufen (Kunden, Tippgeber); was sie
 * an Bedingungen mitschicken, fällt hier weg.
 */
export const EINLADUNG_KONDITIONEN = [
  "karriereStufe",
  "teamleaderId",
  "customProvisionRate",
  "customProvisionRateSetter",
  "customProvisionRateEigen",
  "karriereGatingActive",
] as const;

export function einladungOhneFremdeKonditionen<T extends Record<string, unknown>>(
  body: T,
  aufruferIstAdmin: boolean,
): { body: T; verworfen: string[] } {
  if (aufruferIstAdmin) return { body, verworfen: [] };
  const bereinigt: Record<string, unknown> = { ...body };
  const verworfen: string[] = [];
  for (const feld of EINLADUNG_KONDITIONEN) {
    if (bereinigt[feld] !== undefined && bereinigt[feld] !== null && bereinigt[feld] !== "") verworfen.push(feld);
    delete bereinigt[feld];
  }
  return { body: bereinigt as T, verworfen };
}

/**
 * Darf der Aufrufer diesen Tippgeber mit einem Portalkonto verknüpfen?
 *
 * Geprüft wird VOR der Kontoanlage, damit bei einer Ablehnung weder ein Konto
 * noch eine Einladungsmail entsteht. Erlaubt ist, was die Oberfläche anbietet:
 * Admin, Inhaber und Vertriebsleitung jeden Tippgeber; alle anderen den
 * eigenen oder den eines Teammitglieds, über das sie (auch über mehrere
 * Stufen) Teamleiter sind (Teampartner.tsx, Downline über teamleader_id).
 * Ohne Admin-Rolle darf der Tippgeber noch kein fremdes Konto haben, sonst
 * liesse er sich samt seinen Leads umhängen.
 *
 * Liefert null, wenn es passt, sonst den Satz für die Oberfläche.
 */
export function tippgeberVerknuepfungAblehnung(p: {
  aufruferId: string;
  aufruferRollen: ReadonlySet<string>;
  tippgeber: { zugeordnet_id: string | null; benutzer_id: string | null } | null;
  /** user_id -> teamleader_id aus user_settings. */
  teamleiterVon: ReadonlyMap<string, string>;
  /** Gehört ein schon verknüpftes Konto zur eingeladenen Adresse? */
  kontoPasstZurAdresse: boolean;
}): string | null {
  if (!p.tippgeber) return "Diesen Tippgeber gibt es nicht mehr. Bitte lade die Seite neu.";
  if (p.aufruferRollen.has("admin") || p.aufruferRollen.has("inhaber")) return null;
  if (p.tippgeber.benutzer_id && !p.kontoPasstZurAdresse) {
    return "Dieser Tippgeber hat schon einen Portal-Zugang mit einer anderen Adresse. Das ändern Admin und Inhaber.";
  }
  if (p.aufruferRollen.has("vertriebsleiter")) return null;
  // Von der Zuordnung aufwärts durch die Teamleiter; höchstens 20 Stufen gegen Kreise.
  let person = p.tippgeber.zugeordnet_id;
  for (let stufe = 0; person && stufe < 20; stufe++) {
    if (person === p.aufruferId) return null;
    person = p.teamleiterVon.get(person) ?? null;
  }
  return "Den Portal-Zugang richtest du nur für eigene Tippgeber oder die deines Teams ein.";
}

/**
 * Gehört das vorhandene Konto der eingeladenen Adresse schon einem anderen
 * Tippgeber? Dann würde es umgehängt: Wer einen eigenen Tippgeber mit der
 * Adresse eines fremden anlegt, bekäme dessen Konto. Das dürfen nur Admin und
 * Inhaber. Liefert null, wenn es passt, sonst den Satz für die Oberfläche.
 */
export function tippgeberKontoAblehnung(p: {
  aufruferRollen: ReadonlySet<string>;
  tippgeberId: string;
  /** Kennungen der Tippgeber, deren benutzer_id das vorhandene Konto ist. */
  tippgeberDesKontos: readonly string[];
}): string | null {
  if (p.aufruferRollen.has("admin") || p.aufruferRollen.has("inhaber")) return null;
  if (p.tippgeberDesKontos.some((id) => id !== p.tippgeberId)) {
    return "Diese Adresse gehört schon zum Portal-Zugang eines anderen Tippgebers. Das klären Admin und Inhaber.";
  }
  return null;
}
