import { describe, it, expect, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { EingabeExpose } from "./Eingabebereiche";

/**
 * Objektfotos im Bereich „Exposé-Inhalte" lassen sich seit dem 22.09.2026 auch
 * in das Feld ziehen, nicht nur über den Dateidialog wählen. Christian hatte
 * darum gebeten: Wer sechs Bilder aus einem Ordner nimmt, zieht sie lieber
 * einmal herüber, als sie einzeln anzuklicken.
 *
 * Geprüft wird das Verhalten des Feldes, nicht sein Aussehen: dass abgelegte
 * Dateien weitergereicht werden, dass der Browser die Datei nicht selbst
 * öffnet, und dass die Einfärbung beim Darüberziehen stehen bleibt, statt zu
 * flackern.
 */

/*
  Gesucht wird über die Klasse, nicht über die Beschriftung: Die wechselt beim
  Darüberziehen auf „Jetzt loslassen", und der Helfer fände sein Feld dann
  ausgerechnet in dem Zustand nicht mehr, den er prüfen soll.
*/
function feld() {
  return document.querySelector("label.photo-upload") as HTMLLabelElement;
}

function bild(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

function requisiten(ueberschreibung: Partial<Parameters<typeof EingabeExpose>[0]> = {}) {
  return {
    photos: [],
    onPhotoUpload: vi.fn(),
    onPhotoDateien: vi.fn(),
    onSortPhotos: vi.fn(),
    onRemovePhoto: vi.fn(),
    onOpenPreview: vi.fn(),
    ...ueberschreibung,
  };
}

describe("Objektfotos in das Feld ziehen", () => {
  it("reicht die abgelegten Dateien weiter", () => {
    const onPhotoDateien = vi.fn();
    render(<EingabeExpose {...requisiten({ onPhotoDateien })} />);

    fireEvent.drop(feld(), { dataTransfer: { types: ["Files"], files: [bild("haus.png"), bild("kueche.png")] } });

    expect(onPhotoDateien).toHaveBeenCalledTimes(1);
    const uebergeben = onPhotoDateien.mock.calls[0][0] as File[];
    expect(uebergeben.map((datei) => datei.name)).toEqual(["haus.png", "kueche.png"]);
  });

  /*
    Ohne `preventDefault` beim Überfahren nimmt der Browser die Datei selbst an
    und öffnet sie in einem neuen Tab. Die Seite mit der halb fertigen
    Berechnung wäre dann weg.
  */
  it("überlässt die Datei nicht dem Browser", () => {
    render(<EingabeExpose {...requisiten()} />);

    const ueberfahren = fireEvent.dragOver(feld(), { dataTransfer: { types: ["Files"], files: [] } });
    const abgelegt = fireEvent.drop(feld(), { dataTransfer: { types: ["Files"], files: [bild("haus.png")] } });

    // fireEvent gibt false zurück, wenn ein Zuhörer das Ereignis abgefangen hat.
    expect(ueberfahren, "dragover wurde nicht abgefangen").toBe(false);
    expect(abgelegt, "drop wurde nicht abgefangen").toBe(false);
  });

  it("zeigt beim Darüberziehen an, dass hier losgelassen werden darf", () => {
    render(<EingabeExpose {...requisiten()} />);

    fireEvent.dragOver(feld(), { dataTransfer: { types: ["Files"], files: [] } });

    expect(feld().className).toContain("photo-upload-zieht");
    expect(screen.getByText("Jetzt loslassen")).toBeTruthy();
  });

  /*
    `relatedTarget` ist das Element, auf das der Zeiger wechselt. jsdom kennt
    kein `DragEvent` und verwirft die Angabe, wenn sie nur mitgegeben wird,
    deshalb wird sie hier am fertigen Ereignis gesetzt.
  */
  function zeigerWandertAuf(ziel: Node | null) {
    const ereignis = createEvent.dragLeave(feld());
    Object.defineProperty(ereignis, "relatedTarget", { value: ziel });
    fireEvent(feld(), ereignis);
  }

  it("behält die Einfärbung, solange der Zeiger im Feld bleibt", () => {
    render(<EingabeExpose {...requisiten()} />);
    fireEvent.dragOver(feld(), { dataTransfer: { types: ["Files"], files: [] } });

    // Der Zeiger wandert vom Feld auf die Beschriftung darin. `dragleave`
    // feuert dabei, das Feld hat der Nutzer aber nie verlassen.
    zeigerWandertAuf(screen.getByText("Jetzt loslassen"));
    expect(feld().className, "flackert beim Überfahren der Beschriftung").toContain("photo-upload-zieht");

    // Erst außerhalb geht die Einfärbung weg.
    zeigerWandertAuf(document.body);
    expect(feld().className).not.toContain("photo-upload-zieht");
  });
});

/*
  Christian am 22.09.2026: Wer das Titelbild wechseln will, musste bisher alle
  Bilder löschen und in der gewünschten Reihenfolge neu hochladen. Jetzt zieht
  man ein Bild auf die Stelle, an der es stehen soll.
*/
describe("Bilder umsortieren", () => {
  const kacheln = () => Array.from(document.querySelectorAll<HTMLElement>(".photo-grid-input > div"));
  const dreiBilder = ["data:image/png;base64,eins", "data:image/png;base64,zwei", "data:image/png;base64,drei"];

  /** Zieht die Kachel an Position `von` auf die Kachel an Position `nach`. */
  function ziehen(von: number, nach: number) {
    // Ein umsortiertes Bild ist keine Datei vom Schreibtisch, `types` bleibt leer.
    const nutzlast = { dataTransfer: { types: [] as string[], setData: vi.fn(), effectAllowed: "", dropEffect: "" } };
    fireEvent.dragStart(kacheln()[von], nutzlast);
    fireEvent.dragOver(kacheln()[nach], nutzlast);
    fireEvent.drop(kacheln()[nach], nutzlast);
  }

  it("schiebt das gezogene Bild an die Stelle, auf der es landet", () => {
    const onSortPhotos = vi.fn();
    render(<EingabeExpose {...requisiten({ photos: dreiBilder, onSortPhotos })} />);

    // Das dritte Bild soll Titelbild werden.
    ziehen(2, 0);

    expect(onSortPhotos).toHaveBeenCalledWith(2, 0);
  });

  it("tut nichts, wenn ein Bild auf sich selbst fällt", () => {
    const onSortPhotos = vi.fn();
    render(<EingabeExpose {...requisiten({ photos: dreiBilder, onSortPhotos })} />);

    ziehen(1, 1);

    expect(onSortPhotos).not.toHaveBeenCalled();
  });

  /*
    Über dem Hochladefeld können zwei Dinge schweben: eine Datei vom
    Schreibtisch oder ein Bild, das nur umsortiert wird. Färbt sich das Feld
    auch beim Umsortieren ein, verspricht es etwas, das dort nicht passiert.
  */
  it("färbt das Hochladefeld beim Umsortieren nicht ein", () => {
    render(<EingabeExpose {...requisiten({ photos: dreiBilder })} />);

    fireEvent.dragOver(feld(), { dataTransfer: { types: [] as string[] } });

    expect(feld().className).not.toContain("photo-upload-zieht");
  });

  it("zeigt, wo das Bild landen würde", () => {
    render(<EingabeExpose {...requisiten({ photos: dreiBilder })} />);
    const nutzlast = { dataTransfer: { types: [] as string[], setData: vi.fn(), effectAllowed: "", dropEffect: "" } };

    fireEvent.dragStart(kacheln()[2], nutzlast);
    fireEvent.dragOver(kacheln()[0], nutzlast);

    expect(kacheln()[2].className, "das gezogene Bild tritt zurück").toContain("foto-geschoben");
    expect(kacheln()[0].className, "die Zielstelle bekommt einen Rahmen").toContain("foto-ziel");
  });
});
