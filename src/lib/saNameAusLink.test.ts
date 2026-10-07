import { describe, expect, it } from "vitest";
import { nameAusLink } from "./saNameAusLink";

describe("nameAusLink", () => {
  it("nimmt Vor- und Nachname getrennt aus der Vorbelegung, auch bei Doppelnamen", () => {
    expect(nameAusLink({ vorname: "Anna Maria", nachname: "Müller" }, "Anna Maria Müller")).toEqual({ vorname: "Anna Maria", nachname: "Müller" });
    expect(nameAusLink({ vorname: "Hans", nachname: "von der Heide" }, "Hans von der Heide")).toEqual({ vorname: "Hans", nachname: "von der Heide" });
  });

  it("zerlegt den Anzeigenamen nie, wenn er mehr als zwei Wörter hat", () => {
    expect(nameAusLink({}, "Anna Maria Müller")).toEqual({ vorname: "", nachname: "" });
    expect(nameAusLink(null, "Anna Maria Müller")).toEqual({ vorname: "", nachname: "" });
  });

  it("alter Link mit genau einem Wort je Teil: eindeutig, wird übernommen", () => {
    expect(nameAusLink({}, " Anna  Müller ")).toEqual({ vorname: "Anna", nachname: "Müller" });
  });

  it("leere Namensfelder im Entwurf zählen nicht als Angabe", () => {
    expect(nameAusLink({ vorname: "", nachname: " " }, "Anna Müller")).toEqual({ vorname: "Anna", nachname: "Müller" });
    expect(nameAusLink({ vorname: "", nachname: "" }, "Anna Maria Müller")).toEqual({ vorname: "", nachname: "" });
  });

  it("ohne Namen bleibt alles leer", () => {
    expect(nameAusLink(undefined, "")).toEqual({ vorname: "", nachname: "" });
    expect(nameAusLink(undefined, "Anna")).toEqual({ vorname: "", nachname: "" });
  });
});
