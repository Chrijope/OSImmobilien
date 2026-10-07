import { hoechstesInvestment, investmentFuerNaechstenSchritt } from "./hoechstesInvestment";

it("nimmt Investment 2 statt Investment 1", () => {
  expect(hoechstesInvestment([{ nummer: 1 }, { nummer: 2 }])?.nummer).toBe(2);
});
it("nimmt die höchste Nummer auch bei unsortierten oder lückenhaften Investments", () => {
  const investments = Object.freeze([{ nummer: 4, pipelineStufe: "selbstauskunft" }, { nummer: 1, pipelineStufe: "notar" }, { nummer: 3, pipelineStufe: "finanzierung" }]);
  expect(hoechstesInvestment(investments)).toBe(investments[0]);
});
it("zeigt ohne Investment keinen kundenweiten Ersatzschritt", () => {
  expect(hoechstesInvestment([])).toBeUndefined();
});

it("folgt dem geöffneten Investment und fällt sonst auf die höchste Nummer zurück", () => {
  const investments = [{ id: "eins", nummer: 1 }, { id: "drei", nummer: 3 }, { id: "vier", nummer: 4 }];
  expect(investmentFuerNaechstenSchritt(investments, "drei")).toBe(investments[1]);
  expect(investmentFuerNaechstenSchritt(investments, "eins")).toBe(investments[0]);
  expect(investmentFuerNaechstenSchritt(investments)).toBe(investments[2]);
  expect(investmentFuerNaechstenSchritt(investments, "entfernt")).toBe(investments[2]);
});
