/**
 * Adversarial Challenger M4: Empirical Verification for Defect 1
 * (Single Click Non-Sticky Caret Placement & Cross-Equation Isolation)
 *
 * Verifies:
 * 1. Single click caret placement and non-sticky drag threshold logic in src/editor/widget.ts.
 * 2. Defensive button state verification: (moveEvt.buttons & 1) === 1 prevents any mouse movement without button press from dragging.
 * 3. Rapid clicks, double clicks, and release outside window/document.
 * 4. activeDragTeardown prevents cross-equation selection leakage when switching equations.
 * 5. Global capture-phase listeners on doc and win are 100% removed on pointerup / mouseup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment, computeAndApplyLayout } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger M4: Defect 1 Empirical Verification', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function getWidgetsAndDoms(view: any): Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> {
    const list: Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> = [];
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(0, view.state.doc.length, (from: number, to: number, dec: any) => {
        const w = dec.spec?.widget;
        if (w instanceof WordEquationWidget) {
          const dom = (view.dom.querySelector(`[data-equation-from="${w.from}"]`) ||
            view.dom.querySelector('.word-equation-block') ||
            view.dom.querySelector('.word-equation-inline')) as HTMLElement;
          const mathEl = (dom?.querySelector('.word-equation-math') || dom) as HTMLElement;
          list.push({ widget: w, dom, mathEl });
        }
      });
    }
    return list;
  }

  // =========================================================================
  // Challenge 1: Single Click Caret Placement & Non-Sticky Drag Prevention
  // =========================================================================
  describe('Challenge 1: Single Click Non-Sticky Caret Placement', () => {
    it('places flashing caret on single click without creating selection', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mi>x</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBeGreaterThan(0);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      expect(token1).not.toBeNull();
      const rect = token1.getBoundingClientRect();

      // Dispatch mousedown/pointerdown
      token1.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 2,
          clientY: rect.top + 2,
          buttons: 1,
        })
      );

      // Verify caret placed, selection null
      expect(widget.caret).not.toBeNull();
      expect(widget.selection).toBeNull();
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Dispatch pointerup
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 2,
          clientY: rect.top + 2,
          buttons: 0,
        })
      );

      expect(widget.selection).toBeNull();
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('adversarially stress-tests mouse movements immediately after click with buttons === 0', () => {
      const docStr = '```math-word\n<math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token1.getBoundingClientRect();
      const clickX = rect.left + 5;
      const clickY = rect.top + 5;

      // 1. Single click
      token1.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: clickX,
          clientY: clickY,
          buttons: 1,
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: clickX,
          clientY: clickY,
          buttons: 0,
        })
      );

      // Caret is placed, selection is null
      expect(widget.selection).toBeNull();

      // 2. Adversarial moves across note with buttons === 0 (small and large displacements)
      const moveDisplacements = [
        { dx: 1, dy: 0 },    // sub-threshold (1px)
        { dx: 2, dy: 2 },    // sub-threshold (2.8px)
        { dx: 4, dy: 0 },    // threshold exceeded (4px)
        { dx: 10, dy: 10 },  // larger move (14px)
        { dx: -50, dy: -30 },// moving backwards/away
        { dx: 200, dy: 150 },// far displacement
      ];

      for (const { dx, dy } of moveDisplacements) {
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: clickX + dx,
            clientY: clickY + dy,
            buttons: 0, // NO button held!
          })
        );

        // Invariant: selection MUST remain strictly null
        expect(widget.selection).toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
        const active = getActiveEquationState();
        expect(active?.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 2: Defensive Button State Verification ((moveEvt.buttons & 1) === 1)
  // =========================================================================
  describe('Challenge 2: Defensive Button State Verification', () => {
    it('immediately aborts and tears down if pointermove receives buttons: 0 without prior pointerup', () => {
      const docStr = '```math-word\n<math><mn>42</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Simulate pointerdown
      token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 1,
        })
      );

      // Suppose pointerup was dropped by OS/browser quirk, but pointermove arrives with buttons === 0
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 50,
          clientY: rect.top + 50,
          buttons: 0,
        })
      );

      // Verify that defensive check (moveEvt.buttons & 1) !== 1 triggered onPointerUp and cleaned up
      expect(widget.selection).toBeNull();

      // Subsequent moves even with buttons === 1 must not drag because listeners were cleaned up!
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 100,
          clientY: rect.top + 100,
          buttons: 1,
        })
      );
      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });

    it('rejects secondary (right) and auxiliary (middle) mouse movements: buttons === 2 and buttons === 4', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Right mouse button move (buttons === 2)
      token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 1,
        })
      );

      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 20,
          clientY: rect.top + 20,
          buttons: 2, // Right click held instead of left
        })
      );

      expect(widget.selection).toBeNull();

      // Middle mouse button move (buttons === 4)
      token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 1,
        })
      );

      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 20,
          clientY: rect.top + 20,
          buttons: 4, // Middle click held
        })
      );

      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });

    it('initiates drag selection ONLY when primary button is held (buttons === 1) and threshold >= 3px', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = dom.querySelectorAll('.eq-token');
      const token1 = tokens[0] as HTMLElement;
      const token3 = tokens[2] as HTMLElement;
      const r1 = token1.getBoundingClientRect();
      const r3 = token3.getBoundingClientRect();

      token1.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: r1.left + 2,
          clientY: r1.top + 2,
          buttons: 1,
        })
      );

      // Sub-threshold move (2px)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r1.left + 4,
          clientY: r1.top + 2,
          buttons: 1,
        })
      );
      expect(widget.selection).toBeNull();

      // Supra-threshold move to token 3 (> 30px)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r3.left + 2,
          clientY: r3.top + 2,
          buttons: 1,
        })
      );

      // Selection must now be active!
      expect(widget.selection).not.toBeNull();

      // Release
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: r3.left + 2,
          clientY: r3.top + 2,
          buttons: 0,
        })
      );

      // Selection remains as committed partial selection
      expect(widget.selection).not.toBeNull();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 3: Rapid Clicks, Double Clicks, and Click Outside
  // =========================================================================
  describe('Challenge 3: Rapid Clicks, Double Clicks & External Release', () => {
    it('survives 30 rapid sequential clicks without listener accumulation or sticky selection', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn><mo>+</mo><mn>3</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(tokens.length).toBeGreaterThan(0);

      // Rapidly fire 30 click cycles across various tokens
      for (let i = 0; i < 30; i++) {
        const target = tokens[i % tokens.length];
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: rect.left + 2,
            clientY: rect.top + 2,
            buttons: 1,
          })
        );
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: rect.left + 2,
            clientY: rect.top + 2,
            buttons: 0,
          })
        );
        expect(widget.selection).toBeNull();
      }

      // Move mouse after all 30 clicks: must still have zero selection!
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 500,
          clientY: 500,
          buttons: 0,
        })
      );
      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });

    it('handles double click without triggering sticky selection on subsequent mouse move', () => {
      const docStr = '```math-word\n<math><mi>x</mi><mo>+</mo><mi>y</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Click 1
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 0 })
      );

      // Click 2 (Double click sequence)
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 0 })
      );

      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.anchor.offset).toBe(0);
      expect(widget.selection!.head.offset).toBe(widget.ast.children.length);

      // Mouse moves around
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 30, clientY: rect.top + 20, buttons: 0 })
      );
      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.head.offset).toBe(widget.ast.children.length);

      view.destroy();
      c.remove();
    });

    it('properly executes teardown when mouseup occurs outside equation container', () => {
      const docStr = '```math-word\n<math><mi>x</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Mouseup occurs outside equation on window/document
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 999, clientY: 999, buttons: 0 })
      );

      // Move mouse afterwards
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100, buttons: 0 })
      );
      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 4: Cross-Equation Isolation & activeDragTeardown
  // =========================================================================
  describe('Challenge 4: Cross-Equation Isolation & activeDragTeardown', () => {
    it('activeDragTeardown prevents cross-equation selection leakage when switching equations', () => {
      const docStr =
        '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn></math>\n```\n\n' +
        'Text between\n\n' +
        '```math-word\n<math><mi>a</mi><mo>+</mo><mi>b</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBe(2);

      const eq1 = items[0];
      const eq2 = items[1];
      computeAndApplyLayout(eq1.dom, 100, 100);
      computeAndApplyLayout(eq2.dom, 100, 200);

      const eq1Token = eq1.dom.querySelector('.eq-token') as HTMLElement;
      const eq2Token = eq2.dom.querySelector('.eq-token') as HTMLElement;
      const r1 = eq1Token.getBoundingClientRect();
      const r2 = eq2Token.getBoundingClientRect();

      // 1. Click Equation 1 (even leave drag active by omitting pointerup!)
      eq1Token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: r1.left,
          clientY: r1.top,
          buttons: 1,
        })
      );
      expect(eq1.widget.isFocused).toBe(true);

      // 2. Click Equation 2 without releasing Equation 1
      eq2Token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: r2.left,
          clientY: r2.top,
          buttons: 1,
        })
      );

      // Equation 1 MUST have been torn down!
      expect(eq1.widget.isFocused).toBe(false);
      expect(eq1.widget.selection).toBeNull();
      expect(eq2.widget.isFocused).toBe(true);

      // 3. Move mouse over Equation 2 with buttons === 0
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: r2.left,
          clientY: r2.top,
          buttons: 0,
        })
      );

      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r2.left + 50,
          clientY: r2.top + 50,
          buttons: 0,
        })
      );

      // Neither equation has sticky selection
      expect(eq1.widget.selection).toBeNull();
      expect(eq2.widget.selection).toBeNull();
      expect(eq1.dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect(eq2.dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 5: Global Capture-Phase Listener Removal Audit
  // =========================================================================
  describe('Challenge 5: Global Capture-Phase Listener Removal Audit', () => {
    it('audits that all doc and win listeners attached on pointerdown are 100% unregistered on pointerup', () => {
      const docStr = '```math-word\n<math><mn>123</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Spy on addEventListener and removeEventListener for document and window
      const docAdded: Array<{ type: string; listener: any; useCapture: any }> = [];
      const docRemoved: Array<{ type: string; listener: any; useCapture: any }> = [];
      const winAdded: Array<{ type: string; listener: any; useCapture: any }> = [];
      const winRemoved: Array<{ type: string; listener: any; useCapture: any }> = [];

      const origDocAdd = document.addEventListener.bind(document);
      const origDocRemove = document.removeEventListener.bind(document);
      const origWinAdd = window.addEventListener.bind(window);
      const origWinRemove = window.removeEventListener.bind(window);

      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
        const useCapture = typeof options === 'boolean' ? options : (options as any)?.capture;
        docAdded.push({ type, listener, useCapture });
        return origDocAdd(type, listener, options);
      });
      vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
        const useCapture = typeof options === 'boolean' ? options : (options as any)?.capture;
        docRemoved.push({ type, listener, useCapture });
        return origDocRemove(type, listener, options);
      });
      vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
        const useCapture = typeof options === 'boolean' ? options : (options as any)?.capture;
        winAdded.push({ type, listener, useCapture });
        return origWinAdd(type, listener, options);
      });
      vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
        const useCapture = typeof options === 'boolean' ? options : (options as any)?.capture;
        winRemoved.push({ type, listener, useCapture });
        return origWinRemove(type, listener, options);
      });

      // Pointerdown
      token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 1,
        })
      );

      // At this point, listeners should be registered on doc and win
      expect(docAdded.length).toBeGreaterThan(0);
      expect(winAdded.length).toBeGreaterThan(0);

      // Pointerup
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 0,
        })
      );

      // Audit removal matching: every added listener MUST have an exact removal call
      for (const added of docAdded) {
        const matched = docRemoved.some(
          (rem) => rem.type === added.type && rem.listener === added.listener && rem.useCapture === added.useCapture
        );
        expect(matched, `Expected doc listener ${added.type} (capture: ${added.useCapture}) to be removed`).toBe(true);
      }

      for (const added of winAdded) {
        const matched = winRemoved.some(
          (rem) => rem.type === added.type && rem.listener === added.listener && rem.useCapture === added.useCapture
        );
        expect(matched, `Expected win listener ${added.type} (capture: ${added.useCapture}) to be removed`).toBe(true);
      }

      view.destroy();
      c.remove();
    });

    it('bypasses child stopPropagation via capture-phase listener execution', () => {
      const docStr = '```math-word\n<math><mn>777</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      token.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 1,
        })
      );

      // Dispatch pointerup directly on the token (where dom has stopPropagation in bubble phase)
      // The capture listener on document/window executes BEFORE bubble phase reaching dom!
      token.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.top,
          buttons: 0,
        })
      );

      // Move mouse: drag mode must NOT be active
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 50,
          clientY: rect.top + 50,
          buttons: 0,
        })
      );

      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });
  });
});
