import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ohneLiquidGlasInKopie } from '../lib/designSchalter';

const css = readFileSync(resolve(__dirname, 'design-studio.css'), 'utf8');
const ast = postcss.parse(css);

describe('Lokaler CRM-Entwurf erhält Inhalte und Exportansichten', () => {
  it('isoliert jede Regel auf Vorschau und Liquid Glass, ausschließlich am Bildschirm', () => {
    ast.walkRules(rule => {
      expect(rule.selector).toContain('[data-crm-design="studio"][data-glas="liquid"]');
      let parent = rule.parent;
      let screen = false;
      while (parent) {
        if (parent.type === 'atrule' && parent.name === 'media' && parent.params === 'screen') screen = true;
        parent = parent.parent;
      }
      expect(screen, rule.selector).toBe(true);
    });
  });

  it('blendet nichts aus, kürzt keine Inhalte und erhält die Bedienbarkeit', () => {
    const verboten = /^(visibility|opacity|content|content-visibility|overflow.*|clip.*|.*line-clamp|text-overflow|pointer-events|position|inset|top|left|right|bottom|order|transform|zoom)$/;
    ast.walkDecls(decl => {
      if (decl.prop === 'display') expect(decl.value).not.toBe('none');
      if (!decl.prop.startsWith('--')) expect(decl.prop, decl.toString()).not.toMatch(verboten);
    });
  });

  it('schaltet die neue Schicht auch in einer html2canvas-Kopie aus', () => {
    const kopie = document.implementation.createHTMLDocument();
    kopie.documentElement.dataset.crmDesign = 'studio';
    kopie.documentElement.dataset.glas = 'liquid';
    ohneLiquidGlasInKopie(kopie);
    expect(kopie.documentElement.matches('[data-crm-design="studio"][data-glas="liquid"]')).toBe(false);
  });
});
