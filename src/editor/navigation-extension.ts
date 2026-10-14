/**
 * CodeMirror 6 Keyboard Navigation Extension for Seamless Caret Entry into Equation Widgets
 * Handles ArrowRight, ArrowLeft, ArrowDown, and ArrowUp when cursor is inside or at equation widget boundaries.
 */

import { Extension, Prec, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { wordEquationStateField, isTableRowLine, isInsideTableRow } from './state-field';
import { WordEquationWidget, isBlockEquationStart, isBlockEquationEnd, isInternalEquationUpdating } from './widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationWidget,
} from './active-session';
import { handleArrowKey } from './navigation';
import { updateEquationSelectionDom } from './selection';
import { isEquationEmpty, cloneSlot } from '../core/ast';

import { logDebugEvent, isDebugEnabled } from '../debug/debug-logger';

export function isInsideFullPageContainer(
  state: EditorState,
  pos?: number
): { isFullPage: boolean; widget?: WordEquationWidget } {
  const decorations = state.field(wordEquationStateField, false);
  if (!decorations) return { isFullPage: false };

  let result: { isFullPage: boolean; widget?: WordEquationWidget } = { isFullPage: false };

  decorations.between(0, state.doc.length, (from, to, dec) => {
    if (result.isFullPage) return;
    const w = (dec as any).widget || (dec.spec as any)?.widget;
    if (
      w instanceof WordEquationWidget &&
      (w.displayMode === 'full-page' || w.delimiter === 'math-page' || w.delimiter === 'weq-page')
    ) {
      const inTable = isInsideTableRow(state.doc, from, to);
      if (inTable) {
        if (pos !== undefined) {
          const line = state.doc.lineAt(from);
          const lineText = line.text;
          const relFrom = from - line.from;
          const relTo = to - line.from;
          const prevPipe = lineText.lastIndexOf('|', relFrom - 1);
          const nextPipe = lineText.indexOf('|', relTo);
          const cellStart = prevPipe !== -1 ? line.from + prevPipe + 1 : line.from;
          const cellEnd = nextPipe !== -1 ? line.from + nextPipe : line.to;
          if (pos >= cellStart && pos <= cellEnd) {
            result = { isFullPage: true, widget: w };
          }
        }
      } else {
        result = { isFullPage: true, widget: w };
      }
    }
  });

  return result;
}

export function findFullPageWidget(view: EditorView, target?: HTMLElement | null): WordEquationWidget | null {
  const cell = target?.closest('td, th, .table-cell-wrapper');
  if (cell) {
    const fullPageEl = cell.querySelector('.word-equation-full-page, .eq-full-page, [data-display-mode="full-page"]') as HTMLElement | null;
    if (fullPageEl) {
      const candidate = ((fullPageEl as any).__widget || (fullPageEl.querySelector?.('.word-equation-math') as any)?.__widget) as WordEquationWidget | null;
      if (candidate) return candidate;
    }
  }

  const decorations = view.state.field(wordEquationStateField, false);
  if (decorations) {
    let matched: WordEquationWidget | null = null;
    decorations.between(0, view.state.doc.length, (from, to, dec) => {
      if (matched) return;
      const w = (dec as any).widget || (dec.spec as any)?.widget;
      if (
        w instanceof WordEquationWidget &&
        (w.displayMode === 'full-page' || w.delimiter === 'math-page' || w.delimiter === 'weq-page')
      ) {
        const inTable = isInsideTableRow(view.state.doc, from, to);
        if (cell) {
          if (inTable) {
            matched = w;
          }
        } else if (!inTable) {
          matched = w;
        }
      }
    });
    if (matched) return matched;
  }

  const pageWidgetEl = view.dom.querySelector('.word-equation-full-page, .eq-full-page, [data-display-mode="full-page"]') as HTMLElement | null;
  if (pageWidgetEl) {
    const elCell = pageWidgetEl.closest('td, th, .table-cell-wrapper');
    if (!elCell || cell) {
      const candidate = ((pageWidgetEl as any).__widget || (pageWidgetEl.querySelector?.('.word-equation-math') as any)?.__widget) as WordEquationWidget | null;
      if (candidate) return candidate;
    }
  }

  return null;
}

export const equationTransactionFilterPlugin = EditorState.transactionFilter.of((tr: Transaction) => {
  if (tr.docChanged) {
    const headPos = tr.selection?.main.head ?? tr.startState.selection.main.head;
    const fpInfo = isInsideFullPageContainer(tr.startState, headPos);
    if (fpInfo.isFullPage) {
      if (!isInternalEquationUpdating()) {
        const userEvent = tr.annotation(Transaction.userEvent);
        if (userEvent?.startsWith('input') || userEvent?.startsWith('delete') || !userEvent) {
          return [];
        }
      }
    }
  }

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
      if (update.selectionSet && !getActiveEquationState()?.isFocused) {
        const mainSel = update.state.selection.main;
        if (mainSel.empty) {
          const pos = mainSel.head;
          const fpInfo = isInsideFullPageContainer(update.state, pos);
          if (fpInfo.isFullPage && fpInfo.widget) {
            const actual = resolveActualWidget(update.view, fpInfo.widget);
            actual.enterFromStart(update.view);
          } else {
            const line = update.state.doc.lineAt(pos);
            if (isTableRowLine(line)) {
              const tableWidget = findTableBlockWidgetForPos(update.view, line, pos, 'inside');
              if (tableWidget && pos >= tableWidget.from && pos < tableWidget.to && !(tableWidget.justExitedForward && pos === tableWidget.lastForwardExitPos)) {
                const actual = resolveActualWidget(update.view, tableWidget);
                actual.enterFromStart(update.view);
              }
            }
          }
        }
      }
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
    const liveDocCode = view.state.doc.sliceString(activeWidget.from, activeWidget.to);
    if (!liveDocCode.includes(activeWidget.code) && active.ast) {
      activeWidget.ast = cloneSlot(active.ast, true);
    } else if (active.ast) {
      activeWidget.ast = active.ast;
    }
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
  decorations.between(active.from, active.to, (f, t, dec) => {
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

export function findTableBlockWidgetForPos(
  view: EditorView,
  line: { from: number; to: number; text: string; number: number },
  pos: number,
  direction: 'right' | 'left' | 'inside'
): WordEquationWidget | null {
  if (!isTableRowLine(line)) return null;
  const decorations = view.state.field(wordEquationStateField, false);
  if (!decorations) return null;

  let targetWidget: WordEquationWidget | null = null;
  decorations.between(line.from, line.to, (from, to, dec) => {
    if (targetWidget) return;
    const w = (dec as any).widget || (dec.spec as any)?.widget;
    if (from < line.from || to > line.to) return;
    const isTableBlock = Boolean((w as any).isBlockInTable || (!w.isInline && isInsideTableRow(view.state.doc, from, to)));
    if (!isTableBlock) return;

    const relFrom = from - line.from;
    const lineBefore = line.text.slice(0, Math.max(0, relFrom));
    const pipeBefore = lineBefore.lastIndexOf('|');
    const cellStart = pipeBefore !== -1 ? line.from + pipeBefore : line.from;

    const relTo = to - line.from;
    const lineAfter = line.text.slice(Math.max(0, relTo));
    const pipeAfter = lineAfter.indexOf('|');
    const dividerPipe = pipeAfter !== -1 ? to + pipeAfter : line.to;
    const cellEnd = dividerPipe;

    if (direction === 'right') {
      if (pos >= cellStart && pos <= from) {
        targetWidget = w;
      }
    } else if (direction === 'left') {
      if (pos >= to && pos <= cellEnd + 1) {
        targetWidget = w;
      }
    } else {
      if (pos >= cellStart && pos <= cellEnd) {
        targetWidget = w;
      }
    }
  });
  return targetWidget;
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
            decorations.between(sel.from, sel.to, (from, to, dec) => {
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
          let emptyLineDeleted = false;

          decorations.between(Math.max(0, pos - 10), pos, (from, to, dec) => {
            if (emptyLineDeleted) return;
            if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
              const w = (dec.spec as any).widget as WordEquationWidget;
              const inTable = Boolean(w.isBlockInTable || isInsideTableRow(view.state.doc, w.from, w.to));

              if (w.isInline) {
                if (to === pos) {
                  targetWidget = w;
                }
              } else {
                // Block-level equation (full-line or full-page)
                const blockLine = view.state.doc.lineAt(w.to);
                const curLine = view.state.doc.lineAt(pos);

                if (inTable) {
                  // Inside table container: never delete table block equation via line-adjacent Backspace
                  return;
                }

                // Page / document level block equation
                if (curLine.number === blockLine.number + 1 && curLine.from === pos) {
                  if (curLine.length === 0) {
                    // Empty reserved line following block equation: delete the empty line, NOT the equation
                    const lineBreakLen = (curLine.from >= 2 && view.state.doc.sliceString(curLine.from - 2, curLine.from) === '\r\n') ? 2 : 1;
                    view.dispatch({
                      changes: { from: curLine.from - lineBreakLen, to: curLine.to },
                      selection: { anchor: curLine.from - lineBreakLen },
                      userEvent: 'delete.backward',
                    });
                    emptyLineDeleted = true;
                    return;
                  }
                  // Non-empty following line: do not delete equation
                  return;
                }

                if (pos === w.to) {
                  targetWidget = w;
                }
              }
            }
          });

          if (emptyLineDeleted) {
            return true;
          }

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
            decorations.between(sel.from, sel.to, (from, to, dec) => {
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

          decorations.between(pos, Math.min(view.state.doc.length, pos + 4), (from, to, dec) => {
            if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
              const w = (dec.spec as any).widget as WordEquationWidget;
              const inTable = Boolean(w.isBlockInTable || isInsideTableRow(view.state.doc, w.from, w.to));

              if (w.isInline) {
                if (from === pos) {
                  targetWidget = w;
                }
              } else {
                if (inTable) {
                  return;
                }
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

          // Check if cursor is on a table row line adjacent to a block equation
          const curLine = view.state.doc.lineAt(pos);
          if (isTableRowLine(curLine) && curLine.number < view.state.doc.lines) {
            const nextLine = view.state.doc.line(curLine.number + 1);
            if (isBlockEquationStart(view, nextLine)) {
              if (pos === curLine.to) {
                view.dispatch({
                  changes: { from: nextLine.from, insert: '\n' },
                  selection: { anchor: nextLine.from },
                });
                return true;
              }
            } else if (nextLine.length === 0 && curLine.number + 2 <= view.state.doc.lines) {
              const lineAfterEmpty = view.state.doc.line(curLine.number + 2);
              if (isBlockEquationStart(view, lineAfterEmpty) && pos === curLine.to) {
                view.dispatch({ selection: { anchor: nextLine.from } });
                return true;
              }
            }
          }

          // Check if cursor is on a table row line entering a table block equation
          if (isTableRowLine(curLine)) {
            const tableWidget = findTableBlockWidgetForPos(view, curLine, pos, 'right');
            if (tableWidget) {
              const actualWidget = resolveActualWidget(view, tableWidget);
              actualWidget.enterFromStart(view);
              return true;
            }
          }

          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          let targetWidget: WordEquationWidget | null = null;
          decorations.between(pos, Math.min(view.state.doc.length, pos + 4), (from, to, dec) => {
            const w = (dec as any).widget || (dec.spec as any)?.widget;
            if (!(w instanceof WordEquationWidget || typeof w?.enterFromStart === 'function')) return;

            if (w.displayMode === 'full-page') {
              if (pos === from || (pos >= from && pos <= to) || (pos === from - 1 && view.state.doc.sliceString(pos, from) === '|')) {
                targetWidget = w;
              }
            } else if (w.isInline) {
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

          // Check if cursor is on a table row line adjacent to a preceding block equation
          const curLine = view.state.doc.lineAt(pos);
          if (isTableRowLine(curLine) && curLine.number > 1 && pos === curLine.from) {
            const prevLine = view.state.doc.line(curLine.number - 1);
            if (isBlockEquationEnd(view, prevLine)) {
              view.dispatch({
                changes: { from: curLine.from, insert: '\n' },
                selection: { anchor: curLine.from },
              });
              return true;
            } else if (prevLine.length === 0 && curLine.number > 2) {
              const lineBeforeEmpty = view.state.doc.line(curLine.number - 2);
              if (isBlockEquationEnd(view, lineBeforeEmpty)) {
                view.dispatch({ selection: { anchor: prevLine.from } });
                return true;
              }
            }
          }

          // Check if cursor is on a table row line entering a table block equation from right
          if (isTableRowLine(curLine)) {
            const tableWidget = findTableBlockWidgetForPos(view, curLine, pos, 'left');
            if (tableWidget) {
              const actualWidget = resolveActualWidget(view, tableWidget);
              actualWidget.enterFromEnd(view);
              return true;
            }
          }

          const decorations = view.state.field(wordEquationStateField, false);
          if (!decorations) return false;

          let targetWidget: WordEquationWidget | null = null;
          decorations.between(Math.max(0, pos - 4), pos, (from, to, dec) => {
            const w = (dec as any).widget || (dec.spec as any)?.widget;
            if (!(w instanceof WordEquationWidget || typeof w?.enterFromEnd === 'function')) return;

            if (w.displayMode === 'full-page') {
              if (to === pos || (pos >= from && pos <= to) || (pos === to + 1 && view.state.doc.sliceString(to, pos) === '|')) {
                targetWidget = w;
              }
            } else if (w.isInline) {
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

          // Check if cursor is on a table row line adjacent to a block equation below
          if (isTableRowLine(line) && line.number < view.state.doc.lines) {
            const nextLine = view.state.doc.line(line.number + 1);
            if (isBlockEquationStart(view, nextLine)) {
              view.dispatch({
                changes: { from: nextLine.from, insert: '\n' },
                selection: { anchor: nextLine.from },
              });
              return true;
            } else if (nextLine.length === 0 && line.number + 2 <= view.state.doc.lines) {
              const lineAfterEmpty = view.state.doc.line(line.number + 2);
              if (isBlockEquationStart(view, lineAfterEmpty)) {
                view.dispatch({ selection: { anchor: nextLine.from } });
                return true;
              }
            }
          }

          // Check if cursor is on a table row line entering a table block equation or moving down into one
          if (isTableRowLine(line)) {
            const insideWidget = findTableBlockWidgetForPos(view, line, sel.head, 'inside');
            if (insideWidget) {
              const actualWidget = resolveActualWidget(view, insideWidget);
              actualWidget.enterFromStart(view, 'ArrowDown');
              return true;
            }
          }
          if (line.number < view.state.doc.lines) {
            const nextLine = view.state.doc.line(line.number + 1);
            if (isTableRowLine(nextLine)) {
              const curColPos = nextLine.from + Math.min(nextLine.length, sel.head - line.from);
              const nextWidget = findTableBlockWidgetForPos(view, nextLine, curColPos, 'inside');
              if (nextWidget) {
                const actualWidget = resolveActualWidget(view, nextWidget);
                actualWidget.enterFromStart(view, 'ArrowDown');
                return true;
              }
            }
          }

          const nextPos = line.to + 1;
          if (nextPos <= view.state.doc.length) {
            const decorations = view.state.field(wordEquationStateField, false);
            if (decorations) {
              let targetWidget: WordEquationWidget | null = null;
              decorations.between(nextPos, Math.min(view.state.doc.length, nextPos + 4), (from, to, dec) => {
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

          // Check if cursor is on a table row line adjacent to a preceding block equation
          if (isTableRowLine(curLine) && curLine.number > 1) {
            const prevLine = view.state.doc.line(curLine.number - 1);
            if (isBlockEquationEnd(view, prevLine)) {
              view.dispatch({
                changes: { from: curLine.from, insert: '\n' },
                selection: { anchor: curLine.from },
              });
              return true;
            } else if (prevLine.length === 0 && curLine.number > 2) {
              const lineBeforeEmpty = view.state.doc.line(curLine.number - 2);
              if (isBlockEquationEnd(view, lineBeforeEmpty)) {
                view.dispatch({ selection: { anchor: prevLine.from } });
                return true;
              }
            }
          }

          // Check if cursor is on a table row line entering a table block equation or moving up into one
          if (isTableRowLine(curLine)) {
            const insideWidget = findTableBlockWidgetForPos(view, curLine, sel.head, 'inside');
            if (insideWidget) {
              const actualWidget = resolveActualWidget(view, insideWidget);
              actualWidget.enterFromEnd(view, 'ArrowUp');
              return true;
            }
          }
          if (curLine.number > 1) {
            const prevLine = view.state.doc.line(curLine.number - 1);
            if (isTableRowLine(prevLine)) {
              const curColPos = prevLine.from + Math.min(prevLine.length, sel.head - curLine.from);
              const prevWidget = findTableBlockWidgetForPos(view, prevLine, curColPos, 'inside');
              if (prevWidget) {
                const actualWidget = resolveActualWidget(view, prevWidget);
                actualWidget.enterFromEnd(view, 'ArrowUp');
                return true;
              }
            }
          }

          const prevPos = curLine.from - 1;
          if (prevPos >= 0) {
            const decorations = view.state.field(wordEquationStateField, false);
            if (decorations) {
              let targetWidget: WordEquationWidget | null = null;
              decorations.between(Math.max(0, prevPos - 4), prevPos, (from, to, dec) => {
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
        const target = event.target as HTMLElement | null;

        // Bug 5: Check if clicking anywhere inside a container/page containing a full-page math block
        const fullPageWidget = findFullPageWidget(view, target);
        if (fullPageWidget) {
          if (target && target.closest('.word-equation-math')) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          const actual = resolveActualWidget(view, fullPageWidget);
          actual.enterFromStart(view);
          return true;
        }

        // Check if click is on a table cell containing a block equation
        const cell = target?.closest('td, th, .table-cell-wrapper');
        if (cell) {
          const blockEq = cell.querySelector('.word-equation-block, .word-equation-table-block') as HTMLElement | null;
          if (blockEq) {
            const w = ((blockEq as any).__widget || (blockEq.querySelector('.word-equation-math') as any)?.__widget) as WordEquationWidget | null;
            if (w && typeof w.enterFromStart === 'function') {
              if (target && target.closest('.word-equation-math')) {
                return false;
              }
              event.preventDefault();
              event.stopPropagation();
              const actualWidget = resolveActualWidget(view, w);
              actualWidget.enterFromStart(view);
              return true;
            }
          }
        }

        const active = getActiveEquationState();
        if (!active || !active.isFocused) return false;

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
          decorations.between(active.from, active.to, (f, t, dec) => {
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
      keydown(event: KeyboardEvent, view: EditorView) {
        const headPos = view.state.selection.main.head;
        const fpInfo = isInsideFullPageContainer(view.state, headPos);
        if (fpInfo.isFullPage && fpInfo.widget) {
          const active = getActiveEquationState();
          if (!active || !active.isFocused) {
            event.preventDefault();
            event.stopPropagation();
            const actual = resolveActualWidget(view, fpInfo.widget);
            actual.enterFromStart(view);
            return true;
          }
        }
        return false;
      },
    }),
  ];
}
