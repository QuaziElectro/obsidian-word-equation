/**
 * Active Equation Session Registry
 * Preserves equation focus and caret state across CodeMirror 6 transactions and decoration rebuilds.
 */

import { CaretPosition, SlotNode, SelectionRange } from '../core/types';
import { findSlotById, findParentNodeOfSlot, isSlotEmpty } from '../core/ast';
import { logDebugEvent } from '../debug/debug-logger';
import { MarkdownView } from 'obsidian';


export interface ActiveEquationState {
  from: number;
  to: number;
  caret: CaretPosition;
  selection?: SelectionRange | null;
  highlightedSlotId?: string | null;
  isFocused: boolean;
  ast?: SlotNode;
}

let currentActiveEquation: ActiveEquationState | null = null;
let currentActiveWidget: any = null;

export type ActiveEquationChangeListener = (active: boolean, widget?: any) => void;
const listeners: Set<ActiveEquationChangeListener> = new Set();

export function onActiveEquationChange(callback: (active: boolean, widget?: any) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getActiveEquationState(): ActiveEquationState | null {
  if (typeof window !== 'undefined' && (window as any).__eqActiveState !== undefined) {
    return (window as any).__eqActiveState;
  }
  return currentActiveEquation;
}

export function getActiveEquationWidget(): any | null {
  if (typeof window !== 'undefined' && (window as any).__eqActiveWidget !== undefined) {
    return (window as any).__eqActiveWidget;
  }
  return currentActiveWidget;
}

export function setActiveEquationState(state: ActiveEquationState | null, widget?: any): void {
  const prevActive = Boolean(currentActiveEquation?.isFocused);
  const prevFrom = currentActiveEquation?.from;
  const newActive = Boolean(state?.isFocused);
  const newFrom = state?.from;

  currentActiveEquation = state;
  if (widget !== undefined) {
    currentActiveWidget = widget;
  } else if (!state) {
    currentActiveWidget = null;
  } else if (currentActiveWidget && currentActiveWidget.from !== state.from) {
    currentActiveWidget = null;
  }

  if (typeof window !== 'undefined') {
    (window as any).__eqActiveState = state;
    if (widget !== undefined) {
      (window as any).__eqActiveWidget = widget;
    } else if (!state) {
      (window as any).__eqActiveWidget = null;
    } else if ((window as any).__eqActiveWidget && (window as any).__eqActiveWidget.from !== state.from) {
      (window as any).__eqActiveWidget = null;
    }
  }


  if (newActive && (!prevActive || prevFrom !== newFrom)) {
    for (const listener of listeners) {
      try {
        listener(true, currentActiveWidget || widget);
      } catch (err) {
        console.error('[WordEquation] Active session listener error:', err);
      }
    }
  } else if (!newActive && prevActive) {
    for (const listener of listeners) {
      try {
        listener(false, undefined);
      } catch (err) {
        console.error('[WordEquation] Active session listener error:', err);
      }
    }
  }

  if (state?.isFocused && state?.caret) {
    logDebugEvent('caret', () => {
      const root = state.ast || widget?.ast;
      const slot = root ? findSlotById(root, state.caret.slotId) : null;
      const parentNode = root ? findParentNodeOfSlot(root, state.caret.slotId) : null;
      const slotRole = slot?.role;
      const isAtEnd = slot ? state.caret.offset >= slot.children.length : false;
      const tagName = widget?.containerEl?.tagName?.toLowerCase() || 'div';
      const targetSlotSelector = `[data-slot-id="${state.caret.slotId}"]`;
      const isPlaceholder = Boolean(slot && isSlotEmpty(slot));

      return {
        source: widget ? 'editor_widget' : 'active_session',
        equation: {
          from: state.from,
          to: state.to,
          isInline: Boolean(widget?.isInline),
        },
        caret: {
          slotId: state.caret.slotId,
          offset: state.caret.offset,
          slotRole,
          parentType: parentNode?.type,
          isAtEnd,
          isPlaceholder,
        },
        dom: {
          tagName,
          targetSlotSelector,
          role: slotRole || 'active_session',
          domOffset: state.caret.offset,
          isPlaceholder,
        },
        codeMirrorRange: {
          from: state.from,
          to: state.to,
        },
        isPlaceholder,
      };
    });
  }
}

export function clearActiveEquationState(): void {
  const prevActive = Boolean(currentActiveEquation?.isFocused);
  if (currentActiveWidget) {
    try {
      currentActiveWidget.isFocused = false;
      currentActiveWidget.selection = null;
      currentActiveWidget.highlightedSlotId = null;
    } catch {}
  }
  currentActiveEquation = null;
  currentActiveWidget = null;
  if (typeof window !== 'undefined') {
    (window as any).__eqActiveState = null;
    (window as any).__eqActiveWidget = null;
  }
  if (prevActive) {
    for (const listener of listeners) {
      try {
        listener(false, undefined);
      } catch (err) {
        console.error('[WordEquation] Active session listener error:', err);
      }
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).__clearActiveEquationState = clearActiveEquationState;
}

export interface SavedDocumentContext {
  view: any;
  cursor: any;
  cmSelection: any;
  widget: any;
  equationState: ActiveEquationState | null;
}

let savedDocumentContext: SavedDocumentContext | null = null;

export function captureDocumentContext(app?: any): void {
  const activeView =
    app?.workspace?.getActiveViewOfType?.(MarkdownView) ||
    app?.workspace?.getMostRecentLeaf?.()?.view ||
    (typeof window !== 'undefined' ? (window as any).__lastActiveView : null);
  const editor = activeView?.editor;
  const cm = (editor as any)?.cm || (activeView as any)?.cm;
  const activeWidget = getActiveEquationWidget();
  const activeState = getActiveEquationState();

  savedDocumentContext = {
    view: activeView || null,
    cursor: editor && typeof editor.getCursor === 'function' ? editor.getCursor() : null,
    cmSelection: cm?.state?.selection ? cm.state.selection : null,
    widget: activeWidget || null,
    equationState: activeState ? { ...activeState } : null,
  };
}

export function restoreDocumentContext(app?: any): void {
  if (!savedDocumentContext) return;
  const ctx = savedDocumentContext;
  savedDocumentContext = null;

  const restore = () => {
    if (ctx.widget && typeof ctx.widget.restoreCaret === 'function' && ctx.equationState?.caret) {
      ctx.widget.restoreCaret(ctx.equationState.caret);
    } else if (ctx.widget && typeof ctx.widget.focus === 'function') {
      ctx.widget.focus();
    } else if (ctx.view?.editor) {
      ctx.view.editor.focus();
      if (ctx.cursor && typeof ctx.view.editor.setCursor === 'function') {
        ctx.view.editor.setCursor(ctx.cursor);
      }
    }
  };

  restore();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(restore);
  }
}

export function getSavedDocumentContext(): SavedDocumentContext | null {
  return savedDocumentContext;
}

export function setSavedDocumentContext(ctx: SavedDocumentContext | null): void {
  savedDocumentContext = ctx;
}


