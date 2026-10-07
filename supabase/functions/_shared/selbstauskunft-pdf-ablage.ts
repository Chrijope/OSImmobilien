/**
 * Die unterschriebene Selbstauskunft als echte PDF am Investment.
 *
 * Bis zum 26.09.2026 lag nach der letzten Unterschrift keine Datei am
 * Investment. `finalize-selbstauskunft` schrieb nur einen erfundenen
 * Dateinamen nach `meta.saPdf`, und jeder Knopf „PDF anzeigen“ rechnete das
 * Dokument beim Klick neu aus den Formulardaten. Der Hinweis an der Karte
 * „wird automatisch als PDF im Investment abgelegt“ stimmte also nicht.
 *
 * Seither baut der Browser, in dem die letzte Unterschrift geleistet wird,
 * das PDF in der gewohnten Gestaltung (Hausschrift und Logo gibt es nur dort)
 * und reicht es `finalize-selbstauskunft` nach. Die Function prüft es, legt es
 * im Eimer `unterlagen` ab und vermerkt es am Investment. Dasselbe Muster wie
 * die Kopie der Reservierungsvereinbarung.
 *
 * Diese Datei hält die Regeln, die Browser und Function teilen: wo die Datei
 * liegt, wann sie als aktuell gilt und was am Investment vermerkt wird. Sie
 * liegt in `_shared`, weil Lovable beim Ausrollen nur den Ordner der Function
 * und `_shared` mitnimmt.
 */

/** Größer wird eine Selbstauskunft auch mit zwei Unterschriften nicht. */
export const SA_PDF_HOECHSTGROESSE = 15 * 1024 * 1024;

/**
 * Wo die Datei liegt.
 *
 * Der Ordner `kundenordner/<kontaktId>/<investmentId>/` ist bewusst gewählt:
 * Mitarbeiter lesen dort über „Internal read unterlagen“, der Kunde liest
 * seinen eigenen Ordner über „Kunde read unterlagen“. Hochladen oder löschen
 * darf der Kunde dort nicht, anders als im Ordner `<kontaktId>/`. Das
 * unterschriebene Dokument kann er also nicht austauschen.
 */
export function saPdfPfad(kontaktId: string, investmentId: string, dateiname: string): string {
  return `kundenordner/${kontaktId}/${investmentId}/${dateiname}`;
}

/** Dateiname ohne Zeichen, die im Speicherpfad stören. */
function sichererName(name: string): string {
  return name.replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kunde";
}

/**
 * Der Dateiname, etwa `Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf`.
 *
 * Das Datum ist der Tag der letzten Unterschrift. Wird die Selbstauskunft
 * später korrigiert und neu unterschrieben, entsteht eine neue Datei, die
 * alte bleibt liegen.
 */
export function saPdfDateiname(kundeName: string, unterschriebenAm: string | null | undefined): string {
  const datum = typeof unterschriebenAm === "string" && /^\d{4}-\d{2}-\d{2}/.test(unterschriebenAm)
    ? unterschriebenAm.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `Selbstauskunft_unterschrieben_${sichererName(kundeName)}_${datum}.pdf`;
}

/**
 * Der Dateiname für eine neue Fassung, die eine frühere Datei ablöst.
 *
 * Wird am selben Tag korrigiert und neu unterschrieben, ergäbe
 * `saPdfDateiname` genau den Namen der alten Datei, und das Hochladen hätte
 * sie überschrieben. Die alte Datei soll aber als Nachweis liegen bleiben.
 * Gibt es deshalb schon eine frühere Datei (`saPdfPath` am Investment oder in
 * `saVorigeFassung`), trägt der Name zusätzlich die Uhrzeit der
 * Unterschrift, etwa `..._2026-09-26_14-30-05.pdf`. Jede Fassung hat ihre
 * eigene Unterschriftszeit, der Name ist damit je Fassung eindeutig. Ohne
 * frühere Datei bleibt es beim gewohnten Namen.
 */
export function saPdfDateinameNeueFassung(
  kundeName: string,
  unterschriebenAm: string | null | undefined,
  fruehereDateien: readonly (string | null | undefined)[],
): string {
  const einfach = saPdfDateiname(kundeName, unterschriebenAm);
  const frueher = fruehereDateien.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (frueher.length === 0) return einfach;
  const uhrzeit = typeof unterschriebenAm === "string" && /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/.test(unterschriebenAm)
    ? unterschriebenAm.slice(11, 19).replace(/:/g, "-")
    : new Date().toISOString().slice(11, 19).replace(/:/g, "-");
  const mitUhrzeit = einfach.replace(/\.pdf$/, `_${uhrzeit}.pdf`);
  // Sicherheitsnetz, falls eine frühere Datei zufällig genauso heißt.
  const belegt = (name: string) => frueher.some((p) => p === name || p.endsWith(`/${name}`));
  if (!belegt(mitUhrzeit)) return mitUhrzeit;
  return mitUhrzeit.replace(/\.pdf$/, `_${Date.now()}.pdf`);
}

/** Die früheren Dateien am Investment, die nicht überschrieben werden dürfen. */
export function saFruehereDateien(meta: Record<string, unknown> | null | undefined): string[] {
  const m = meta ?? {};
  const vorige = m.saVorigeFassung && typeof m.saVorigeFassung === "object"
    ? (m.saVorigeFassung as Record<string, unknown>).saPdfPath
    : null;
  return [m.saPdfPath, vorige].filter((p): p is string => typeof p === "string" && p.trim() !== "");
}

/** Base64 aus dem Browser in Bytes. `null`, wenn es kein gültiges Base64 ist. */
export function base64ZuBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Ist das überhaupt eine PDF in vernünftiger Größe?
 *
 * Mehr lässt sich serverseitig nicht prüfen. Den Inhalt baut der Browser des
 * Unterschreibenden; maßgeblich bleiben die gespeicherten Angaben und
 * Unterschriften, aus denen das Kundenprofil das Dokument jederzeit neu
 * erzeugen kann.
 */
export function pruefeSaPdf(bytes: Uint8Array | null): { ok: true } | { ok: false; grund: string } {
  if (!bytes || bytes.length === 0) return { ok: false, grund: "Leere Datei" };
  if (bytes.length > SA_PDF_HOECHSTGROESSE) return { ok: false, grund: "Datei zu groß" };
  const kopf = String.fromCharCode(...Array.from(bytes.subarray(0, 5)));
  if (kopf !== "%PDF-") return { ok: false, grund: "Keine PDF-Datei" };
  return { ok: true };
}

/** Die Felder am Investment, die hier gelesen und geschrieben werden. */
export interface SaPdfMeta {
  saSigned?: unknown;
  saSignedAt?: unknown;
  saPdfPath?: unknown;
  saPdfUnterschriftAm?: unknown;
}

/** Ist die Selbstauskunft vollständig unterschrieben? */
export function saVollstaendigUnterschrieben(meta: SaPdfMeta | null | undefined): boolean {
  return !!meta && meta.saSigned === true && typeof meta.saSignedAt === "string" && meta.saSignedAt !== "";
}

/**
 * Der Pfad der abgelegten PDF, aber nur, wenn sie zur geltenden Unterschrift
 * gehört.
 *
 * Wird die Selbstauskunft korrigiert, setzen die Korrekturwege `saSigned` und
 * `saSignedAt` zurück. Die alte Datei zeigt dann einen überholten Stand und
 * darf nicht mehr als „die unterschriebene Selbstauskunft“ erscheinen. Nach
 * der neuen Unterschrift steht ein neues `saSignedAt`, und die alte Datei
 * passt wieder nicht. Deshalb der Abgleich über den Zeitpunkt.
 */
export function aktuellerSaPdfPfad(meta: SaPdfMeta | null | undefined): string | null {
  if (!saVollstaendigUnterschrieben(meta)) return null;
  const pfad = typeof meta!.saPdfPath === "string" ? meta!.saPdfPath.trim() : "";
  if (!pfad) return null;
  return meta!.saPdfUnterschriftAm === meta!.saSignedAt ? pfad : null;
}

/** Fehlt zur geltenden Unterschrift noch die Datei? */
export function saPdfFehlt(meta: SaPdfMeta | null | undefined): boolean {
  return saVollstaendigUnterschrieben(meta) && aktuellerSaPdfPfad(meta) === null;
}

/**
 * Was nach dem Ablegen am Investment vermerkt wird.
 *
 * `saPdf` trägt ab jetzt den echten Dateinamen statt eines erfundenen.
 * `saPdfUnterschriftAm` bindet die Datei an die Unterschrift, siehe
 * `aktuellerSaPdfPfad`. `docFileUrls` bleibt bewusst unberührt: Das Portal
 * wertet `docFileUrls.Selbstauskunft` als „unterschrieben“, und nach einer
 * Korrektur stünde die Selbstauskunft dort sonst weiter als erledigt.
 */
export function saPdfMetaPatch(
  meta: SaPdfMeta,
  args: { pfad: string; dateiname: string; jetzt: string },
): Record<string, unknown> {
  return {
    saPdf: args.dateiname,
    saPdfPath: args.pfad,
    saPdfUnterschriftAm: meta.saSignedAt,
    saPdfAbgelegtAm: args.jetzt,
  };
}
