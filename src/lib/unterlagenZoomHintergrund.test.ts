import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mitNachgetragenen, seedUnterlagen } from "@/lib/unterlagenSeed";

/** Zoom-Hintergrund mit Betonwand und Lichtleiste (Christian, 21.10.2026). */
describe("Zoom-Hintergrund 9 unter Marketing", () => {
  const ids = (liste: ReturnType<typeof seedUnterlagen>) =>
    liste.flatMap((a) => a.dokumente.map((d) => d.id));

  it("steht direkt hinter Zoom-Hintergrund 8, das Bild liegt in public", () => {
    const seed = seedUnterlagen();
    const alle = ids(seed);
    expect(alle.indexOf("m-zoom-desktop-11")).toBe(alle.indexOf("m-zoom-desktop-8") + 1);
    const eintrag = seed.flatMap((a) => a.dokumente).find((d) => d.id === "m-zoom-desktop-11")!;
    expect(eintrag.download).toBe(true);
    expect(existsSync(join(process.cwd(), "public", "images/zoom/os-real-estate-buero-11.jpg"))).toBe(true);
  });

  it("erscheint auch in einer schon gespeicherten Liste", () => {
    const gespeichert = seedUnterlagen().map((a) => ({ ...a, dokumente: a.dokumente.filter((d) => d.id !== "m-zoom-desktop-11") }));
    const { daten, geaendert } = mitNachgetragenen(gespeichert);
    expect(geaendert).toBe(true);
    expect(ids(daten)).toEqual(ids(seedUnterlagen()));
  });
});
