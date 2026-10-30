import { describe, expect, it } from "vitest";
import { waagerechtesRad } from "./pipelineRollen";

const rad = (deltaX: number, deltaY: number, shiftKey = false, deltaMode = 0) => ({ deltaX, deltaY, shiftKey, deltaMode });
const liste = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 });

describe("waagerechtesRad", () => {
  it("schiebt in beide Richtungen, auch nach links", () => {
    expect(waagerechtesRad(rad(30, 2), null)).toBe(30);
    expect(waagerechtesRad(rad(-30, 2), null)).toBe(-30);
  });
  it("Shift mit Mausrad schiebt waagerecht", () => {
    expect(waagerechtesRad(rad(0, -40, true), liste(100))).toBe(-40);
  });
  it("lässt die Kartenliste senkrecht rollen, solange sie kann", () => {
    expect(waagerechtesRad(rad(0, 40), liste(100))).toBe(0);
    expect(waagerechtesRad(rad(0, -40), liste(100))).toBe(0);
  });
  it("schiebt das Board, wenn die Liste am Ende ist oder fehlt", () => {
    expect(waagerechtesRad(rad(0, 40), liste(600))).toBe(40);
    expect(waagerechtesRad(rad(0, -40), liste(0))).toBe(-40);
    expect(waagerechtesRad(rad(0, -3, false, 1), null)).toBe(-48);
  });
});
