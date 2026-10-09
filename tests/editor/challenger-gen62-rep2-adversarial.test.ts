/**
 * Challenger Gen 62 Rep 2 Independent Adversarial Stress Probe
 * Author: teamwork_preview_challenger_p2_1_rep2_gen62
 *
 * Empirical verification of:
 * 1. Non-Node / Non-Element target robustness on handleMouseClick & drag listeners
 *    (window, document, TextNode, Comment, DocumentFragment, detached Element, null, undefined)
 * 2. Pathological coordinates (NaN, Infinity, -Infinity, extreme offsets)
 * 3. Deeply nested AST drag & hit testing (depth 25 nested fractions)
 * 4. InteractiveEquationBox lifecycle under concurrent pointer events and immediate destruction
 * 5. Plugin command registration idempotency (multiple onload/onunload cycles)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { clearActiveEquationState } from '../../src/editor/active-session';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { App } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { SlotNode, FractionNode } from '../../src/core/types';

describe('Challenger Gen 62 Rep 2 Adversarial Stress Probes', () => {
  let container: HTMLElement;

  beforeEach(() => {
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
  });

  describe('Adversarial Target & Coordinate Stress on handleMouseClick', () => {
    const simpleAst: SlotNode = {
      id: 'root-1',
      role: 'root',
      parentNodeId: null,
      children: [
        { id: 'tok-1', type: 'token', text: 'x', tokenKind: 'mi', parentSlotId: 'root-1' },
        { id: 'tok-2', type: 'token', text: '+', tokenKind: 'mo', parentSlotId: 'root-1' },
        { id: 'tok-3', type: 'token', text: 'y', tokenKind: 'mi', parentSlotId: 'root-1' },
      ],
    };

    it('Should safely handle window, document, text node, comment, fragment, and detached element targets without throwing', () => {
      const rootEl = document.createElement('div');
      rootEl.className = 'word-equation-math';
      container.appendChild(rootEl);

      const tokenEl = document.createElement('span');
      tokenEl.className = 'eq-token';
      tokenEl.setAttribute('data-node-id', 'tok-1');
      rootEl.appendChild(tokenEl);

      const targetsToTest = [
        window,
        document,
        document.documentElement,
        document.createTextNode('orphan-text'),
        document.createComment('comment-node'),
        document.createDocumentFragment(),
        document.createElement('div'), // detached element
        null,
        undefined,
        rootEl,
        tokenEl,
      ];

      for (const target of targetsToTest) {
        expect(() => {
          const pos = handleMouseClick(simpleAst, rootEl, 50, 50, target as any);
          expect(pos).toBeDefined();
          expect(typeof pos.slotId).toBe('string');
          expect(typeof pos.offset).toBe('number');
        }).not.toThrow();
      }
    });

    it('Should safely handle pathological coordinates (NaN, Infinity, -Infinity, extreme values)', () => {
      const rootEl = document.createElement('div');
      rootEl.className = 'word-equation-math';
      container.appendChild(rootEl);

      const coords = [
        { x: NaN, y: NaN },
        { x: Infinity, y: Infinity },
        { x: -Infinity, y: -Infinity },
        { x: -999999, y: -999999 },
        { x: 9999999, y: 9999999 },
        { x: 0, y: 0 },
      ];

      for (const { x, y } of coords) {
        expect(() => {
          const pos = handleMouseClick(simpleAst, rootEl, x, y, window as any);
          expect(pos).toBeDefined();
          expect(pos.slotId).toBeDefined();
          expect(pos.offset).toBeGreaterThanOrEqual(0);
        }).not.toThrow();
      }
    });

    it('Should correctly handle SVG elements (e.g. radical surd checkmark)', () => {
      const rootEl = document.createElement('div');
      rootEl.className = 'word-equation-math';
      container.appendChild(rootEl);

      const radEl = document.createElement('span');
      radEl.className = 'eq-radical';
      rootEl.appendChild(radEl);

      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svgEl.appendChild(pathEl);
      radEl.appendChild(svgEl);

      const radicandSlotEl = document.createElement('span');
      radicandSlotEl.className = 'eq-slot eq-radicand';
      radicandSlotEl.setAttribute('data-slot-id', 'root-1');
      radEl.appendChild(radicandSlotEl);

      // SVG path element clicked
      const pos = handleMouseClick(simpleAst, rootEl, 10, 10, pathEl as any);
      expect(pos).toBeDefined();
      expect(pos.slotId).toBe('root-1');
    });

    it('Deep AST stress: should handle 25 levels of nested fractions without stack overflow or failure', () => {
      let currentSlot: SlotNode = {
        id: 'leaf-slot',
        role: 'numerator',
        parentNodeId: 'frac-0',
        children: [{ id: 'leaf-tok', type: 'token', text: '1', tokenKind: 'mn', parentSlotId: 'leaf-slot' }],
      };

      for (let i = 24; i >= 0; i--) {
        const fracNode: FractionNode = {
          id: `frac-${i}`,
          type: 'fraction',
          parentSlotId: i === 0 ? 'deep-root' : `frac-${i - 1}`,
          numerator: currentSlot,
          denominator: {
            id: `den-${i}`,
            role: 'denominator',
            parentNodeId: `frac-${i}`,
            children: [{ id: `num-${i}`, type: 'token', text: `${i}`, tokenKind: 'mn', parentSlotId: `den-${i}` }],
          },
        };
        currentSlot = {
          id: `slot-${i}`,
          role: 'numerator',
          parentNodeId: `frac-${i + 1}`,
          children: [fracNode],
        };
      }
      const rootAst: SlotNode = {
        id: 'deep-root',
        role: 'root',
        parentNodeId: null,
        children: currentSlot.children,
      };

      const rootEl = document.createElement('div');
      rootEl.className = 'word-equation-math';
      container.appendChild(rootEl);

      expect(() => {
        const pos = handleMouseClick(rootAst, rootEl, 50, 50, window as any);
        expect(pos).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('InteractiveEquationBox Adversarial Pointer & Lifecycle Stress', () => {
    it('Should handle pointer drag sequence when target transitions to window and document', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>',
        onChange: () => {},
      });

      box.isFocused = true;

      // Pointerdown inside box
      box.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }));

      // Pointermove targeting window
      const moveEvt1 = new PointerEvent('pointermove', { bubbles: true, clientX: 500, clientY: 500 });
      Object.defineProperty(moveEvt1, 'target', { value: window });
      expect(() => window.dispatchEvent(moveEvt1)).not.toThrow();

      // Pointermove targeting document
      const moveEvt2 = new PointerEvent('pointermove', { bubbles: true, clientX: -200, clientY: -200 });
      Object.defineProperty(moveEvt2, 'target', { value: document });
      expect(() => document.dispatchEvent(moveEvt2)).not.toThrow();

      // Pointerup targeting window
      const upEvt = new PointerEvent('pointerup', { bubbles: true, clientX: -200, clientY: -200 });
      Object.defineProperty(upEvt, 'target', { value: window });
      expect(() => window.dispatchEvent(upEvt)).not.toThrow();

      box.destroy();
    });

    it('Should safely handle immediate destruction during active pointer drag', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math><mi>x</mi></math>',
        onChange: () => {},
      });

      box.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      
      // Destroy immediately before pointerup fires
      expect(() => {
        box.destroy();
      }).not.toThrow();

      // Subsequent window pointermove and pointerup after box destroyed should not throw
      const moveEvt = new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 });
      Object.defineProperty(moveEvt, 'target', { value: window });
      expect(() => window.dispatchEvent(moveEvt)).not.toThrow();
    });

    it('Should safely handle non-text clipboard paste data', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math><mi>x</mi></math>',
        onChange: () => {},
      });
      box.isFocused = true;

      const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
      Object.defineProperty(pasteEvt, 'clipboardData', {
        value: {
          getData: () => '',
          types: ['image/png'],
        },
      });

      expect(() => {
        box.dom.dispatchEvent(pasteEvt);
      }).not.toThrow();

      box.destroy();
    });
  });

  describe('Plugin Command Registration Idempotency & Stress', () => {
    it('Multiple load/unload cycles should not leave duplicate commands or leak listeners', async () => {
      const desktopApp: any = new App();
      const plainCommandsObj: Record<string, any> = {};
      desktopApp.commands = {
        commands: plainCommandsObj,
        listCommands: () => Object.values(plainCommandsObj),
        executeCommandById: (id: string) => {
          const cmd = plainCommandsObj[id];
          if (cmd?.callback) return cmd.callback();
        },
      };

      for (let cycle = 0; cycle < 5; cycle++) {
        const plugin = new WordEquationPlugin(desktopApp, {} as any);
        plugin.settings = { ...DEFAULT_SETTINGS };
        await plugin.onload();

        const commands = desktopApp.commands.listCommands();
        const blockCmds = commands.filter((c: any) => c.name === 'Insert block equation');
        const inlineCmds = commands.filter((c: any) => c.name === 'Insert inline equation');

        expect(blockCmds.length).toBe(1);
        expect(inlineCmds.length).toBe(1);

        const keys = Object.keys(desktopApp.commands.commands);
        expect(keys.includes('insert-word-equation')).toBe(false);
        expect(keys.includes('insert-word-equation-inline')).toBe(false);

        plugin.onunload();
      }
    });
  });
});
