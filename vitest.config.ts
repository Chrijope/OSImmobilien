import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Kopien, die ein Dateisync bei gleichzeitigem Schreiben anlegt ("Datei 2.ts").
    // Sie werden nirgends importiert und sind inhaltlich ältere Stände. Liefen sie
    // mit, gäbe ein grüner Lauf falsche Sicherheit: Er hätte eine Fassung geprüft,
    // die niemand benutzt.
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/* [23].{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
