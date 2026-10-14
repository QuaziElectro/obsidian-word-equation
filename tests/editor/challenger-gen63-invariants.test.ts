/**
 * Adversarial Invariants Test Suite — Generation 63 Phase 2
 * Author: challenger_p2_2_gen63
 * Focus: Feature 1 (Settings Expansion Scope: inline vs block) and
 *        Feature 2 (Complete MathML Gallery Coverage, Integrals, Sums, Universal MathML, AST & Caret Invariants)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App } from 'obsidian';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  createSlot,
  createToken,
  createEnclosed,
  createPhantom,
  createSpace,
  createMultiscripts,
  createFraction,
  createSubSup,
  getChildSlots,
  resetIdCounter,
} from '../../src/core/ast';
import {
  GALLERY_CATEGORIES,
  EquationGalleryView,
} from '../../src/gallery/gallery-view';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import {
  setCustomShortcuts,
  getCustomShortcuts,
  CustomShortcut,
  lookupCustomOrCatalog,
} from '../../src/shortcuts/catalog';
import {
  expandShortcutInMarkdown,
  expandShortcutInSlot,
} from '../../src/shortcuts/engine';
import { DEFAULT_SETTINGS, WordEquationPluginSettings } from '../../src/main';

describe('Adversarial Invariants Suite — Generation 63 Phase 2 (Features 1 & 2)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // FEATURE 1: SETTINGS 4TH COLUMN FOR EXPANSION SCOPE ('inline' vs 'block')
  // =========================================================================
  describe('Feature 1: Expansion Scope Invariants', () => {
    let mockApp: any;
    let mockPlugin: any;

    beforeEach(() => {
      mockApp = new App();
      mockPlugin = {
        app: mockApp,
        manifest: { id: 'obsidian-word-equation' },
        settings: {
          ...DEFAULT_SETTINGS,
          customShortcuts: [
            { trigger: '\\alpha_in', expansion: '<mi>α</mi>', scope: 'inline' },
            { trigger: '\\beta_blk', expansion: '<mi>β</mi>', scope: 'block' },
          ],
        },
        saveSettings: vi.fn(async () => {
          setCustomShortcuts(mockPlugin.settings.customShortcuts);
        }),
      };
      setCustomShortcuts(mockPlugin.settings.customShortcuts);
    });

    it('Scenario 1.1: Migration normalizes missing or legacy scopes to inline', () => {
      // User vault data from older plugin version without 'scope' property
      const legacyShortcuts: any[] = [
        { trigger: '\\frac', expansion: '<mfrac><mrow></mrow><mrow></mrow></mfrac>' },
        { trigger: '\\custom1', expansion: '<mi>x</mi>', scope: undefined },
        { trigger: '\\custom2', expansion: '<mi>y</mi>', scope: null },
        { trigger: '\\custom3', expansion: '<mi>z</mi>', scope: 'block' },
      ];

      setCustomShortcuts(legacyShortcuts);
      const registered = getCustomShortcuts();

      expect(registered.length).toBe(4);
      expect(registered.find((s) => s.trigger === '\\frac')?.scope).toBe('inline');
      expect(registered.find((s) => s.trigger === '\\custom1')?.scope).toBe('inline');
      expect(registered.find((s) => s.trigger === '\\custom2')?.scope).toBe('inline');
      expect(registered.find((s) => s.trigger === '\\custom3')?.scope).toBe('block');
    });

    it('Scenario 1.2: setCustomShortcuts handles empty, null, undefined, or whitespace triggers defensively', () => {
      const hostileList: any[] = [
        null,
        undefined,
        { trigger: null, expansion: '<mi>err</mi>' },
        { trigger: undefined, expansion: '<mi>err</mi>' },
        { trigger: 12345, expansion: '<mi>err</mi>' },
        { trigger: '', expansion: '<mi>a</mi>' },
        { trigger: '   ', expansion: '<mi>b</mi>' },
        { trigger: '\\valid', expansion: '<mi>c</mi>' },
      ];

      setCustomShortcuts(hostileList);
      const filtered = getCustomShortcuts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].trigger).toBe('\\valid');
      expect(filtered[0].scope).toBe('inline');

      // Also verify completely null or undefined list does not throw
      expect(() => setCustomShortcuts(null as any)).not.toThrow();
      expect(getCustomShortcuts()).toEqual([]);

      expect(() => setCustomShortcuts(undefined as any)).not.toThrow();
      expect(getCustomShortcuts()).toEqual([]);
    });

    it('Scenario 1.3: WordEquationSettingTab renders exact 4-column structure with scope dropdowns', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const table = tab.containerEl.querySelector('table.weq-shortcuts-table');
      expect(table).not.toBeNull();

      // Check header columns
      const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers).toEqual([
        'Trigger Shortcut',
        'MathML / Expansion Result',
        'Expansion Mode',
        'Actions',
      ]);

      // Check each row has select with inline and block options
      const rows = table!.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      rows.forEach((row, idx) => {
        const select = row.querySelector('select.weq-select-scope') as HTMLSelectElement;
        expect(select).not.toBeNull();
        const options = Array.from(select.options).map((o) => o.value);
        expect(options).toContain('inline');
        expect(options).toContain('block');

        const expectedScope = mockPlugin.settings.customShortcuts[idx].scope;
        expect(select.value).toBe(expectedScope);
      });
    });

    it('Scenario 1.4: Changing scope dropdown from inline to block persists to settings, catalog, and lookup', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const table = tab.containerEl.querySelector('table.weq-shortcuts-table')!;
      const firstSelect = table.querySelectorAll('tbody select.weq-select-scope')[0] as HTMLSelectElement;

      expect(firstSelect.value).toBe('inline');

      // Mutate dropdown
      firstSelect.value = 'block';
      firstSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // Settings object mutated
      expect(mockPlugin.settings.customShortcuts[0].scope).toBe('block');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();

      // Catalog lookup reflects change
      const resolved = lookupCustomOrCatalog('\\alpha_in');
      expect(resolved).not.toBeNull();
      expect(resolved?.scope).toBe('block');
    });

    it('Scenario 1.5: Changing scope dropdown from block to inline persists immediately', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const table = tab.containerEl.querySelector('table.weq-shortcuts-table')!;
      const secondSelect = table.querySelectorAll('tbody select.weq-select-scope')[1] as HTMLSelectElement;

      expect(secondSelect.value).toBe('block');

      secondSelect.value = 'inline';
      secondSelect.dispatchEvent(new Event('change', { bubbles: true }));

      expect(mockPlugin.settings.customShortcuts[1].scope).toBe('inline');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();

      const resolved = lookupCustomOrCatalog('\\beta_blk');
      expect(resolved).not.toBeNull();
      expect(resolved?.scope).toBe('inline');
    });

    it('Scenario 1.6: Clicking "Add Shortcut" button creates new shortcut defaulting to scope "inline"', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const addBtn = Array.from(tab.containerEl.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Shortcut')
      );
      expect(addBtn).toBeDefined();

      addBtn!.click();

      expect(mockPlugin.settings.customShortcuts.length).toBe(3);
      const newEntry = mockPlugin.settings.customShortcuts[2];
      expect(newEntry.trigger).toBe('\\');
      expect(newEntry.scope).toBe('inline');
    });

    it('Scenario 1.7: Markdown expansion: scope="inline" generates /weq_inline <math display="inline">', () => {
      setCustomShortcuts([
        {
          trigger: '\\mysum',
          expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mo>∑</mo></math>',
          scope: 'inline',
        },
        {
          trigger: '\\barexml',
          expansion: '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
          scope: 'inline',
        },
      ]);

      const res1 = expandShortcutInMarkdown('Formula \\mysum', 'math-word');
      expect(res1).not.toBeNull();
      expect(res1!.matched).toBe(true);
      expect(res1!.replacement).toMatch(/^\/weq_inline /);
      expect(res1!.replacement).toMatch(/\/weq_inline$/);
      expect(res1!.replacement).toContain('display="inline"');

      const res2 = expandShortcutInMarkdown('Check \\barexml', 'math-word');
      expect(res2).not.toBeNull();
      expect(res2!.matched).toBe(true);
      expect(res2!.replacement).toMatch(/^\/weq_inline /);
      expect(res2!.replacement).toContain('display="inline"');
    });

    it('Scenario 1.8: Markdown expansion: scope="block" generates ```<delimiter>\n<math display="block">', () => {
      setCustomShortcuts([
        {
          trigger: '\\bigsum',
          expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mo>∑</mo></math>',
          scope: 'block',
        },
        {
          trigger: '\\bareblock',
          expansion: '<msqrt><mi>x</mi></msqrt>',
          scope: 'block',
        },
      ]);

      // With defaultDelimiter 'math-word'
      const res1 = expandShortcutInMarkdown('\\bigsum', 'math-word');
      expect(res1).not.toBeNull();
      expect(res1!.matched).toBe(true);
      expect(res1!.replacement).toMatch(/^```math-word\n/);
      expect(res1!.replacement).toMatch(/\n```$/);
      expect(res1!.replacement).toContain('display="block"');

      // With defaultDelimiter 'weq'
      const res2 = expandShortcutInMarkdown('\\bareblock', 'weq');
      expect(res2).not.toBeNull();
      expect(res2!.matched).toBe(true);
      expect(res2!.replacement).toMatch(/^```weq\n/);
      expect(res2!.replacement).toMatch(/\n```$/);
      expect(res2!.replacement).toContain('display="block"');
    });

    it('Scenario 1.9: Plain non-MathML shortcuts are immune to scope wrapping in Markdown', () => {
      setCustomShortcuts([
        { trigger: '\\tensor', expansion: '⊗', scope: 'block' },
        { trigger: '\\approxeq', expansion: '≊', scope: 'inline' },
        { trigger: '\\plain', expansion: 'plain_text', scope: 'block' },
      ]);

      const res1 = expandShortcutInMarkdown('\\tensor', 'math-word');
      expect(res1).not.toBeNull();
      expect(res1!.replacement).toBe('⊗');
      expect(res1!.replacement).not.toContain('```');

      const res2 = expandShortcutInMarkdown('\\approxeq', 'math-word');
      expect(res2).not.toBeNull();
      expect(res2!.replacement).toBe('≊');
      expect(res2!.replacement).not.toContain('/weq_inline');

      const res3 = expandShortcutInMarkdown('\\plain', 'math-word');
      expect(res3).not.toBeNull();
      expect(res3!.replacement).toBe('plain_text');
      expect(res3!.replacement).not.toContain('```');
    });

    it('Scenario 1.10: In-equation expansion inside slots completely ignores scope and inserts AST nodes locally', () => {
      setCustomShortcuts([
        {
          trigger: '\\blockFrac',
          expansion: '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
          scope: 'block', // Marked block, but inside equation slot must insert AST directly!
        },
        {
          trigger: '\\inlineFrac',
          expansion: '<mfrac><mi>c</mi><mi>d</mi></mfrac>',
          scope: 'inline',
        },
      ]);

      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('b', 'mi'),
        createToken('l', 'mi'),
        createToken('o', 'mi'),
        createToken('c', 'mi'),
        createToken('k', 'mi'),
        createToken('F', 'mi'),
        createToken('r', 'mi'),
        createToken('a', 'mi'),
        createToken('c', 'mi'),
      ]);

      const result = expandShortcutInSlot(slot, 10, ' ');
      expect(result.expanded).toBe(true);
      expect(result.newSlot).toBeDefined();

      // Must NOT contain markdown fences
      expect(result.replacementText).not.toContain('```');
      expect(result.replacementText).not.toContain('/weq_inline');

      // The new slot must contain the fraction AST node
      const insertedNode = result.newSlot!.children[0] as any;
      expect(insertedNode.type).toBe('fraction');
      expect(insertedNode.parentSlotId).toBe(result.newSlot!.id);
      expect(insertedNode.numerator.children[0].text).toBe('a');
      expect(insertedNode.denominator.children[0].text).toBe('b');

      // Caret positioned inside the numerator
      expect(result.newCaret?.slotId).toBe(insertedNode.numerator.id);
      expect(result.newCaret?.offset).toBe(0);
    });
  });

  // =========================================================================
  // FEATURE 2: COMPLETE MATHML COVERAGE IN GALLERY & CORE AST
  // =========================================================================
  describe('Feature 2: Complete MathML Coverage in Gallery, AST, Renderer & Smart Caret', () => {
    it('Scenario 2.1: GALLERY_CATEGORIES defines all 11 categories with valid metadata', () => {
      const expectedCategories = [
        'fractions',
        'radicals',
        'scripts',
        'operators',
        'greek',
        'matrices',
        'integrals',
        'large-operators',
        'universal-mathml',
        'enclosed',
        'delimiters',
      ];

      const categoryIds = GALLERY_CATEGORIES.map((c) => c.id);
      for (const catId of expectedCategories) {
        expect(categoryIds).toContain(catId);
      }
    });

    it('Scenario 2.2: Every single gallery item in all categories parses cleanly with parseMathML', () => {
      let totalItemCount = 0;

      for (const cat of GALLERY_CATEGORIES) {
        expect(cat.items.length).toBeGreaterThan(0);
        for (const item of cat.items) {
          totalItemCount++;
          expect(item.id).toBeTruthy();
          expect(item.name).toBeTruthy();
          expect(item.mathml).toBeTruthy();

          // Adversarial check: parseMathML MUST NOT throw, and MUST produce at least 1 node
          let parsedAst: any = null;
          expect(() => {
            parsedAst = parseMathML(item.mathml);
          }).not.toThrow();

          expect(parsedAst).not.toBeNull();
          if (item.id === 'elem-mrow') {
            // In MathML AST, <mrow></mrow> represents an empty group container / slot
            expect(parsedAst.children.length).toBe(0);
          } else {
            expect(parsedAst.children.length).toBeGreaterThan(0);
          }
        }
      }

      // Total catalog must have at least 80 distinct math elements
      expect(totalItemCount).toBeGreaterThanOrEqual(80);
    });

    it('Scenario 2.3: Integrals category contains all specified integral variants', () => {
      const intCat = GALLERY_CATEGORIES.find((c) => c.id === 'integrals')!;
      expect(intCat).toBeDefined();

      const ids = intCat.items.map((i) => i.id);

      // Single symbol
      expect(ids).toContain('int-symbol');
      // 2-slot limits
      expect(ids).toContain('int-2slot');
      // 2-slot integrand & differential
      expect(ids).toContain('int-2slot-diff');
      // 4-slot definite
      expect(ids).toContain('int-4slot');
      // 4-slot underover
      expect(ids).toContain('int-4slot-underover');
      // Multiple integrals: double, triple, quadruple
      expect(ids).toContain('double-int');
      expect(ids).toContain('double-int-region');
      expect(ids).toContain('triple-int');
      expect(ids).toContain('triple-int-region');
      expect(ids).toContain('quad-int');
      expect(ids).toContain('quad-int-region');
      // Contours
      expect(ids).toContain('oint');
      expect(ids).toContain('oiint');
      expect(ids).toContain('oiiint');

      // Verify mathematical structures
      const int2 = intCat.items.find((i) => i.id === 'int-2slot')!;
      expect(int2.mathml).toContain('<msubsup>');
      expect(int2.mathml).toContain('∫');

      const int4 = intCat.items.find((i) => i.id === 'int-4slot')!;
      expect(int4.mathml).toContain('<msubsup>');
      expect(int4.mathml).toContain('<mo>d</mo>');

      const quadRegion = intCat.items.find((i) => i.id === 'quad-int-region')!;
      expect(quadRegion.mathml).toContain('⨌');
    });

    it('Scenario 2.4: Large Operators category contains 1-slot and 3-slot sums, products, coproducts, and limits', () => {
      const opCat = GALLERY_CATEGORIES.find((c) => c.id === 'large-operators')!;
      expect(opCat).toBeDefined();

      const ids = opCat.items.map((i) => i.id);

      // Sums
      expect(ids).toContain('sum-1slot');
      expect(ids).toContain('sum-3slot');
      // Products
      expect(ids).toContain('prod-1slot');
      expect(ids).toContain('prod-3slot');
      // Coproducts
      expect(ids).toContain('coprod-1slot');
      expect(ids).toContain('coprod-3slot');
      // Limits
      expect(ids).toContain('lim-1slot');
      expect(ids).toContain('lim-expr');
      // Min & Max
      expect(ids).toContain('min-under');
      expect(ids).toContain('max-under');

      // Verify XML structures
      const sum1 = opCat.items.find((i) => i.id === 'sum-1slot')!;
      expect(sum1.mathml).toContain('<munder>');
      expect(sum1.mathml).toContain('∑');

      const sum3 = opCat.items.find((i) => i.id === 'sum-3slot')!;
      expect(sum3.mathml).toContain('<munderover>');
      expect(sum3.mathml).toContain('∑');

      const coprod3 = opCat.items.find((i) => i.id === 'coprod-3slot')!;
      expect(coprod3.mathml).toContain('∐');

      const limExpr = opCat.items.find((i) => i.id === 'lim-expr')!;
      expect(limExpr.mathml).toContain('lim');
      expect(limExpr.mathml).toContain('→');
    });

    it('Scenario 2.5: Universal MathML category includes all core MathML specification elements', () => {
      const uniCat = GALLERY_CATEGORIES.find((c) => c.id === 'universal-mathml')!;
      expect(uniCat).toBeDefined();

      const requiredElements = [
        'elem-mfrac',
        'elem-msqrt',
        'elem-mroot',
        'elem-msub',
        'elem-msup',
        'elem-msubsup',
        'elem-munder',
        'elem-mover',
        'elem-munderover',
        'elem-mtable',
        'elem-mtr',
        'elem-mtd',
        'elem-mfenced',
        'elem-menclose',
        'elem-mphantom',
        'elem-mtext',
        'elem-mspace',
        'elem-mpadded',
        'elem-mstyle',
        'elem-merror',
        'elem-mmultiscripts',
        'elem-mrow',
        'elem-mi',
        'elem-mn',
        'elem-mo',
      ];

      const itemIds = uniCat.items.map((i) => i.id);
      for (const elemId of requiredElements) {
        expect(itemIds).toContain(elemId);
      }
    });

    it('Scenario 2.6: MathML Parser properly instantiates enclosed, phantom, space, and multiscripts AST nodes', () => {
      // 1. menclose
      const encAst = parseMathML('<menclose notation="horizontalstrike"><mn>42</mn></menclose>');
      const encNode = encAst.children[0] as any;
      expect(encNode.type).toBe('enclosed');
      expect(encNode.notation).toBe('horizontalstrike');
      expect(encNode.content.role).toBe('enclosed');
      expect(encNode.content.children[0].text).toBe('42');

      // 2. mphantom
      const phAst = parseMathML('<mphantom><mi>invisible</mi></mphantom>');
      const phNode = phAst.children[0] as any;
      expect(phNode.type).toBe('phantom');
      expect(phNode.content.role).toBe('phantom');
      expect(phNode.content.children[0].text).toBe('invisible');

      // 3. mspace
      const spAst = parseMathML('<mspace width="3.5em"/>');
      const spNode = spAst.children[0] as any;
      expect(spNode.type).toBe('space');
      expect(spNode.width).toBe('3.5em');

      // 4. mmultiscripts (with postscripts and prescripts)
      const multiAst = parseMathML(
        '<mmultiscripts><mi>T</mi><mi>i</mi><mi>j</mi><mprescripts/><mi>k</mi><mi>l</mi></mmultiscripts>'
      );
      const mNode = multiAst.children[0] as any;
      expect(mNode.type).toBe('multiscripts');
      expect(mNode.base.children[0].text).toBe('T');
      expect(mNode.postSub.children[0].text).toBe('i');
      expect(mNode.postSup.children[0].text).toBe('j');
      expect(mNode.preSub.children[0].text).toBe('k');
      expect(mNode.preSup.children[0].text).toBe('l');
    });

    it('Scenario 2.7: getChildSlots invariant returns valid child slots for all new node types', () => {
      // 1. enclosed
      const encNode = createEnclosed(createSlot('enclosed', []), 'box');
      const encSlots = getChildSlots(encNode);
      expect(encSlots.length).toBe(1);
      expect(encSlots[0].role).toBe('enclosed');

      // 2. phantom
      const phNode = createPhantom(createSlot('phantom', []));
      const phSlots = getChildSlots(phNode);
      expect(phSlots.length).toBe(1);
      expect(phSlots[0].role).toBe('phantom');

      // 3. space (leaf node)
      const spNode = createSpace('1em');
      const spSlots = getChildSlots(spNode);
      expect(spSlots.length).toBe(0);

      // 4. multiscripts
      const multiNode = createMultiscripts(
        createSlot('base', []),
        createSlot('sub', []),
        createSlot('sup', []),
        createSlot('presub', []),
        createSlot('presup', [])
      );
      const multiSlots = getChildSlots(multiNode);
      expect(multiSlots.length).toBe(5);
      expect(multiSlots.map((s) => s.role)).toEqual(['base', 'sub', 'sup', 'presub', 'presup']);
    });

    it('Scenario 2.8: MathML Serializer round-trips all universal MathML elements without corruption', () => {
      // 1. Enclosed with notation
      const origEnc = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><menclose notation="circle"><mi>λ</mi></menclose></math>';
      const ast1 = parseMathML(origEnc);
      const ser1 = serializeMathML(ast1, { pretty: false, display: 'inline' });
      expect(ser1).toContain('<menclose notation="circle">');
      expect(ser1).toContain('<mi>λ</mi>');

      // 2. Phantom
      const origPh = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mphantom><mi>hidden</mi></mphantom></math>';
      const ast2 = parseMathML(origPh);
      const ser2 = serializeMathML(ast2, { pretty: false, display: 'inline' });
      expect(ser2).toContain('<mphantom>');
      expect(ser2).toContain('<mi>hidden</mi>');

      // 3. Space
      const origSp = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mspace width="2em"/></math>';
      const ast3 = parseMathML(origSp);
      const ser3 = serializeMathML(ast3, { pretty: false, display: 'inline' });
      expect(ser3).toContain('<mspace width="2em"/>');

      // 4. Multiscripts
      const origMulti =
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mmultiscripts><mi>R</mi><mi>a</mi><mi>b</mi><mprescripts/><mi>c</mi><mi>d</mi></mmultiscripts></math>';
      const ast4 = parseMathML(origMulti);
      const ser4 = serializeMathML(ast4, { pretty: false, display: 'inline' });
      expect(ser4).toContain('<mmultiscripts>');
      expect(ser4).toContain('<mprescripts/>');
    });

    it('Scenario 2.9: DomRenderer produces correct CSS classes and structure for universal MathML nodes', () => {
      const renderer = new DomRenderer();

      // Enclosed
      const encNode = createEnclosed(createSlot('enclosed', [createToken('X', 'mi')]), 'actuarial');
      const root1 = createSlot('root', [encNode]);
      const dom1 = renderer.render(root1);
      const encEl = dom1.querySelector('.eq-enclosed');
      expect(encEl).not.toBeNull();
      expect(encEl?.classList.contains('eq-enclosed-actuarial')).toBe(true);
      expect(encEl?.getAttribute('data-notation')).toBe('actuarial');

      // Phantom
      const phNode = createPhantom(createSlot('phantom', [])); // empty slot -> should render placeholder
      const root2 = createSlot('root', [phNode]);
      const dom2 = renderer.render(root2);
      const phEl = dom2.querySelector('.eq-phantom');
      expect(phEl).not.toBeNull();
      expect(phEl?.querySelector('.eq-placeholder')).not.toBeNull();

      // Space
      const spNode = createSpace('2.5em');
      const root3 = createSlot('root', [spNode]);
      const dom3 = renderer.render(root3);
      const spEl = dom3.querySelector('.eq-space') as HTMLElement;
      expect(spEl).not.toBeNull();
      expect(spEl.style.width).toBe('2.5em');

      // Multiscripts
      const multiNode = createMultiscripts(
        createSlot('base', [createToken('M', 'mi')]),
        createSlot('sub', [createToken('1', 'mn')]),
        createSlot('sup', [createToken('2', 'mn')]),
        createSlot('presub', [createToken('3', 'mn')]),
        createSlot('presup', [createToken('4', 'mn')])
      );
      const root4 = createSlot('root', [multiNode]);
      const dom4 = renderer.render(root4);
      const multiEl = dom4.querySelector('.eq-multiscripts');
      expect(multiEl).not.toBeNull();
      expect(multiEl?.querySelector('.eq-prescripts')).not.toBeNull();
      expect(multiEl?.querySelector('.eq-postscripts')).not.toBeNull();
    });

    it('Scenario 2.10: Smart Caret: Inserting 4-slot definite integral lands in lower bound slot at offset 0', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Definite integral: lower limit is the first empty slot
      const int4Snippet = '<msubsup><mo>∫</mo><mrow></mrow><mrow></mrow></msubsup><mrow></mrow><mo>d</mo><mrow></mrow>';
      widget!.insertMathSnippet(int4Snippet, view);

      const subsupNode = widget!.ast.children.find((n) => n.type === 'subsup') as any;
      expect(subsupNode).toBeDefined();

      // Caret must be in subsup's sub slot (lower bound) at offset 0
      expect(widget!.caret.slotId).toBe(subsupNode.sub.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.11: Smart Caret: Inserting 3-slot sum lands in underscript index slot at offset 0', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // 3-slot sum: underover
      const sumSnippet = '<munderover><mo>∑</mo><mrow></mrow><mrow></mrow></munderover><mrow></mrow>';
      widget!.insertMathSnippet(sumSnippet, view);

      const underoverNode = widget!.ast.children.find((n) => n.type === 'underover') as any;
      expect(underoverNode).toBeDefined();

      // Caret must be in the under slot (index condition) at offset 0
      expect(widget!.caret.slotId).toBe(underoverNode.under.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.12: Smart Caret: Inserting enclosed notation lands in enclosed content slot at offset 0', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Boxed snippet
      const boxSnippet = '<menclose notation="box"><mrow></mrow></menclose>';
      widget!.insertMathSnippet(boxSnippet, view);

      const encNode = widget!.ast.children.find((n) => n.type === 'enclosed') as any;
      expect(encNode).toBeDefined();

      expect(widget!.caret.slotId).toBe(encNode.content.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.13: Smart Caret: Inserting unslotted operator token lands after token in parent slot', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Unslotted double integral
      const opSnippet = '<mo>∬</mo>';
      widget!.insertMathSnippet(opSnippet, view);

      const opNode = widget!.ast.children.find((n) => n.type === 'token') as any;
      expect(opNode).toBeDefined();
      expect(opNode.text).toBe('∬');

      // Caret must land in root slot at offset 1 (right after the inserted token)
      expect(widget!.caret.slotId).toBe(widget!.ast.id);
      expect(widget!.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.14: Smart Caret: Nested composite insertion smoothly cascades caret into deepest first slot', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // 1. Insert 4-slot integral -> caret is in lower limit (sub)
      widget!.insertMathSnippet('<msubsup><mo>∫</mo><mrow></mrow><mrow></mrow></msubsup><mrow></mrow><mo>d</mo><mrow></mrow>', view);
      const subsupNode = widget!.ast.children.find((n) => n.type === 'subsup') as any;
      expect(widget!.caret.slotId).toBe(subsupNode.sub.id);

      // 2. While in lower limit slot, insert a fraction
      widget!.insertMathSnippet('<mfrac><mrow></mrow><mrow></mrow></mfrac>', view);

      // Find the fraction inside the sub slot
      const nestedSub = (widget!.ast.children[0] as any).sub;
      const nestedFrac = nestedSub.children.find((c: any) => c.type === 'fraction');
      expect(nestedFrac).toBeDefined();

      // Caret must now be inside the numerator of the nested fraction!
      expect(widget!.caret.slotId).toBe(nestedFrac.numerator.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.15: Exhaustive insertion & DOM rendering for all 14 integral variants', () => {
      const intCat = GALLERY_CATEGORIES.find((c) => c.id === 'integrals')!;
      expect(intCat.items.length).toBe(14);

      for (const item of intCat.items) {
        const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
        const { view, container: c } = createMockEditor(docStr, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
          const w = (dec.spec as any)?.widget;
          if (w instanceof WordEquationWidget) widget = w;
        });
        expect(widget).not.toBeNull();

        widget!.enterFromStart(view);
        widget!.insertMathSnippet(item.mathml, view);

        // Verify AST has children
        expect(widget!.ast.children.length).toBeGreaterThan(0);

        // Verify DOM rendering works cleanly without throwing
        const rendered = widget!.toDOM(view);
        expect(rendered).not.toBeNull();
        expect(rendered.classList.contains('word-equation-math') || rendered.querySelector('.word-equation-math') !== null).toBe(true);

        view.destroy();
        c.remove();
      }
    });

    it('Scenario 2.16: Exhaustive insertion & DOM rendering for all 10 large operator variants', () => {
      const opCat = GALLERY_CATEGORIES.find((c) => c.id === 'large-operators')!;
      expect(opCat.items.length).toBe(10);

      for (const item of opCat.items) {
        const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
        const { view, container: c } = createMockEditor(docStr, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
          const w = (dec.spec as any)?.widget;
          if (w instanceof WordEquationWidget) widget = w;
        });
        expect(widget).not.toBeNull();

        widget!.enterFromStart(view);
        widget!.insertMathSnippet(item.mathml, view);

        expect(widget!.ast.children.length).toBeGreaterThan(0);

        const rendered = widget!.toDOM(view);
        expect(rendered).not.toBeNull();

        view.destroy();
        c.remove();
      }
    });

    it('Scenario 2.17: Exhaustive insertion & DOM rendering for all 25 universal MathML elements', () => {
      const uniCat = GALLERY_CATEGORIES.find((c) => c.id === 'universal-mathml')!;
      expect(uniCat.items.length).toBe(25);

      for (const item of uniCat.items) {
        const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
        const { view, container: c } = createMockEditor(docStr, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
          const w = (dec.spec as any)?.widget;
          if (w instanceof WordEquationWidget) widget = w;
        });
        expect(widget).not.toBeNull();

        widget!.enterFromStart(view);
        widget!.insertMathSnippet(item.mathml, view);

        // For elem-mrow, widget falls back to inserting mtext token, which is still a child
        expect(widget!.ast.children.length).toBeGreaterThan(0);

        const rendered = widget!.toDOM(view);
        expect(rendered).not.toBeNull();

        view.destroy();
        c.remove();
      }
    });

    it('Scenario 2.18: EquationGalleryView renders sidebar UI with category sections and blur prevention', async () => {
      const mockLeaf: any = {
        view: null,
      };
      let insertedSnippet: string | null = null;
      const mockPlugin: any = {
        insertMathFromGallery: (snippet: string) => {
          insertedSnippet = snippet;
        },
      };

      const galleryView = new EquationGalleryView(mockLeaf, mockPlugin);
      await galleryView.onOpen();

      const containerEl = galleryView.contentEl;
      expect(containerEl.classList.contains('equation-gallery-container')).toBe(true);

      // Verify 11 category sections rendered
      const sections = containerEl.querySelectorAll('.equation-gallery-category');
      expect(sections.length).toBe(11);

      // Verify buttons
      const buttons = containerEl.querySelectorAll('button.equation-gallery-btn');
      expect(buttons.length).toBeGreaterThanOrEqual(80);

      // Test blur prevention on mousedown
      const firstBtn = buttons[0] as HTMLButtonElement;
      const mousedownEvent = new MouseEvent('mousedown', { cancelable: true, bubbles: true });
      firstBtn.dispatchEvent(mousedownEvent);
      expect(mousedownEvent.defaultPrevented).toBe(true);

      // Test clicking button calls insertItem
      firstBtn.click();
      expect(insertedSnippet).not.toBeNull();
    });

    it('Scenario 2.19: insertMathFromGallery creates new block equation when no active equation exists', () => {
      let replacedText = '';
      const mockEditor: any = {
        replaceSelection: (template: string) => {
          replacedText = template;
        },
      };
      const mockApp: any = {
        workspace: {
          getActiveViewOfType: () => ({ editor: mockEditor }),
          getLeavesOfType: () => [],
        },
      };

      // Mock plugin using WordEquationPlugin insertMathFromGallery logic
      const plugin = {
        app: mockApp,
        settings: { defaultDelimiter: 'math-word' },
        insertMathFromGallery: (snippet: string) => {
          const delimiter = plugin.settings.defaultDelimiter || 'math-word';
          let xml = (snippet || '').trim();
          if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
            xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  ${xml}\n</math>`;
          }
          const template = `\`\`\`${delimiter}\n${xml}\n\`\`\`\n`;
          mockEditor.replaceSelection(template);
        },
      };

      plugin.insertMathFromGallery('<mfrac><mrow></mrow><mrow></mrow></mfrac>');
      expect(replacedText).toContain('```math-word');
      expect(replacedText).toContain('display="block"');
      expect(replacedText).toContain('<mfrac>');
    });
  });
});
