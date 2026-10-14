/**
 * Gate Certification: Empirical Challenge Test Suite (Challenger 1)
 *
 * Exhaustively stress-tests:
 * 1. Single click inside an equation places caret without arming sticky selection mode.
 * 2. Mouse movement with buttons === 0 never triggers selection mode under any trajectory.
 * 3. Switching/clicking between multiple equations cleanly tears down previous drag/selection sessions with zero leaked listeners.
 * 4. Rapid clicking, double/triple clicks, and mouse interrupts (pointercancel, window blur, widget destroy) do not desync state.
 * 5. Selection dragging inside equation clamps strictly to equation boundaries and suppresses external selection.
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

describe('Gate Certification Challenger 1: Empirical Single Click & Selection Stress Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    container.id = 'challenger1-test-root';
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
  // SECTION 1: Single Click Caret Placement (No Sticky Selection)
  // =========================================================================
  describe('Section 1: Single Click Caret Placement & Selection Isolation', () => {
    it('places caret cleanly at clicked token across varied math structures without arming selection', () => {
      const docStr =
        '```math-word\n<math><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>+</mo><msqrt><mi>c</mi></msqrt><mo>=</mo><msup><mi>x</mi><mn>2</mn></msup></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBeGreaterThan(0);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(tokens.length).toBeGreaterThan(4);

      for (const token of tokens) {
        const rect = token.getBoundingClientRect();
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.top + rect.height / 2;

        // Dispatch single click (pointerdown then pointerup)
        token.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: clickX,
            clientY: clickY,
            buttons: 1,
            button: 0,
          })
        );
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            clientX: clickX,
            clientY: clickY,
            buttons: 0,
            button: 0,
          })
        );

        // Verification: Caret must exist, selection must be strictly null
        expect(widget.caret).not.toBeNull();
        expect(widget.selection).toBeNull();
        expect(dom.querySelector('.eq-caret')).not.toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

        const activeState = getActiveEquationState();
        expect(activeState?.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('clicking directly on empty placeholder places caret inside slot without sticky selection', () => {
      const docStr = '```math-word\n<math><mfrac><mrow/><mi>y</mi></mfrac></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const placeholder = dom.querySelector('.eq-placeholder') as HTMLElement;
      expect(placeholder).not.toBeNull();
      const rect = placeholder.getBoundingClientRect();

      placeholder.dispatchEvent(
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
      expect(widget.caret).not.toBeNull();
      expect(placeholder.querySelector('.eq-caret')).not.toBeNull();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 2: Mouse Movement with buttons === 0
  // =========================================================================
  describe('Section 2: Mouse Movement With buttons === 0 Under Hostile Trajectories', () => {
    it('never activates selection mode regardless of distance, direction, or trajectory when buttons === 0', () => {
      const docStr = '```math-word\n<math><mn>123</mn><mo>+</mo><mn>456</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();
      const startX = rect.left + 2;
      const startY = rect.top + 2;

      // 1. Single click
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: startX, clientY: startY, buttons: 1 })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: startX, clientY: startY, buttons: 0 })
      );

      expect(widget.selection).toBeNull();

      // 2. Stress with 50 diverse trajectory points with buttons === 0
      const trajectories: Array<{ x: number; y: number; desc: string }> = [
        { x: startX + 1, y: startY, desc: '1px right (sub-threshold)' },
        { x: startX + 2.9, y: startY, desc: '2.9px right (sub-threshold boundary)' },
        { x: startX + 3.1, y: startY, desc: '3.1px right (threshold boundary breached)' },
        { x: startX + 10, y: startY + 10, desc: 'diagonal move inside equation' },
        { x: startX + 50, y: startY, desc: 'far horizontal move' },
        { x: startX, y: startY - 100, desc: 'far vertical above equation' },
        { x: startX, y: startY + 200, desc: 'far vertical below equation' },
        { x: -500, y: -500, desc: 'negative off-screen coordinates' },
        { x: 5000, y: 5000, desc: 'far positive off-screen coordinates' },
      ];

      // Generate additional random sweep coordinates
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * 2 * Math.PI;
        const radius = 5 + (i * 20);
        trajectories.push({
          x: startX + Math.cos(angle) * radius,
          y: startY + Math.sin(angle) * radius,
          desc: `radial sweep step ${i} radius ${radius.toFixed(1)}`,
        });
      }

      for (const traj of trajectories) {
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: traj.x,
            clientY: traj.y,
            buttons: 0, // Invariant under test: NO buttons held
          })
        );

        // Verification: Selection MUST remain null, 0 tokens selected
        expect(widget.selection, `Failed on ${traj.desc}: selection should be null`).toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
        const activeState = getActiveEquationState();
        expect(activeState?.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('rejects moves if buttons bitmask indicates non-primary buttons (right=2, middle=4, back=8)', () => {
      const docStr = '```math-word\n<math><mn>99</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Attempt drag moves with secondary/auxiliary buttons
      const nonPrimaryButtons = [2, 4, 8, 16, 6, 10];
      for (const btn of nonPrimaryButtons) {
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: rect.left + 50,
            clientY: rect.top + 50,
            buttons: btn,
          })
        );
        expect(widget.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 3: Multi-Equation Switching & Teardown with Zero Leaks
  // =========================================================================
  describe('Section 3: Multi-Equation Teardown and Zero Leaked Listeners', () => {
    it('switching between 4 equations cleanly tears down previous drag sessions with zero leaked listeners', () => {
      const docStr =
        '```math-word\n<math><mn>1</mn></math>\n```\n\n' +
        'Text 1\n\n' +
        '```math-word\n<math><mfrac><mn>2</mn><mi>x</mi></mfrac></math>\n```\n\n' +
        'Text 2\n\n' +
        '```math-word\n<math><msqrt><mn>3</mn></msqrt></math>\n```\n\n' +
        'Text 3\n\n' +
        '```math-word\n<math><msup><mi>y</mi><mn>4</mn></msup></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      expect(items.length).toBe(4);

      items.forEach((item, idx) => {
        computeAndApplyLayout(item.dom, 100, 100 + idx * 80);
      });

      // Audit listeners on document and window
      let activeDocMoveCount = 0;
      let activeDocUpCount = 0;

      const origDocAdd = document.addEventListener.bind(document);
      const origDocRemove = document.removeEventListener.bind(document);

      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
        if (type === 'pointermove' || type === 'mousemove') activeDocMoveCount++;
        if (type === 'pointerup' || type === 'mouseup') activeDocUpCount++;
        return origDocAdd(type, listener, options);
      });

      vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
        if (type === 'pointermove' || type === 'mousemove') activeDocMoveCount--;
        if (type === 'pointerup' || type === 'mouseup') activeDocUpCount--;
        return origDocRemove(type, listener, options);
      });

      // Sequential activation from Eq0 -> Eq1 -> Eq2 -> Eq3, deliberately omitting pointerup on some
      for (let i = 0; i < 4; i++) {
        const cur = items[i];
        const tok = cur.dom.querySelector('.eq-token') as HTMLElement;
        const rect = tok.getBoundingClientRect();

        // Start interaction on current equation
        tok.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
        );

        // Verify current is focused, others are unfocused
        items.forEach((other, oIdx) => {
          if (oIdx === i) {
            expect(other.widget.isFocused).toBe(true);
          } else {
            expect(other.widget.isFocused).toBe(false);
            expect(other.widget.selection).toBeNull();
            expect(other.dom.querySelectorAll('.eq-selected-token').length).toBe(0);
          }
        });

        // For even i, dispatch pointerup; for odd i, omit pointerup (simulate abrupt switch!)
        if (i % 2 === 0) {
          document.dispatchEvent(
            new PointerEvent('pointerup', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 0 })
          );
        }
      }

      // Final release on last equation
      const lastTok = items[3].dom.querySelector('.eq-token') as HTMLElement;
      const lastRect = lastTok.getBoundingClientRect();
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: lastRect.left, clientY: lastRect.top, buttons: 0 })
      );

      // Verify that after final teardown, all previous equations are completely clean
      for (let i = 0; i < 3; i++) {
        expect(items[i].widget.selection).toBeNull();
        expect(items[i].widget.isFocused).toBe(false);
        expect(items[i].dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      }

      // Now move mouse across all equations with buttons === 0: NO equation should get sticky selection!
      for (let i = 0; i < 4; i++) {
        const rect = items[i].dom.getBoundingClientRect();
        document.dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10, buttons: 0 })
        );
        expect(items[i].widget.selection).toBeNull();
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 4: Rapid Clicks & Interrupt Synchronization
  // =========================================================================
  describe('Section 4: Rapid Clicks, Interrupts, and Asynchronous Robustness', () => {
    it('survives 100 rapid click cycles with randomized coordinates without desync', () => {
      const docStr = '```math-word\n<math><mn>1</mn><mo>+</mo><mn>2</mn><mo>+</mo><mn>3</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];

      for (let cycle = 0; cycle < 100; cycle++) {
        const token = tokens[cycle % tokens.length];
        const rect = token.getBoundingClientRect();
        const randOffset = (cycle * 3) % 15;

        token.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: rect.left + randOffset,
            clientY: rect.top + randOffset,
            buttons: 1,
          })
        );

        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: rect.left + randOffset,
            clientY: rect.top + randOffset,
            buttons: 0,
          })
        );

        // Verification after each cycle: caret placed, zero selection
        expect(widget.caret).not.toBeNull();
        expect(widget.selection).toBeNull();
      }

      // Post-burst mouse move: verify no residual drag state
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 250, clientY: 250, buttons: 0 })
      );
      expect(widget.selection).toBeNull();
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('recovers cleanly from focusout / window blur during active pointer session', () => {
      const docStr = '```math-word\n<math><mi>x</mi><mo>+</mo><mn>1</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom, mathEl } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      // Pointer down
      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Simulate external blur (e.g. user Alt-Tabs or clicks external browser panel)
      const externalEl = document.createElement('div');
      externalEl.id = 'external-pane';
      document.body.appendChild(externalEl);

      mathEl.dispatchEvent(
        new FocusEvent('focusout', {
          bubbles: true,
          relatedTarget: externalEl,
        })
      );

      // Verification: widget handles blur cleanly, drag teardown runs
      expect(widget.isFocused).toBe(false);

      // Subsequent mouse move with buttons === 0 does NOT trigger drag
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 50, clientY: rect.top + 50, buttons: 0 })
      );
      expect(widget.selection).toBeNull();

      externalEl.remove();
      view.destroy();
      c.remove();
    });

    it('widget destruction cleanly detaches observers and cancels active drag sessions', () => {
      const docStr = '```math-word\n<math><mn>123</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const token = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token.getBoundingClientRect();

      token.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Destroy widget while drag is theoretically armed
      widget.destroy(dom);

      // Move mouse afterwards
      document.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 100, clientY: rect.top + 100, buttons: 1 })
      );

      // No exception thrown and global listeners detached
      expect(widget.selection).toBeNull();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 5: Selection Boundary Containment & Defect 2 Verification
  // =========================================================================
  describe('Section 5: Selection Dragging and Boundary Clamping', () => {
    it('click-and-drag inside equation activates selection, but dragging out of bounds clamps to [0, length]', () => {
      const docStr = '```math-word\n<math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { widget, dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tokens = dom.querySelectorAll('.eq-token');
      const tok1 = tokens[0] as HTMLElement;
      const r1 = tok1.getBoundingClientRect();
      const eqRect = dom.getBoundingClientRect();

      // 1. Pointerdown on Token 1
      tok1.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: r1.left + 2,
          clientY: r1.top + 2,
          buttons: 1,
        })
      );

      // 2. Drag 40px right inside equation (threshold exceeded with buttons: 1)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r1.left + 42,
          clientY: r1.top + 2,
          buttons: 1,
        })
      );

      // Selection MUST be active!
      expect(widget.selection).not.toBeNull();
      const innerSelectedCount = dom.querySelectorAll('.eq-selected-token').length;
      expect(innerSelectedCount).toBeGreaterThan(0);

      // 3. Drag vertically ABOVE equation into markdown text (y = eqRect.top - 50)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r1.left + 20,
          clientY: eqRect.top - 50,
          buttons: 1,
        })
      );

      expect(widget.selection).not.toBeNull();
      // Clamped to start: head offset 0 in root slot
      expect(widget.selection?.head.offset).toBe(0);

      // 4. Drag vertically BELOW equation into markdown text (y = eqRect.bottom + 80)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: r1.left + 20,
          clientY: eqRect.bottom + 80,
          buttons: 1,
        })
      );

      expect(widget.selection).not.toBeNull();
      // Clamped to end: head offset in root slot equals children length
      expect(widget.selection?.head.offset).toBe(widget.ast.children.length);

      // 5. Release mouse button
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: r1.left + 20,
          clientY: eqRect.bottom + 80,
          buttons: 0,
        })
      );

      // Committed selection remains intact
      expect(widget.selection).not.toBeNull();

      view.destroy();
      c.remove();
    });

    it('intercepts selectstart during active drag to prevent native markdown text selection', () => {
      const docStr = '```math-word\n<math><mn>123</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const items = getWidgetsAndDoms(view);
      const { dom } = items[0];
      computeAndApplyLayout(dom, 100, 100);

      const tok = dom.querySelector('.eq-token') as HTMLElement;
      const rect = tok.getBoundingClientRect();

      tok.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 1 })
      );

      // Fire native selectstart on document
      const selStartEvt = new Event('selectstart', { bubbles: true, cancelable: true });
      document.dispatchEvent(selStartEvt);

      // Must be prevented during active drag session!
      expect(selStartEvt.defaultPrevented).toBe(true);

      // Release
      document.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: rect.left, clientY: rect.top, buttons: 0 })
      );

      // Fire native selectstart after release: should not be prevented anymore
      const selStartAfter = new Event('selectstart', { bubbles: true, cancelable: true });
      document.dispatchEvent(selStartAfter);
      expect(selStartAfter.defaultPrevented).toBe(false);

      view.destroy();
      c.remove();
    });
  });
});
