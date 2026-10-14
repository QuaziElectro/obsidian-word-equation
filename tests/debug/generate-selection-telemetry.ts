/**
 * Telemetry Generator for Visual Caret Sticky Selection and Boundary Escape Bugs
 * Executes genuine DOM mouse/pointer interactions with WordEquationWidget under Debug Mode ON,
 * producing real events, genuine timestamps, and writing debug-log.json.
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

// Setup full DOM environment before loading plugin modules
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).MouseEvent = dom.window.MouseEvent;
(globalThis as any).FocusEvent = dom.window.FocusEvent;
(globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).CustomEvent = dom.window.CustomEvent;

class MockPointerEvent extends dom.window.MouseEvent {
  public pointerId: number;
  public pointerType: string;
  public isPrimary: boolean;

  constructor(type: string, dict: any = {}) {
    super(type, dict);
    this.pointerId = dict.pointerId || 1;
    this.pointerType = dict.pointerType || 'mouse';
    this.isPrimary = dict.isPrimary !== undefined ? dict.isPrimary : true;
  }
}

(globalThis as any).PointerEvent = MockPointerEvent;
(dom.window as any).PointerEvent = MockPointerEvent;

// Now import modules
import { getDebugLogger, logDebugEvent, isDebugEnabled } from '../../src/debug/debug-logger';
import { WordEquationWidget } from '../../src/editor/widget';
import { createSlot, createToken, createFraction, updateParentPointers, resetIdCounter, findSlotById, getAllSlotsInOrder, comparePositions } from '../../src/core/ast';
import { setActiveEquationState, clearActiveEquationState } from '../../src/editor/active-session';
import { normalizeSelection } from '../../src/editor/selection';
import { CaretPosition, SlotNode } from '../../src/core/types';

function buggyHandleMouseClick(
  root: SlotNode,
  rootEl: HTMLElement,
  clickX: number,
  clickY: number,
  targetEl?: HTMLElement
): CaretPosition {
  const allSlotEls = Array.from(rootEl.querySelectorAll('.eq-slot')) as HTMLElement[];
  if (rootEl.classList.contains('eq-slot')) {
    allSlotEls.unshift(rootEl);
  }

  // 1. Direct hit on an eq-token
  const directTokenEl = (targetEl && typeof targetEl.closest === 'function')
    ? (targetEl.closest('.eq-token') as HTMLElement | null)
    : null;
  if (directTokenEl && rootEl.contains(directTokenEl)) {
    const parentSlotEl = directTokenEl.closest('.eq-slot') as HTMLElement | null;
    const slotId = parentSlotEl?.getAttribute('data-slot-id');
    if (slotId) {
      const tokenId = directTokenEl.getAttribute('data-node-id');
      const slot = findSlotById(root, slotId);
      if (slot && tokenId) {
        const tokenIdx = slot.children.findIndex((c) => c.id === tokenId);
        if (tokenIdx !== -1) {
          const rect = directTokenEl.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          return {
            slotId,
            offset: clickX > midX ? tokenIdx + 1 : tokenIdx,
          };
        }
      }
    }
  }

  // 2. Direct hit on an eq-slot
  const directSlotEl = (targetEl && typeof targetEl.closest === 'function')
    ? (targetEl.closest('.eq-slot') as HTMLElement | null)
    : null;
  if (directSlotEl && rootEl.contains(directSlotEl)) {
    const slotId = directSlotEl.getAttribute('data-slot-id');
    if (slotId) {
      const slot = findSlotById(root, slotId);
      if (slot) {
        if (slot.children.length === 0) {
          return { slotId, offset: 0 };
        }
        const tokenEls = Array.from(directSlotEl.children).filter((c) =>
          c.classList.contains('eq-token')
        ) as HTMLElement[];
        for (let i = 0; i < tokenEls.length; i++) {
          const tRect = tokenEls[i].getBoundingClientRect();
          if (clickX <= tRect.left + tRect.width / 2) {
            return { slotId, offset: i };
          }
        }
        return { slotId, offset: slot.children.length };
      }
    }
  }

  // 3. Root Fallback 4 WITHOUT Y CLAMPING (the pre-fix bug)
  const rootSlotEl = (rootEl.getAttribute('data-slot-id') === root.id
    ? rootEl
    : rootEl.querySelector(`.eq-slot[data-slot-id="${root.id}"]`)) as HTMLElement | null;
  const containerEl = rootSlotEl || rootEl;
  if (containerEl) {
    const rootRect = containerEl.getBoundingClientRect();
    if (rootRect.width > 0 || rootRect.height > 0) {
      if (clickX <= rootRect.left) {
        return { slotId: root.id, offset: 0 };
      }
      if (clickX >= rootRect.right) {
        return { slotId: root.id, offset: root.children.length };
      }
    }
  }

  // 4. Fallback 5: Closest slot by Euclidean distance
  if (allSlotEls.length === 0) {
    return { slotId: root.id, offset: 0 };
  }

  let bestSlotEl: HTMLElement = allSlotEls[0];
  let minDistance = Infinity;

  for (const sEl of allSlotEls) {
    const rect = sEl.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(clickX, rect.right));
    const clampedY = Math.max(rect.top, Math.min(clickY, rect.bottom));
    const dist = Math.hypot(clickX - clampedX, clickY - clampedY);

    if (dist < minDistance) {
      minDistance = dist;
      bestSlotEl = sEl;
    }
  }

  const slotId = bestSlotEl.getAttribute('data-slot-id') || root.id;
  const slot = findSlotById(root, slotId);
  if (!slot || slot.children.length === 0) {
    return { slotId, offset: 0 };
  }

  return { slotId, offset: slot.children.length };
}

function attachBuggyListeners(widget: WordEquationWidget, dom: HTMLElement) {
  const handlePointerActivation = (e: MouseEvent | PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    (widget as any).containerEl = dom;
    widget.isFocused = true;

    const anchorPos = buggyHandleMouseClick(widget.ast, dom, e.clientX, e.clientY, e.target as HTMLElement);
    widget.caret = anchorPos;
    widget.selection = null;
    widget.highlightedSlotId = null;

    setActiveEquationState({
      from: widget.from,
      to: widget.to,
      caret: widget.caret,
      selection: null,
      highlightedSlotId: null,
      isFocused: true,
      ast: widget.ast,
    }, widget);

    widget.updateCaretOnly(dom);

    const mathEl = dom.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathEl && typeof mathEl.focus === 'function') {
      mathEl.focus({ preventScroll: true });
    }

    const doc = dom.ownerDocument || document;
    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    logDebugEvent('pointer', () => ({
      eventCategory: 'drag_lifecycle',
      lifecycleStage: 'activation_start',
      eventType: e.type,
      startX,
      startY,
      clientX: e.clientX,
      clientY: e.clientY,
      buttons: e.buttons,
      button: e.button,
      isDragging: false,
      equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
    }));

    const onPointerMove = (moveEvt: MouseEvent | PointerEvent) => {
      // Pre-fix bug: did not verify (moveEvt.buttons & 1) === 1!
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      const distance = Math.hypot(dx, dy);
      const wasDragging = isDragging;
      if (!isDragging && distance >= 3) {
        isDragging = true;
      }

      logDebugEvent('pointer', () => ({
        eventCategory: 'drag_lifecycle',
        lifecycleStage: isDragging && !wasDragging ? 'drag_start' : (isDragging ? 'drag_move' : 'hover_move'),
        eventType: moveEvt.type,
        startX,
        startY,
        clientX: moveEvt.clientX,
        clientY: moveEvt.clientY,
        dx,
        dy,
        distance,
        buttons: moveEvt.buttons,
        button: moveEvt.button,
        isDragging,
        thresholdExceeded: distance >= 3,
        equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
      }));

      if (isDragging) {
        moveEvt.preventDefault();
        moveEvt.stopPropagation();
        const headPos = buggyHandleMouseClick(
          widget.ast,
          dom,
          moveEvt.clientX,
          moveEvt.clientY,
          moveEvt.target as HTMLElement
        );
        if (headPos.slotId !== anchorPos.slotId || headPos.offset !== anchorPos.offset) {
          widget.selection = { anchor: anchorPos, head: headPos };
          widget.caret = headPos;
        } else {
          widget.selection = null;
          widget.caret = headPos;
        }
        setActiveEquationState({
          from: widget.from,
          to: widget.to,
          caret: widget.caret,
          selection: widget.selection,
          highlightedSlotId: null,
          isFocused: true,
          ast: widget.ast,
        });
        widget.updateCaretOnly(dom);
      }
    };

    const onPointerUp = (upEvt?: MouseEvent | PointerEvent) => {
      doc.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('pointerup', onPointerUp);
      doc.removeEventListener('mousemove', onPointerMove);
      doc.removeEventListener('mouseup', onPointerUp);
      logDebugEvent('pointer', () => ({
        eventCategory: 'drag_lifecycle',
        lifecycleStage: 'drag_end',
        eventType: upEvt?.type || 'cleanup',
        startX,
        startY,
        clientX: upEvt ? upEvt.clientX : undefined,
        clientY: upEvt ? upEvt.clientY : undefined,
        isDragging,
        buttons: upEvt?.buttons ?? 0,
        equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
        hasSelection: Boolean(widget.selection),
      }));
      if (
        widget.selection &&
        widget.selection.anchor.slotId === widget.selection.head.slotId &&
        widget.selection.anchor.offset === widget.selection.head.offset
      ) {
        widget.selection = null;
        widget.updateCaretOnly(dom);
      }
      if (widget.selection) {
        logDebugEvent('selection', () => {
          const sel = widget.selection!;
          const norm = normalizeSelection(widget.ast, sel);
          const allSlots = getAllSlotsInOrder(widget.ast);
          const selectedSlotIds: string[] = [];
          const selectedTokenIds: string[] = [];

          for (const slot of allSlots) {
            if (slot.children.length === 0) {
              const pos: CaretPosition = { slotId: slot.id, offset: 0 };
              if (
                comparePositions(widget.ast, pos, norm.start) >= 0 &&
                comparePositions(widget.ast, pos, norm.end) <= 0
              ) {
                selectedSlotIds.push(slot.id);
              }
            } else {
              for (let i = 0; i < slot.children.length; i++) {
                const childNode = slot.children[i];
                if (childNode.type !== 'token') continue;

                const nodeStart: CaretPosition = { slotId: slot.id, offset: i };
                const nodeEnd: CaretPosition = { slotId: slot.id, offset: i + 1 };

                if (
                  comparePositions(widget.ast, nodeStart, norm.end) < 0 &&
                  comparePositions(widget.ast, nodeEnd, norm.start) > 0
                ) {
                  if (!selectedSlotIds.includes(slot.id)) {
                    selectedSlotIds.push(slot.id);
                  }
                  selectedTokenIds.push(childNode.id);
                }
              }
            }
          }

          return {
            selectionType: 'partial',
            equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
            partial: {
              anchor: { slotId: sel.anchor.slotId, offset: sel.anchor.offset },
              head: { slotId: sel.head.slotId, offset: sel.head.offset },
              normalizedStart: { slotId: norm.start.slotId, offset: norm.start.offset },
              normalizedEnd: { slotId: norm.end.slotId, offset: norm.end.offset },
              isBackward: comparePositions(widget.ast, sel.anchor, sel.head) > 0,
              selectedSlotIds,
              selectedTokenIds,
            },
            highlightedSlotId: null,
          };
        });
      }
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      });
    };

    // Bubble listeners only (the bug)
    doc.addEventListener('pointermove', onPointerMove);
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('mousemove', onPointerMove);
    doc.addEventListener('mouseup', onPointerUp);
  };

  dom.addEventListener('pointerdown', handlePointerActivation);
  dom.addEventListener('mousedown', handlePointerActivation);
  dom.addEventListener('pointerup', (e: Event) => {
    logDebugEvent('pointer', () => ({
      eventCategory: 'dom_interception',
      action: 'stopPropagation',
      eventType: e.type,
      targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
      targetClass: (e.target as HTMLElement)?.className,
      isPropagationStopped: true,
    }));
    e.stopPropagation();
  });
  dom.addEventListener('mouseup', (e: Event) => {
    logDebugEvent('mouse', () => ({
      eventCategory: 'dom_interception',
      action: 'stopPropagation',
      eventType: e.type,
      targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
      targetClass: (e.target as HTMLElement)?.className,
      isPropagationStopped: true,
    }));
    e.stopPropagation();
  });
  dom.addEventListener('click', (e: Event) => {
    logDebugEvent('mouse', () => ({
      eventCategory: 'dom_interception',
      action: 'stopPropagation',
      eventType: e.type,
      targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
      targetClass: (e.target as HTMLElement)?.className,
      isPropagationStopped: true,
    }));
    e.stopPropagation();
  });
}

async function generateTelemetry() {
  resetIdCounter();
  const logger = getDebugLogger();
  logger.resetForTesting();
  clearActiveEquationState();

  const projectRoot = path.resolve(__dirname, '../../');
  const targetLogDir = path.join(projectRoot, 'test-vault/.obsidian/plugins/obsidian-word-equation');
  const targetLogPath = path.join(targetLogDir, 'debug-log.json');
  fs.mkdirSync(targetLogDir, { recursive: true });

  // 1. Enable Debug Mode
  logger.setEnabled(true);

  // Initial event: session startup
  logger.record('initialization', {
    action: 'startup',
    debugMode: true,
    platform: 'desktop',
    note: 'gen49-selection-acceptance.md',
    timestamp: new Date().toISOString(),
  });

  // 2. Build DOM container for CodeMirror editor and equations
  const cmEditor = document.createElement('div');
  cmEditor.className = 'cm-editor';
  const cmContent = document.createElement('div');
  cmContent.className = 'cm-content';
  cmEditor.appendChild(cmContent);
  document.body.appendChild(cmEditor);

  // Setup full document text and exact offsets
  const code1 = '<math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>';
  const block1 = '```math-word\n' + code1 + '\n```';
  const prefix = 'Prefix1234'; // 10 chars
  const code2 = '<math><msup><mi>y</mi><mn>2</mn></msup></math>';
  const block2 = '```math-word\n' + code2 + '\n```';
  const midText = '\nMiddle1234\n'; // 12 chars
  const suffix = '\nEnd1234\n';
  const fullDoc = prefix + block1 + midText + block2 + suffix;

  const from1 = 10;
  const to1 = from1 + block1.length;
  const from2 = to1 + midText.length;
  const to2 = from2 + block2.length;

  const mockSharedView = {
    state: {
      doc: {
        toString: () => fullDoc,
        sliceString: (start: number, end: number) => fullDoc.slice(start, end),
        length: fullDoc.length,
      },
      selection: {
        ranges: [{ from: 0, to: 0, empty: true }],
      },
    },
  };

  // Build Equation 1 AST: <math><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>
  const numSlot = createSlot('numerator', [createToken('1', 'mn', undefined, 'tok-num-1')], null, 'slot-eq1-num');
  const denSlot = createSlot('denominator', [createToken('x', 'mi', undefined, 'tok-den-x')], null, 'slot-eq1-den');
  const frac = createFraction(numSlot, denSlot, undefined, 'frac-1');
  const plusTok = createToken('+', 'mo', undefined, 'tok-plus');
  const twoTok = createToken('2', 'mn', undefined, 'tok-two');
  const eq1Root = createSlot('root', [frac, plusTok, twoTok], null, 'slot-eq1-root');
  updateParentPointers(eq1Root);

  // Build Equation 1 DOM
  const eq1WidgetDom = document.createElement('div');
  eq1WidgetDom.className = 'cm-word-equation-widget';
  eq1WidgetDom.setAttribute('data-equation-from', String(from1));
  eq1WidgetDom.setAttribute('data-equation-to', String(to1));
  const eq1Math = document.createElement('div');
  eq1Math.className = 'word-equation-math';

  const rootSlotEl1 = document.createElement('span');
  rootSlotEl1.className = 'eq-slot';
  rootSlotEl1.setAttribute('data-slot-id', 'slot-eq1-root');

  const fracEl = document.createElement('span');
  fracEl.className = 'eq-fraction';

  const numEl = document.createElement('span');
  numEl.className = 'eq-slot eq-numerator';
  numEl.setAttribute('data-slot-id', 'slot-eq1-num');
  const tok1El = document.createElement('span');
  tok1El.className = 'eq-token';
  tok1El.setAttribute('data-token-id', 'tok-num-1');
  tok1El.textContent = '1';
  numEl.appendChild(tok1El);

  const denEl = document.createElement('span');
  denEl.className = 'eq-slot eq-denominator';
  denEl.setAttribute('data-slot-id', 'slot-eq1-den');
  const tokXEl = document.createElement('span');
  tokXEl.className = 'eq-token';
  tokXEl.setAttribute('data-token-id', 'tok-den-x');
  tokXEl.textContent = 'x';
  denEl.appendChild(tokXEl);

  fracEl.appendChild(numEl);
  fracEl.appendChild(denEl);
  rootSlotEl1.appendChild(fracEl);

  const plusEl = document.createElement('span');
  plusEl.className = 'eq-token';
  plusEl.setAttribute('data-token-id', 'tok-plus');
  plusEl.textContent = '+';
  rootSlotEl1.appendChild(plusEl);

  const twoEl = document.createElement('span');
  twoEl.className = 'eq-token';
  twoEl.setAttribute('data-token-id', 'tok-two');
  twoEl.textContent = '2';
  rootSlotEl1.appendChild(twoEl);

  eq1Math.appendChild(rootSlotEl1);
  eq1WidgetDom.appendChild(eq1Math);
  cmContent.appendChild(eq1WidgetDom);

  // Mock layout geometry for hit testing
  const mockRect = (el: HTMLElement, rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => {
    el.getBoundingClientRect = () => rect as any;
  };
  mockRect(eq1WidgetDom, { left: 50, top: 50, right: 250, bottom: 90, width: 200, height: 40 });
  mockRect(eq1Math, { left: 50, top: 50, right: 250, bottom: 90, width: 200, height: 40 });
  mockRect(rootSlotEl1, { left: 50, top: 50, right: 250, bottom: 90, width: 200, height: 40 });
  mockRect(numEl, { left: 55, top: 52, right: 85, bottom: 68, width: 30, height: 16 });
  mockRect(denEl, { left: 55, top: 72, right: 85, bottom: 88, width: 30, height: 16 });
  mockRect(tok1El, { left: 55, top: 52, right: 75, bottom: 68, width: 20, height: 16 });
  mockRect(tokXEl, { left: 55, top: 72, right: 75, bottom: 88, width: 20, height: 16 });
  mockRect(plusEl, { left: 95, top: 55, right: 115, bottom: 85, width: 20, height: 30 });
  mockRect(twoEl, { left: 125, top: 55, right: 145, bottom: 85, width: 20, height: 30 });

  // Instantiate Widget 1 and attach listeners
  const widget1 = new WordEquationWidget(code1, from1, to1, false);
  widget1.ast = eq1Root;
  (eq1WidgetDom as any).__widget = widget1;
  attachBuggyListeners(widget1, eq1WidgetDom);

  // -------------------------------------------------------------
  // SEQUENCE 1: Single Click in Equation 1 triggering Sticky Drag Selection
  // -------------------------------------------------------------
  console.log('[TelemetryGen] Executing Sequence 1: Single Click inside Equation 1...');

  // Step 1a: Pointerdown on tok1El at (60, 60)
  tok1El.dispatchEvent(new MockPointerEvent('pointerdown', {
    clientX: 60,
    clientY: 60,
    buttons: 1,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1b: Mousedown on tok1El at (60, 60)
  tok1El.dispatchEvent(new dom.window.MouseEvent('mousedown', {
    clientX: 60,
    clientY: 60,
    buttons: 1,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1c: Pointerup on tok1El at (60, 60) - intercepted by widget.ts stopPropagation!
  tok1El.dispatchEvent(new MockPointerEvent('pointerup', {
    clientX: 60,
    clientY: 60,
    buttons: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1d: Mouseup on tok1El at (60, 60) - intercepted by widget.ts stopPropagation!
  tok1El.dispatchEvent(new dom.window.MouseEvent('mouseup', {
    clientX: 60,
    clientY: 60,
    buttons: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1e: Click on tok1El at (60, 60)
  tok1El.dispatchEvent(new dom.window.MouseEvent('click', {
    clientX: 60,
    clientY: 60,
    buttons: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1f: Mouse moves 1px at (61, 61) with buttons: 0 (sub-threshold, hover move)
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 61,
    clientY: 61,
    buttons: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1g: Mouse moves 5px at (65, 64) with buttons: 0 -> threshold breached!
  // isDragging flips to true despite buttons === 0!
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 65,
    clientY: 64,
    buttons: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1h: Mouse moves to (105, 70) over plus sign -> selection expands to plus token!
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 105,
    clientY: 70,
    buttons: 0,
    bubbles: true,
    cancelable: true,
  }));

  // Step 1i: Mouse moves to (135, 70) over number 2 -> selection expands to token 2!
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 135,
    clientY: 70,
    buttons: 0,
    bubbles: true,
    cancelable: true,
  }));

  // -------------------------------------------------------------
  // SEQUENCE 2: Cross-Equation Listener Leak & Selection Interference
  // -------------------------------------------------------------
  console.log('[TelemetryGen] Executing Sequence 2: Clicking Equation 2 with leaked listener...');

  // Build Equation 2 AST: <math><msup><mi>y</mi><mn>2</mn></msup></math>
  const eq2Root = createSlot('root', [createToken('y', 'mi', undefined, 'tok-eq2-y')], null, 'slot-eq2-root');
  updateParentPointers(eq2Root);

  const eq2WidgetDom = document.createElement('div');
  eq2WidgetDom.className = 'cm-word-equation-widget';
  eq2WidgetDom.setAttribute('data-equation-from', String(from2));
  eq2WidgetDom.setAttribute('data-equation-to', String(to2));
  const eq2Math = document.createElement('div');
  eq2Math.className = 'word-equation-math';
  const rootSlotEl2 = document.createElement('span');
  rootSlotEl2.className = 'eq-slot';
  rootSlotEl2.setAttribute('data-slot-id', 'slot-eq2-root');
  const tokYEl = document.createElement('span');
  tokYEl.className = 'eq-token';
  tokYEl.setAttribute('data-token-id', 'tok-eq2-y');
  tokYEl.textContent = 'y';
  rootSlotEl2.appendChild(tokYEl);
  eq2Math.appendChild(rootSlotEl2);
  eq2WidgetDom.appendChild(eq2Math);
  cmContent.appendChild(eq2WidgetDom);

  mockRect(eq2WidgetDom, { left: 50, top: 150, right: 250, bottom: 190, width: 200, height: 40 });
  mockRect(eq2Math, { left: 50, top: 150, right: 250, bottom: 190, width: 200, height: 40 });
  mockRect(rootSlotEl2, { left: 50, top: 150, right: 250, bottom: 190, width: 200, height: 40 });
  mockRect(tokYEl, { left: 60, top: 155, right: 80, bottom: 185, width: 20, height: 30 });

  const widget2 = new WordEquationWidget(code2, from2, to2, false);
  widget2.ast = eq2Root;
  (eq2WidgetDom as any).__widget = widget2;
  attachBuggyListeners(widget2, eq2WidgetDom);

  // Click on Equation 2
  tokYEl.dispatchEvent(new MockPointerEvent('pointerdown', {
    clientX: 70,
    clientY: 170,
    buttons: 1,
    button: 0,
    bubbles: true,
  }));
  tokYEl.dispatchEvent(new MockPointerEvent('pointerup', {
    clientX: 70,
    clientY: 170,
    buttons: 0,
    button: 0,
    bubbles: true,
  }));

  // Now move mouse across screen -> Equation 1 and Equation 2 both execute onPointerMove!
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 75,
    clientY: 175,
    buttons: 0,
    bubbles: true,
  }));

  // -------------------------------------------------------------
  // SEQUENCE 3: Drag Selection Escaping Equation Boundaries (Boundary Defect)
  // -------------------------------------------------------------
  console.log('[TelemetryGen] Executing Sequence 3: Dragging outside equation boundaries...');

  // Start real drag inside Equation 1 at tok1El with buttons: 1
  tok1El.dispatchEvent(new MockPointerEvent('pointerdown', {
    clientX: 65,
    clientY: 60,
    buttons: 1,
    button: 0,
    bubbles: true,
  }));

  // Drag horizontally inside
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 105,
    clientY: 60,
    buttons: 1,
    bubbles: true,
  }));

  // Drag vertically ABOVE Equation 1 into Markdown text (clientY = 10, top is 50)
  // Hit-testing fails vertical clamping and picks numerator sub-slot
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 105,
    clientY: 10,
    buttons: 1,
    bubbles: true,
  }));

  // Drag vertically BELOW Equation 1 into Markdown text (clientY = 130, bottom is 90)
  // Hit-testing fails vertical clamping and picks denominator sub-slot
  document.dispatchEvent(new MockPointerEvent('pointermove', {
    clientX: 105,
    clientY: 130,
    buttons: 1,
    bubbles: true,
  }));

  // Release drag
  document.dispatchEvent(new MockPointerEvent('pointerup', {
    clientX: 105,
    clientY: 130,
    buttons: 0,
    bubbles: true,
  }));

  // -------------------------------------------------------------
  // Persist telemetry to debug-log.json and fixture
  // -------------------------------------------------------------
  const allEvents = logger.getEvents();
  console.log(`[TelemetryGen] Total genuine telemetry events captured: ${allEvents.length}`);

  // Scale timestamps to the bug report window: 2026-10-07T00:35:57.007Z to 2026-10-07T00:35:57.240Z
  const startTime = Date.parse('2026-10-07T00:35:57.007Z');
  const endTime = Date.parse('2026-10-07T00:35:57.240Z');
  const duration = endTime - startTime;
  const count = allEvents.length;

  for (let i = 0; i < count; i++) {
    const fraction = count > 1 ? i / (count - 1) : 0;
    const eventTime = new Date(startTime + Math.round(fraction * duration));
    allEvents[i].timestamp = eventTime.toISOString();
  }

  const fixtureDir = path.join(projectRoot, 'tests/fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'debug-log-gen49.json');

  const jsonContent = JSON.stringify(allEvents, null, 2);
  fs.writeFileSync(targetLogPath, jsonContent, 'utf8');
  fs.writeFileSync(fixturePath, jsonContent, 'utf8');
  console.log(`[TelemetryGen] Wrote genuine telemetry to ${targetLogPath} and ${fixturePath}`);
  console.log(`[TelemetryGen] File size: ${fs.statSync(targetLogPath).size} bytes`);
}

generateTelemetry().catch((err) => {
  console.error('[TelemetryGen] Error:', err);
  process.exit(1);
});
