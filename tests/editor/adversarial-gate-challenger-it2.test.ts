/**
 * Iteration 2 Gate Certification: Adversarial Challenger Empirical Test Suite
 *
 * Exhaustively stress-tests:
 * 1. Single click inside equation places caret cleanly without arming sticky selection mode
 *    across inline, block, nested fractions, and multi-cell matrices.
 * 2. Mouse movements when buttons === 0 never trigger selection mode under any trajectory
 *    (Brownian walk, boundary crossings, off-screen jumps, non-primary buttons 2/4/8/16/32).
 * 3. Multi-equation switching cleans up previous drag closures with zero leaked listeners
 *    under hostile abandonment and random permutation sequences.
 * 4. Rapid clicking and interrupt storms (pointercancel, contextmenu, pointerleave, doc sync)
 *    maintain strict caret state synchronization without desync or sticky mode.
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
import { resetIdCounter, findSlotById } from '../../src/core/ast';
import { setupAccurateDomEnvironment, computeAndApplyLayout } from '../helpers/dom-layout-engine';

describe('Gate Certification (Iteration 2): Empirical Stress Harness', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    container.id = 'gate-it2-challenger-container';
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
  // REQUIREMENT 1: Single Click Caret Placement Without Sticky Selection
  // =========================================================================
  describe('1. Single Click Caret Placement & Zero Sticky Selection', () => {
    it('accurately positions visual caret on single click in both inline and block equations without arming selection', () => {
      const docStr =
        'Prefix text /weq_inline <math><mi>x</mi><mo>+</mo><mn>1</mn></math>/weq_inline middle text\n\n' +
        '```math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mi>c</mi></mfrac></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBe(2);

      const inlineItem = items[0];
      const blockItem = items[1];
      computeAndApplyLayout(inlineItem.dom, 50, 50);
      computeAndApplyLayout(blockItem.dom, 50, 150);

      // Test 1A: Single click on inline token 'x'
      const inlineToken = inlineItem.dom.querySelector('.eq-token') as HTMLElement;
      expect(inlineToken).not.toBeNull();
      const inRect = inlineToken.getBoundingClientRect();

      inlineToken.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: inRect.left + 2,
          clientY: inRect.top + 2,
          buttons: 1,
          button: 0,
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: inRect.left + 2,
          clientY: inRect.top + 2,
          buttons: 0,
          button: 0,
        })
      );

      expect(inlineItem.widget.isFocused).toBe(true);
      expect(inlineItem.widget.caret).not.toBeNull();
      expect(inlineItem.widget.selection).toBeNull();
      expect(inlineItem.dom.querySelector('.eq-caret')).not.toBeNull();
      expect(inlineItem.dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      // Test 1B: Single click on block denominator 'c'
      const blockTokens = blockItem.dom.querySelectorAll('.eq-token');
      const denomToken = blockTokens[blockTokens.length - 1] as HTMLElement;
      expect(denomToken).not.toBeNull();
      const blkRect = denomToken.getBoundingClientRect();

      denomToken.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: blkRect.left + 2,
          clientY: blkRect.top + 2,
          buttons: 1,
          button: 0,
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: blkRect.left + 2,
          clientY: blkRect.top + 2,
          buttons: 0,
          button: 0,
        })
      );

      // Block must be focused, inline unfocused
      expect(blockItem.widget.isFocused).toBe(true);
      expect(inlineItem.widget.isFocused).toBe(false);
      expect(blockItem.widget.caret).not.toBeNull();
      expect(blockItem.widget.selection).toBeNull();
      expect(blockItem.dom.querySelector('.eq-caret')).not.toBeNull();
      expect(blockItem.dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('places caret into multi-cell matrix and empty placeholders on single click without arming selection', () => {
      const docStr =
        '```math-word\n<math><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mrow/></mtd></mtr><mtr><mtd><mrow/></mtd><mtd><mn>4</mn></mtd></mtr></mtable></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(2);

      for (const ph of placeholders) {
        const rect = ph.getBoundingClientRect();
        ph.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: rect.left + 3,
            clientY: rect.top + 3,
            buttons: 1,
          })
        );
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: rect.left + 3,
            clientY: rect.top + 3,
            buttons: 0,
          })
        );

        expect(widget.caret).not.toBeNull();
        expect(widget.selection).toBeNull();
        expect(ph.querySelector('.eq-caret')).not.toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT 2: Mouse Movement When buttons === 0 Under Any Trajectory
  // =========================================================================
  describe('2. Mouse Movement When buttons === 0 Never Triggers Selection', () => {
    it('survives an adversarial Brownian walk across the editor with buttons === 0 without activating selection', () => {
      const docStr = '```math-word\n<math><mfrac><mn>123</mn><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></mfrac></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 200, 200);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();
      let curX = rect.left + 2;
      let curY = rect.top + 2;

      // 1. Single click to place caret
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: curX, clientY: curY, buttons: 1 })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: curX, clientY: curY, buttons: 0 })
      );

      expect(widget.selection).toBeNull();

      // 2. Perform 100-step Brownian motion walk across boundaries
      // Pseudo-random deterministic steps
      for (let step = 0; step < 100; step++) {
        const angle = (step * 37) % 360;
        const dist = ((step * 13) % 40) - 20; // -20 to +20 px
        curX += Math.cos((angle * Math.PI) / 180) * dist;
        curY += Math.sin((angle * Math.PI) / 180) * dist;

        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: curX,
            clientY: curY,
            buttons: 0, // MUST NEVER initiate selection
          })
        );

        // Verification invariant: Selection MUST remain null at every single step
        expect(widget.selection, `Step ${step} at (${curX.toFixed(1)}, ${curY.toFixed(1)}) triggered sticky selection!`).toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      }

      view.destroy();
      c.remove();
    });

    it('rejects selection for all non-primary mouse buttons (buttons: 2, 4, 8, 16, 32, 24)', () => {
      const docStr = '```math-word\n<math><mn>555</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Attempt drag with non-primary buttons
      const hostileButtons = [2, 4, 8, 16, 32, 2 | 4, 8 | 16, 0];
      for (const btn of hostileButtons) {
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: rect.left + 30,
            clientY: rect.top + 30,
            buttons: btn,
          })
        );
        expect(widget.selection, `Button code ${btn} triggered illegal selection`).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('defensively aborts active drag if button is released mid-flight and pointermove arrives with buttons === 0', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn><mo>+</mo><mn>3</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = dom.querySelectorAll('.eq-token');
      const t1 = tokens[0] as HTMLElement;
      const t3 = tokens[2] as HTMLElement;
      const r1 = t1.getBoundingClientRect();
      const r3 = t3.getBoundingClientRect();

      // Start drag with buttons === 1
      t1.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: r1.left, clientY: r1.top, buttons: 1 })
      );

      // Move with buttons === 1 (initiates active drag)
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: r3.left, clientY: r3.top, buttons: 1 })
      );
      expect(widget.selection).not.toBeNull();

      // Now simulate dropped mouseup: mouse moves to new position with buttons === 0
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: r1.left, clientY: r1.top, buttons: 0 })
      );

      // Further moves with buttons === 1 must NOT re-arm or expand the selection because listeners were torn down
      const savedSelection = widget.selection;
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 999, clientY: 999, buttons: 1 })
      );

      // Selection head must NOT have moved to (999, 999)
      expect(widget.selection).toEqual(savedSelection);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT 3: Multi-Equation Switching & Zero Leaked Listeners
  // =========================================================================
  describe('3. Multi-Equation Switching & Zero Leaked Listeners', () => {
    it('switching across 5 equations under abandoned drag cycles leaves exactly zero leaked listeners', () => {
      const docStr =
        '```math-word\n<math><mn>10</mn></math>\n```\n\n' +
        '```math-word\n<math><mn>20</mn></math>\n```\n\n' +
        '```math-word\n<math><mn>30</mn></math>\n```\n\n' +
        '```math-word\n<math><mn>40</mn></math>\n```\n\n' +
        '```math-word\n<math><mn>50</mn></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBe(5);

      items.forEach((item, idx) => {
        computeAndApplyLayout(item.dom, 100, 100 + idx * 60);
      });

      // Track active listeners on document and window
      const docMap = new Map<string, number>();
      const winMap = new Map<string, number>();

      const origDocAdd = document.addEventListener.bind(document);
      const origDocRemove = document.removeEventListener.bind(document);
      const origWinAdd = window.addEventListener.bind(window);
      const origWinRemove = window.removeEventListener.bind(window);

      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
        docMap.set(type, (docMap.get(type) || 0) + 1);
        return origDocAdd(type, listener, options);
      });
      vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
        docMap.set(type, Math.max(0, (docMap.get(type) || 0) - 1));
        return origDocRemove(type, listener, options);
      });
      vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
        winMap.set(type, (winMap.get(type) || 0) + 1);
        return origWinAdd(type, listener, options);
      });
      vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
        winMap.set(type, Math.max(0, (winMap.get(type) || 0) - 1));
        return origWinRemove(type, listener, options);
      });

      // Permuted activation order: Eq 0 -> Eq 2 -> Eq 4 -> Eq 1 -> Eq 3
      const order = [0, 2, 4, 1, 3];
      for (const eqIdx of order) {
        const item = items[eqIdx];
        const token = item.dom.querySelector('.eq-token') as HTMLElement;
        const rect = token.getBoundingClientRect();

        // pointerdown without pointerup on previous
        token.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
        );

        // Check focus isolation: only item[eqIdx] is focused
        items.forEach((it, idx) => {
          if (idx === eqIdx) {
            expect(it.widget.isFocused).toBe(true);
          } else {
            expect(it.widget.isFocused).toBe(false);
            expect(it.widget.selection).toBeNull();
          }
        });
      }

      // Final pointerup to conclude the sequence
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 100, buttons: 0 })
      );

      // Verification: All drag-related event listeners on document and window MUST be exactly 0
      const dragEventTypes = ['pointermove', 'pointerup', 'mousemove', 'mouseup', 'selectstart'];
      for (const t of dragEventTypes) {
        expect(docMap.get(t) || 0, `Document leaked active listener for ${t}`).toBe(0);
        expect(winMap.get(t) || 0, `Window leaked active listener for ${t}`).toBe(0);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT 4: Rapid Clicking & Interrupt Storm Synchronization
  // =========================================================================
  describe('4. Rapid Clicking, Interrupt Storms & Caret Synchronization', () => {
    it('survives 150 rapid clicks alternating between multiple equations without caret desync', () => {
      const docStr =
        '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn></math>\n```\n\n' +
        '```math-word\n<math><mi>x</mi><mo>-</mo><mi>y</mi></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBe(2);

      computeAndApplyLayout(items[0].dom, 100, 100);
      computeAndApplyLayout(items[1].dom, 100, 200);

      for (let i = 0; i < 150; i++) {
        const eqIdx = i % 2;
        const cur = items[eqIdx];
        const tokens = cur.dom.querySelectorAll('.eq-token');
        const tok = tokens[i % tokens.length] as HTMLElement;
        const rect = tok.getBoundingClientRect();

        tok.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 2, buttons: 1 })
        );
        document.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 2, buttons: 0 })
        );

        // Verification after each rapid click:
        // 1. Caret is valid and exists in current widget AST
        expect(cur.widget.caret).not.toBeNull();
        const slot = findSlotById(cur.widget.ast, cur.widget.caret.slotId);
        expect(slot, `Caret pointed to non-existent slotId ${cur.widget.caret.slotId}`).toBeDefined();
        expect(cur.widget.caret.offset).toBeGreaterThanOrEqual(0);
        expect(cur.widget.caret.offset).toBeLessThanOrEqual(slot!.children.length);

        // 2. Selection is null
        expect(cur.widget.selection).toBeNull();

        // 3. The other equation is inactive
        const other = items[1 - eqIdx];
        expect(other.widget.isFocused).toBe(false);
        expect(other.widget.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('gracefully handles interrupt storm: pointercancel, contextmenu, and pointerleave', () => {
      const docStr = '```math-word\n<math><msqrt><mn>16</mn></msqrt></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Interrupt 1: pointercancel
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );
      token.dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 0 })
      );
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 50, clientY: rect.top + 50, buttons: 0 })
      );
      expect(widget.selection).toBeNull();

      // Interrupt 2: contextmenu event
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );
      token.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 2 })
      );
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 50, clientY: rect.top + 50, buttons: 0 })
      );
      expect(widget.selection).toBeNull();

      // Interrupt 3: pointerleave / pointerout outside container
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );
      dom.dispatchEvent(
        new PointerEvent('pointerleave', { bubbles: true, clientX: -100, clientY: -100, buttons: 0 })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: -100, clientY: -100, buttons: 0 })
      );
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200, buttons: 0 })
      );
      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });
  });
});
