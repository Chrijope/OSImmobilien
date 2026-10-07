import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { YoutubeNachKlick } from "./YoutubeNachKlick";

describe("YouTube auf der News-Seite (Datenschutz, Punkt 12)", () => {
  it("lädt ohne Klick nichts von Google", () => {
    const { container } = render(<YoutubeNachKlick videoId="dQw4w9WgXcQ" titel="Einführung" />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Video laden/ })).toBeInTheDocument();
  });

  it("lädt nach dem Klick über youtube-nocookie.com", () => {
    const { container } = render(<YoutubeNachKlick videoId="dQw4w9WgXcQ" titel="Einführung" />);
    fireEvent.click(screen.getByRole("button", { name: /Video laden/ }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1");
    expect(iframe?.getAttribute("title")).toBe("Einführung");
  });

  it("die News-Seite bettet YouTube nirgends mehr direkt ein", () => {
    const seite = readFileSync("src/pages/News.tsx", "utf8");
    expect(seite).not.toContain("youtube.com/embed");
    expect(seite).toContain("<YoutubeNachKlick");
  });
});
