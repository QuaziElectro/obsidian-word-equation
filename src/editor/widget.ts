/**
 * CodeMirror 6 Word-like Equation Widget
 * Renders interactive visual MathML editor and encapsulates keyboard & mouse interaction.
 */

import { WidgetType, EditorView } from '@codemirror/view';
import { SlotNode, CaretPosition, MathNode, SelectionRange, MATHML_NAMESPACE, EquationDisplayMode } from '../core/types';
import { parseMathML } from '../core/mathml-parser';

import { serializeMathML } from '../core/mathml-serializer';
import { parseLinearEquation } from '../core/linear-parser';
import {
  cloneSlot,
  cloneNode,
  createSlot,
  createToken,
  findSlotById,
  findNodeById,
  findParentNodeOfSlot,
  isEquationEmpty,
  isSlotEmpty,
  getChildSlots,
  getAllSlotsInOrder,
  updateParentPointers,
  comparePositions,
  findFirstEditableSlot,
  findLastEditableSlot,
  elevateSelectionForDrag,
  extractSelectionAST,
} from '../core/ast';
import { DomRenderer } from './dom-renderer';
import {
  handleArrowKey,
  handleTabKey,
  handleSelectionStep,
  handleHierarchicalBoundaryExpansion,
  SelectionStepResult,
} from './navigation';

export {
  handleSelectionStep,
  handleHierarchicalBoundaryExpansion,
} from './navigation';
export type { SelectionStepResult } from './navigation';
export { elevateSelectionForDrag } from '../core/ast';
import { handleMouseClick } from './hit-testing';
import {
  insertCharacter,
  handleBackspace,
  handleDelete,
  updateVisualCaretDom,
  updateEquationSelectionDom,
  updatePartialSelectionDom,
  deleteSelection,
  deleteParentStructure,
  normalizeSelection,
} from './selection';
import { expandShortcutInSlot } from '../shortcuts/engine';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationWidget,
} from './active-session';
import {
  logDebugEvent,
  getDebugLogger,
  isDebugEnabled,
  attachEquationMutationObserver,
  disconnectEquationMutationObserver,
  captureTableCellMetrics,
} from '../debug/debug-logger';

import { isTableRowLine, isInsideTableRow } from './state-field';

let isUpdatingActiveEquation = false;
export function isInternalEquationUpdating(): boolean {
  return isUpdatingActiveEquation;
}
let activeDragCleanup: (() => void) | null = null;
const activeDragTeardown = () => {
  if (activeDragCleanup) {
    activeDragCleanup();
    activeDragCleanup = null;
  }
};

export function isBlockEquationStart(view: EditorView, line: { text: string; from: number }): boolean {
  const lineText = line.text.trimStart();
  if (lineText.startsWith('```math-word') || lineText.startsWith('```weq')) {
    return true;
  }
  return false;
}

export function isBlockEquationEnd(view: EditorView, line: { text: string; to: number; from: number }): boolean {
  const lineText = line.text.trim();
  if (lineText === '```') {
    // Verify that this closing fence belongs to a math-word or weq block
    const textBefore = view.state.doc.sliceString(Math.max(0, line.from - 2000), line.to);
    const lastFence = textBefore.lastIndexOf('```');
    if (lastFence !== -1) {
      const prevFence = textBefore.lastIndexOf('```', lastFence - 1);
      if (prevFence !== -1) {
        const fenceHeader = textBefore.slice(prevFence, prevFence + 20);
        if (fenceHeader.startsWith('```math-word') || fenceHeader.startsWith('```weq')) {
          return true;
        }
      }
    }
  }
  return false;
}

export class WordEquationWidget extends WidgetType {
  public ast: SlotNode;
  public caret: CaretPosition;
  public selection: SelectionRange | null = null;
  public highlightedSlotId: string | null = null;
  public isFocused = false;
  private static liveWidgets: Set<WordEquationWidget> = new Set();

  public syncPeerWidgets(focused: boolean): void {
    for (const other of WordEquationWidget.liveWidgets) {
      if (other !== this && other.code === this.code && Math.abs(other.from - this.from) <= 4) {
        other.isFocused = focused;
        if (focused) {
          other.caret = this.caret;
          other.selection = this.selection;
          other.ast = this.ast;
          other.highlightedSlotId = this.highlightedSlotId;
        }
      }
    }
  }
  public justExitedForward = false;
  public enteredFromEnd = false;
  public justEscapedForwardAfterEnteringFromEnd = false;
  public lastForwardExitPos = -1;
  private isUpdatingDom = false;
  private renderer = new DomRenderer();
  private containerEl: HTMLElement | null = null;
  private currentView: EditorView | null = null;
  private justExpandedShortcut = false;
  private mutationObserver: MutationObserver | null = null;
  private lastClickTime = 0;
  private lastClickX = 0;
  private lastClickY = 0;
  private lastClickCount = 0;
  public lastClickPos: CaretPosition | null = null;
  public lastClickTarget: EventTarget | null = null;

  public resolveClickCount(e: MouseEvent | PointerEvent): number {
    const now = Date.now();
    const dt = now - this.lastClickTime;
    const dist = Math.hypot(e.clientX - this.lastClickX, e.clientY - this.lastClickY);
    let count = e.detail;
    if (count === undefined || count === 0) {
      count = dt < 400 && dist < 15 ? this.lastClickCount + 1 : 1;
    }
    this.lastClickTime = now;
    this.lastClickX = e.clientX;
    this.lastClickY = e.clientY;
    this.lastClickCount = count;
    return count;
  }

  public attachObserver(dom: HTMLElement): void {
    if (!isDebugEnabled()) {
      this.detachObserver();
      return;
    }
    if (this.mutationObserver) return;
    this.mutationObserver = attachEquationMutationObserver(dom);
  }

  public detachObserver(): void {
    if (this.mutationObserver) {
      disconnectEquationMutationObserver(this.mutationObserver);
      this.mutationObserver = null;
    }
  }

  constructor(
    public code: string,
    public from: number,
    public to: number,
    public isInline: boolean = false,
    public delimiter: string = 'math-word',
    public isBlockInTable: boolean = false,
    public displayMode: EquationDisplayMode = (delimiter === 'math-page' || delimiter === 'weq-page' ? 'full-page' : (isInline ? 'inline' : 'block')),
    public isInlineInTable: boolean = false
  ) {
    super();
    const parsedAst = parseMathML(this.code);
    const active = getActiveEquationState();
    const isAstCompatible =
      Boolean(active && active.isFocused && active.from === this.from) &&
      (!isEquationEmpty(parsedAst) ? !isEquationEmpty(active!.ast || parsedAst) : isEquationEmpty(active!.ast || parsedAst));

    const isExternalChange = Boolean(
      !isUpdatingActiveEquation &&
      active &&
      active.isFocused &&
      active.from === this.from &&
      active.ast &&
      (serializeMathML(active.ast, { pretty: !this.isInline, display: this.isInline ? 'inline' : 'block' }).trim() !== this.code.trim() &&
       serializeMathML(active.ast, { pretty: !this.isInline }).trim() !== this.code.trim())
    );

    if (isExternalChange) {
      this.ast = parsedAst;
      this.isFocused = true;
      const targetSlot = findSlotById(parsedAst, active!.caret.slotId);
      if (targetSlot) {
        this.caret = {
          slotId: targetSlot.id,
          offset: Math.min(active!.caret.offset, targetSlot.children.length),
        };
      } else {
        this.caret = { slotId: parsedAst.id, offset: parsedAst.children.length };
      }
      this.selection = null;
      this.highlightedSlotId = null;
      setActiveEquationState({
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      }, this);
    } else if (isAstCompatible && active) {
      this.isFocused = true;
      this.caret = active.caret;
      this.selection = active.selection || null;
      this.highlightedSlotId = active.highlightedSlotId || null;
      this.ast = active.ast || parsedAst;
    } else {
      this.ast = parsedAst;
      this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
    }
    WordEquationWidget.liveWidgets.add(this);
  }

  public eq(other: WordEquationWidget): boolean {
    return (
      this.code === other.code &&
      this.from === other.from &&
      this.to === other.to &&
      this.isInline === other.isInline &&
      this.delimiter === other.delimiter &&
      this.isBlockInTable === other.isBlockInTable &&
      this.displayMode === other.displayMode &&
      this.isInlineInTable === other.isInlineInTable
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    this.currentView = view;
    const active = getActiveEquationState();
    const isExternalChange = Boolean(
      !isUpdatingActiveEquation &&
      active &&
      active.isFocused &&
      active.from === this.from &&
      active.ast &&
      (serializeMathML(active.ast, { pretty: !this.isInline, display: this.isInline ? 'inline' : 'block' }).trim() !== this.code.trim() &&
       serializeMathML(active.ast, { pretty: !this.isInline }).trim() !== this.code.trim())
    );
    const parsedAst = isExternalChange ? parseMathML(this.code) : (this.ast || parseMathML(this.code));
    const isAstCompatible =
      Boolean(active && active.isFocused && active.from === this.from) &&
      (!isEquationEmpty(parsedAst) ? !isEquationEmpty(active!.ast || parsedAst) : isEquationEmpty(active!.ast || parsedAst));

    if (isExternalChange) {
      this.ast = parsedAst;
      this.isFocused = true;
      const targetSlot = findSlotById(parsedAst, active!.caret.slotId);
      if (targetSlot) {
        this.caret = {
          slotId: targetSlot.id,
          offset: Math.min(active!.caret.offset, targetSlot.children.length),
        };
      } else {
        this.caret = { slotId: parsedAst.id, offset: parsedAst.children.length };
      }
      this.selection = null;
      this.highlightedSlotId = null;
      setActiveEquationState({
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      }, this);
    } else if (isAstCompatible && active) {
      this.isFocused = true;
      this.caret = active.caret;
      this.selection = active.selection || null;
      this.highlightedSlotId = active.highlightedSlotId || null;
      if (active.ast) {
        this.ast = active.ast;
      }
    } else if (active && active.from === this.from && !isAstCompatible) {
      this.isFocused = false;
      this.ast = parsedAst;
      this.selection = null;
      this.highlightedSlotId = null;
    }
    const dom = this.renderCurrentDom();
    this.containerEl = dom;
    (dom as any).__widget = this;
    dom.setAttribute('data-equation-from', String(this.from));
    dom.setAttribute('data-equation-to', String(this.to));
    const isSelected =
      !this.isFocused &&
      Boolean(view?.state?.selection?.ranges?.some((r) => !r.empty && r.from < this.to && r.to > this.from));
    updateEquationSelectionDom(dom, isSelected);
    if (this.selection || this.highlightedSlotId) {
      updatePartialSelectionDom(dom, this.ast, this.selection, this.highlightedSlotId);
    }
    this.attachEventListeners(dom, view);
    const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathBox) {
      (mathBox as any).__widget = this;
    }
    if (this.isFocused) {
      this.attachObserver(dom);
    }
    return dom;
  }

  public updateDOM(dom: HTMLElement, view: EditorView, oldWidget?: WidgetType): boolean {
    this.currentView = view;
    this.containerEl = dom;
    const activeState = getActiveEquationState();
    const activeWidget = getActiveEquationWidget();
    const prevWidget =
      (activeWidget instanceof WordEquationWidget && activeWidget.from === this.from ? activeWidget : null) ||
      ((dom as any).__widget instanceof WordEquationWidget ? (dom as any).__widget : null) ||
      (oldWidget instanceof WordEquationWidget ? oldWidget : null);
    const isInternalUpdate = Boolean(
      this.isUpdatingDom ||
      prevWidget?.isUpdatingDom ||
      isUpdatingActiveEquation
    );

    if (prevWidget && this.code !== prevWidget.code && !isInternalUpdate) {
      return false;
    }

    (dom as any).__widget = this;
    const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathBox) {
      (mathBox as any).__widget = this;
    }
    dom.setAttribute('data-equation-from', String(this.from));
    dom.setAttribute('data-equation-to', String(this.to));

    if (isInternalUpdate && prevWidget) {
      this.ast = (activeState && activeState.from === this.from && activeState.isFocused && activeState.ast) ? activeState.ast : prevWidget.ast;
      this.caret = (activeState && activeState.from === this.from && activeState.isFocused && activeState.caret) ? activeState.caret : prevWidget.caret;
      this.selection = prevWidget.selection;
      this.highlightedSlotId = prevWidget.highlightedSlotId;
      this.isFocused = prevWidget.isFocused;
      updateEquationSelectionDom(dom, false);
      if (this.selection || this.highlightedSlotId) {
        updatePartialSelectionDom(dom, this.ast, this.selection, this.highlightedSlotId);
      } else {
        updatePartialSelectionDom(dom, this.ast, null);
      }
      updateVisualCaretDom(dom, this.caret, this.isFocused);
      if (this.isFocused) {
        this.attachObserver(dom);
      } else {
        this.detachObserver();
      }
      return true;
    }

    const active = getActiveEquationState();
    const parsedAst = parseMathML(this.code);
    const isAstCompatible =
      Boolean(active && active.isFocused && active.from === this.from) &&
      (!isEquationEmpty(parsedAst) ? !isEquationEmpty(active!.ast || parsedAst) : isEquationEmpty(active!.ast || parsedAst));

    if (isAstCompatible && active) {
      this.isFocused = true;
      this.caret = active.caret;
      this.selection = active.selection || null;
      this.highlightedSlotId = active.highlightedSlotId || null;
      if (active.ast) {
        this.ast = active.ast;
      } else {
        this.ast = parsedAst;
      }
    } else {
      this.isFocused = false;
      this.ast = parsedAst;
      this.selection = null;
      this.highlightedSlotId = null;
    }

    this.isUpdatingDom = true;
    try {
      this.updateDomContents(dom);
      dom.setAttribute('data-equation-from', String(this.from));
      dom.setAttribute('data-equation-to', String(this.to));
      if (this.isFocused) {
        const mathEl = dom.querySelector('.word-equation-math') as HTMLElement | null;
        if (mathEl && typeof mathEl.focus === 'function') {
          mathEl.focus({ preventScroll: true });
        }
      }
    } finally {
      this.isUpdatingDom = false;
    }
    const isSelected =
      !this.isFocused &&
      view.state.selection.ranges.some((r) => !r.empty && r.from < this.to && r.to > this.from);
    updateEquationSelectionDom(dom, isSelected);
    if (this.isFocused) {
      this.attachObserver(dom);
    } else {
      this.detachObserver();
    }
    return true;
  }

  public ignoreEvent(event: Event): boolean {
    const interactiveEvents = [
      'pointerdown',
      'pointerup',
      'pointermove',
      'mousedown',
      'mouseup',
      'click',
      'dblclick',
      'keydown',
      'keyup',
      'keypress',
      'selectionchange',
      'beforeinput',
      'input',
      'contextmenu',
      'touchstart',
      'touchend',
      'touchmove',
      'copy',
      'cut',
      'paste',
    ];
    return interactiveEvents.includes(event.type);
  }

  public destroy(dom: HTMLElement): void {
    activeDragTeardown();
    this.detachObserver();
    if (dom) {
      if ((dom as any).__widget === this) {
        delete (dom as any).__widget;
      }
      const math = dom.querySelector?.('.word-equation-math');
      if (math && (math as any).__widget === this) {
        delete (math as any).__widget;
      }
    }
    if (!isUpdatingActiveEquation && this.containerEl === dom) {
      this.containerEl = null;
    }
    this.currentView = null;
    if (isUpdatingActiveEquation) {
      return;
    }
    const active = getActiveEquationState();
    if (active && active.from === this.from) {
      clearActiveEquationState();
    }
  }

  /**
   * Reconciles this widget's AST with the mounted DOM element to handle
   * CodeMirror 6 widget recycling and ephemeral slot ID generation.
   */
  private reconcileDomAst(view?: EditorView): void {
    if (!this.containerEl && view) {
      let el = view.dom.querySelector(`[data-equation-from="${this.from}"]`) as HTMLElement | null;
      if (!el) {
        const mathEl =
          view.dom.querySelector(`[data-equation-from="${this.from}"] .word-equation-math`) ||
          view.dom.querySelector('.word-equation-math');
        if (mathEl && mathEl.parentElement) {
          el = mathEl.parentElement;
        }
      }
      if (el) {
        this.containerEl = el;
      }
    }

    if (this.containerEl) {
      const domWidget = (this.containerEl as any).__widget;
      if (domWidget && domWidget !== this && domWidget.ast && domWidget.code === this.code) {
        // Adopt the existing AST from the mounted DOM widget (preserves identical slot IDs)
        this.ast = domWidget.ast;
      } else {
        // Verify that this widget's AST slot IDs exist in the mounted DOM
        const firstSlotEl = this.containerEl.querySelector('.eq-slot');
        const domSlotId = firstSlotEl?.getAttribute('data-slot-id');
        if (domSlotId && !findSlotById(this.ast, domSlotId)) {
          // Slot IDs are desynchronized: re-render mounted DOM to align with this.ast
          this.rerender();
        }
      }

      (this.containerEl as any).__widget = this;
      const mathBox = this.containerEl.querySelector('.word-equation-math') as HTMLElement | null;
      if (mathBox) {
        (mathBox as any).__widget = this;
      }
      this.attachObserver(this.containerEl);
    }
  }

  public enterFromStart(view: EditorView, key: 'ArrowRight' | 'ArrowDown' = 'ArrowRight'): void {
    this.currentView = view;
    const cmSelectionBefore = isDebugEnabled() && view ? {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
      empty: view.state.selection.main.empty,
    } : undefined;
    const activeElBefore = isDebugEnabled() && typeof document !== 'undefined'
      ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
      : undefined;

    activeDragTeardown();
    const prevActiveWidget = getActiveEquationWidget();
    if (prevActiveWidget && prevActiveWidget !== this) {
      prevActiveWidget.isFocused = false;
      prevActiveWidget.selection = null;
      prevActiveWidget.highlightedSlotId = null;
      prevActiveWidget.updateCaretOnly();
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => {
        el.classList.remove('eq-active');
        el.querySelectorAll('.eq-caret').forEach((c) => c.remove());
      });
    }
    this.isFocused = true;
    this.justExitedForward = false;
    this.enteredFromEnd = false;
    this.justEscapedForwardAfterEnteringFromEnd = false;
    this.lastForwardExitPos = -1;

    // 1. Resolve container element & reconcile AST before setting caret
    this.reconcileDomAst(view);

    // 2. Position caret at root slot offset 0
    this.caret = { slotId: this.ast.id, offset: 0 };

    // 3. Publish active equation session state with reconciled AST and caret
    setActiveEquationState(
      {
        from: this.from,
        to: this.to,
        caret: this.caret,
        isFocused: true,
        ast: this.ast,
      },
      this
    );
    this.syncPeerWidgets(true);

    // 4. Update caret and active highlights in DOM
    this.updateCaretOnly();

    // 5. Assert focus on math element
    if (this.containerEl) {
      const mathEl = (this.containerEl.classList?.contains('word-equation-math')
        ? this.containerEl
        : this.containerEl.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl && typeof mathEl.focus === 'function') {
        mathEl.focus({ preventScroll: true });
      }

      // Defensive focus assertion: recover focus if deferred browser events blurred to body
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          if (this.isFocused && mathEl && document.activeElement === document.body && typeof mathEl.focus === 'function') {
            mathEl.focus({ preventScroll: true });
          }
        });
      }
    }

    if (isDebugEnabled()) {
      const cmSelectionAfter = view ? {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
        empty: view.state.selection.main.empty,
      } : undefined;
      const activeElAfter = typeof document !== 'undefined'
        ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
        : undefined;

      const enteredSlot = findSlotById(this.ast, this.caret.slotId);
      const isPlaceholderSlot = enteredSlot ? isSlotEmpty(enteredSlot) : false;

      logDebugEvent('navigation', () => ({
        key,
        shiftKey: false,
        navType: 'enter_equation',
        from: { cmPos: this.from },
        to: { slotId: this.caret.slotId, offset: this.caret.offset, cmPos: this.from },
        equation: { from: this.from, to: this.to, isInline: this.isInline },
        isPlaceholder: isPlaceholderSlot,
        cmSelectionBefore,
        cmSelectionAfter,
        handled: true,
      }));

      logDebugEvent('boundary', () => ({
        transition: 'enterFromStart',
        key,
        from: { cmPos: this.from },
        to: { slotId: this.caret.slotId, offset: this.caret.offset },
        activeElementBefore: activeElBefore,
        activeElementAfter: activeElAfter,
        isPlaceholder: isPlaceholderSlot,
        cmSelectionBefore,
        cmSelectionAfter,
      }));

      if (isPlaceholderSlot && enteredSlot) {
        logDebugEvent('placeholder', () => ({
          action: 'enter_placeholder',
          slotId: enteredSlot.id,
          role: enteredSlot.role,
          parentNodeId: enteredSlot.parentNodeId,
        }));
      }
      getDebugLogger().scheduleFlush(true);
    }
  }

  public enterFromEnd(view: EditorView, key: 'ArrowLeft' | 'ArrowUp' = 'ArrowLeft'): void {
    this.currentView = view;
    const cmSelectionBefore = isDebugEnabled() && view ? {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
      empty: view.state.selection.main.empty,
    } : undefined;
    const activeElBefore = isDebugEnabled() && typeof document !== 'undefined'
      ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
      : undefined;

    activeDragTeardown();
    const prevActiveWidget = getActiveEquationWidget();
    if (prevActiveWidget && prevActiveWidget !== this) {
      prevActiveWidget.isFocused = false;
      prevActiveWidget.selection = null;
      prevActiveWidget.highlightedSlotId = null;
      prevActiveWidget.updateCaretOnly();
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => {
        el.classList.remove('eq-active');
        el.querySelectorAll('.eq-caret').forEach((c) => c.remove());
      });
    }
    this.isFocused = true;
    this.justExitedForward = false;
    this.enteredFromEnd = true;
    this.justEscapedForwardAfterEnteringFromEnd = false;
    this.lastForwardExitPos = -1;

    // 1. Resolve container element & reconcile AST before setting caret
    this.reconcileDomAst(view);

    // 2. Position caret at root slot end
    this.caret = { slotId: this.ast.id, offset: this.ast.children.length };

    // 3. Publish active equation session state with reconciled AST and caret
    setActiveEquationState(
      {
        from: this.from,
        to: this.to,
        caret: this.caret,
        isFocused: true,
        ast: this.ast,
      },
      this
    );
    this.syncPeerWidgets(true);

    // 4. Update caret and active highlights in DOM
    this.updateCaretOnly();

    // 5. Assert focus on math element
    if (this.containerEl) {
      const mathEl = (this.containerEl.classList?.contains('word-equation-math')
        ? this.containerEl
        : this.containerEl.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl && typeof mathEl.focus === 'function') {
        mathEl.focus({ preventScroll: true });
      }

      // Defensive focus assertion: recover focus if deferred browser events blurred to body
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          if (this.isFocused && mathEl && document.activeElement === document.body && typeof mathEl.focus === 'function') {
            mathEl.focus({ preventScroll: true });
          }
        });
      }
    }

    if (isDebugEnabled()) {
      const cmSelectionAfter = view ? {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
        empty: view.state.selection.main.empty,
      } : undefined;
      const activeElAfter = typeof document !== 'undefined'
        ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
        : undefined;

      const enteredSlot = findSlotById(this.ast, this.caret.slotId);
      const isPlaceholderSlot = enteredSlot ? isSlotEmpty(enteredSlot) : false;

      logDebugEvent('navigation', () => ({
        key,
        shiftKey: false,
        navType: 'enter_equation',
        from: { cmPos: this.to },
        to: { slotId: this.caret.slotId, offset: this.caret.offset, cmPos: this.to },
        equation: { from: this.from, to: this.to, isInline: this.isInline },
        isPlaceholder: isPlaceholderSlot,
        cmSelectionBefore,
        cmSelectionAfter,
        handled: true,
      }));

      logDebugEvent('boundary', () => ({
        transition: 'enterFromEnd',
        key,
        from: { cmPos: this.to },
        to: { slotId: this.caret.slotId, offset: this.caret.offset },
        activeElementBefore: activeElBefore,
        activeElementAfter: activeElAfter,
        isPlaceholder: isPlaceholderSlot,
        cmSelectionBefore,
        cmSelectionAfter,
      }));

      if (isPlaceholderSlot && enteredSlot) {
        logDebugEvent('placeholder', () => ({
          action: 'enter_placeholder',
          slotId: enteredSlot.id,
          role: enteredSlot.role,
          parentNodeId: enteredSlot.parentNodeId,
        }));
      }
      getDebugLogger().scheduleFlush(true);
    }
  }

  private renderCurrentDom(): HTMLElement {
    const dom = this.renderer.render(this.ast, {
      caret: this.isFocused ? this.caret : null,
      isFocused: this.isFocused,
      inline: this.isInline,
    });
    if (this.displayMode === 'full-page') {
      dom.classList.add('word-equation-full-page');
      dom.style.display = 'flex';
      dom.style.width = '100%';
      dom.style.height = '100%';
      dom.style.minHeight = '100%';
      dom.style.alignItems = 'center';
      dom.style.justifyContent = 'center';

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
      if (mathBox) {
        mathBox.classList.add('eq-full-page');
        mathBox.style.display = 'flex';
        mathBox.style.width = '100%';
        mathBox.style.height = '100%';
        mathBox.style.minHeight = '100%';
        mathBox.style.alignItems = 'center';
        mathBox.style.justifyContent = 'center';
        mathBox.style.borderRadius = '0';
      }
    } else if (this.isBlockInTable) {
      dom.classList.add('word-equation-table-block');
      dom.style.display = 'flex';
      dom.style.width = '100%';
      dom.style.margin = '0.25em 0';
      dom.style.padding = '0';
      dom.style.boxSizing = 'border-box';
      dom.style.alignItems = 'center';
      dom.style.justifyContent = 'center';

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
      if (mathBox) {
        mathBox.style.display = 'inline-flex';
        mathBox.style.width = 'auto';
        mathBox.style.height = 'auto';
        mathBox.style.alignItems = 'center';
        mathBox.style.justifyContent = 'center';
        mathBox.style.borderRadius = '6px';
        mathBox.style.padding = '6px 12px';
        mathBox.style.minHeight = '2.2em';
        mathBox.style.margin = '0';
        mathBox.style.boxSizing = 'border-box';
      }
    } else if (this.isInlineInTable) {
      dom.classList.add('word-equation-table-inline');
      dom.style.margin = '0';
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
      if (mathBox) {
        mathBox.style.padding = '2px 4px';
        mathBox.style.minHeight = '1.6em';
        mathBox.style.minWidth = '2em';
        mathBox.style.margin = '0';
        mathBox.style.boxSizing = 'border-box';
      }
    }
    if (this.isBlockInTable || this.isInlineInTable || dom.classList?.contains('word-equation-table-block') || dom.classList?.contains('word-equation-table-inline') || dom.closest?.('td, th, .table-cell-wrapper')) {
      captureTableCellMetrics(dom, this.isFocused ? 'cell_entry' : 'cell_exit', this.from, this.to);
    }
    return dom;

  }

  private updateDomContents(dom: HTMLElement): void {
    this.isUpdatingDom = true;
    try {
      const newDom = this.renderCurrentDom();
      dom.innerHTML = '';
      while (newDom.firstChild) {
        dom.appendChild(newDom.firstChild);
      }
      if (this.isFocused) {
        dom.classList.add('eq-active');
      } else {
        dom.classList.remove('eq-active');
      }
      if (this.isBlockInTable || this.isInlineInTable || dom.classList?.contains('word-equation-table-block') || dom.classList?.contains('word-equation-table-inline') || dom.closest?.('td, th, .table-cell-wrapper')) {
        captureTableCellMetrics(dom, this.isFocused ? 'cell_entry' : 'cell_exit', this.from, this.to);
      }
    } finally {
      this.isUpdatingDom = false;
    }
  }

  public updateCaretOnly(targetDom?: HTMLElement): void {
    let container = targetDom || this.containerEl;
    if (!container && this.currentView) {
      container =
        (this.currentView.dom.querySelector(`[data-equation-from="${this.from}"]`) as HTMLElement | null) ||
        (this.currentView.dom.querySelector('.word-equation-math')?.parentElement as HTMLElement | null);
    }
    if (!container && typeof document !== 'undefined') {
      container =
        (document.querySelector(`[data-equation-from="${this.from}"]`) as HTMLElement | null) ||
        (document.querySelector('.word-equation-math')?.parentElement as HTMLElement | null);
    }
    if (container) {
      this.containerEl = container;
      (container as any).__widget = this;
      updateVisualCaretDom(container, this.caret, this.isFocused);
      if (!this.isFocused) {
        this.selection = null;
        this.highlightedSlotId = null;
      }
      const effectiveSelection = this.isFocused ? this.selection : null;
      const effectiveHighlightSlot = this.isFocused ? this.highlightedSlotId : null;
      updatePartialSelectionDom(container, this.ast, effectiveSelection, effectiveHighlightSlot);
      const mathEl = (container.classList?.contains('word-equation-math')
        ? container
        : container.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl) {
        if (this.isFocused) {
          mathEl.classList.add('eq-active');
          if (typeof mathEl.focus === 'function' && document.activeElement !== mathEl) {
            mathEl.focus({ preventScroll: true });
          }
        } else {
          mathEl.classList.remove('eq-active');
          if (typeof mathEl.blur === 'function' && document.activeElement === mathEl) {
            mathEl.blur();
          }
        }
      }
      if (this.isBlockInTable || this.isInlineInTable || container.classList?.contains('word-equation-table-block') || container.classList?.contains('word-equation-table-inline') || container.closest?.('td, th, .table-cell-wrapper')) {
        captureTableCellMetrics(container, this.isFocused ? 'cell_entry' : 'cell_exit', this.from, this.to);
      }
    }
  }

  public restoreCaret(caret: CaretPosition, view?: EditorView): void {
    if (view) this.currentView = view;
    this.isFocused = true;
    this.caret = caret;
    setActiveEquationState(
      {
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      },
      this
    );
    this.updateCaretOnly();
    const mathEl = this.containerEl?.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathEl && typeof mathEl.focus === 'function') {
      mathEl.focus({ preventScroll: true });
    }
  }

  public focus(view?: EditorView): void {
    if (view) this.currentView = view;
    this.isFocused = true;
    this.updateCaretOnly();
    const mathEl = this.containerEl?.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathEl && typeof mathEl.focus === 'function') {
      mathEl.focus({ preventScroll: true });
    }
  }

  public rerender(): void {

    if (!this.containerEl && this.currentView) {
      this.containerEl =
        (this.currentView.dom.querySelector(`[data-equation-from="${this.from}"]`) as HTMLElement | null) ||
        (this.currentView.dom.querySelector('.word-equation-math')?.parentElement as HTMLElement | null);
    }
    if (!this.containerEl && typeof document !== 'undefined') {
      this.containerEl =
        (document.querySelector(`[data-equation-from="${this.from}"]`) as HTMLElement | null) ||
        (document.querySelector('.word-equation-math')?.parentElement as HTMLElement | null);
    }
    if (this.containerEl) {
      this.isUpdatingDom = true;
      try {
        this.updateDomContents(this.containerEl);
        updatePartialSelectionDom(this.containerEl, this.ast, this.selection, this.highlightedSlotId);
        if (this.isFocused) {
          const mathEl = this.containerEl.querySelector('.word-equation-math') as HTMLElement | null;
          if (mathEl && typeof mathEl.focus === 'function') {
            mathEl.focus({ preventScroll: true });
          }
        }
      } finally {
        this.isUpdatingDom = false;
      }
    }
  }

  public getLiveRange(view?: EditorView): { from: number; to: number } {
    const activeView = view || this.currentView;
    if (activeView) {
      try {
        const doc = activeView.state.doc;
        const docText = doc.toString();

        // 1. If existing from/to bounds still point to this equation, keep them
        if (this.from >= 0 && this.to <= docText.length && this.from < this.to) {
          const slice = docText.slice(this.from, this.to);
          const hasCode = this.code ? slice.includes(this.code.trim()) : false;
          if (hasCode) {
            if (this.isInline) {
              if (slice.startsWith('/weq_inline') || slice.startsWith('$weq')) {
                return { from: this.from, to: this.to };
              }
            } else {
              if (slice.startsWith('```math-word') || slice.startsWith('```weq')) {
                return { from: this.from, to: this.to };
              }
            }
          }
        }

        // 2. Bounds have shifted (e.g. earlier document edits); locate nearest matching fence
        const dom =
          (this.containerEl && activeView.dom.contains(this.containerEl) ? this.containerEl : null) ||
          (activeView.dom.querySelector('.word-equation-math.eq-active')?.closest('.word-equation-block, .word-equation-inline') as HTMLElement | null) ||
          (activeView.dom.querySelector('.word-equation-math.eq-active') as HTMLElement | null);

        let pos: number | null = null;
        if (dom && activeView.dom.contains(dom)) {
          try {
            pos = activeView.posAtDOM(dom);
          } catch (e) {}
        }

        if (this.isInline) {
          const inlineRegex = /(\/weq_inline|\$weq(?:_inline)?)\s*([\s\S]*?)\s*(\/weq_inline|\$weq(?:_inline)?)/g;
          let m: RegExpExecArray | null;
          let bestMatch: { from: number; to: number } | null = null;
          let bestDist = Infinity;
          while ((m = inlineRegex.exec(docText)) !== null) {
            const start = m.index;
            const end = m.index + m[0].length;
            const content = (m[2] || '').trim();
            const contentMatches = Boolean(
              this.code &&
                content &&
                (content === this.code.trim() ||
                  content.includes(this.code.trim()) ||
                  this.code.includes(content))
            );
            const dist = pos !== null ? Math.abs(start - pos) : Math.abs(start - this.from);
            if (pos !== null && pos >= start && pos <= end) {
              bestMatch = { from: start, to: end };
              break;
            }
            if (contentMatches) {
              if (dist < bestDist) {
                bestDist = dist;
                bestMatch = { from: start, to: end };
              }
            } else if (dist < bestDist && bestMatch === null) {
              bestDist = dist;
              bestMatch = { from: start, to: end };
            }
          }
          if (bestMatch) {
            this.from = bestMatch.from;
            this.to = bestMatch.to;
            if (this.containerEl) {
              this.containerEl.setAttribute('data-equation-from', String(this.from));
              this.containerEl.setAttribute('data-equation-to', String(this.to));
            }
            return { from: this.from, to: this.to };
          }
        } else {
          const blockRegex = /```(math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/g;
          let m: RegExpExecArray | null;
          let bestMatch: { from: number; to: number } | null = null;
          let bestDist = Infinity;
          while ((m = blockRegex.exec(docText)) !== null) {
            const start = m.index;
            const end = m.index + m[0].length;
            const content = (m[2] || '').trim();
            const contentMatches = Boolean(
              this.code &&
                content &&
                (content === this.code.trim() ||
                  content.includes(this.code.trim()) ||
                  this.code.includes(content))
            );
            const dist = pos !== null ? Math.abs(start - pos) : Math.abs(start - this.from);
            if (pos !== null && pos >= start && pos <= end) {
              bestMatch = { from: start, to: end };
              break;
            }
            if (contentMatches) {
              if (dist < bestDist) {
                bestDist = dist;
                bestMatch = { from: start, to: end };
              }
            } else if (dist < bestDist && bestMatch === null) {
              bestDist = dist;
              bestMatch = { from: start, to: end };
            }
          }
          if (bestMatch) {
            this.from = bestMatch.from;
            this.to = bestMatch.to;
            if (this.containerEl) {
              this.containerEl.setAttribute('data-equation-from', String(this.from));
              this.containerEl.setAttribute('data-equation-to', String(this.to));
            }
            return { from: this.from, to: this.to };
          }
        }
      } catch (err) {}
    }
    return { from: this.from, to: this.to };
  }

  public syncToDocument(view: EditorView): void {
    const range = this.getLiveRange(view);
    this.from = range.from;
    this.to = range.to;
    const newXml = serializeMathML(this.ast, { pretty: !this.isInline });
    this.code = newXml;

    let fullReplacement: string;
    if (this.isInline) {
      if (this.delimiter === '$weq' || this.delimiter.startsWith('$')) {
        fullReplacement = `$weq ${newXml} $weq`;
      } else {
        fullReplacement = `/weq_inline ${newXml} /weq_inline`;
      }
    } else {
      let fence = this.delimiter === 'weq' ? 'weq' : 'math-word';
      if (this.displayMode === 'full-page' || this.delimiter === 'math-page' || this.delimiter === 'weq-page') {
        fence = this.delimiter === 'weq-page' ? 'weq-page' : 'math-page';
      }
      fullReplacement = `\`\`\`${fence}\n${newXml}\n\`\`\``;
    }

    const currentDoc = view.state.doc.sliceString(this.from, this.to);

    if (currentDoc !== fullReplacement) {
      const newTo = this.from + fullReplacement.length;
      if (this.isFocused) {
        setActiveEquationState(
          {
            from: this.from,
            to: newTo,
            caret: this.caret,
            isFocused: true,
            ast: this.ast,
          },
          this
        );
      }

      this.isUpdatingDom = true;
      isUpdatingActiveEquation = true;
      try {
        view.dispatch({
          changes: {
            from: this.from,
            to: this.to,
            insert: fullReplacement,
          },
          userEvent: 'input.type',
        });
        this.to = newTo;
      } finally {
        this.isUpdatingDom = false;
        isUpdatingActiveEquation = false;
      }
    }
  }

  public handleUndoRedo(action: 'undo' | 'redo', view?: EditorView): void {
    const activeView = view || this.currentView;
    const app = typeof window !== 'undefined' ? (window as any).app : null;

    if (app) {
      if (app.commands?.executeCommandById) {
        const cmdId = action === 'undo' ? 'editor:undo' : 'editor:redo';
        try {
          const handled = app.commands.executeCommandById(cmdId);
          if (handled !== false) return;
        } catch (e) {}
      }
      try {
        let MarkdownViewClass: any;
        try {
          MarkdownViewClass = require('obsidian').MarkdownView;
        } catch (e) {}
        const mdView =
          (MarkdownViewClass && app.workspace?.getActiveViewOfType?.(MarkdownViewClass)) ||
          app.workspace?.getLeavesOfType?.('markdown')?.[0]?.view;
        if (mdView?.editor) {
          if (action === 'undo' && typeof mdView.editor.undo === 'function') {
            mdView.editor.undo();
            return;
          } else if (action === 'redo' && typeof mdView.editor.redo === 'function') {
            mdView.editor.redo();
            return;
          }
        }
      } catch (e) {}
    }

    if (activeView) {
      try {
        if (action === 'undo' && typeof (activeView as any).undo === 'function') {
          (activeView as any).undo();
          return;
        } else if (action === 'redo' && typeof (activeView as any).redo === 'function') {
          (activeView as any).redo();
          return;
        }
      } catch (e) {}
    }

    if (typeof document !== 'undefined' && document.execCommand) {
      try {
        document.execCommand(action);
      } catch (e) {}
    }
  }

  public insertMathSnippet(snippet: string, view?: EditorView): void {
    const trimmed = (snippet || '').trim();
    if (!trimmed) return;

    const activeView = view || this.currentView;
    const activeState = getActiveEquationState();
    if (activeState && activeState.from === this.from && activeState.ast) {
      this.ast = activeState.ast;
    }
    const targetSlot = findSlotById(this.ast, this.caret.slotId) || this.ast;

    const isMathML = /<math[\s>]|<math[\s\S]*<\/math>/i.test(trimmed) || /<m[a-z]+/i.test(trimmed);
    let nodesToInsert: MathNode[] = [];

    if (isMathML) {
      let xml = trimmed;
      if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
        xml = `<math xmlns="${MATHML_NAMESPACE}">\n  <mrow>${xml}</mrow>\n</math>`;
      } else if (!xml.includes('xmlns=')) {
        xml = xml.replace(/<math/i, `<math xmlns="${MATHML_NAMESPACE}"`);
      }
      const parsed = parseMathML(xml);
      nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mtext')];
    } else {
      const parsed = parseLinearEquation(trimmed);
      nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mi')];
    }

    for (const n of nodesToInsert) {
      n.parentSlotId = targetSlot.id;
    }

    const insertOffset = Math.min(this.caret.offset, targetSlot.children.length);
    targetSlot.children.splice(insertOffset, 0, ...nodesToInsert);
    updateParentPointers(this.ast);

    this.selection = null;
    this.highlightedSlotId = null;

    // Smart caret placement: position caret inside first placeholder slot if available
    const findFirstEmptySlot = (nodes: MathNode[]): SlotNode | null => {
      for (const node of nodes) {
        const slots = getChildSlots(node);
        for (const s of slots) {
          if (isSlotEmpty(s)) return s;
          const nested = findFirstEmptySlot(s.children);
          if (nested) return nested;
        }
      }
      return null;
    };

    const firstPlaceholder = findFirstEmptySlot(nodesToInsert);
    if (firstPlaceholder) {
      this.caret = { slotId: firstPlaceholder.id, offset: 0 };
    } else {
      const childSlots = nodesToInsert.length > 0 ? getChildSlots(nodesToInsert[0]) : [];
      if (childSlots.length > 0) {
        this.caret = { slotId: childSlots[0].id, offset: 0 };
      } else {
        this.caret = {
          slotId: targetSlot.id,
          offset: insertOffset + nodesToInsert.length,
        };
      }
    }

    this.isFocused = true;
    setActiveEquationState(
      {
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      },
      this
    );

    this.rerender();
    if (activeView) {
      this.syncToDocument(activeView);
    }
    const emptyPlaceholder = findFirstEmptySlot(nodesToInsert);
    if (emptyPlaceholder) {
      this.caret = { slotId: emptyPlaceholder.id, offset: 0 };
    }

    setActiveEquationState(
      {
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      },
      this
    );
    this.updateCaretOnly();
  }

  public handleArrowNavigation(
    key: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown',
    shiftKey: boolean,
    view?: EditorView
  ): boolean {
    const activeView = view || this.currentView;
    const fromCaret = shiftKey && this.selection ? { ...this.selection.head } : { ...this.caret };
    const cmSelectionBefore = isDebugEnabled() && activeView ? {
      anchor: activeView.state.selection.main.anchor,
      head: activeView.state.selection.main.head,
      empty: activeView.state.selection.main.empty,
    } : undefined;

    if (shiftKey) {
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        const step = handleSelectionStep(
          this.ast,
          this.selection,
          this.caret,
          key,
          this.highlightedSlotId
        );

        if (step && step.handled) {
          this.selection = step.selection;
          this.caret = step.caret;
          this.highlightedSlotId = step.highlightedSlotId ?? null;
          setActiveEquationState({
            from: this.from,
            to: this.to,
            caret: this.caret,
            selection: this.selection,
            highlightedSlotId: this.highlightedSlotId,
            isFocused: true,
            ast: this.ast,
          });
          this.updateCaretOnly();
          logDebugEvent('navigation', () => ({
            key,
            shiftKey: true,
            navType: 'selection_step',
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { slotId: step.caret.slotId, offset: step.caret.offset },
            equation: { from: this.from, to: this.to, isInline: this.isInline },
            cmSelectionBefore,
            cmSelectionAfter: cmSelectionBefore,
            handled: true,
          }));
          return true;
        }

        if (step && !step.handled) {
          // At root boundary, allow exit into CodeMirror markdown
          return false;
        }
        return false;
      }

      // Vertical navigation (ArrowUp / ArrowDown) with Shift
      if (!this.selection) {
        this.selection = { anchor: { ...this.caret }, head: { ...this.caret } };
      }
      const nav = handleArrowKey(this.ast, this.selection.head, key);
      if (nav.handled) {
        this.selection.head = nav.caret;
        this.caret = nav.caret;
        this.highlightedSlotId = null;
        setActiveEquationState({
          from: this.from,
          to: this.to,
          caret: this.caret,
          selection: this.selection,
          highlightedSlotId: null,
          isFocused: true,
          ast: this.ast,
        });
        this.updateCaretOnly();
        logDebugEvent('navigation', () => ({
          key,
          shiftKey: true,
          navType: 'internal_jump',
          from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
          to: { slotId: nav.caret.slotId, offset: nav.caret.offset },
          equation: { from: this.from, to: this.to, isInline: this.isInline },
          cmSelectionBefore,
          cmSelectionAfter: cmSelectionBefore,
          handled: true,
        }));
        return true;
      }
      return false;
    }

    // Check if an active, non-collapsed selection or placeholder highlight exists
    const hasActiveSelectionRange =
      this.selection &&
      comparePositions(this.ast, this.selection.anchor, this.selection.head) !== 0;
    const hasActivePlaceholderHighlight = Boolean(this.highlightedSlotId);

    if (!shiftKey && (hasActiveSelectionRange || hasActivePlaceholderHighlight)) {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        let targetCaret: CaretPosition | null = null;

        if (this.selection && hasActiveSelectionRange) {
          const norm = normalizeSelection(this.ast, this.selection);
          targetCaret = key === 'ArrowLeft' ? { ...norm.start } : { ...norm.end };
        } else if (this.highlightedSlotId) {
          const targetSlot = findSlotById(this.ast, this.highlightedSlotId);
          if (targetSlot) {
            targetCaret = key === 'ArrowLeft'
              ? { slotId: targetSlot.id, offset: 0 }
              : { slotId: targetSlot.id, offset: targetSlot.children.length };
          }
        }

        if (targetCaret) {
          this.caret = targetCaret;
          this.selection = null;
          this.highlightedSlotId = null;

          setActiveEquationState(
            {
              from: this.from,
              to: this.to,
              caret: this.caret,
              selection: null,
              highlightedSlotId: null,
              isFocused: true,
              ast: this.ast,
            },
            this
          );

          this.updateCaretOnly();

          if (isDebugEnabled()) {
            logDebugEvent('navigation', () => ({
              key,
              shiftKey: false,
              navType: 'collapse_selection',
              from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
              to: { slotId: targetCaret!.slotId, offset: targetCaret!.offset },
              equation: { from: this.from, to: this.to, isInline: this.isInline },
              cmSelectionBefore,
              cmSelectionAfter: cmSelectionBefore,
              handled: true,
            }));
          }

          // Consume keystroke: collapse is complete, do not step further
          return true;
        }
      }
    }

    // Collapse selection if active for vertical arrows or empty selection
    if (this.selection || this.highlightedSlotId) {
      this.selection = null;
      this.highlightedSlotId = null;
      this.updateCaretOnly();
    }

    const nav = handleArrowKey(this.ast, this.caret, key);
    if (nav.handled) {
      this.caret = nav.caret;
      setActiveEquationState({
        from: this.from,
        to: this.to,
        caret: this.caret,
        selection: null,
        highlightedSlotId: null,
        isFocused: true,
        ast: this.ast,
      });
      this.updateCaretOnly();
      if (isDebugEnabled()) {
        const destSlot = findSlotById(this.ast, nav.caret.slotId);
        const isPlaceholderSlot = destSlot ? isSlotEmpty(destSlot) : false;

        logDebugEvent('navigation', () => ({
          key,
          shiftKey: false,
          navType: 'internal_jump',
          from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
          to: { slotId: nav.caret.slotId, offset: nav.caret.offset },
          equation: { from: this.from, to: this.to, isInline: this.isInline },
          isPlaceholder: isPlaceholderSlot,
          placeholderSlotId: isPlaceholderSlot ? nav.caret.slotId : undefined,
          cmSelectionBefore,
          cmSelectionAfter: cmSelectionBefore,
          handled: true,
        }));

        if (isPlaceholderSlot && destSlot) {
          logDebugEvent('placeholder', () => ({
            action: 'enter_placeholder',
            slotId: destSlot.id,
            role: destSlot.role,
            parentNodeId: destSlot.parentNodeId,
          }));
        }
      }
      return true;
    } else if (activeView) {
      const activeElBefore = typeof document !== 'undefined'
        ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
        : undefined;

      if (nav.exitDirection === 'before') {
        this.isFocused = false;
        this.detachObserver();
        this.justExitedForward = false;
        this.enteredFromEnd = false;
        this.justEscapedForwardAfterEnteringFromEnd = false;
        this.lastForwardExitPos = -1;
        clearActiveEquationState();
        this.syncPeerWidgets(false);
        this.updateCaretOnly();
        activeView.focus();
        let targetPos: number;
        if (this.displayMode === 'full-page') {
          const curLine = activeView.state.doc.lineAt(this.from);
          if (isTableRowLine(curLine)) {
            const lineBeforeFrom = curLine.text.slice(0, Math.max(0, this.from - curLine.from));
            const pipeIndex = lineBeforeFrom.lastIndexOf('|');
            if (pipeIndex > 0) {
              targetPos = curLine.from + pipeIndex - 1;
              activeView.dispatch({ selection: { anchor: targetPos } });
            } else {
              // Trap caret inside: clamp to root slot offset 0
              this.isFocused = true;
              this.caret = { slotId: this.ast.id, offset: 0 };
              setActiveEquationState(
                {
                  from: this.from,
                  to: this.to,
                  caret: this.caret,
                  isFocused: true,
                  ast: this.ast,
                },
                this
              );
              this.updateCaretOnly();
              return true;
            }
          } else {
            // Full-page math block in note page: trap caret inside, clamp to start
            this.isFocused = true;
            this.caret = { slotId: this.ast.id, offset: 0 };
            setActiveEquationState(
              {
                from: this.from,
                to: this.to,
                caret: this.caret,
                isFocused: true,
                ast: this.ast,
              },
              this
            );
            this.updateCaretOnly();
            return true;
          }
        } else if (this.isBlockInTable || isInsideTableRow(activeView.state.doc, this.from, this.to)) {
          const curLine = activeView.state.doc.lineAt(this.from);
          const lineBeforeFrom = curLine.text.slice(0, Math.max(0, this.from - curLine.from));
          const pipeIndex = lineBeforeFrom.lastIndexOf('|');
          targetPos = pipeIndex !== -1 ? curLine.from + pipeIndex : this.from;
          activeView.dispatch({ selection: { anchor: targetPos } });
        } else if (this.isInline) {
          targetPos = this.from;
          activeView.dispatch({ selection: { anchor: targetPos } });
        } else {
          const curLine = activeView.state.doc.lineAt(this.from);
          if (curLine.number <= 1) {
            // Bug 1: Block equation at document start: insert implicit empty line before line 1
            activeView.dispatch({
              changes: { from: 0, insert: '\n' },
              selection: { anchor: 0 },
            });
            targetPos = 0;
          } else {
            const prevLine = activeView.state.doc.line(curLine.number - 1);
            if (isBlockEquationEnd(activeView, prevLine) || isTableRowLine(prevLine)) {
              // Consecutive block equation or table directly before: insert implicit empty line between them
              activeView.dispatch({
                changes: { from: this.from, insert: '\n' },
                selection: { anchor: this.from },
              });
              targetPos = this.from;
            } else {
              targetPos = prevLine.length === 0 ? prevLine.from : Math.max(0, this.from - 1);
              activeView.dispatch({ selection: { anchor: targetPos } });
            }
          }
        }
        if (isDebugEnabled()) {
          const cmSelectionAfter = {
            anchor: activeView.state.selection.main.anchor,
            head: activeView.state.selection.main.head,
            empty: activeView.state.selection.main.empty,
          };
          const activeElAfter = typeof document !== 'undefined'
            ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
            : undefined;
          logDebugEvent('navigation', () => ({
            key,
            shiftKey: false,
            navType: 'exit_equation',
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            exitDirection: 'before',
            equation: { from: this.from, to: this.to, isInline: this.isInline },
            cmSelectionBefore,
            cmSelectionAfter,
            handled: true,
          }));
          logDebugEvent('boundary', () => ({
            transition: 'exitToEditor',
            direction: 'before',
            key,
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            activeElementBefore: activeElBefore,
            activeElementAfter: activeElAfter,
            cmSelectionBefore,
            cmSelectionAfter,
          }));
          getDebugLogger().scheduleFlush(true);
        }
        return true;
      } else if (nav.exitDirection === 'after') {
        this.isFocused = false;
        this.detachObserver();
        this.justExitedForward = true;
        if (this.enteredFromEnd) {
          this.justEscapedForwardAfterEnteringFromEnd = true;
          this.enteredFromEnd = false;
        } else {
          this.justEscapedForwardAfterEnteringFromEnd = false;
        }
        clearActiveEquationState();
        this.syncPeerWidgets(false);
        this.updateCaretOnly();
        activeView.focus();
        let targetPos: number;
        if (this.displayMode === 'full-page') {
          const curLine = activeView.state.doc.lineAt(Math.min(activeView.state.doc.length, this.to));
          if (isTableRowLine(curLine)) {
            const lineAfterTo = curLine.text.slice(Math.max(0, this.to - curLine.from));
            const pipeIndex = lineAfterTo.indexOf('|');
            if (pipeIndex !== -1 && lineAfterTo.slice(pipeIndex + 1).includes('|')) {
              targetPos = this.to + pipeIndex + 1;
              this.lastForwardExitPos = targetPos;
              activeView.dispatch({ selection: { anchor: targetPos } });
            } else {
              // Trap inside: clamp to end
              this.isFocused = true;
              this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
              setActiveEquationState(
                {
                  from: this.from,
                  to: this.to,
                  caret: this.caret,
                  isFocused: true,
                  ast: this.ast,
                },
                this
              );
              this.updateCaretOnly();
              return true;
            }
          } else {
            // Full-page math block in note page: trap inside, clamp to end
            this.isFocused = true;
            this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
            setActiveEquationState(
              {
                from: this.from,
                to: this.to,
                caret: this.caret,
                isFocused: true,
                ast: this.ast,
              },
              this
            );
            this.updateCaretOnly();
            return true;
          }
        } else if (this.isBlockInTable || isInsideTableRow(activeView.state.doc, this.from, this.to)) {

          const curLine = activeView.state.doc.lineAt(Math.min(activeView.state.doc.length, this.to));
          const lineAfterTo = curLine.text.slice(Math.max(0, this.to - curLine.from));
          const pipeIndex = lineAfterTo.indexOf('|');
          targetPos = pipeIndex !== -1 ? this.to + pipeIndex + 1 : Math.min(activeView.state.doc.length, this.to);
          this.lastForwardExitPos = targetPos;
          activeView.dispatch({ selection: { anchor: targetPos } });
        } else if (this.isInline) {
          targetPos = Math.min(activeView.state.doc.length, this.to);
          activeView.dispatch({ selection: { anchor: targetPos } });
        } else {
          const blockLine = activeView.state.doc.lineAt(Math.min(activeView.state.doc.length, this.to));
          if (blockLine.number >= activeView.state.doc.lines) {
            const docLen = activeView.state.doc.length;
            activeView.dispatch({
              changes: { from: docLen, insert: '\n' },
              selection: { anchor: docLen + 1 },
            });
            targetPos = docLen + 1;
          } else {
            const nextLine = activeView.state.doc.line(blockLine.number + 1);
            if (isBlockEquationStart(activeView, nextLine) || isTableRowLine(nextLine)) {
              // Consecutive block equation or table directly after: insert implicit empty line between them
              activeView.dispatch({
                changes: { from: nextLine.from, insert: '\n' },
                selection: { anchor: nextLine.from },
              });
              targetPos = nextLine.from;
            } else {
              activeView.dispatch({ selection: { anchor: nextLine.from } });
              targetPos = nextLine.from;
            }
          }
        }
        this.lastForwardExitPos = targetPos;
        if (isDebugEnabled()) {
          const cmSelectionAfter = {
            anchor: activeView.state.selection.main.anchor,
            head: activeView.state.selection.main.head,
            empty: activeView.state.selection.main.empty,
          };
          const activeElAfter = typeof document !== 'undefined'
            ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
            : undefined;
          logDebugEvent('navigation', () => ({
            key,
            shiftKey: false,
            navType: 'exit_equation',
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            exitDirection: 'after',
            equation: { from: this.from, to: this.to, isInline: this.isInline },
            cmSelectionBefore,
            cmSelectionAfter,
            handled: true,
          }));
          logDebugEvent('boundary', () => ({
            transition: 'exitToEditor',
            direction: 'after',
            key,
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            activeElementBefore: activeElBefore,
            activeElementAfter: activeElAfter,
            cmSelectionBefore,
            cmSelectionAfter,
          }));
          getDebugLogger().scheduleFlush(true);
        }
        return true;
      } else if (nav.exitDirection === 'up') {
        this.isFocused = false;
        this.detachObserver();
        this.justExitedForward = false;
        this.enteredFromEnd = false;
        this.justEscapedForwardAfterEnteringFromEnd = false;
        this.lastForwardExitPos = -1;
        clearActiveEquationState();
        this.syncPeerWidgets(false);
        this.updateCaretOnly();
        activeView.focus();
        let targetPos: number;
        if (this.isBlockInTable || isInsideTableRow(activeView.state.doc, this.from, this.to)) {
          const curLine = activeView.state.doc.lineAt(this.from);
          if (curLine.number > 1) {
            const prevLine = activeView.state.doc.line(curLine.number - 1);
            targetPos = Math.min(prevLine.to, prevLine.from + (this.from - curLine.from));
            activeView.dispatch({ selection: { anchor: targetPos } });
          } else {
            targetPos = 0;
            activeView.dispatch({ selection: { anchor: targetPos } });
          }
        } else {
          const lineAbove = activeView.state.doc.lineAt(Math.max(0, this.from - 1));
          if (isBlockEquationEnd(activeView, lineAbove) || isTableRowLine(lineAbove)) {
            activeView.dispatch({
              changes: { from: this.from, insert: '\n' },
              selection: { anchor: this.from },
            });
            targetPos = this.from;
          } else {
            targetPos = lineAbove.length === 0 ? lineAbove.from : lineAbove.to;
            activeView.dispatch({ selection: { anchor: targetPos } });
          }
        }
        if (isDebugEnabled()) {
          const cmSelectionAfter = {
            anchor: activeView.state.selection.main.anchor,
            head: activeView.state.selection.main.head,
            empty: activeView.state.selection.main.empty,
          };
          const activeElAfter = typeof document !== 'undefined'
            ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
            : undefined;
          logDebugEvent('navigation', () => ({
            key,
            shiftKey: false,
            navType: 'exit_equation',
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            exitDirection: 'up',
            equation: { from: this.from, to: this.to, isInline: this.isInline },
            cmSelectionBefore,
            cmSelectionAfter,
            handled: true,
          }));
          logDebugEvent('boundary', () => ({
            transition: 'exitToEditor',
            direction: 'up',
            key,
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            activeElementBefore: activeElBefore,
            activeElementAfter: activeElAfter,
            cmSelectionBefore,
            cmSelectionAfter,
          }));
          getDebugLogger().scheduleFlush(true);
        }
        return true;
      } else if (nav.exitDirection === 'down') {
        this.isFocused = false;
        this.detachObserver();
        this.justExitedForward = false;
        this.enteredFromEnd = false;
        this.justEscapedForwardAfterEnteringFromEnd = false;
        this.lastForwardExitPos = -1;
        clearActiveEquationState();
        this.updateCaretOnly();
        activeView.focus();
        let targetPos: number;
        if (this.isBlockInTable || isInsideTableRow(activeView.state.doc, this.from, this.to)) {
          const curLine = activeView.state.doc.lineAt(this.from);
          if (curLine.number < activeView.state.doc.lines) {
            const nextLine = activeView.state.doc.line(curLine.number + 1);
            targetPos = Math.min(nextLine.to, nextLine.from + (this.from - curLine.from));
            activeView.dispatch({ selection: { anchor: targetPos } });
          } else {
            const docLen = activeView.state.doc.length;
            activeView.dispatch({
              changes: { from: docLen, insert: '\n' },
              selection: { anchor: docLen + 1 },
            });
            targetPos = docLen + 1;
          }
        } else if (this.isInline) {
          const curLine = activeView.state.doc.lineAt(this.to);
          if (curLine.number < activeView.state.doc.lines) {
            const nextLine = activeView.state.doc.line(curLine.number + 1);
            targetPos = Math.min(nextLine.to, nextLine.from + (this.to - curLine.from));
            activeView.dispatch({ selection: { anchor: targetPos } });
          } else {
            const docLen = activeView.state.doc.length;
            activeView.dispatch({
              changes: { from: docLen, insert: '\n' },
              selection: { anchor: docLen + 1 },
            });
            targetPos = docLen + 1;
          }
        } else {
          const blockLine = activeView.state.doc.lineAt(Math.min(activeView.state.doc.length, this.to));
          if (blockLine.number >= activeView.state.doc.lines) {
            const docLen = activeView.state.doc.length;
            activeView.dispatch({
              changes: { from: docLen, insert: '\n' },
              selection: { anchor: docLen + 1 },
            });
            targetPos = docLen + 1;
          } else {
            const nextLine = activeView.state.doc.line(blockLine.number + 1);
            if (isBlockEquationStart(activeView, nextLine) || isTableRowLine(nextLine)) {
              activeView.dispatch({
                changes: { from: nextLine.from, insert: '\n' },
                selection: { anchor: nextLine.from },
              });
              targetPos = nextLine.from;
            } else {
              activeView.dispatch({ selection: { anchor: nextLine.from } });
              targetPos = nextLine.from;
            }
          }
        }
        if (isDebugEnabled()) {
          const cmSelectionAfter = {
            anchor: activeView.state.selection.main.anchor,
            head: activeView.state.selection.main.head,
            empty: activeView.state.selection.main.empty,
          };
          const activeElAfter = typeof document !== 'undefined'
            ? { tag: document.activeElement?.tagName, className: document.activeElement?.className }
            : undefined;
          logDebugEvent('navigation', () => ({
            key,
            shiftKey: false,
            navType: 'exit_equation',
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            exitDirection: 'down',
            equation: { from: this.from, to: this.to, isInline: this.isInline },
            cmSelectionBefore,
            cmSelectionAfter,
            handled: true,
          }));
          logDebugEvent('boundary', () => ({
            transition: 'exitToEditor',
            direction: 'down',
            key,
            from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
            to: { cmPos: targetPos },
            activeElementBefore: activeElBefore,
            activeElementAfter: activeElAfter,
            cmSelectionBefore,
            cmSelectionAfter,
          }));
          getDebugLogger().scheduleFlush(true);
        }
        return true;
      }
    }

    logDebugEvent('navigation_unhandled', () => ({
      reason: 'arrow_not_handled',
      key,
      shiftKey,
      from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
      equation: { from: this.from, to: this.to, isInline: this.isInline },
      cmSelectionBefore,
      activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
      activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
    }));
    return false;
  }

  public handleCopyEvent(e: ClipboardEvent, isCut = false): void {
    const widget = ((this.containerEl as any)?.__widget as WordEquationWidget) || this;
    if (!widget.isFocused) {
      const active = getActiveEquationState();
      if (active && active.from === widget.from && active.isFocused) {
        widget.isFocused = true;
        widget.caret = active.caret;
        if (active.ast) {
          widget.ast = active.ast;
        }
      } else {
        return;
      }
    }

    let xmlToCopy = '';
    const activeSel = widget.selection || getActiveEquationState()?.selection;
    const highlightedSlotId = widget.highlightedSlotId || getActiveEquationState()?.highlightedSlotId;

    if (highlightedSlotId) {
      // Entire slot highlighted (e.g., from double-click or backspace on placeholder)
      const slot = findSlotById(widget.ast, highlightedSlotId);
      if (slot) {
        const tempSlot = createSlot('root', slot.children.map((c) => cloneNode(c, true)));
        updateParentPointers(tempSlot);
        xmlToCopy = serializeMathML(tempSlot, {
          display: widget.isInline ? 'inline' : 'block',
          pretty: !widget.isInline,
        });
      }
    } else if (
      activeSel &&
      (activeSel.anchor.slotId !== activeSel.head.slotId ||
        activeSel.anchor.offset !== activeSel.head.offset)
    ) {
      // Active partial selection range
      const subSlot = extractSelectionAST(widget.ast, activeSel);
      xmlToCopy = serializeMathML(subSlot, {
        display: widget.isInline ? 'inline' : 'block',
        pretty: !widget.isInline,
      });
    }

    if (!xmlToCopy) {
      const selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer as Node;
        const elem = container.nodeType === 1 ? (container as HTMLElement) : container.parentElement;
        const targetBox = elem ? elem.closest('[data-node-id]') : null;
        if (targetBox) {
          const nodeId = targetBox.getAttribute('data-node-id');
          const foundNode = nodeId ? findNodeById(widget.ast, nodeId) : null;
          if (foundNode) {
            const tempSlot = createSlot('root', [cloneNode(foundNode, true)]);
            updateParentPointers(tempSlot);
            xmlToCopy = serializeMathML(tempSlot, {
              display: widget.isInline ? 'inline' : 'block',
              pretty: !widget.isInline,
            });
          }
        }
      }
    }

    if (!xmlToCopy) {
      xmlToCopy = serializeMathML(widget.ast, {
        display: widget.isInline ? 'inline' : 'block',
        pretty: !widget.isInline,
      });
    }

    if (xmlToCopy) {
      if (e?.clipboardData) {
        e.preventDefault();
        e.stopPropagation();
        e.clipboardData.setData('application/mathml+xml', xmlToCopy);
        e.clipboardData.setData('text/plain', xmlToCopy);
      }
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(xmlToCopy).catch(() => {});
      }

      logDebugEvent('clipboard', () => ({
        action: isCut ? 'cut' : 'copy',
        context: 'equation_widget',
        payload: {
          types: e?.clipboardData ? Array.from(e.clipboardData.types) : ['application/mathml+xml', 'text/plain'],
          plainTextSnippet: xmlToCopy.slice(0, 100),
          mathmlSnippet: xmlToCopy.slice(0, 100),
          isMathML: /<math[\s>]|<math[\s\S]*<\/math>/i.test(xmlToCopy),
          characterCount: xmlToCopy.length,
        },
        destination: {
          slotId: widget.caret.slotId,
          offset: widget.caret.offset,
        },
        success: true,
      }));

      if (isCut) {
        if (
          activeSel &&
          (activeSel.anchor.slotId !== activeSel.head.slotId ||
            activeSel.anchor.offset !== activeSel.head.offset)
        ) {
          const editRes = deleteSelection(widget.ast, activeSel);
          widget.ast = editRes.root;
          widget.caret = editRes.caret;
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
          });
          widget.rerender();
          const targetView = widget.currentView;
          if (targetView) {
            widget.syncToDocument(targetView);
          }
        } else if (highlightedSlotId) {
          const slot = findSlotById(widget.ast, highlightedSlotId);
          if (slot) {
            slot.children = [];
            widget.caret = { slotId: slot.id, offset: 0 };
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
            });
            widget.rerender();
            const targetView = widget.currentView;
            if (targetView) {
              widget.syncToDocument(targetView);
            }
          }
        } else {
          const slot = findSlotById(widget.ast, widget.caret.slotId);
          if (slot) {
            slot.children = [];
            widget.caret = { slotId: slot.id, offset: 0 };
            setActiveEquationState({
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              isFocused: true,
              ast: widget.ast,
            });
            widget.rerender();
            const targetView = widget.currentView;
            if (targetView) {
              widget.syncToDocument(targetView);
            }
          }
        }
      }
    }
  }

  public handlePasteEvent(e: ClipboardEvent, view?: EditorView): void {
    const widget = ((this.containerEl as any)?.__widget as WordEquationWidget) || this;
    if (!widget.isFocused) {
      const active = getActiveEquationState();
      if (active && active.from === widget.from && active.isFocused) {
        widget.isFocused = true;
        widget.caret = active.caret;
        if (active.ast) {
          widget.ast = active.ast;
        }
      } else {
        return;
      }
    }

    const clipboardText =
      e.clipboardData?.getData('application/mathml+xml') ||
      e.clipboardData?.getData('text/plain') ||
      '';
    const trimmed = clipboardText.trim();
    if (!trimmed) return;

    e.preventDefault();
    e.stopPropagation();

    const clonedRoot = cloneSlot(widget.ast);
    const targetSlot = findSlotById(clonedRoot, widget.caret.slotId);
    if (!targetSlot) return;

    const isMathML = /<math[\s>]|<math[\s\S]*<\/math>/i.test(trimmed) || /<m[a-z]+/i.test(trimmed);
    let nodesToInsert: MathNode[] = [];

    if (isMathML) {
      let xml = trimmed;
      if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
        xml = `<math xmlns="${MATHML_NAMESPACE}">\n  <mrow>${xml}</mrow>\n</math>`;
      } else if (!xml.includes('xmlns=')) {
        xml = xml.replace(/<math/i, `<math xmlns="${MATHML_NAMESPACE}"`);
      }
      const parsed = parseMathML(xml);
      nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mtext')];
    } else {
      const parsed = parseLinearEquation(trimmed);
      nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mi')];
    }

    for (const n of nodesToInsert) {
      n.parentSlotId = targetSlot.id;
    }

    const insertOffset = Math.min(widget.caret.offset, targetSlot.children.length);
    targetSlot.children.splice(insertOffset, 0, ...nodesToInsert);
    updateParentPointers(clonedRoot);

    widget.ast = clonedRoot;
    widget.caret = {
      slotId: targetSlot.id,
      offset: insertOffset + nodesToInsert.length,
    };

    setActiveEquationState({
      from: widget.from,
      to: widget.to,
      caret: widget.caret,
      isFocused: true,
      ast: widget.ast,
    });

    logDebugEvent('clipboard', () => ({
      action: 'paste',
      context: 'equation_widget',
      payload: {
        types: e.clipboardData ? Array.from(e.clipboardData.types) : [],
        plainTextSnippet: trimmed.slice(0, 100),
        mathmlSnippet: isMathML ? trimmed.slice(0, 100) : undefined,
        isMathML,
        characterCount: trimmed.length,
      },
      destination: {
        slotId: targetSlot.id,
        offset: insertOffset,
      },
      success: true,
    }));

    widget.rerender();
    const targetView = view || widget.currentView;
    if (targetView) {
      widget.syncToDocument(targetView);
    }
  }

  private attachEventListeners(dom: HTMLElement, view: EditorView): void {
    const handlePointerActivation = (e: MouseEvent | PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Clean up any active drag session from a previously active equation
      activeDragTeardown();

      let widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      widget.currentView = view;
      const range = widget.getLiveRange(view);
      widget.from = range.from;
      widget.to = range.to;
      dom.setAttribute('data-equation-from', String(widget.from));
      dom.setAttribute('data-equation-to', String(widget.to));

      const prevActiveWidget = getActiveEquationWidget();
      if (prevActiveWidget && prevActiveWidget !== widget) {
        prevActiveWidget.isFocused = false;
        prevActiveWidget.selection = null;
        prevActiveWidget.highlightedSlotId = null;
        if (typeof prevActiveWidget.detachObserver === 'function') {
          prevActiveWidget.detachObserver();
        }
        prevActiveWidget.updateCaretOnly();
      }
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => {
          if (!dom.contains(el)) {
            el.classList.remove('eq-active');
            el.querySelectorAll('.eq-caret').forEach((c) => c.remove());
          }
        });
      }


      widget.isFocused = true;
      widget.attachObserver(dom);
      const docText = view ? view.state.doc.sliceString(widget.from, widget.to) : '';
      if (!widget.ast) {
        const parsed = parseMathML(widget.code);
        if (!isEquationEmpty(parsed)) {
          widget.ast = parsed;
        } else if (docText) {
          const blockMatch = /```(?:math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/.exec(docText);
          const inlineMatch = /(?:\/weq_inline|\$weq(?:_inline)?)\s*([\s\S]*?)\s*(?:\/weq_inline|\$weq(?:_inline)?)/.exec(docText);
          const rawXml = blockMatch ? blockMatch[1] : (inlineMatch ? inlineMatch[1] : '');
          if (rawXml) {
            const parsedDoc = parseMathML(rawXml);
            if (!isEquationEmpty(parsedDoc)) {
              widget.ast = parsedDoc;
              widget.code = rawXml;
            }
          }
        }
      }

      const targetEl = e.target instanceof Element ? (e.target as HTMLElement) : null;
      const anchorPos = handleMouseClick(widget.ast, dom, e.clientX, e.clientY, targetEl);
      let clickCount = widget.resolveClickCount(e);

      if (e.type === 'mousedown' && (!e.detail || e.detail < 2)) {
        clickCount = 1;
      } else if ((e.detail === undefined || e.detail <= 1) && e.type !== 'dblclick') {
        const isSameTarget = !widget.lastClickTarget || !e.target || widget.lastClickTarget === e.target;
        const isSamePos = widget.lastClickPos &&
          widget.lastClickPos.slotId === anchorPos.slotId &&
          widget.lastClickPos.offset === anchorPos.offset;
        if ((!isSameTarget || !isSamePos) && clickCount > 1) {
          clickCount = 1;
        }
      }
      widget.lastClickPos = anchorPos;
      widget.lastClickTarget = e.target || null;

      if (clickCount === 2) {
        // Double-click: Select entire current placeholder
        const targetSlot = findSlotById(widget.ast, anchorPos.slotId) || widget.ast;
        if (targetSlot.children.length === 0) {
          widget.caret = { slotId: targetSlot.id, offset: 0 };
          widget.selection = null;
          widget.highlightedSlotId = targetSlot.id;
        } else {
          widget.selection = {
            anchor: { slotId: targetSlot.id, offset: 0 },
            head: { slotId: targetSlot.id, offset: targetSlot.children.length },
          };
          widget.caret = { slotId: targetSlot.id, offset: targetSlot.children.length };
          widget.highlightedSlotId = null;
        }
      } else if (clickCount >= 3) {
        // Triple-click: Select entire root placeholder
        widget.selection = {
          anchor: { slotId: widget.ast.id, offset: 0 },
          head: { slotId: widget.ast.id, offset: widget.ast.children.length },
        };
        widget.caret = { slotId: widget.ast.id, offset: widget.ast.children.length };
        widget.highlightedSlotId = null;
      } else {
        widget.caret = anchorPos;
        widget.selection = null;
        widget.highlightedSlotId = null;
      }

      setActiveEquationState(
        {
          from: widget.from,
          to: widget.to,
          caret: widget.caret,
          selection: widget.selection,
          highlightedSlotId: widget.highlightedSlotId,
          isFocused: true,
          ast: widget.ast,
        },
        widget
      );

      widget.updateCaretOnly(dom);

      const mathEl = (dom.classList?.contains('word-equation-math')
        ? dom
        : dom.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl && typeof mathEl.focus === 'function') {
        mathEl.focus({ preventScroll: true });
      }

      const doc = dom.ownerDocument || document;
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let isCleanedUp = false;

      // Prevent native browser text selection escaping into markdown text outside equation
      const onSelectStart = (selEvt: Event) => {
        selEvt.preventDefault();
      };
      doc.addEventListener('selectstart', onSelectStart);

      const cleanupDragListeners = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        doc.removeEventListener('pointermove', onPointerMove, true);
        doc.removeEventListener('pointerup', onPointerUp, true);
        doc.removeEventListener('mousemove', onPointerMove, true);
        doc.removeEventListener('mouseup', onPointerUp, true);
        doc.removeEventListener('pointermove', onPointerMove, false);
        doc.removeEventListener('pointerup', onPointerUp, false);
        doc.removeEventListener('mousemove', onPointerMove, false);
        doc.removeEventListener('mouseup', onPointerUp, false);
        if (win) {
          win.removeEventListener('pointermove', onPointerMove, true);
          win.removeEventListener('pointerup', onPointerUp, true);
          win.removeEventListener('mousemove', onPointerMove, true);
          win.removeEventListener('mouseup', onPointerUp, true);
          win.removeEventListener('pointermove', onPointerMove, false);
          win.removeEventListener('pointerup', onPointerUp, false);
          win.removeEventListener('mousemove', onPointerMove, false);
          win.removeEventListener('mouseup', onPointerUp, false);
        }
        doc.removeEventListener('selectstart', onSelectStart);
        if (activeDragCleanup === cleanupDragListeners) {
          activeDragCleanup = null;
        }
      };

      activeDragCleanup = cleanupDragListeners;

      if (isDebugEnabled()) {
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
      }

      const onPointerMove = (moveEvt: MouseEvent | PointerEvent) => {
        // Defensive button state verification: if left button is not held, immediately tear down drag session
        if ((moveEvt.buttons & 1) !== 1) {
          widget.lastClickCount = 0;
          widget.lastClickTime = 0;
          widget.lastClickPos = null;
          widget.lastClickTarget = null;
          onPointerUp(moveEvt);
          return;
        }

        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        const distance = Math.hypot(dx, dy);
        const wasDragging = isDragging;
        const dragThreshold = clickCount >= 2 ? 10 : 3;
        if (!isDragging && distance >= dragThreshold) {
          isDragging = true;
        }

        if (isDebugEnabled()) {
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
            thresholdExceeded: distance >= dragThreshold,
            equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
          }));
        }

        if (isDragging) {
          moveEvt.preventDefault();
          moveEvt.stopPropagation();
          const targetEl = moveEvt.target instanceof Element ? (moveEvt.target as HTMLElement) : null;
          const headPos = handleMouseClick(
            widget.ast,
            dom,
            moveEvt.clientX,
            moveEvt.clientY,
            targetEl
          );
          if (headPos.slotId !== anchorPos.slotId || headPos.offset !== anchorPos.offset) {
            const elevated = elevateSelectionForDrag(widget.ast, anchorPos, headPos);
            widget.selection = elevated;
            widget.caret = elevated.head;
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
        cleanupDragListeners();
        if (isDebugEnabled()) {
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
        }
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
              equation: {
                from: widget.from,
                to: widget.to,
                isInline: widget.isInline,
              },
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
        setActiveEquationState(
          {
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: widget.selection,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          },
          widget
        );
      };

      // Register capture phase on window and doc to guarantee execution before dom.stopPropagation
      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('mousemove', onPointerMove, true);
      doc.addEventListener('mouseup', onPointerUp, true);
      doc.addEventListener('pointermove', onPointerMove, false);
      doc.addEventListener('pointerup', onPointerUp, false);
      doc.addEventListener('mousemove', onPointerMove, false);
      doc.addEventListener('mouseup', onPointerUp, false);
      if (win) {
        win.addEventListener('pointermove', onPointerMove, true);
        win.addEventListener('pointerup', onPointerUp, true);
        win.addEventListener('mousemove', onPointerMove, true);
        win.addEventListener('mouseup', onPointerUp, true);
        win.addEventListener('pointermove', onPointerMove, false);
        win.addEventListener('pointerup', onPointerUp, false);
        win.addEventListener('mousemove', onPointerMove, false);
        win.addEventListener('mouseup', onPointerUp, false);
      }
    };

    dom.addEventListener('pointerdown', handlePointerActivation);
    dom.addEventListener('mousedown', handlePointerActivation);
    const onInterrupt = (e: Event) => {
      activeDragTeardown();
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.lastClickCount = 0;
      widget.lastClickTime = 0;
      widget.lastClickPos = null;
      widget.lastClickTarget = null;
    };
    dom.addEventListener('pointercancel', onInterrupt);
    dom.addEventListener('contextmenu', onInterrupt);
    const mathBox = dom.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathBox) {
      mathBox.addEventListener('pointerdown', handlePointerActivation);
      mathBox.addEventListener('mousedown', handlePointerActivation);
      mathBox.addEventListener('pointercancel', onInterrupt);
      mathBox.addEventListener('contextmenu', onInterrupt);
    }

    const handleDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      widget.currentView = view;
      const targetEl = e.target instanceof Element ? (e.target as HTMLElement) : null;
      const clickPos = handleMouseClick(widget.ast, dom, e.clientX, e.clientY, targetEl);
      const targetSlot = findSlotById(widget.ast, clickPos.slotId) || widget.ast;
      if (targetSlot.children.length === 0) {
        widget.caret = { slotId: targetSlot.id, offset: 0 };
        widget.selection = null;
        widget.highlightedSlotId = targetSlot.id;
      } else {
        widget.selection = {
          anchor: { slotId: targetSlot.id, offset: 0 },
          head: { slotId: targetSlot.id, offset: targetSlot.children.length },
        };
        widget.caret = { slotId: targetSlot.id, offset: targetSlot.children.length };
        widget.highlightedSlotId = null;
      }
      setActiveEquationState(
        {
          from: widget.from,
          to: widget.to,
          caret: widget.caret,
          selection: widget.selection,
          highlightedSlotId: widget.highlightedSlotId,
          isFocused: true,
          ast: widget.ast,
        },
        widget
      );
      widget.updateCaretOnly(dom);
    };

    dom.addEventListener('dblclick', handleDblClick);
    if (mathBox) {
      mathBox.addEventListener('dblclick', handleDblClick);
    }
    dom.addEventListener('pointerup', (e: Event) => {
      if (isDebugEnabled()) {
        logDebugEvent('pointer', () => ({
          eventCategory: 'dom_interception',
          action: 'stopPropagation',
          eventType: e.type,
          targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
          targetClass: (e.target as HTMLElement)?.className,
          isPropagationStopped: true,
        }));
      }
      e.stopPropagation();
    });
    dom.addEventListener('mouseup', (e: Event) => {
      if (isDebugEnabled()) {
        logDebugEvent('mouse', () => ({
          eventCategory: 'dom_interception',
          action: 'stopPropagation',
          eventType: e.type,
          targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
          targetClass: (e.target as HTMLElement)?.className,
          isPropagationStopped: true,
        }));
      }
      e.stopPropagation();
    });
    dom.addEventListener('click', (e: MouseEvent) => {
      const mathEl = (dom.classList?.contains('word-equation-math')
        ? dom
        : dom.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl && typeof mathEl.focus === 'function') {
        mathEl.focus({ preventScroll: true });
      }
      if (isDebugEnabled()) {
        logDebugEvent('mouse', () => ({
          eventCategory: 'dom_interception',
          action: 'stopPropagation',
          eventType: e.type,
          targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase(),
          targetClass: (e.target as HTMLElement)?.className,
          isPropagationStopped: true,
        }));
      }
      e.stopPropagation();
    });

    dom.addEventListener('copy', (e: ClipboardEvent) => {
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      widget.handleCopyEvent(e, false);
    });
    dom.addEventListener('cut', (e: ClipboardEvent) => {
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      widget.handleCopyEvent(e, true);
    });
    dom.addEventListener('paste', (e: ClipboardEvent) => {
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      widget.handlePasteEvent(e, view);
    });

    if (mathBox) {
      mathBox.addEventListener('copy', (e: ClipboardEvent) => {
        const widget = ((dom as any).__widget as WordEquationWidget) || this;
        widget.containerEl = dom;
        widget.handleCopyEvent(e, false);
      });
      mathBox.addEventListener('cut', (e: ClipboardEvent) => {
        const widget = ((dom as any).__widget as WordEquationWidget) || this;
        widget.containerEl = dom;
        widget.handleCopyEvent(e, true);
      });
      mathBox.addEventListener('paste', (e: ClipboardEvent) => {
        const widget = ((dom as any).__widget as WordEquationWidget) || this;
        widget.containerEl = dom;
        widget.handlePasteEvent(e, view);
      });
    }

    dom.addEventListener('keydown', (e: KeyboardEvent) => {
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      widget.containerEl = dom;
      const liveRange = widget.getLiveRange(view);
      widget.from = liveRange.from;
      widget.to = liveRange.to;
      if (e.key !== ' ') {
        widget.justExpandedShortcut = false;
      }
      const cmSelectionBefore = isDebugEnabled() && view ? {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
        empty: view.state.selection.main.empty,
      } : undefined;
      const isPropStopped = Boolean(e.cancelBubble || (e as any).isPropagationStopped?.());
      logDebugEvent('keydown', () => ({
        key: e.key,
        code: e.code,
        phase: e.eventPhase === 2 ? 'target' : (e.eventPhase === 1 ? 'capture' : 'bubble'),
        defaultPrevented: e.defaultPrevented,
        cancelBubble: e.cancelBubble,
        isPropagationStopped: isPropStopped,
        targetTag: (e.target as HTMLElement)?.tagName?.toLowerCase?.(),
        targetClass: (e.target as HTMLElement)?.className,
        activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName?.toLowerCase?.() : undefined,
        activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
        isFocused: widget.isFocused,
        widgetRange: { from: widget.from, to: widget.to },
        cmSelectionBefore,
      }));

      if (!widget.isFocused) {
        const active = getActiveEquationState();
        const activeWidget = getActiveEquationWidget();
        if (active && (active.from === widget.from || activeWidget === widget) && active.isFocused) {
          widget.isFocused = true;
          widget.caret = active.caret;
          if (active.ast) {
            widget.ast = active.ast;
          }
          (dom as any).__widget = widget;
        } else if (
          dom.classList.contains('eq-active') ||
          Boolean(dom.querySelector?.('.word-equation-math.eq-active')) ||
          (typeof document !== 'undefined' &&
            (dom.contains(document.activeElement) || dom === document.activeElement))
        ) {
          widget.isFocused = true;
          if (active && active.ast && (active.from === widget.from || activeWidget === widget)) {
            widget.caret = active.caret;
            widget.ast = active.ast;
          }
          setActiveEquationState(
            {
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              isFocused: true,
              ast: widget.ast,
            },
            widget
          );
          (dom as any).__widget = widget;
        } else {
          logDebugEvent('navigation_unhandled', () => ({
            reason: 'widget_not_focused',
            key: e.key,
            code: e.code,
            targetTag: (e.target as HTMLElement)?.tagName,
            activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
            activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
            widgetFrom: widget.from,
            widgetTo: widget.to,
          }));
          return;
        }
      }

      // 0. Escape Key Handling
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();

        logDebugEvent('keydown', () => ({
          eventCategory: 'escape_handling',
          key: 'Escape',
          code: e.code,
          isWidgetFocused: widget.isFocused,
          equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
          hasVisualCaret: Boolean(dom.querySelector('.eq-caret')),
          cmSelection: view ? {
            anchor: view.state.selection.main.anchor,
            head: view.state.selection.main.head,
          } : undefined,
          activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName?.toLowerCase() : undefined,
          action: 'deactivate_equation_and_exit',
        }), true);

        widget.isFocused = false;
        widget.selection = null;
        widget.highlightedSlotId = null;
        widget.detachObserver();
        clearActiveEquationState();
        widget.updateCaretOnly(dom);

        if (view) {
          view.focus();
          const targetPos = widget.isInline ? widget.from : Math.max(0, widget.from - 1);
          view.dispatch({
            selection: { anchor: targetPos, head: targetPos },
            scrollIntoView: true,
            userEvent: 'select',
          });
        }
        return;
      }

      // 0. Undo / Redo
      const isUndo = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey;
      const isRedo =
        ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'));

      if (isUndo || isRedo) {
        e.preventDefault();
        e.stopPropagation();
        widget.handleUndoRedo(isUndo ? 'undo' : 'redo', view);
        return;
      }

      // 0.1 Select All Shortcut (Ctrl+A / Cmd+A) inside equation root
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        e.stopPropagation();

        widget.selection = {
          anchor: { slotId: widget.ast.id, offset: 0 },
          head: { slotId: widget.ast.id, offset: widget.ast.children.length },
        };
        widget.caret = { slotId: widget.ast.id, offset: widget.ast.children.length };
        widget.highlightedSlotId = null;

        setActiveEquationState(
          {
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: widget.selection,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          },
          widget
        );

        widget.updateCaretOnly();
        return;
      }

      // 1. Navigation Keys

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        e.stopPropagation();
        widget.handleArrowNavigation(e.key, e.shiftKey, view);
        return;
      }

      // 2. Tab Navigation
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const fromCaret = { ...widget.caret };
        widget.selection = null;
        widget.highlightedSlotId = null;
        const tabNav = handleTabKey(widget.ast, widget.caret, e.shiftKey);
        if (tabNav.handled) {
          widget.caret = tabNav.caret;
          setActiveEquationState({
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: null,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          });
          widget.updateCaretOnly(dom);
        }
        logDebugEvent('navigation', () => ({
          key: 'Tab',
          shiftKey: e.shiftKey,
          navType: 'tab_jump',
          from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
          to: { slotId: widget.caret.slotId, offset: widget.caret.offset },
          equation: { from: widget.from, to: widget.to, isInline: widget.isInline },
          handled: tabNav.handled,
        }));
        return;
      }

      // 3. Backspace
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();

        // 3.1 Active non-collapsed selection
        if (
          widget.selection &&
          (widget.selection.anchor.slotId !== widget.selection.head.slotId ||
            widget.selection.anchor.offset !== widget.selection.head.offset)
        ) {
          const del = deleteSelection(widget.ast, widget.selection);
          widget.selection = null;
          widget.highlightedSlotId = null;
          widget.ast = del.root;
          widget.caret = del.caret;
          setActiveEquationState({
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: null,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          });
          widget.rerender();
          widget.syncToDocument(view);
          return;
        }

        widget.selection = null;

        const slot = findSlotById(widget.ast, widget.caret.slotId);
        const isEmpty = slot ? isSlotEmpty(slot) : false;
        const isAtRoot =
          widget.caret.slotId === widget.ast.id ||
          !findParentNodeOfSlot(widget.ast, widget.caret.slotId);

        // 3.2 If highlightedSlotId is set -> Stage 2
        if (widget.highlightedSlotId) {
          const targetSlotId = widget.highlightedSlotId;
          const isTargetAtRoot =
            targetSlotId === widget.ast.id ||
            !findParentNodeOfSlot(widget.ast, targetSlotId);

          if (isTargetAtRoot) {
            widget.isFocused = false;
            clearActiveEquationState();
            widget.updateCaretOnly(dom);

            const range = widget.getLiveRange(view);
            let deleteFrom = range.from;
            let deleteTo = range.to;
            if (!widget.isInline) {
              if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 2) === '\r\n') {
                deleteTo += 2;
              } else if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 1) === '\n') {
                deleteTo += 1;
              }
            }
            view.dispatch({
              changes: { from: deleteFrom, to: deleteTo },
              selection: { anchor: deleteFrom },
            });
            view.focus();
            return;
          } else {
            const currentSlot = findSlotById(widget.ast, targetSlotId);
            if (currentSlot && currentSlot.children.length === 0) {
              const res = deleteParentStructure(widget.ast, targetSlotId);
              if (res.handled) {
                widget.ast = res.root;
                widget.caret = res.caret;
                widget.highlightedSlotId = null;
                widget.selection = null;
                setActiveEquationState({
                  from: widget.from,
                  to: widget.to,
                  caret: widget.caret,
                  selection: null,
                  highlightedSlotId: null,
                  isFocused: true,
                  ast: widget.ast,
                });
                widget.rerender();
                widget.syncToDocument(view);
                return;
              }
            }

            // Empties the placeholder
            const clonedRoot = cloneSlot(widget.ast);
            const targetSlot = findSlotById(clonedRoot, targetSlotId);
            if (targetSlot) {
              targetSlot.children = [];
              updateParentPointers(clonedRoot);
              widget.ast = clonedRoot;
              widget.caret = { slotId: targetSlot.id, offset: 0 };
            }
            widget.highlightedSlotId = null;
            setActiveEquationState({
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              selection: null,
              highlightedSlotId: null,
              isFocused: true,
              ast: widget.ast,
            });
            widget.rerender();
            widget.syncToDocument(view);
            return;
          }
        }

        // 3.3 Rule 1: offset > 0 -> delete element to left
        if (widget.caret.offset > 0) {
          widget.highlightedSlotId = null;
          const res = handleBackspace(widget.ast, widget.caret);
          if (res.handled) {
            widget.ast = res.root;
            widget.caret = res.caret;
            setActiveEquationState({
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              selection: null,
              highlightedSlotId: null,
              isFocused: true,
              ast: widget.ast,
            });
            widget.rerender();
            widget.syncToDocument(view);
          }
          return;
        }

        // 3.4 Caret at offset 0:
        if (isEmpty || isEquationEmpty(widget.ast)) {
          // Rule 2: Delete parent structure
          if (isAtRoot || isEquationEmpty(widget.ast)) {
            widget.isFocused = false;
            clearActiveEquationState();
            widget.updateCaretOnly(dom);

            const range = widget.getLiveRange(view);
            let deleteFrom = range.from;
            let deleteTo = range.to;
            if (!widget.isInline) {
              if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 2) === '\r\n') {
                deleteTo += 2;
              } else if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 1) === '\n') {
                deleteTo += 1;
              }
            }
            view.dispatch({
              changes: { from: deleteFrom, to: deleteTo },
              selection: { anchor: deleteFrom },
            });
            view.focus();
            return;
          } else {
            const parentNode = findParentNodeOfSlot(widget.ast, widget.caret.slotId);
            const isScriptSlot =
              parentNode &&
              (parentNode.type === 'superscript' || parentNode.type === 'subscript') &&
              widget.caret.slotId !== parentNode.base.id;

            if (parentNode && !isScriptSlot) {
              const siblingSlots = getChildSlots(parentNode).filter((s) => s.id !== widget.caret.slotId);
              const nonEmptySibling = siblingSlots.find((s) => !isSlotEmpty(s));
              if (nonEmptySibling) {
                widget.caret = {
                  slotId: nonEmptySibling.id,
                  offset: nonEmptySibling.children.length,
                };
                widget.highlightedSlotId = null;
                setActiveEquationState({
                  from: widget.from,
                  to: widget.to,
                  caret: widget.caret,
                  selection: null,
                  highlightedSlotId: null,
                  isFocused: true,
                  ast: widget.ast,
                });
                widget.updateCaretOnly(dom);
                return;
              }
            }

            const res = deleteParentStructure(widget.ast, widget.caret.slotId);
            if (res.handled) {
              widget.ast = res.root;
              widget.caret = res.caret;
              widget.highlightedSlotId = null;
              setActiveEquationState({
                from: widget.from,
                to: widget.to,
                caret: widget.caret,
                selection: null,
                highlightedSlotId: null,
                isFocused: true,
                ast: widget.ast,
              });
              widget.rerender();
              widget.syncToDocument(view);
              return;
            }
          }
        } else {
          // Rule 3: Start of non-empty placeholder -> Stage 1
          if (isAtRoot) {
            // First Backspace selects equation in CodeMirror
            const range = widget.getLiveRange(view);
            widget.from = range.from;
            widget.to = range.to;
            widget.highlightedSlotId = widget.ast.id;
            widget.isFocused = false;
            clearActiveEquationState();
            widget.updateCaretOnly(dom);
            updateEquationSelectionDom(dom, true);

            view.dispatch({
              selection: { anchor: widget.to, head: widget.from },
            });
            logDebugEvent('selection', () => ({
              selectionType: 'full',
              equation: {
                from: widget.from,
                to: widget.to,
                isInline: widget.isInline,
              },
              codeMirrorSelection: {
                from: widget.from,
                to: widget.to,
                head: widget.from,
                anchor: widget.to,
              },
            }));
            view.focus();
            return;
          } else {
            // Stage 1: Highlights the placeholder
            widget.highlightedSlotId = widget.caret.slotId;
            setActiveEquationState({
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              selection: null,
              highlightedSlotId: widget.highlightedSlotId,
              isFocused: true,
              ast: widget.ast,
            });
            updatePartialSelectionDom(dom, widget.ast, null, widget.highlightedSlotId);
            return;
          }
        }
        return;
      }

      // 4. Delete
      if (e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();

        if (
          widget.selection &&
          (widget.selection.anchor.slotId !== widget.selection.head.slotId ||
            widget.selection.anchor.offset !== widget.selection.head.offset)
        ) {
          const del = deleteSelection(widget.ast, widget.selection);
          widget.selection = null;
          widget.highlightedSlotId = null;
          widget.ast = del.root;
          widget.caret = del.caret;
          setActiveEquationState({
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: null,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          });
          widget.rerender();
          widget.syncToDocument(view);
          return;
        }

        // B. Handle Delete on active placeholder highlight (highlightedSlotId)
        if (widget.highlightedSlotId) {
          const targetSlotId = widget.highlightedSlotId;
          const parentNode = findParentNodeOfSlot(widget.ast, targetSlotId);
          if (parentNode) {
            const res = deleteParentStructure(widget.ast, targetSlotId);
            if (res.handled) {
              widget.ast = res.root;
              widget.caret = res.caret;
              widget.highlightedSlotId = null;
              widget.selection = null;
              setActiveEquationState({
                from: widget.from,
                to: widget.to,
                caret: widget.caret,
                selection: null,
                highlightedSlotId: null,
                isFocused: true,
                ast: widget.ast,
              });
              widget.rerender();
              widget.syncToDocument(view);
              return;
            }
          }
          widget.highlightedSlotId = null;
        }

        // C. Handle Delete at boundary of empty placeholder
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        if (slot && slot.children.length === 0 && slot.role !== 'root') {
          const res = deleteParentStructure(widget.ast, widget.caret.slotId);
          if (res.handled) {
            widget.ast = res.root;
            widget.caret = res.caret;
            widget.highlightedSlotId = null;
            widget.selection = null;
            setActiveEquationState({
              from: widget.from,
              to: widget.to,
              caret: widget.caret,
              selection: null,
              highlightedSlotId: null,
              isFocused: true,
              ast: widget.ast,
            });
            widget.rerender();
            widget.syncToDocument(view);
            return;
          }
        }

        widget.selection = null;
        widget.highlightedSlotId = null;

        if (isEquationEmpty(widget.ast)) {
          widget.isFocused = false;
          clearActiveEquationState();
          widget.updateCaretOnly(dom);

          const range = widget.getLiveRange(view);
          let deleteFrom = range.from;
          let deleteTo = range.to;
          if (!widget.isInline) {
            if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 2) === '\r\n') {
              deleteTo += 2;
            } else if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 1) === '\n') {
              deleteTo += 1;
            }
          }

          view.dispatch({
            changes: { from: deleteFrom, to: deleteTo },
            selection: { anchor: deleteFrom },
          });
          view.focus();
          return;
        }

        const res = handleDelete(widget.ast, widget.caret);
        if (res.handled) {
          widget.ast = res.root;
          widget.caret = res.caret;
          setActiveEquationState({
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: null,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          });
          widget.rerender();
          widget.syncToDocument(view);
        }
        return;
      }

      // 5. Space (Shortcut Trigger)
      if (e.key === ' ') {
        if (widget.justExpandedShortcut) {
          e.preventDefault();
          e.stopPropagation();
          widget.justExpandedShortcut = false;
          return;
        }

        const clonedRoot = cloneSlot(widget.ast);
        const targetSlot = findSlotById(clonedRoot, widget.caret.slotId);
        if (targetSlot) {
          const expanded = expandShortcutInSlot(targetSlot, widget.caret.offset, ' ');
          if (expanded.expanded && expanded.newSlot && expanded.newCaret) {
            e.preventDefault();
            e.stopPropagation();
            targetSlot.children = expanded.newSlot.children;
            updateParentPointers(clonedRoot);
            widget.ast = clonedRoot;
            widget.caret = expanded.newCaret;
            widget.justExpandedShortcut = true;
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
            });
            widget.rerender();
            widget.syncToDocument(view);
            return;
          }
        }
      }

      // 6. Character Insertion
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        let rootForInsert = widget.ast;
        let caretForInsert = widget.caret;

        if (
          widget.selection &&
          (widget.selection.anchor.slotId !== widget.selection.head.slotId ||
            widget.selection.anchor.offset !== widget.selection.head.offset)
        ) {
          const del = deleteSelection(widget.ast, widget.selection);
          rootForInsert = del.root;
          caretForInsert = del.caret;
        }

        widget.selection = null;
        widget.highlightedSlotId = null;

        const res = insertCharacter(rootForInsert, caretForInsert, e.key);
        if (res.handled) {
          widget.ast = res.root;
          widget.caret = res.caret;

          // Immediately check if the inserted character completed a custom shortcut!
          const targetSlot = findSlotById(widget.ast, widget.caret.slotId);
          if (targetSlot) {
            const expanded = expandShortcutInSlot(targetSlot, widget.caret.offset, e.key);
            if (expanded.expanded && expanded.newSlot && expanded.newCaret) {
              targetSlot.children = expanded.newSlot.children;
              updateParentPointers(widget.ast);
              widget.caret = expanded.newCaret;
              widget.justExpandedShortcut = true;
            }
          }

          setActiveEquationState({
            from: widget.from,
            to: widget.to,
            caret: widget.caret,
            selection: null,
            highlightedSlotId: null,
            isFocused: true,
            ast: widget.ast,
          });
          widget.rerender();
          widget.syncToDocument(view);
        }
        return;
      }
    });

    // Blur event
    dom.addEventListener('focusout', (e: FocusEvent) => {
      const widget = ((dom as any).__widget as WordEquationWidget) || this;
      if (widget.isUpdatingDom) return;

      const related = e.relatedTarget as HTMLElement | null;
      // If focus moved within this equation container, ignore
      if (related && related instanceof Node && dom.contains(related)) return;

      // If relatedTarget is null (e.g. clicking non-focusable elements), do not blur if activeElement is still inside
      if (!related) {
        if (typeof document !== 'undefined' && document.activeElement && document.activeElement instanceof Node && dom.contains(document.activeElement)) {
          return;
        }
        return;
      }

      // If focus shifted to CodeMirror editor content (.cm-content or view.contentDOM)
      if (view && (related === view.contentDOM || (view.dom && related instanceof Node && view.dom.contains(related)))) {
        return;
      }

      // Genuine blur to outside the editor (e.g. clicked another pane, file tree, etc.)
      logDebugEvent('focus', () => ({
        eventType: 'widget_blur',
        fromTag: dom.tagName?.toLowerCase(),
        fromClass: dom.className,
        toTag: related?.tagName?.toLowerCase(),
        toClass: related?.className,
        focusShiftType: 'equation_to_external',
        widgetFrom: widget.from,
        widgetTo: widget.to,
      }));
      activeDragTeardown();
      widget.isFocused = false;
      widget.selection = null;
      widget.highlightedSlotId = null;
      widget.detachObserver();
      const active = getActiveEquationState();
      if (active && active.from === widget.from) {
        clearActiveEquationState();
      }
      widget.updateCaretOnly(dom);
    });
  }
}
