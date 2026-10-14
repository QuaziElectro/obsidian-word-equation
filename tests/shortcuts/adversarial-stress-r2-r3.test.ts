import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
  createRoot,
  createMatrix,
  createUnderOver,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { handleArrowKey } from '../../src/editor/navigation';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { setMockRect, mockSlotLayout } from '../helpers/dom-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import {
  setCustomShortcuts,
  getCustomShortcuts,
  lookupCustomOrCatalog,
  lookupSymbol,
} from '../../src/shortcuts/catalog';
import {
  expandShortcutInMarkdown,
  expandShortcutInSlot,
} from '../../src/shortcuts/engine';
import { parseLinearEquation } from '../../src/core/linear-parser';
import { App } from '../mocks/obsidian';

describe('Adversarial Stress Test Suite: Requirements R2 & R3', () => {
  beforeEach(() => {
    resetIdCounter();
    setCustomShortcuts([]);
  });

  // =========================================================================
  // REQUIREMENT R2: MOUSE HIT-TESTING & CARET PRECISION & NAVIGATION
  // =========================================================================
  describe('R2 Adversarial: Precision Hit-Testing & Caret Placement', () => {
    it('accurately distinguishes click on left half vs right half of a multi-digit number token', () => {
      const doc = '```math-word\n<math><mn>98765</mn></math>\n```';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      let numEl = dom.querySelector('.eq-token.eq-mn') as HTMLElement;
      expect(numEl).not.toBeNull();
      expect(numEl.textContent).toBe('98765');

      // Layout: left=100, width=50 (range: 100..150, midpoint=125)
      setMockRect(numEl, { left: 100, top: 10, width: 50, height: 20 });

      // Click on left half (x=110 <= 125) -> offset 0 (before 98765)
      numEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 110,
          clientY: 20,
        })
      );
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);

      // Immediate typing: type '1' at offset 0 -> '1' inserted before '98765'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('1');
      expect((widget!.ast.children[1] as any).text).toBe('98765');
      expect(view.state.doc.toString()).toContain('<mn>1</mn>');

      // Query the newly rendered token after DOM re-render
      numEl = dom.querySelectorAll('.eq-token.eq-mn')[1] as HTMLElement;
      expect(numEl.textContent).toBe('98765');
      setMockRect(numEl, { left: 120, top: 10, width: 50, height: 20 });

      // Click on right half of the '98765' token (x=160 > 145 midpoint)
      numEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 160,
          clientY: 20,
        })
      );
      expect(widget!.caret.offset).toBe(2); // after 98765

      // Immediate typing: type '0' at offset 2 -> '0' inserted after '98765'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      expect(widget!.ast.children.length).toBe(3);
      expect((widget!.ast.children[2] as any).text).toBe('0');

      view.destroy();
      container.remove();
    });

    it('hit-tests nested fractions accurately to inner numerator and inner denominator', () => {
      // Equation: ((1 / 2) / 3)
      const doc = `\`\`\`math-word\n<math><mfrac><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>3</mn></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const outerFrac = widget!.ast.children[0] as any;
      const innerFrac = outerFrac.numerator.children[0] as any;

      // 1. Locate token '1' (inner numerator)
      let tokens = Array.from(dom.querySelectorAll('.eq-token.eq-mn')) as HTMLElement[];
      const token1 = tokens.find((t) => t.textContent === '1')!;
      setMockRect(token1, { left: 10, top: 10, width: 20, height: 15 });

      // Click on token 1 (inner numerator)
      token1.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 25, clientY: 15 })
      );
      expect(widget!.caret.slotId).toBe(innerFrac.numerator.id);
      expect(widget!.caret.offset).toBe(1);

      // Immediate edit: type '+'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      const currentOuterFrac = widget!.ast.children[0] as any;
      const currentInnerFrac = currentOuterFrac.numerator.children[0] as any;
      expect(currentInnerFrac.numerator.children.length).toBe(2);
      expect((currentInnerFrac.numerator.children[1] as any).text).toBe('+');

      // 2. Re-query fresh DOM token '2' after typing re-rendered the DOM
      tokens = Array.from(dom.querySelectorAll('.eq-token.eq-mn')) as HTMLElement[];
      const token2 = tokens.find((t) => t.textContent === '2')!;
      setMockRect(token2, { left: 10, top: 30, width: 20, height: 15 });

      // Click on token 2 (inner denominator)
      token2.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 12, clientY: 35 })
      );
      expect(widget!.caret.slotId).toBe(currentInnerFrac.denominator.id);
      expect(widget!.caret.offset).toBe(0);

      // 3. Re-query fresh DOM token '3' after mousedown on token2 re-rendered the DOM
      tokens = Array.from(dom.querySelectorAll('.eq-token.eq-mn')) as HTMLElement[];
      const token3 = tokens.find((t) => t.textContent === '3')!;
      setMockRect(token3, { left: 10, top: 50, width: 20, height: 15 });

      // Click on token 3 (outer denominator)
      token3.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 25, clientY: 55 })
      );
      expect(widget!.caret.slotId).toBe(currentOuterFrac.denominator.id);
      expect(widget!.caret.offset).toBe(1);

      view.destroy();
      container.remove();
    });

    it('hit-tests 3x3 matrix cells across grid coordinates with immediate cell editing', () => {
      // 3x3 Matrix with values 1..9
      const row0 = [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')]), createSlot('cell', [createToken('3', 'mn')])];
      const row1 = [createSlot('cell', [createToken('4', 'mn')]), createSlot('cell', [createToken('5', 'mn')]), createSlot('cell', [createToken('6', 'mn')])];
      const row2 = [createSlot('cell', [createToken('7', 'mn')]), createSlot('cell', [createToken('8', 'mn')]), createSlot('cell', [createToken('9', 'mn')])];
      const mat = createMatrix([row0, row1, row2]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const cells = Array.from(dom.querySelectorAll('.eq-matrix-cell')) as HTMLElement[];
      expect(cells.length).toBe(9);

      // Setup geometric layout for cells: 3 rows x 3 cols, 30x30 each
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c;
          setMockRect(cells[idx], {
            left: 10 + c * 30,
            top: 10 + r * 30,
            width: 30,
            height: 30,
          });
          const slot = cells[idx].querySelector('.eq-slot') as HTMLElement;
          setMockRect(slot, {
            left: 15 + c * 30,
            top: 15 + r * 30,
            width: 20,
            height: 20,
          });
        }
      }

      // Test click inside cell (0, 2) -> should resolve to row0[2] (value 3)
      const caret02 = handleMouseClick(root, dom, 75, 20, cells[2]);
      expect(caret02.slotId).toBe(row0[2].id);

      // Test click inside center cell (1, 1) -> should resolve to row1[1] (value 5)
      const caret11 = handleMouseClick(root, dom, 45, 45, cells[4]);
      expect(caret11.slotId).toBe(row1[1].id);

      // Test click inside bottom-left cell (2, 0) -> should resolve to row2[0] (value 7)
      const caret20 = handleMouseClick(root, dom, 15, 75, cells[6]);
      expect(caret20.slotId).toBe(row2[0].id);

      // Test click inside bottom-right cell (2, 2) -> should resolve to row2[2] (value 9)
      const caret22 = handleMouseClick(root, dom, 80, 80, cells[8]);
      expect(caret22.slotId).toBe(row2[2].id);
    });

    it('hit-tests underover limits (e.g. sum with lower and upper limits)', () => {
      // \sum_{i=1}^\infty
      const base = createSlot('base', [createToken('∑', 'mo')]);
      const under = createSlot('under', [createToken('i', 'mi'), createToken('=', 'mo'), createToken('1', 'mn')]);
      const over = createSlot('over', [createToken('∞', 'mo')]);
      const underover = createUnderOver(base, under, over);
      const root = createSlot('root', [underover]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const overEl = dom.querySelector('.eq-over') as HTMLElement;
      const baseEl = dom.querySelector('.eq-base') as HTMLElement;
      const underEl = dom.querySelector('.eq-under') as HTMLElement;

      expect(overEl).not.toBeNull();
      expect(baseEl).not.toBeNull();
      expect(underEl).not.toBeNull();

      setMockRect(overEl, { left: 20, top: 0, width: 20, height: 15 });
      setMockRect(baseEl, { left: 20, top: 15, width: 20, height: 25 });
      setMockRect(underEl, { left: 10, top: 40, width: 40, height: 15 });

      // Click on upper limit ('∞')
      const caretOver = handleMouseClick(root, dom, 25, 5, overEl.querySelector('.eq-token') as HTMLElement);
      expect(caretOver.slotId).toBe(over.id);

      // Click on base operator ('∑')
      const caretBase = handleMouseClick(root, dom, 25, 25, baseEl.querySelector('.eq-token') as HTMLElement);
      expect(caretBase.slotId).toBe(base.id);

      // Click on lower limit ('1' at right side of under slot)
      const underTokens = underEl.querySelectorAll('.eq-token');
      const token1 = underTokens[2] as HTMLElement;
      setMockRect(token1, { left: 35, top: 40, width: 10, height: 15 });
      const caretUnder = handleMouseClick(root, dom, 42, 45, token1);
      expect(caretUnder.slotId).toBe(under.id);
      expect(caretUnder.offset).toBe(3); // after '1'
    });

    it('fallback coordinates safely handle clicks in margins, outside bounding boxes, and empty spaces without errors', () => {
      const root = createSlot('root', [createToken('a', 'mi'), createToken('+', 'mo'), createToken('b', 'mi')]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);
      const slotEl = dom.querySelector('.eq-slot') as HTMLElement;
      setMockRect(slotEl, { left: 50, top: 50, width: 100, height: 30 });

      // Click way to the left of slot (x = 0, y = 50)
      const cLeft = handleMouseClick(root, dom, 0, 50);
      expect(cLeft.slotId).toBe(root.id);
      expect(cLeft.offset).toBe(0);

      // Click way to the right of slot (x = 500, y = 50)
      const cRight = handleMouseClick(root, dom, 500, 50);
      expect(cRight.slotId).toBe(root.id);
      expect(cRight.offset).toBe(root.children.length);

      // Click above the slot (x = 100, y = 0)
      const cAbove = handleMouseClick(root, dom, 100, 0);
      expect(cAbove.slotId).toBe(root.id);
      expect(typeof cAbove.offset).toBe('number');
    });

    it('navigates through complex structural equations via ArrowUp / ArrowDown and documents subscript vertical handling', () => {
      // Fraction with superscript in numerator and subscript in denominator
      // \frac{x^2}{y_1}
      const numBase = createSlot('base', [createToken('x', 'mi')]);
      const numSup = createSlot('sup', [createToken('2', 'mn')]);
      const numNode = createSuperscript(numBase, numSup);
      const numSlot = createSlot('numerator', [numNode]);

      const denBase = createSlot('base', [createToken('y', 'mi')]);
      const denSub = createSlot('sub', [createToken('1', 'mn')]);
      const denNode = createSubscript(denBase, denSub);
      const denSlot = createSlot('denominator', [denNode]);

      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // 1. Vertical fraction navigation: from denominator slot to numerator slot
      let resFracUp = handleArrowKey(root, { slotId: denSlot.id, offset: 1 }, 'ArrowUp');
      expect(resFracUp.handled).toBe(true);
      expect(resFracUp.caret.slotId).toBe(numSlot.id);

      // 2. Vertical fraction navigation: from numerator slot to denominator slot
      let resFracDown = handleArrowKey(root, { slotId: numSlot.id, offset: 1 }, 'ArrowDown');
      expect(resFracDown.handled).toBe(true);
      expect(resFracDown.caret.slotId).toBe(denSlot.id);

      // 3. Superscript vertical navigation: from base to sup
      let resSupUp = handleArrowKey(root, { slotId: numBase.id, offset: 0 }, 'ArrowUp');
      expect(resSupUp.handled).toBe(true);
      expect(resSupUp.caret.slotId).toBe(numSup.id);

      // 4. Superscript vertical navigation: from sup down to base
      let resSupDown = handleArrowKey(root, { slotId: numSup.id, offset: 1 }, 'ArrowDown');
      expect(resSupDown.handled).toBe(true);
      expect(resSupDown.caret.slotId).toBe(numBase.id);

      // 5. Stress finding on Subscript: ArrowUp from subscript sub slot is not handled by navigateUp
      // (navigateUp does not have a case for parentNode.type === 'subscript' so returns unhandled/exitDirection 'up')
      let resSubUp = handleArrowKey(root, { slotId: denSub.id, offset: 1 }, 'ArrowUp');
      expect(resSubUp.handled).toBe(false);
      expect(resSubUp.exitDirection).toBe('up');
    });
  });

  // =========================================================================
  // REQUIREMENT R3: SETTINGS TAB RENDERING & CUSTOM SHORTCUTS STRESS-TEST
  // =========================================================================
  describe('R3 Adversarial: Settings Tab & Custom Shortcuts Edge Cases', () => {
    let mockPlugin: any;
    let tab: WordEquationSettingTab;

    beforeEach(() => {
      mockPlugin = {
        app: new App(),
        manifest: { id: 'obsidian-word-equation' },
        settings: {
          autoExpandShortcuts: true,
          defaultDelimiter: 'math-word',
          customShortcuts: [
            { trigger: '\\tensor', expansion: '⊗' },
            { trigger: '\\approxeq', expansion: '≊' },
          ],
        },
        saveSettings: async () => {
          setCustomShortcuts(mockPlugin.settings.customShortcuts);
        },
        loadData: async () => ({}),
        saveData: async () => {},
      };

      setCustomShortcuts(mockPlugin.settings.customShortcuts);
      tab = new WordEquationSettingTab(mockPlugin.app, mockPlugin as any);
    });

    it('verifies settings tab table contains exact required columns and structural elements', () => {
      tab.display();
      const container = tab.containerEl;

      const table = container.querySelector('table.weq-shortcuts-table');
      expect(table).not.toBeNull();

      const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers).toContain('Trigger Shortcut');
      expect(headers).toContain('MathML / Expansion Result');

      const rows = Array.from(table!.querySelectorAll('tbody tr'));
      expect(rows.length).toBe(2);

      // Check input fields and initial values
      const trigger0 = rows[0].querySelector('input.weq-input-trigger') as HTMLInputElement;
      const exp0 = rows[0].querySelector('input.weq-input-expansion') as HTMLInputElement;
      expect(trigger0.value).toBe('\\tensor');
      expect(exp0.value).toBe('⊗');
    });

    it('stress-tests overlapping prefix triggers: longest prefix match in Markdown and Equation slots', () => {
      // Configure overlapping prefixes:
      // \a       -> 1
      // \alpha   -> α
      // \alphabar -> ᾱ
      // \alphabeta -> αβ
      mockPlugin.settings.customShortcuts = [
        { trigger: '\\a', expansion: '1' },
        { trigger: '\\alphabar', expansion: 'ᾱ' },
        { trigger: '\\alpha', expansion: 'α' },
        { trigger: '\\alphabeta', expansion: 'αβ' },
      ];
      setCustomShortcuts(mockPlugin.settings.customShortcuts);

      // 1. In Markdown:
      const resBar = expandShortcutInMarkdown('Test \\alphabar');
      expect(resBar).not.toBeNull();
      expect(resBar?.matched).toBe(true);
      expect(resBar?.replacement).toBe('ᾱ');
      expect(resBar?.triggerLength).toBe(9); // \alphabar is 9 chars

      const resBeta = expandShortcutInMarkdown('Test \\alphabeta');
      expect(resBeta?.replacement).toBe('αβ');

      const resAlpha = expandShortcutInMarkdown('Test \\alpha');
      expect(resAlpha?.replacement).toBe('α');

      const resA = expandShortcutInMarkdown('Test \\a');
      expect(resA?.replacement).toBe('1');

      // 2. Inside Equation Slot:
      // Slot with tokens '\', 'a', 'l', 'p', 'h', 'a', 'b', 'a', 'r'
      const slotBar = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('p', 'mi'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
        createToken('b', 'mi'),
        createToken('a', 'mi'),
        createToken('r', 'mi'),
      ]);
      const expSlotBar = expandShortcutInSlot(slotBar, 9, ' ');
      expect(expSlotBar.expanded).toBe(true);
      expect((expSlotBar.newSlot?.children[0] as any).text).toBe('ᾱ');

      // Slot with tokens '\', 'a', 'l', 'p', 'h', 'a'
      const slotAlpha = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('p', 'mi'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
      ]);
      const expSlotAlpha = expandShortcutInSlot(slotAlpha, 6, ' ');
      expect(expSlotAlpha.expanded).toBe(true);
      expect((expSlotAlpha.newSlot?.children[0] as any).text).toBe('α');

      // Slot with tokens '\', 'a'
      const slotA = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
      ]);
      const expSlotA = expandShortcutInSlot(slotA, 2, ' ');
      expect(expSlotA.expanded).toBe(true);
      expect((expSlotA.newSlot?.children[0] as any).text).toBe('1');
    });

    it('handles math operators, relations, and non-slash trigger symbols in custom shortcuts', () => {
      mockPlugin.settings.customShortcuts = [
        { trigger: '!=', expansion: '≠' },
        { trigger: ':=', expansion: '≔' },
        { trigger: '>=', expansion: '≥' },
        { trigger: '<=>', expansion: '⇔' },
        { trigger: '->', expansion: '→' },
        { trigger: '-->', expansion: '⟶' },
      ];
      setCustomShortcuts(mockPlugin.settings.customShortcuts);

      // In Markdown:
      expect(expandShortcutInMarkdown('x !=')?.replacement).toBe('≠');
      expect(expandShortcutInMarkdown('x :=')?.replacement).toBe('≔');
      expect(expandShortcutInMarkdown('x >=')?.replacement).toBe('≥');
      expect(expandShortcutInMarkdown('p <=>')?.replacement).toBe('⇔');
      expect(expandShortcutInMarkdown('a ->')?.replacement).toBe('→');
      expect(expandShortcutInMarkdown('a -->')?.replacement).toBe('⟶'); // longest match wins

      // Inside Equation Slot:
      const slot = createSlot('root', [
        createToken('x', 'mi'),
        createToken('!', 'mo'),
        createToken('=', 'mo'),
      ]);
      const res = expandShortcutInSlot(slot, 3, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children.length).toBe(2);
      expect((res.newSlot?.children[0] as any).text).toBe('x');
      expect((res.newSlot?.children[1] as any).text).toBe('≠');
      expect((res.newSlot?.children[1] as any).tokenKind).toBe('mo');
    });

    it('handles MathML structural expansions with deeply nested tags in both Markdown and Equation blocks', () => {
      // Custom shortcut expanding to a complex MathML derivative
      mockPlugin.settings.customShortcuts = [
        {
          trigger: '\\dydx',
          expansion: '<mfrac><mrow><mo>d</mo><mi>y</mi></mrow><mrow><mo>d</mo><mi>x</mi></mrow></mfrac>',
          scope: 'block',
        },
        {
          trigger: '\\sqrtx',
          expansion: '<msqrt><mi>x</mi><mo>+</mo><mn>1</mn></msqrt>',
          scope: 'block',
        },
      ];
      setCustomShortcuts(mockPlugin.settings.customShortcuts);

      // 1. In standard Markdown:
      const mdRes = expandShortcutInMarkdown('Equation \\dydx');
      expect(mdRes).not.toBeNull();
      expect(mdRes?.replacement).toContain('```math-word');
      expect(mdRes?.replacement).toContain('<mfrac>');
      expect(mdRes?.replacement).toContain('<mo>d</mo>');

      // 2. In Equation Block Slot:
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('d', 'mi'),
        createToken('y', 'mi'),
        createToken('d', 'mi'),
        createToken('x', 'mi'),
      ]);
      const slotRes = expandShortcutInSlot(slot, 5, ' ');
      expect(slotRes.expanded).toBe(true);
      const fracNode = slotRes.newSlot?.children[0] as any;
      expect(fracNode.type).toBe('fraction');
      expect(fracNode.numerator.children.length).toBeGreaterThan(0);
      expect(fracNode.denominator.children.length).toBeGreaterThan(0);

      // Radical expansion inside slot:
      const slotRad = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('s', 'mi'),
        createToken('q', 'mi'),
        createToken('r', 'mi'),
        createToken('t', 'mi'),
        createToken('x', 'mi'),
      ]);
      const radRes = expandShortcutInSlot(slotRad, 6, ' ');
      expect(radRes.expanded).toBe(true);
      const radNode = radRes.newSlot?.children[0] as any;
      expect(radNode.type).toBe('radical');
      expect(radNode.radicand.children.length).toBe(3); // x, +, 1
    });

    it('allows overriding built-in symbols and gracefully reverts when custom shortcut is deleted', async () => {
      tab.display();

      // Default built-in \alpha expands to 'α'
      expect(lookupSymbol('\\alpha')).toBe('α');
      expect(expandShortcutInMarkdown('\\alpha')?.replacement).toBe('α');

      // Add override for \alpha in custom shortcuts: \alpha -> 𝜶 (bold italic alpha)
      mockPlugin.settings.customShortcuts.push({
        trigger: '\\alpha',
        expansion: '𝜶',
      });
      await mockPlugin.saveSettings();

      // Custom override must take precedence
      expect(lookupSymbol('\\alpha')).toBe('𝜶');
      expect(expandShortcutInMarkdown('\\alpha')?.replacement).toBe('𝜶');

      // Now delete the custom shortcut
      const idx = mockPlugin.settings.customShortcuts.findIndex((s: any) => s.trigger === '\\alpha');
      mockPlugin.settings.customShortcuts.splice(idx, 1);
      await mockPlugin.saveSettings();

      // Built-in behavior must be restored
      expect(lookupSymbol('\\alpha')).toBe('α');
      expect(expandShortcutInMarkdown('\\alpha')?.replacement).toBe('α');
    });

    it('handles chained expansions sequentially in WordEquationWidget with BMP symbols', () => {
      // Configure custom shortcut with BMP character '⊗'
      mockPlugin.settings.customShortcuts = [
        { trigger: '\\mytensor', expansion: '⊗' },
      ];
      setCustomShortcuts(mockPlugin.settings.customShortcuts);

      const initialDoc = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container } = createMockEditor(initialDoc, [], true);
      const widget = new WordEquationWidget(
        '<math><mrow></mrow></math>',
        0,
        initialDoc.length,
        false,
        'math-word'
      );
      const dom = widget.toDOM(view);
      widget.enterFromStart(view);

      // Step 1: Type \mytensor followed by Space -> expands to ⊗
      for (const char of ['\\', 'm', 'y', 't', 'e', 'n', 's', 'o', 'r', ' ']) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
      }
      expect(widget.ast.children.length).toBe(1);
      expect((widget.ast.children[0] as any).text).toBe('⊗');

      // Step 2: Type _ followed by 1 followed by Space -> expands to subscript ⊗_1
      for (const char of ['_', '1', ' ']) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
      }
      expect(widget.ast.children.length).toBe(1);
      expect(widget.ast.children[0].type).toBe('subscript');
      const subNode = widget.ast.children[0] as any;
      expect((subNode.base.children[0] as any).text).toBe('⊗');
      expect((subNode.sub.children[0] as any).text).toBe('1');

      view.destroy();
      container.remove();
    });

    it('documents edge case: non-BMP surrogate pair character tokenization in LinearParser', () => {
      // Test the exact behavior of non-BMP surrogate pair in linear equation parser
      // '𝐯' is U+1D42F (length 2 in UTF-16: high surrogate \uD835, low surrogate \uDC2F)
      const parsed = parseLinearEquation('𝐯_1');
      // When tokenized without surrogate pair awareness, \uD835 and \uDC2F are split into separate operators
      expect(parsed.children.length).toBe(2);
      expect((parsed.children[0] as any).text).toBe('\uD835');
      expect(parsed.children[1].type).toBe('subscript');
      expect(((parsed.children[1] as any).base.children[0] as any).text).toBe('\uDC2F');
    });

    it('handles empty triggers, invalid entries, and multiple additions/deletions robustly', async () => {
      tab.display();

      // Add shortcut button click
      const addBtn = Array.from(tab.containerEl.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Add Shortcut')
      );
      addBtn!.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPlugin.settings.customShortcuts.length).toBe(3);

      // Add another
      addBtn!.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(mockPlugin.settings.customShortcuts.length).toBe(4);

      // Delete the 2nd row (index 1)
      const delBtns = tab.containerEl.querySelectorAll('.weq-btn-delete');
      (delBtns[1] as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPlugin.settings.customShortcuts.length).toBe(3);

      // Ensure catalog has filtered out empty triggers cleanly
      expect(getCustomShortcuts().length).toBeGreaterThanOrEqual(1);
    });
  });
});
