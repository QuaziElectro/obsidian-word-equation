/**
 * CodeMirror 6 Keyboard Navigation Extension for Seamless Caret Entry into Equation Widgets
 * Handles ArrowRight, ArrowLeft, ArrowDown, and ArrowUp when cursor is inside or at equation widget boundaries.
 */

import { Extension, Prec, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { wordEquationStateField } from './state-field';
import { WordEquationWidget } from './widget';
import {
  getActiveEquationState,
  clearActiveEquationState,
  getActiveEquationWidget,
} from './active-session';
import { updateEquationSelectionDom } from './selection';
import { logDebugEvent, isDebugEnabled } from '../debug/debug-logger';

export const equationTransactionFilterPlugin = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!isDebugEnabled()) return tr;

  try {
    const activeState = getActiveEquationState();
    const userEvent = tr.annotation(Transaction.userEvent);
    const targetSel = tr.selection || tr.newSelection;
    const selectionBefore = {
      anchor: tr.startState.selection.main.anchor,
      head: tr.startState.selection.main.head,
      empty: tr.startState.selection.main.empty,
    };
    const selectionAfter = {
      anchor: targetSel.main.anchor,
      head: targetSel.main.head,
      empty: targetSel.main.empty,
    };

    logDebugEvent('navigation', () => ({
      eventCategory: 'cm_transaction',
      userEvent,
      selectionChanged: !targetSel.eq(tr.startState.selection),
      selectionBefore,
      selectionAfter,
      docChanged: tr.docChanged,
      hasActiveEquation: Boolean(activeState?.isFocused),
      activeEquationRange: activeState ? { from: activeState.from, to: activeState.to } : undefined,
    }));
  } catch (err) {
    console.error('[WordEquation] Telemetry error in transaction filter:', err);
  }

  return tr;
});

export const equationSelectionHighlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.syncSelection(view);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet && isDebugEnabled()) {
        const activeState = getActiveEquationState();
        const mainSel = update.state.selection.main;
        logDebugEvent('selection', () => ({
          selectionType: 'cm_selection_update',
          codeMirrorSelection: {
            anchor: mainSel.anchor,
            head: mainSel.head,
            empty: mainSel.empty,
            from: mainSel.from,
            to: mainSel.to,
          },
          hasActiveEquation: Boolean(activeState?.isFocused),
          activeEquationRange: activeState ? { from: activeState.from, to: activeState.to } : undefined,
        }));
      }
      if (update.selectionSet || update.docChanged || update.viewportChanged) {
        this.syncSelection(update.view);
      }
    }

    syncSelection(view: EditorView) {
      const ranges = view.state.selection.ranges.filter((r) => !r.empty);
      const activeState = getActiveEquationState();

      const equationEls = view.dom.querySelectorAll<HTMLElement>('[data-equation-from]');
      equationEls.forEach((el) => {
        const from = Number(el.getAttribute('data-equation-from'));
        const to = Number(el.getAttribute('data-equation-to'));
        if (Number.isNaN(from) || Number.isNaN(to)) return;

        const isInternallyActive = Boolean(activeState?.isFocused && activeState.from === from);
        const hasInternalSelection = Boolean(activeState?.from === from && activeState?.selection);
        const isSelected =
          !isInternallyActive &&
          !hasInternalSelection &&
          ranges.some((r) => r.from < to && r.to > from);

        updateEquationSelectionDom(el, isSelected);

        if (isSelected) {
          logDebugEvent('selection', () => ({
            selectionType: 'full',
            equation: {
              from,
              to,
              isInline: el.classList.contains('word-equation-inline'),
            },
            codeMirrorSelection: ranges[0] ? {
              from: ranges[0].from,
              to: ranges[0].to,
              head: ranges[0].head,
              anchor: ranges[0].anchor,
            } : undefined,
          }));
        }
      });
    }
  }
);

export function getActiveWidget(view: EditorView): WordEquationWidget | null {
  const active = getActiveEquationState();
  if (!active || !active.isFocused) return null;

  // 1. Direct lookup from active session widget reference
  const activeWidget = getActiveEquationWidget();
  if (activeWidget instanceof WordEquationWidget && activeWidget.from === active.from) {
    if (!activeWidget.isFocused) {
      clearActiveEquationState();
      return null;
    }
    if (active.ast) activeWidget.ast = active.ast;
    return activeWidget;
  }

  // 2. Direct lookup from active DOM container if available
  const containerEl =
    (view.dom.querySelector(`[data-equation-from="${active.from}"]`) as HTMLElement | null) ||
    (view.dom.querySelector('.word-equation-math.eq-active')?.closest('[data-equation-from]') as HTMLElement | null) ||
    (view.dom.querySelector('.word-equation-math.eq-active') as HTMLElement | null);
  if (containerEl) {
    const candidate = ((containerEl as any).__widget || (containerEl.querySelector?.('[data-equation-from]') as any)?.__widget) as any;
    if (candidate && (candidate instanceof WordEquationWidget || typeof candidate.handleArrowNavigation === 'function') && candidate.from === active.from) {
      candidate.isFocused = true;
      if (active.ast) candidate.ast = active.ast;
      return candidate;
    }
  }

  // 3. Lookup from StateField decorations
  const decorations = view.state.field(wordEquationStateField, false);
  if (!decorations) return null;
  let targetWidget: WordEquationWidget | null = null;
  decorations.between(active.from, active.to, (_f, _t, dec) => {
    const w = (dec as any).widget || (dec.spec as any)?.widget;
    if (w && (w instanceof WordEquationWidget || typeof w.handleArrowNavigation === 'function')) {
      if (w.from === active.from) {
        w.isFocused = true;
        if (active.ast) {
          w.ast = active.ast;
        }
        targetWidget = w;
      }
    }
  });
  if (!targetWidget) {
    clearActiveEquationState();
  }
  return targetWidget;
}

function deleteEquationWidget(view: EditorView, widget: WordEquationWidget): void {
  const range = (widget as any).getLiveRange ? (widget as any).getLiveRange(view) : { from: widget.from, to: widget.to };
  let deleteFrom = range.from;
  let deleteTo = range.to;
  if (!widget.isInline) {
    if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 2) === '\r\n') {
      deleteTo += 2;
    } else if (deleteTo < view.state.doc.length && view.state.doc.sliceString(deleteTo, deleteTo + 1) === '\n') {
      deleteTo += 1;
    }
  }
  clearActiveEquationState();
  view.dispatch({
    changes: { from: deleteFrom, to: deleteTo },
    selection: { anchor: deleteFrom },
  });
}

/**
 * Resolves the active widget instance, prioritizing the mounted DOM widget
 * to prevent CodeMirror 6 widget recycling slot ID desynchronization.
 */
function resolveActualWidget(view: EditorView, targetWidget: WordEquationWidget): WordEquationWidget {
  const mountedEl =
    (view.dom.querySelector(`[data-equation-from="${targetWidget.from}"]`) as HTMLElement | null) ||
    (view.dom.querySelector('.word-equation-math')?.parentElement as HTMLElement | null);
  const domWidget = (mountedEl as any)?.__widget;
  const actualWidget =
    domWidget instanceof WordEquationWidget && domWidget.code === targetWidget.code
      ? domWidget
      : targetWidget;
  actualWidget.from = targetWidget.from;
  actualWidget.to = targetWidget.to;
  return actualWidget;
}

let isWindowCaptureInterceptorInstalled = false;

/**
 * Global capture-phase window keydown listener to recover focus and forward arrow keys
 * when CodeMirror microtask reconciliation involuntarily blurs activeElement to document.body.
 */
export function registerWindowArrowCaptureInterceptor(): void {
  if (typeof window === 'undefined' || isWindowCaptureInterceptorInstalled) return;
  isWindowCaptureInterceptorInstalled = true;

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // Do not intercept hotkeys with Ctrl, Alt, or Meta modifiers
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowUp'
      ) {
        return;
      }

      const activeState = getActiveEquationState();
      if (!activeState?.isFocused || document.activeElement !== document.body) return;

      const activeWidget = getActiveEquationWidget();
      if (!activeWidget || typeof activeWidget.handleArrowNavigation !== 'function') return;

      // If widget was unmounted from DOM, clear session and do not intercept
      if (activeWidget.containerEl && !activeWidget.containerEl.isConnected) {
        clearActiveEquationState();
        return;
      }

      // Assert focus back to the equation element
      const mathEl = (activeWidget.containerEl?.classList?.contains('word-equation-math')
        ? activeWidget.containerEl
        : activeWidget.containerEl?.querySelector('.word-equation-math')) as HTMLElement | null;
      if (mathEl && typeof mathEl.focus === 'function') {
        mathEl.focus({ preventScroll: true });
      }

      const handled = activeWidget.handleArrowNavigation(
        e.key as any,
        e.shiftKey,
        activeWidget.currentView
      );
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },
    true
  );
}

export function createEquationNavigationExtension(): Extension {
  registerWindowArrowCaptureInterceptor();
  return [
    equationTransactionFilterPlugin,
    equationSelectionHighlightPlugin,
    Prec.highest(EditorView.decorations.from(wordEquationStateField)),
    Prec.highest(
      keymap.of([
        {
          key: 'Escape',
          run: (view: EditorView): boolean => {
            const activeWidget = getActiveWidget(view);
            if (activeWidget) {
              logDebugEvent('keydown', () => ({
                eventCategory: 'cm_keymap_escape',
                action: 'deactivate_active_widget',
                from: activeWidget.from,
                to: activeWidget.to,
              }), true);
              activeWidget.isFocused = false;
              activeWidget.selection = null;
              activeWidget.highlightedSlotId = null;
              activeWidget.detachObserver();
              clearActiveEquationState();
              activeWidget.updateCaretOnly();

              view.focus();
              const targetPos = activeWidget.isInline ? activeWidget.from : Math.max(0, activeWidget.from - 1);
              view.dispatch({
                selection: { anchor: targetPos, head: targetPos },
                scrollIntoView: true,
                userEvent: 'select',
              });
              return true;
            }
            return false;
          },
        },
        {
          key: 'Mod-z',
          run: (view: EditorView): boolean => {
            const activeWidget = getActiveWidget(view);
            if (activeWidget) {
              activeWidget.handleUndoRedo('undo', view);
              return true;
            }
            return false;
          },
        },
        {
          key: 'Mod-y',
          run: (view: EditorView): boolean => {
            const activeWidget = getActiveWidget(view);
            if (activeWidget) {
              activeWidget.handleUndoRedo('redo', view);
              return true;
            }
            return false;
          },
        },
        {
          key: 'Mod-Shift-z',
          run: (view: EditorView): boolean => {
            const activeWidget = getActiveWidget(view);
            if (activeWidget) {
              activeWidget.handleUndoRedo('redo', view);
              return true;
            }
            return false;
          },
        },
        {
          key: 'Backspace',
        run: (view: EditorView): boolean => {
          const active = getActiveEquationState();
          if (active && active.isFocused) return false;

          const sel = view.state.selection.main;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          // A. If an equation is selected across its range
          if (!sel.empty) {
            let targetWidget: WordEquationWidget | null = null;
            decorations.between(sel.from, sel.to, (_from, _to, dec) => {
              if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
                const w = (dec.spec as any).widget as WordEquationWidget;
                if (w.from === sel.from && w.to === sel.to) {
                  targetWidget = w;
                }
              }
            });
            if (targetWidget) {
              deleteEquationWidget(view, targetWidget);
              return true;
            }
            return false;
          }

          // B. Collapsed cursor immediately AFTER an equation
          const pos = sel.head;
          let targetWidget: WordEquationWidget | null = null;

          decorations.between(Math.max(0, pos - 10), pos, (_from, to, dec) => {
            if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
              const w = (dec.spec as any).widget as WordEquationWidget;
              if (w.isInline) {
                if (to === pos) {
                  targetWidget = w;
                }
              } else {
                const blockLine = view.state.doc.lineAt(w.to);
                const curLine = view.state.doc.lineAt(pos);
                const isImmediatelyAfterBlock =
                  pos === w.to ||
                  (curLine.number === blockLine.number + 1 && curLine.from === pos);
                if (isImmediatelyAfterBlock) {
                  targetWidget = w;
                }
              }
            }
          });

          if (targetWidget) {
            deleteEquationWidget(view, targetWidget);
            return true;
          }

          return false;
        },
      },
      {
        key: 'Delete',
        run: (view: EditorView): boolean => {
          const active = getActiveEquationState();
          if (active && active.isFocused) return false;

          const sel = view.state.selection.main;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          // A. If an equation is selected across its range
          if (!sel.empty) {
            let targetWidget: WordEquationWidget | null = null;
            decorations.between(sel.from, sel.to, (_from, _to, dec) => {
              if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
                const w = (dec.spec as any).widget as WordEquationWidget;
                if (w.from === sel.from && w.to === sel.to) {
                  targetWidget = w;
                }
              }
            });
            if (targetWidget) {
              deleteEquationWidget(view, targetWidget);
              return true;
            }
            return false;
          }

          // B. Collapsed cursor immediately BEFORE an equation
          const pos = sel.head;
          let targetWidget: WordEquationWidget | null = null;

          decorations.between(pos, Math.min(view.state.doc.length, pos + 4), (from, _to, dec) => {
            if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
              const w = (dec.spec as any).widget as WordEquationWidget;
              if (w.isInline) {
                if (from === pos) {
                  targetWidget = w;
                }
              } else {
                const blockLine = view.state.doc.lineAt(w.from);
                const curLine = view.state.doc.lineAt(pos);
                if (
                  pos === w.from ||
                  pos === w.from - 1 ||
                  pos === w.from - 2 ||
                  (curLine.number === blockLine.number - 1 && curLine.to === pos)
                ) {
                  targetWidget = w;
                }
              }
            }
          });

          if (targetWidget) {
            deleteEquationWidget(view, targetWidget);
            return true;
          }

          return false;
        },
      },
      {
        key: 'Shift-ArrowRight',
        run: (view: EditorView): boolean => {
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowRight', true, view);
          }

          const sel = view.state.selection.main;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          const doc = view.state.doc;

          // Scan for equation decorations near or encompassing selection head
          const candidates: Array<{ from: number; to: number; isInline: boolean }> = [];
          decorations.between(
            Math.max(0, sel.head - 4),
            Math.min(doc.length, sel.head + 4),
            (from, to, dec) => {
              const w = (dec as any).widget || (dec.spec as any)?.widget;
              if (w instanceof WordEquationWidget || from < to) {
                if (!candidates.some((c) => c.from === from && c.to === to)) {
                  candidates.push({
                    from,
                    to,
                    isInline: Boolean((w as any)?.isInline || (dec.spec as any)?.widget?.isInline),
                  });
                }
              }
            }
          );

          if (candidates.length === 0) {
            decorations.between(
              Math.max(0, sel.from),
              Math.min(doc.length, sel.to + 1),
              (from, to, dec) => {
                if (sel.head >= from && sel.head <= to) {
                  const w = (dec as any).widget || (dec.spec as any)?.widget;
                  if (!candidates.some((c) => c.from === from && c.to === to)) {
                    candidates.push({
                      from,
                      to,
                      isInline: Boolean((w as any)?.isInline || (dec.spec as any)?.widget?.isInline),
                    });
                  }
                }
              }
            );
          }

          let candidateWidget: { from: number; to: number; isInline: boolean } | null = null;
          if (candidates.length > 0) {
            const atEntranceOrInside = candidates.find(
              (c) => sel.head === c.from || (sel.head > c.from && sel.head < c.to)
            );
            if (atEntranceOrInside) {
              candidateWidget = atEntranceOrInside;
            } else {
              const rightCandidates = candidates.filter((c) => c.to >= sel.head);
              if (rightCandidates.length > 0) {
                candidateWidget = rightCandidates.reduce((closest, curr) =>
                  curr.to < closest.to ? curr : closest
                );
              } else {
                candidateWidget = candidates[0];
              }
            }
          }

          if (candidateWidget) {
            const { from, to, isInline } = candidateWidget;
            const exitPos = !isInline && to < doc.length && doc.sliceString(to, to + 1) === '\n'
              ? to + 1
              : to;

            if (sel.anchor <= from) {
              if (sel.head < to) {
                // If approaching or inside the equation, jump across
                if (sel.head === from || (sel.head > from && sel.head < to)) {
                  logDebugEvent('selection', () => ({
                    action: 'external_shift_arrow',
                    direction: 'Shift-ArrowRight',
                    step: 'jump_across_equation',
                    headBefore: sel.head,
                    headAfter: exitPos,
                    anchor: sel.anchor,
                    equation: { from, to, isInline },
                  }));

                  view.dispatch({
                    selection: { anchor: sel.anchor, head: exitPos },
                    scrollIntoView: true,
                    userEvent: 'select.extend',
                  });
                  return true;
                }
              } else if (sel.head >= to) {
                // Equation is already encompassed: extend past equation into subsequent text
                const nextPos = Math.min(doc.length, sel.head + 1);
                if (nextPos !== sel.head) {
                  logDebugEvent('selection', () => ({
                    action: 'external_shift_arrow',
                    direction: 'Shift-ArrowRight',
                    step: 'extend_past_equation',
                    headBefore: sel.head,
                    headAfter: nextPos,
                    anchor: sel.anchor,
                    equation: { from, to, isInline },
                  }));

                  view.dispatch({
                    selection: { anchor: sel.anchor, head: nextPos },
                    scrollIntoView: true,
                    userEvent: 'select.extend',
                  });
                  return true;
                }
              }
            }
          }

          return false;
        },
      },
      {
        key: 'Shift-ArrowLeft',
        run: (view: EditorView): boolean => {
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowLeft', true, view);
          }

          const sel = view.state.selection.main;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          const doc = view.state.doc;

          // Scan for equation decorations near or encompassing selection head
          const candidates: Array<{ from: number; to: number; isInline: boolean }> = [];
          decorations.between(
            Math.max(0, sel.head - 4),
            Math.min(doc.length, sel.head + 4),
            (from, to, dec) => {
              const w = (dec as any).widget || (dec.spec as any)?.widget;
              if (w instanceof WordEquationWidget || from < to) {
                if (!candidates.some((c) => c.from === from && c.to === to)) {
                  candidates.push({
                    from,
                    to,
                    isInline: Boolean((w as any)?.isInline || (dec.spec as any)?.widget?.isInline),
                  });
                }
              }
            }
          );

          if (candidates.length === 0) {
            decorations.between(
              Math.max(0, sel.from - 1),
              Math.min(doc.length, sel.to),
              (from, to, dec) => {
                if (sel.head >= from && sel.head <= to) {
                  const w = (dec as any).widget || (dec.spec as any)?.widget;
                  if (!candidates.some((c) => c.from === from && c.to === to)) {
                    candidates.push({
                      from,
                      to,
                      isInline: Boolean((w as any)?.isInline || (dec.spec as any)?.widget?.isInline),
                    });
                  }
                }
              }
            );
          }

          let candidateWidget: { from: number; to: number; isInline: boolean } | null = null;
          if (candidates.length > 0) {
            const atExitOrInside = candidates.find((c) => {
              const exitPos = !c.isInline && c.to < doc.length && doc.sliceString(c.to, c.to + 1) === '\n'
                ? c.to + 1
                : c.to;
              return sel.head === exitPos || sel.head === c.to || (sel.head < c.to && sel.head > c.from);
            });
            if (atExitOrInside) {
              candidateWidget = atExitOrInside;
            } else {
              const leftCandidates = candidates.filter((c) => c.from <= sel.head);
              if (leftCandidates.length > 0) {
                candidateWidget = leftCandidates.reduce((closest, curr) =>
                  curr.from > closest.from ? curr : closest
                );
              } else {
                candidateWidget = candidates[0];
              }
            }
          }

          if (candidateWidget) {
            const { from, to, isInline } = candidateWidget;
            const entrancePos = !isInline && from > 0 && doc.sliceString(from - 1, from) === '\n'
              ? from - 1
              : from;
            const exitPos = !isInline && to < doc.length && doc.sliceString(to, to + 1) === '\n'
              ? to + 1
              : to;

            if (sel.anchor >= to) {
              if (sel.head > from) {
                // If approaching or inside the equation backward, jump across
                if (sel.head === exitPos || sel.head === to || (sel.head < to && sel.head > from)) {
                  logDebugEvent('selection', () => ({
                    action: 'external_shift_arrow',
                    direction: 'Shift-ArrowLeft',
                    step: 'jump_across_equation',
                    headBefore: sel.head,
                    headAfter: entrancePos,
                    anchor: sel.anchor,
                    equation: { from, to, isInline },
                  }));

                  view.dispatch({
                    selection: { anchor: sel.anchor, head: entrancePos },
                    scrollIntoView: true,
                    userEvent: 'select.extend',
                  });
                  return true;
                }
              } else if (sel.head <= from) {
                // Equation is already encompassed: extend past equation into preceding text
                const prevPos = Math.max(0, sel.head - 1);
                if (prevPos !== sel.head) {
                  logDebugEvent('selection', () => ({
                    action: 'external_shift_arrow',
                    direction: 'Shift-ArrowLeft',
                    step: 'extend_past_equation',
                    headBefore: sel.head,
                    headAfter: prevPos,
                    anchor: sel.anchor,
                    equation: { from, to, isInline },
                  }));

                  view.dispatch({
                    selection: { anchor: sel.anchor, head: prevPos },
                    scrollIntoView: true,
                    userEvent: 'select.extend',
                  });
                  return true;
                }
              }
            }
          }

          return false;
        },
      },
      {
        key: 'Shift-ArrowDown',
        run: (view: EditorView): boolean => {
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowDown', true, view);
          }
          return false;
        },
      },
      {
        key: 'Shift-ArrowUp',
        run: (view: EditorView): boolean => {
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowUp', true, view);
          }
          return false;
        },
      },
      {
        key: 'ArrowRight',
        run: (view: EditorView): boolean => {
          logDebugEvent('keydown', () => ({
            key: 'ArrowRight',
            code: 'ArrowRight',
            targetTag: 'contentDOM',
            activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
            activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
            isFocused: Boolean(getActiveEquationState()?.isFocused),
            cmSelectionBefore: {
              anchor: view.state.selection.main.anchor,
              head: view.state.selection.main.head,
              empty: view.state.selection.main.empty,
            },
          }));

          // 1. If an equation is currently active, navigate internally or exit
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowRight', false, view);
          }

          // 2. Cursor is outside equation at boundary: enter from start
          const sel = view.state.selection.main;
          if (!sel.empty) return false;

          const pos = sel.head;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          let targetWidget: WordEquationWidget | null = null;
          decorations.between(pos, Math.min(view.state.doc.length, pos + 4), (from, _to, dec) => {
            const w = (dec as any).widget || (dec.spec as any)?.widget;
            if (!(w instanceof WordEquationWidget || typeof w?.enterFromStart === 'function')) return;

            if (w.isInline) {
              if (from === pos) {
                targetWidget = w;
              }
            } else {
              const blockLine = view.state.doc.lineAt(from);
              const curLine = view.state.doc.lineAt(pos);
              const isAtBlockBoundary =
                from === pos ||
                (curLine.number === blockLine.number - 1 && curLine.to === pos) ||
                (pos === from - 1 && view.state.doc.sliceString(pos, from) === '\n');
              if (isAtBlockBoundary) {
                targetWidget = w;
              }
            }
          });

          if (targetWidget) {
            const actualWidget = resolveActualWidget(view, targetWidget as WordEquationWidget);
            actualWidget.enterFromStart(view);
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowLeft',
        run: (view: EditorView): boolean => {
          logDebugEvent('keydown', () => ({
            key: 'ArrowLeft',
            code: 'ArrowLeft',
            targetTag: 'contentDOM',
            activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
            activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
            isFocused: Boolean(getActiveEquationState()?.isFocused),
            cmSelectionBefore: {
              anchor: view.state.selection.main.anchor,
              head: view.state.selection.main.head,
              empty: view.state.selection.main.empty,
            },
          }));

          // 1. If an equation is currently active, navigate internally or exit
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowLeft', false, view);
          }

          // 2. Cursor is outside equation at boundary: enter from end
          const sel = view.state.selection.main;
          if (!sel.empty) return false;

          const pos = sel.head;
          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          let targetWidget: WordEquationWidget | null = null;
          decorations.between(Math.max(0, pos - 4), pos, (_from, to, dec) => {
            const w = (dec as any).widget || (dec.spec as any)?.widget;
            if (!(w instanceof WordEquationWidget || typeof w?.enterFromEnd === 'function')) return;

            if (w.isInline) {
              if (to === pos) {
                targetWidget = w;
              }
            } else {
              const blockLine = view.state.doc.lineAt(to);
              const curLine = view.state.doc.lineAt(pos);
              const isAtBlockBoundary =
                to === pos ||
                (curLine.number === blockLine.number + 1 && curLine.from === pos) ||
                (pos === to + 1 && view.state.doc.sliceString(to, pos) === '\n');
              if (isAtBlockBoundary) {
                targetWidget = w;
              }
            }
          });

          if (targetWidget) {
            const w = targetWidget as WordEquationWidget;
            if (w.justEscapedForwardAfterEnteringFromEnd) {
              w.justEscapedForwardAfterEnteringFromEnd = false;
              return false;
            }
            w.justEscapedForwardAfterEnteringFromEnd = false;
            const actualWidget = resolveActualWidget(view, w);
            actualWidget.enterFromEnd(view);
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view: EditorView): boolean => {
          logDebugEvent('keydown', () => ({
            key: 'ArrowDown',
            code: 'ArrowDown',
            targetTag: 'contentDOM',
            activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
            activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
            isFocused: Boolean(getActiveEquationState()?.isFocused),
            cmSelectionBefore: {
              anchor: view.state.selection.main.anchor,
              head: view.state.selection.main.head,
              empty: view.state.selection.main.empty,
            },
          }));

          // 1. If an equation is currently active, navigate internally or exit
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowDown', false, view);
          }

          // 2. Cursor is outside equation at boundary: enter from start
          const sel = view.state.selection.main;
          if (!sel.empty) return false;

          const line = view.state.doc.lineAt(sel.head);
          const nextPos = line.to + 1;
          if (nextPos <= view.state.doc.length) {
            const decorations = view.state.field(wordEquationStateField, false);
            if (decorations) {
              let targetWidget: WordEquationWidget | null = null;
              decorations.between(nextPos, Math.min(view.state.doc.length, nextPos + 4), (from, _to, dec) => {
                const w = (dec as any).widget || (dec.spec as any)?.widget;
                if ((from === nextPos || from === nextPos + 1 || from === nextPos + 2) && (w instanceof WordEquationWidget || typeof w?.enterFromStart === 'function')) {
                  targetWidget = w;
                }
              });
              if (targetWidget) {
                const actualWidget = resolveActualWidget(view, targetWidget as WordEquationWidget);
                actualWidget.enterFromStart(view, 'ArrowDown');
                return true;
              }
            }
          }
          return false;
        },
      },
      {
        key: 'ArrowUp',
        run: (view: EditorView): boolean => {
          logDebugEvent('keydown', () => ({
            key: 'ArrowUp',
            code: 'ArrowUp',
            targetTag: 'contentDOM',
            activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName : undefined,
            activeElementClass: typeof document !== 'undefined' ? document.activeElement?.className : undefined,
            isFocused: Boolean(getActiveEquationState()?.isFocused),
            cmSelectionBefore: {
              anchor: view.state.selection.main.anchor,
              head: view.state.selection.main.head,
              empty: view.state.selection.main.empty,
            },
          }));

          // 1. If an equation is currently active, navigate internally or exit
          const activeWidget = getActiveWidget(view);
          if (activeWidget) {
            return activeWidget.handleArrowNavigation('ArrowUp', false, view);
          }

          // 2. Cursor is outside equation at boundary: enter from end
          const sel = view.state.selection.main;
          if (!sel.empty) return false;

          const curLine = view.state.doc.lineAt(sel.head);
          const prevPos = curLine.from - 1;
          if (prevPos >= 0) {
            const decorations = view.state.field(wordEquationStateField, false);
            if (decorations) {
              let targetWidget: WordEquationWidget | null = null;
              decorations.between(Math.max(0, prevPos - 4), prevPos, (_from, to, dec) => {
                const w = (dec as any).widget || (dec.spec as any)?.widget;
                if ((to === prevPos || to === prevPos - 1 || to === prevPos - 2) && (w instanceof WordEquationWidget || typeof w?.enterFromEnd === 'function')) {
                  const blockLine = view.state.doc.lineAt(to);
                  if (curLine.number === blockLine.number + 1) {
                    targetWidget = w;
                  }
                }
              });

              logDebugEvent('navigation', () => ({
                navType: 'arrow_up_line_evaluation',
                currentPos: sel.head,
                currentLineNumber: curLine.number,
                candidateWidget: targetWidget ? { from: targetWidget.from, to: targetWidget.to } : null,
                blockLineNumber: targetWidget ? view.state.doc.lineAt(targetWidget.to).number : null,
                decision: targetWidget ? 'enter_equation' : 'skip_intermediate_line_or_none',
              }));

              if (targetWidget) {
                const actualWidget = resolveActualWidget(view, targetWidget as WordEquationWidget);
                actualWidget.enterFromEnd(view, 'ArrowUp');
                return true;
              }
            }
          }
          return false;
        },
      },
    ])) as Extension,
    EditorView.domEventHandlers({
      pointerdown(event, view) {
        const active = getActiveEquationState();
        if (!active || !active.isFocused) return false;

        const target = event.target as HTMLElement | null;
        if (target && target.closest('.word-equation-block, .word-equation-inline')) {
          return false;
        }

        const hadActiveSelection = Boolean(active.selection);
        logDebugEvent('pointer', () => ({
          eventCategory: 'external_pointerdown',
          hadActiveEquation: true,
          activeEquationRange: { from: active.from, to: active.to },
          hadActiveSelection,
          actionTaken: 'blur_equation_and_clear_selection',
        }));

        const decorations = view.state.field(wordEquationStateField, false);
        if (decorations) {
          decorations.between(active.from, active.to, (_f, _t, dec) => {
            if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
              const w = (dec.spec as any).widget as WordEquationWidget;
              w.isFocused = false;
              w.selection = null;
              w.highlightedSlotId = null;
              w.updateCaretOnly();
            }
          });
        }
        clearActiveEquationState();
        return false;
      },
      copy(event: ClipboardEvent, view: EditorView): boolean {
        if (!isDebugEnabled()) return false;

        const active = getActiveEquationState();
        if (active && active.isFocused) {
          return false;
        }

        const sel = view.state.selection.main;
        if (sel.empty) return false;

        const selectedText = view.state.sliceDoc(sel.from, sel.to);
        const decorations = view.state.field(wordEquationStateField, false);
        let spansEquation = false;
        if (decorations) {
          decorations.between(sel.from, sel.to, (f, t) => {
            if (f < t) {
              spansEquation = true;
            }
          });
        }

        const types = event.clipboardData ? Array.from(event.clipboardData.types) : ['text/plain'];
        const snippet = selectedText.slice(0, 100);

        logDebugEvent('clipboard', () => ({
          action: 'copy',
          context: spansEquation ? 'cross_boundary_selection' : 'markdown_editor',
          types,
          characterCount: selectedText.length,
          snippet,
          selection: {
            from: sel.from,
            to: sel.to,
            anchor: sel.anchor,
            head: sel.head,
            spansEquation,
          },
          payload: {
            types,
            characterCount: selectedText.length,
            snippet,
            plainTextSnippet: snippet,
            hasMathMarkup: /<math[\s>]|```math-word|\/weq_inline|\$weq/i.test(selectedText),
          },
          targetTag: (event.target as HTMLElement)?.tagName?.toLowerCase(),
          success: true,
        }));

        return false;
      },
      paste(event: ClipboardEvent, view: EditorView): boolean {
        const active = getActiveEquationState();
        if (active && active.isFocused) {
          return false;
        }

        const clipboardText =
          event.clipboardData?.getData('application/mathml+xml')?.trim() ||
          event.clipboardData?.getData('text/plain')?.trim();
        if (!clipboardText) return false;

        const hasMarkdownFences =
          clipboardText.includes('```math-word') ||
          clipboardText.includes('```weq') ||
          clipboardText.includes('```') ||
          clipboardText.includes('/weq_inline') ||
          clipboardText.includes('$weq');

        if (hasMarkdownFences) {
          return false;
        }

        const isPureMathML = /^\s*(?:<\?xml[^>]*\?>\s*)?<math[\s>][\s\S]*<\/math>\s*$/i.test(clipboardText);
        if (!isPureMathML) {
          return false;
        }

        event.preventDefault();

        let xml = clipboardText.replace(/^\s*<\?xml[^>]*\?>\s*/i, '').trim();
        if (!xml.includes('xmlns=')) {
          xml = xml.replace(/<math/i, '<math xmlns="http://www.w3.org/1998/Math/MathML"');
        }

        const sel = view.state.selection.main;
        const line = view.state.doc.lineAt(sel.head);

        const isInline =
          xml.includes('display="inline"') ||
          (line.text.trim().length > 0 && !xml.includes('display="block"'));

        let template: string;
        if (isInline) {
          template = `/weq_inline ${xml} /weq_inline`;
        } else {
          const prefix = sel.from > 0 && view.state.doc.sliceString(sel.from - 1, sel.from) !== '\n' ? '\n' : '';
          const suffix = sel.to < view.state.doc.length && view.state.doc.sliceString(sel.to, sel.to + 1) !== '\n' ? '\n' : '';
          template = `${prefix}\`\`\`math-word\n${xml}\n\`\`\`${suffix}`;
        }

        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: template },
          selection: { anchor: sel.from + template.length },
        });

        logDebugEvent('clipboard', () => ({
          action: 'paste',
          context: 'markdown_editor',
          payload: {
            types: event.clipboardData ? Array.from(event.clipboardData.types) : [],
            plainTextSnippet: clipboardText.slice(0, 100),
            mathmlSnippet: clipboardText.slice(0, 100),
            isMathML: true,
            characterCount: clipboardText.length,
          },
          destination: {
            cmPos: sel.from,
          },
          success: true,
        }));
        return true;
      },
    }),
  ];
}
