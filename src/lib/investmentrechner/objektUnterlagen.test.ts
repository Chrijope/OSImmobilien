import { afterEach, describe, expect, it, vi } from "vitest";
import { automatischeObjektwerte, automatischeUnterlagenwerte, ergaenzeUnterlagen, ladeObjektUnterlage, leseObjektUnterlagen, objektUnterlagenQuelle, vereinigeAuslesungen } from "./objektUnterlagen";
import { aufEigenSetzen } from "./herkunft";
import { standardEingabe } from "./rechenkern";
import { leereUnterlagenDaten } from "./unterlagenAuslesen";
import type { KiAntwort } from "./unterlagenKiFelder";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

const auslesen = vi.hoisted(() => vi.fn());
vi.mock("./unterlagenKiAufruf", () => ({
  felderAusUnterlagenAuslesen: auslesen,
  anfrageZusammenstellen: async (d: Array<{ name: string }>) => d,
}));

const aufloesen = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ resolveUnterlagenUrl: aufloesen }));

const feld = (wert: number | string, quelle = "Beleg.pdf, Seite 1") => ({ wert, quelle, sicherheit: "hoch" as const });
const antwort = (felder: Record<string, ReturnType<typeof feld>>): KiAntwort => ({ felder, hinweise: [] }) as KiAntwort;
afterEach(() => vi.unstubAllGlobals());

describe("automatische Objektunterlagen", () => {
  it("nimmt nur Dokumente der Zielwohnung und gemeinsame Objektunterlagen, keine internen Dateien", () => {
    const w = { id: "w7", weNr: "7", dokumente: [{ id: "m", name: "Miete", url: "/m.pdf", kategorie: "wohnungsunterlagen" }] } as ObjektWohnung;
    const o = { id: "o1", adresse: "Straße 1", plz: "12345", ort: "Ort", wohnungen: [w, { id: "w8", dokumente: [{ url: "/fremd.pdf" }] }], dokumente: [{ id: "e", name: "Energie", url: "/e.pdf", kategorie: "objektunterlagen" }, { id: "i", url: "/intern.pdf", kategorie: "intern" }] } as ObjektData;
    expect(objektUnterlagenQuelle(o, w).dokumente.map(d => d.url)).toEqual(["/m.pdf", "/e.pdf"]);
    expect(objektUnterlagenQuelle(o, w).wohnungId).toBe("w7");
  });
  it("findet die Unterlagen aus dem Investagon-Import, seit sie nicht mehr als intern abgelegt werden", () => {
    const w = { id: "w7", weNr: "7", dokumente: [{ id: "g", name: "Grundriss", url: "/investagon-dokument/o1/we-7-grundriss.pdf", kategorie: "wohnungsunterlagen" }] } as ObjektWohnung;
    const o = { id: "o1", adresse: "", plz: "", ort: "", wohnungen: [w], dokumente: [
      { id: "b", name: "Baubeschreibung", url: "/investagon-dokument/o1/baubeschreibung.pdf", kategorie: "objektunterlagen" },
      { id: "p", name: "Provisionsvereinbarung", url: "/investagon-dokument/o1/provision.pdf", kategorie: "intern" },
    ] } as ObjektData;
    expect(objektUnterlagenQuelle(o, w).dokumente.map(d => d.name)).toEqual(["Grundriss", "Baubeschreibung"]);
  });
  it("markiert Mietvertrag und Grundbuch als rot, auch über die Investagon-Kategorie (seit dem 28.09.2026)", () => {
    const w = {
      id: "w7", weNr: "7",
      investagonRaw: { files: [{ category: "rental_agreement", title: "Anlage 3", filename: "https://x.investagon.com/a3.pdf" }] },
      dokumente: [
        { id: "m", name: "Mietvertrag WE 7", url: "/m.pdf", kategorie: "wohnungsunterlagen" },
        { id: "a", name: "Anlage 3", url: "/a3.pdf", kategorie: "wohnungsunterlagen" },
      ],
    } as unknown as ObjektWohnung;
    const o = { id: "o1", adresse: "", plz: "", ort: "", wohnungen: [w], dokumente: [
      { id: "g", name: "Grundbuchauszug", url: "/g.pdf", kategorie: "objektunterlagen" },
      { id: "e", name: "Energieausweis", url: "/e.pdf", kategorie: "objektunterlagen" },
    ] } as ObjektData;
    const rot = Object.fromEntries(objektUnterlagenQuelle(o, w).dokumente.map(d => [d.name, d.rot]));
    expect(rot).toEqual({ "Mietvertrag WE 7": true, "Anlage 3": true, Grundbuchauszug: true, Energieausweis: false });
  });
  it("ergänzt belegte Objektwerte, aber niemals Kunden-Eigenkapital oder Musterfinanzierung", () => {
    const a = antwort({ purchasePrice: feld(250000), area: feld(62), equity: feld(40000), seniorInterestRate: feld(3.1) });
    expect(automatischeObjektwerte(a, standardEingabe, {}).aenderung).toEqual({ purchasePrice: 250000, area: 62 });
  });
  it("schützt manuell gesetzte Null und gepflegte Werte selbst bei Übereinstimmung mit einem Standardwert", () => {
    const herkunft = aufEigenSetzen({}, ["furniturePrice"]);
    const a = antwort({ furniturePrice: feld(8000), buildingShare: feld(90) });
    const result = automatischeObjektwerte(a, standardEingabe, { ...herkunft, buildingShare: { quelle: "objekt", text: "Aus Objekt" } });
    expect(result.aenderung).toEqual({});
    expect(result.hinweise).toHaveLength(2);
  });
  it("setzt leere Felder automatisch, merkt den Wert davor, bestätigt Gleiches und lässt Abweichungen stehen (R4-004)", () => {
    const a = antwort({ area: feld(62), rooms: feld(3), purchasePrice: feld(250000) });
    const eingabe = { ...standardEingabe, rooms: 2, purchasePrice: 250000 };
    const herkunft = { rooms: { quelle: "objekt" as const, text: "Aus Objekt" }, purchasePrice: { quelle: "objekt" as const, text: "Aus Objekt" } };
    const result = automatischeObjektwerte(a, eingabe, herkunft);
    expect(result.aenderung).toEqual({ area: 62 });
    expect(result.herkunft.area).toMatchObject({ quelle: "unterlagen", automatisch: true, vorher: 0 });
    expect(result.hinweise.some((h) => h.startsWith("Kaufpreis") && h.includes("stimmt mit den hinterlegten Daten überein"))).toBe(true);
    expect(result.hinweise.some((h) => /Hinterlegt 2, laut Beleg\.pdf, Seite 1 3\./.test(h))).toBe(true);
    // Nach der Übernahme meldet derselbe Abgleich die Fläche als automatisch übernommen.
    const danach = automatischeObjektwerte(a, { ...eingabe, area: 62 }, { ...herkunft, ...result.herkunft });
    expect(danach.aenderung).toEqual({});
    expect(danach.hinweise.some((h) => h.includes("automatisch übernommen"))).toBe(true);
  });
  it("übernimmt weder unsichere Werte noch Angaben ohne Beleg", () => {
    const a: KiAntwort = { felder: { area: { ...feld(65), sicherheit: "mittel" }, purchasePrice: feld(250000, "") }, hinweise: [] };
    expect(automatischeObjektwerte(a, standardEingabe, {}).aenderung).toEqual({});
  });
  it("blockiert widersprüchliche Werte über alle Dokumentpakete hinweg", () => {
    const a = vereinigeAuslesungen([antwort({ area: feld(65), rooms: feld(3) }), antwort({ area: feld(67, "Neu.pdf, Seite 2") }), antwort({ area: feld(65) })]);
    expect(a.felder.area).toBeUndefined();
    expect(a.felder.rooms?.wert).toBe(3);
    expect(a.hinweise[0]).toContain("Widersprüchliche");
  });
  it("übernimmt Energie- und Rücklagendaten auch aus der Scan-Auslesung, ohne gepflegte Daten zu überschreiben", () => {
    const a = antwort({ energyClass: feld("B"), energyValue: feld(65), reserveUnitShare: feld(1200), renovations: feld("2024 · Dach\n2025 · Fenster") });
    const { daten, hinweise } = automatischeUnterlagenwerte(a, { ...leereUnterlagenDaten, energyClass: "C" });
    expect(daten.energyClass).toBe("C"); expect(daten.energyValue).toBe(65);
    expect(daten.reserveUnitShare).toBe(1200); expect(daten.renovations).toHaveLength(2);
    expect(hinweise).toHaveLength(1);
  });
  it("löscht beim Hinzufügen oder Entfernen einer Datei keine bestehenden Energieangaben", () => {
    expect(ergaenzeUnterlagen({ ...leereUnterlagenDaten, energyClass: "A+" }, leereUnterlagenDaten).energyClass).toBe("A+");
  });
  it("meldet nicht erreichbare Dateien, statt einen leeren Erfolg vorzutäuschen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const d = await ladeObjektUnterlage({ id: "1", name: "Beleg", url: "/beleg.pdf", ebene: "objekt" }, new AbortController().signal);
    expect(d.status).toBe("error"); expect(d.detail).toContain("403");
  });
  it("holt für eine Kopie aus Investagon erst eine befristete Adresse", async () => {
    aufloesen.mockResolvedValue("https://abc.supabase.co/storage/v1/object/sign/investagon-dokumente/o1/a.pdf?token=t");
    const abruf = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", abruf);
    await ladeObjektUnterlage({ id: "1", name: "Baubeschreibung", url: "/investagon-dokument/o1/a.pdf", ebene: "objekt" }, new AbortController().signal);
    expect(aufloesen).toHaveBeenCalledWith("/investagon-dokument/o1/a.pdf");
    expect(abruf.mock.calls[0][0]).toBe("https://abc.supabase.co/storage/v1/object/sign/investagon-dokumente/o1/a.pdf?token=t");
  });
  it("behandelt Ordner- und Loginseiten nicht als Dokumenttext", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new Blob(["<html>Login</html>"], { type: "text/html" }) }));
    const d = await ladeObjektUnterlage({ id: "1", name: "Ordner", url: "/ordner", ebene: "objekt" }, new AbortController().signal);
    expect(d.status).toBe("error");
  });
});

describe("Auslesung über die Serverfunktion", () => {
  const quelle = { objektId: "o1", wohnungId: "w7", weNr: "7", adresse: "Straße 1", dokumente: [{ id: "d1", name: "Liste.txt", url: "/liste.txt", ebene: "objekt" as const }] };
  const datei = () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => ({ size: 100, type: "text/plain", text: async () => "Wohnung 7: Kaufpreis 250000 Euro. ".repeat(5), slice: () => ({ text: async () => "Wohnu" }) }) }));
  };
  it("übergibt die Zielwohnung und übernimmt nur Antworten der kontextfähigen Serverversion", async () => {
    datei(); auslesen.mockResolvedValue({ ...antwort({ purchasePrice: feld(250000) }), ausleseVersion: 2 });
    const r = await leseObjektUnterlagen(quelle);
    expect(auslesen).toHaveBeenLastCalledWith(expect.any(Array), quelle);
    expect(r.antwort.felder.purchasePrice?.wert).toBe(250000);
  });
  it("blockiert automatische Werte einer älteren Serverversion", async () => {
    datei(); auslesen.mockResolvedValue(antwort({ purchasePrice: feld(250000) }));
    const r = await leseObjektUnterlagen(quelle);
    expect(r.antwort.felder).toEqual({});
    expect(r.antwort.hinweise.join(" ")).toContain("noch nicht freigeschaltet");
  });
});
