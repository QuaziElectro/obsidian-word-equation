/**
 * InteractiveEquationBox
 * A self-contained, fully interactive visual MathML equation editor component
 * for settings and preview interfaces.
 */

import { SlotNode, CaretPosition, MathNode, SelectionRange, MATHML_NAMESPACE } from '../core/types';
import { parseMathML } from '../core/mathml-parser';
import { serializeMathML } from '../core/mathml-serializer';
import { parseLinearEquation } from '../core/linear-parser';
import {
  cloneSlot,
  cloneNode,
  createSlot,
  createToken,
  findSlotById,
  updateParentPointers,
  comparePositions,
  extractSelectionAST,
  normalizeSelection,
  elevateSelectionForDrag,
  getAllSlotsInOrder,
} from '../core/ast';
import { DomRenderer } from '../editor/dom-renderer';
import { handleMouseClick } from '../editor/hit-testing';
import { handleArrowKey, handleTabKey, handleSelectionStep } from '../editor/navigation';
import {
  insertCharacter,
  handleBackspace,
  handleDelete,
  updateVisualCaretDom,
  updatePartialSelectionDom,
  deleteSelection,
} from '../editor/selection';
import { expandShortcutInSlot } from '../shortcuts/engine';
import { logDebugEvent } from '../debug/debug-logger';

export interface InteractiveEquationBoxOptions {
  container: HTMLElement;
  initialContent: string;
  onChange: (newXml: string) => Promise<void> | void;
}

export class InteractiveEquationBox {
  public ast: SlotNode;
  public caret: CaretPosition;
  public isFocused = false;
  public dom: HTMLElement;
  public selection: SelectionRange | null = null;
  public highlightedSlotId: string | null = null;
  private renderer = new DomRenderer();
  private container: HTMLElement;
  private onChange: (newXml: string) => Promise<void> | void;
  private justExpandedShortcut = false;
  private undoStack: Array<{ ast: SlotNode; caret: CaretPosition }> = [];
  private redoStack: Array<{ ast: SlotNode; caret: CaretPosition }> = [];
  private lastClickTime = 0;
  private lastClickPos: CaretPosition | null = null;
  private lastClickTarget: EventTarget | null = null;
  private lastClickCount = 0;
  private activeDragCleanup: (() => void) | null = null;

  constructor(options: InteractiveEquationBoxOptions) {
    this.container = options.container;
    this.onChange = options.onChange;

    this.ast = this.parseContent(options.initialContent);
    this.caret = { slotId: this.ast.id, offset: this.ast.children.length };

    this.dom = this.renderCurrentDom();
    this.container.appendChild(this.dom);
    this.syncNativeMathML();
    this.attachEventListeners();
  }

  public pushHistorySnapshot(): void {
    this.undoStack.push({
      ast: cloneSlot(this.ast, true),
      caret: { ...this.caret },
    });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push({
      ast: cloneSlot(this.ast, true),
      caret: { ...this.caret },
    });
    const prev = this.undoStack.pop()!;
    this.ast = prev.ast;
    this.caret = prev.caret;
    this.rerender();
    this.emitChange();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push({
      ast: cloneSlot(this.ast, true),
      caret: { ...this.caret },
    });
    const next = this.redoStack.pop()!;
    this.ast = next.ast;
    this.caret = next.caret;
    this.rerender();
    this.emitChange();
    return true;
  }

  private parseContent(content: string): SlotNode {
    const trimmed = (content || '').trim();
    if (!trimmed) {
      const root = createSlot('root', []);
      updateParentPointers(root);
      return root;
    }

    try {
      let root: SlotNode;
      if (trimmed.startsWith('<math') || trimmed.includes('</math>') || trimmed.startsWith('<m')) {
        root = parseMathML(trimmed);
      } else {
        root = parseLinearEquation(trimmed);
      }
      updateParentPointers(root);
      return root;
    } catch {
      // Incomplete or broken XML/text during typing: fallback to linear parser or plain text tokens
      try {
        const root = parseLinearEquation(trimmed);
        updateParentPointers(root);
        return root;
      } catch {
        const root = createSlot('root', [createToken(trimmed, 'mi')]);
        updateParentPointers(root);
        return root;
      }
    }
  }

  public setContent(content: string): void {
    this.undoStack = [];
    this.redoStack = [];
    this.ast = this.parseContent(content);
    this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
    this.rerender();
  }

  private renderCurrentDom(): HTMLElement {
    const rendered = this.renderer.render(this.ast, {
      readOnly: false,
      inline: true,
      isFocused: this.isFocused,
      caret: this.isFocused ? this.caret : null,
    });
    const mathBox = (rendered.querySelector('.word-equation-math') || rendered) as HTMLElement;
    mathBox.setAttribute('tabindex', '0');
    mathBox.classList.add('weq-settings-equation-box');

    // Add weq-preview-empty marker to placeholder if slot is empty
    if (this.ast.children.length === 0) {
      const ph = mathBox.querySelector('.eq-placeholder');
      if (ph) {
        ph.classList.add('weq-preview-empty');
      }
    }

    return mathBox;
  }

  private syncNativeMathML(): void {
    const existing = this.container.querySelectorAll('.weq-native-mathml');
    existing.forEach((n) => n.remove());

    if (this.ast.children.length === 0) return;

    try {
      const xml = serializeMathML(this.ast, { display: 'inline', pretty: false });
      let cleanXml = xml.trim();
      if (cleanXml.length > 0) {
        if (!cleanXml.startsWith('<math') && !cleanXml.startsWith('<?xml')) {
          cleanXml = `<math xmlns="${MATHML_NAMESPACE}">${cleanXml}</math>`;
        }
        const parser = new DOMParser();
        let doc = parser.parseFromString(cleanXml, 'text/html');
        let mathNode: Element | null = doc.querySelector('math');
        if (!mathNode) {
          doc = parser.parseFromString(cleanXml, 'application/xml');
          mathNode =
            doc.querySelector('math') ||
            (doc.documentElement && doc.documentElement.localName?.toLowerCase() === 'math'
              ? doc.documentElement
              : null) ||
            doc.getElementsByTagName('math')[0] ||
            doc.getElementsByTagNameNS('*', 'math')[0] ||
            null;
        }
        if (mathNode) {
          const imported = (
            document.importNode ? document.importNode(mathNode, true) : mathNode.cloneNode(true)
          ) as HTMLElement;
          imported.classList.add('weq-native-mathml');
          if (imported.style) {
            imported.style.display = 'none';
          } else {
            imported.setAttribute('style', 'display: none;');
          }
          this.container.appendChild(imported);
        }
      }
    } catch {}
  }

  private rerender(): void {
    const newDom = this.renderCurrentDom();
    this.dom.innerHTML = '';
    while (newDom.firstChild) {
      this.dom.appendChild(newDom.firstChild);
    }
    this.syncNativeMathML();
    this.updateVisualState();
  }

  public updateVisualState(): void {
    if (this.isFocused) {
      this.dom.classList.add('eq-active');
      updateVisualCaretDom(this.dom, this.caret, true);
    } else {
      this.dom.classList.remove('eq-active');
      updateVisualCaretDom(this.dom, this.caret, false);
      this.selection = null;
      this.highlightedSlotId = null;
    }
    const effectiveSelection = this.isFocused ? this.selection : null;
    const effectiveHighlightSlot = this.isFocused ? this.highlightedSlotId : null;
    updatePartialSelectionDom(this.dom, this.ast, effectiveSelection, effectiveHighlightSlot);
  }

  public focus(): void {
    this.isFocused = true;
    this.dom.focus({ preventScroll: true });
    this.updateVisualState();
  }

  private emitChange(): void {
    const xml = serializeMathML(this.ast, { display: 'inline', pretty: false });
    this.onChange(xml);
  }

  public handleCopyEvent(e?: ClipboardEvent, isCut = false): void {
    let xml = '';
    if (this.highlightedSlotId) {
      const slot = findSlotById(this.ast, this.highlightedSlotId);
      if (slot) {
        const tempSlot = createSlot('root', slot.children.map((c) => cloneNode(c, true)));
        updateParentPointers(tempSlot);
        xml = serializeMathML(tempSlot, { display: 'inline', pretty: false });
      }
    } else if (
      this.selection &&
      (this.selection.anchor.slotId !== this.selection.head.slotId ||
        this.selection.anchor.offset !== this.selection.head.offset)
    ) {
      const subSlot = extractSelectionAST(this.ast, this.selection);
      xml = serializeMathML(subSlot, { display: 'inline', pretty: false });
    }

    if (!xml) {
      xml = serializeMathML(this.ast, { display: 'inline', pretty: false });
    }

    if (e?.clipboardData) {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.clipboardData.setData('application/mathml+xml', xml);
        e.clipboardData.setData('text/plain', xml);
      } catch {}
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(xml).catch(() => {});
    }

    logDebugEvent('clipboard', () => ({
      action: isCut ? 'cut' : 'copy',
      context: 'settings_box',
      payload: {
        types: e?.clipboardData ? Array.from(e.clipboardData.types) : ['application/mathml+xml', 'text/plain'],
        plainTextSnippet: xml.slice(0, 100),
        mathmlSnippet: xml.slice(0, 100),
        isMathML: /<math[\s>]|<math[\s\S]*<\/math>/i.test(xml),
        characterCount: xml.length,
      },
      destination: {
        slotId: this.caret.slotId,
        offset: this.caret.offset,
      },
      success: true,
    }));

    if (isCut) {
      this.pushHistorySnapshot();
      if (
        this.selection &&
        (this.selection.anchor.slotId !== this.selection.head.slotId ||
          this.selection.anchor.offset !== this.selection.head.offset)
      ) {
        const editRes = deleteSelection(this.ast, this.selection);
        this.ast = editRes.root;
        this.caret = editRes.caret;
        this.selection = null;
        this.highlightedSlotId = null;
        this.rerender();
        this.emitChange();
      } else if (this.highlightedSlotId) {
        const clonedRoot = cloneSlot(this.ast);
        const slot = findSlotById(clonedRoot, this.highlightedSlotId);
        if (slot) {
          slot.children = [];
          updateParentPointers(clonedRoot);
          this.ast = clonedRoot;
          this.caret = { slotId: slot.id, offset: 0 };
          this.selection = null;
          this.highlightedSlotId = null;
          this.rerender();
          this.emitChange();
        }
      } else {
        const clonedRoot = cloneSlot(this.ast);
        const slot = findSlotById(clonedRoot, this.caret.slotId);
        if (slot) {
          slot.children = [];
          updateParentPointers(clonedRoot);
          this.ast = clonedRoot;
          this.caret = { slotId: slot.id, offset: 0 };
          this.rerender();
          this.emitChange();
        }
      }
    }
  }

  public handlePasteEvent(e?: ClipboardEvent): void {
    const text =
      e?.clipboardData?.getData('application/mathml+xml') ||
      e?.clipboardData?.getData('text/plain') ||
      '';
    const trimmed = text.trim();
    if (trimmed) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.insertPastedContent(trimmed);
    }
  }

  public insertPastedContent(trimmed: string): void {
    if (!trimmed) return;

    this.pushHistorySnapshot();

    if (
      this.selection &&
      (this.selection.anchor.slotId !== this.selection.head.slotId ||
        this.selection.anchor.offset !== this.selection.head.offset)
    ) {
      const editRes = deleteSelection(this.ast, this.selection);
      this.ast = editRes.root;
      this.caret = editRes.caret;
      this.selection = null;
      this.highlightedSlotId = null;
    } else if (this.highlightedSlotId) {
      const slot = findSlotById(this.ast, this.highlightedSlotId);
      if (slot) {
        slot.children = [];
        this.caret = { slotId: slot.id, offset: 0 };
        this.highlightedSlotId = null;
      }
    }

    const clonedRoot = cloneSlot(this.ast);
    const targetSlot = findSlotById(clonedRoot, this.caret.slotId);
    if (!targetSlot) return;

    const isMathML =
      /<math[\s>]|<math[\s\S]*<\/math>/i.test(trimmed) ||
      /<(?:mfrac|mroot|msqrt|msup|msub|msubsup|mrow|mi|mn|mo|mtext)/i.test(trimmed);

    let nodesToInsert: MathNode[] = [];
    if (isMathML) {
      let xml = trimmed;
      if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
        xml = `<math xmlns="${MATHML_NAMESPACE}">\n  <mrow>${xml}</mrow>\n</math>`;
      }
      try {
        const parsed = parseMathML(xml);
        nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mtext')];
      } catch {
        nodesToInsert = [createToken(trimmed, 'mtext')];
      }
    } else {
      try {
        const parsed = parseLinearEquation(trimmed);
        nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(trimmed, 'mi')];
      } catch {
        nodesToInsert = [createToken(trimmed, 'mi')];
      }
    }

    for (const n of nodesToInsert) {
      n.parentSlotId = targetSlot.id;
    }

    const insertOffset = Math.min(this.caret.offset, targetSlot.children.length);
    targetSlot.children.splice(insertOffset, 0, ...nodesToInsert);
    updateParentPointers(clonedRoot);

    this.ast = clonedRoot;
    this.caret = {
      slotId: targetSlot.id,
      offset: insertOffset + nodesToInsert.length,
    };
    this.rerender();
    this.emitChange();

    logDebugEvent('clipboard', () => ({
      action: 'paste',
      context: 'settings_box',
      payload: {
        types: [],
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
  }

  private resolveClickCount(e: MouseEvent | PointerEvent): number {
    const now = Date.now();
    const dt = now - this.lastClickTime;
    let count = e.detail;
    if (count === undefined || count === 0) {
      count = dt < 400 ? this.lastClickCount + 1 : 1;
    }
    this.lastClickTime = now;
    this.lastClickCount = count;
    return count;
  }

  private attachEventListeners(): void {
    (this.dom as any).__interactiveBox = this;
    (this.container as any).__interactiveBox = this;

    const handlePointerActivation = (e: MouseEvent | PointerEvent) => {
      e.preventDefault();
      this.isFocused = true;
      this.dom.focus({ preventScroll: true });

      const targetEl = e.target instanceof Element ? (e.target as HTMLElement) : null;
      const anchorPos = handleMouseClick(
        this.ast,
        this.dom,
        e.clientX,
        e.clientY,
        targetEl
      );

      let clickCount = this.resolveClickCount(e);

      if (e.type === 'mousedown' && (!e.detail || e.detail < 2)) {
        clickCount = 1;
      } else if ((e.detail === undefined || e.detail <= 1) && e.type !== 'dblclick') {
        const isSameTarget = !this.lastClickTarget || !e.target || this.lastClickTarget === e.target;
        const isSamePos =
          this.lastClickPos &&
          this.lastClickPos.slotId === anchorPos.slotId &&
          this.lastClickPos.offset === anchorPos.offset;
        if ((!isSameTarget || !isSamePos) && clickCount > 1) {
          clickCount = 1;
        }
      }
      this.lastClickPos = anchorPos;
      this.lastClickTarget = e.target || null;

      if (clickCount === 2) {
        // Double-click: Select entire current placeholder
        const targetSlot = findSlotById(this.ast, anchorPos.slotId) || this.ast;
        if (targetSlot.children.length === 0) {
          this.caret = { slotId: targetSlot.id, offset: 0 };
          this.selection = null;
          this.highlightedSlotId = targetSlot.id;
        } else {
          this.selection = {
            anchor: { slotId: targetSlot.id, offset: 0 },
            head: { slotId: targetSlot.id, offset: targetSlot.children.length },
          };
          this.caret = { slotId: targetSlot.id, offset: targetSlot.children.length };
          this.highlightedSlotId = null;
        }
      } else if (clickCount >= 3) {
        // Triple-click: Select entire root placeholder
        this.selection = {
          anchor: { slotId: this.ast.id, offset: 0 },
          head: { slotId: this.ast.id, offset: this.ast.children.length },
        };
        this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
        this.highlightedSlotId = null;
      } else {
        this.caret = anchorPos;
        this.selection = null;
        this.highlightedSlotId = null;
      }

      this.updateVisualState();

      // Setup document/window drag listeners
      const doc = this.dom.ownerDocument || document;
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let isCleanedUp = false;

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
        if (this.activeDragCleanup === cleanupDragListeners) {
          this.activeDragCleanup = null;
        }
      };

      this.activeDragCleanup = cleanupDragListeners;

      const onPointerMove = (moveEvt: MouseEvent | PointerEvent) => {
        if ((moveEvt.buttons & 1) !== 1) {
          this.lastClickCount = 0;
          this.lastClickTime = 0;
          this.lastClickPos = null;
          this.lastClickTarget = null;
          onPointerUp(moveEvt);
          return;
        }

        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        const distance = Math.hypot(dx, dy);
        const dragThreshold = clickCount >= 2 ? 10 : 3;
        if (!isDragging && distance >= dragThreshold) {
          isDragging = true;
        }

        if (isDragging) {
          moveEvt.preventDefault();
          moveEvt.stopPropagation();
          const targetEl = moveEvt.target instanceof Element ? (moveEvt.target as HTMLElement) : null;
          const headPos = handleMouseClick(
            this.ast,
            this.dom,
            moveEvt.clientX,
            moveEvt.clientY,
            targetEl
          );
          if (headPos.slotId !== anchorPos.slotId || headPos.offset !== anchorPos.offset) {
            const elevated = elevateSelectionForDrag(this.ast, anchorPos, headPos);
            this.selection = elevated;
            this.caret = elevated.head;
          } else {
            this.selection = null;
            this.caret = headPos;
          }
          this.highlightedSlotId = null;
          this.updateVisualState();
        }
      };

      const onPointerUp = (upEvt?: MouseEvent | PointerEvent) => {
        cleanupDragListeners();
        if (
          this.selection &&
          this.selection.anchor.slotId === this.selection.head.slotId &&
          this.selection.anchor.offset === this.selection.head.offset
        ) {
          this.selection = null;
          this.updateVisualState();
        }
      };

      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('mousemove', onPointerMove, true);
      doc.addEventListener('mouseup', onPointerUp, true);
      if (win) {
        win.addEventListener('pointermove', onPointerMove, true);
        win.addEventListener('pointerup', onPointerUp, true);
        win.addEventListener('mousemove', onPointerMove, true);
        win.addEventListener('mouseup', onPointerUp, true);
      }
    };

    this.dom.addEventListener('pointerdown', handlePointerActivation);
    this.dom.addEventListener('mousedown', handlePointerActivation);
    this.dom.addEventListener('click', handlePointerActivation);
    this.dom.addEventListener('dblclick', handlePointerActivation);

    // Clear selection on pointerdown outside equation box
    const onDocPointerDown = (evt: MouseEvent | PointerEvent) => {
      const isInside = evt.target instanceof Node && this.dom.contains(evt.target);
      if (this.dom && !isInside) {
        this.isFocused = false;
        if (this.selection || this.highlightedSlotId) {
          this.selection = null;
          this.highlightedSlotId = null;
          this.updateVisualState();
        }
      }
    };
    const ownerDoc = this.dom.ownerDocument || document;
    ownerDoc.addEventListener('pointerdown', onDocPointerDown, true);
    ownerDoc.addEventListener('mousedown', onDocPointerDown, true);

    this.dom.addEventListener('focus', () => {
      this.isFocused = true;
      if (!this.caret) {
        this.caret = { slotId: this.ast.id, offset: this.ast.children.length };
      }
      this.updateVisualState();
    });

    this.dom.addEventListener('blur', () => {
      this.isFocused = false;
      this.updateVisualState();
    });

    this.dom.addEventListener('copy', (e: ClipboardEvent) => this.handleCopyEvent(e, false));
    this.dom.addEventListener('cut', (e: ClipboardEvent) => this.handleCopyEvent(e, true));
    this.dom.addEventListener('paste', (e: ClipboardEvent) => this.handlePasteEvent(e));

    this.dom.addEventListener('keydown', (e: KeyboardEvent) => {
      // 0. Undo / Redo shortcuts
      const isUndo = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey;
      const isRedo =
        ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'));

      if (isUndo) {
        e.preventDefault();
        e.stopPropagation();
        this.undo();
        return;
      }
      if (isRedo) {
        e.preventDefault();
        e.stopPropagation();
        this.redo();
        return;
      }

      // 0.1 Copy / Cut / Paste shortcuts
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          e.stopPropagation();
          this.handleCopyEvent(undefined, false);
          return;
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          e.stopPropagation();
          this.handleCopyEvent(undefined, true);
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          e.stopPropagation();
          if (typeof navigator !== 'undefined' && navigator?.clipboard?.readText) {
            navigator.clipboard
              .readText()
              .then((text) => {
                if (text) this.insertPastedContent(text.trim());
              })
              .catch(() => {});
          }
          return;
        }
      }

      // 1. Navigation keys
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();

        const fromCaret = { ...this.caret };

        // 1.1 Shift + Arrow keys: Expand or step selection across tokens and structures
        if (e.shiftKey) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const step = handleSelectionStep(
              this.ast,
              this.selection,
              this.caret,
              e.key,
              this.highlightedSlotId
            );

            if (step && step.handled) {
              this.selection = step.selection;
              this.caret = step.caret;
              this.highlightedSlotId = step.highlightedSlotId ?? null;
              this.updateVisualState();
              logDebugEvent('navigation', () => ({
                key: e.key as any,
                shiftKey: true,
                navType: 'selection_step',
                from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
                to: { slotId: step.caret.slotId, offset: step.caret.offset },
                equation: { from: 0, to: 0, isInline: true },
                handled: true,
              }));
              return;
            }
          }
          return;
        }

        // 1.2 Unshifted Arrow keys: collapse selection if active
        const hasActiveSelectionRange =
          this.selection &&
          comparePositions(this.ast, this.selection.anchor, this.selection.head) !== 0;
        const hasActivePlaceholderHighlight = Boolean(this.highlightedSlotId);

        if (hasActiveSelectionRange || hasActivePlaceholderHighlight) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            let targetCaret: CaretPosition | null = null;
            if (this.selection && hasActiveSelectionRange) {
              const norm = normalizeSelection(this.ast, this.selection);
              targetCaret = e.key === 'ArrowLeft' ? { ...norm.start } : { ...norm.end };
            } else if (this.highlightedSlotId) {
              const targetSlot = findSlotById(this.ast, this.highlightedSlotId);
              if (targetSlot) {
                targetCaret = e.key === 'ArrowLeft'
                  ? { slotId: targetSlot.id, offset: 0 }
                  : { slotId: targetSlot.id, offset: targetSlot.children.length };
              }
            }
            if (targetCaret) {
              this.caret = targetCaret;
              this.selection = null;
              this.highlightedSlotId = null;
              this.updateVisualState();
              return; // Consume arrow key: selection collapsed without extra move
            }
          }
          this.selection = null;
          this.highlightedSlotId = null;
          this.updateVisualState();
        }

        const nav = handleArrowKey(this.ast, this.caret, e.key as any);
        if (nav.handled) {
          this.caret = nav.caret;
          this.updateVisualState();
        }
        logDebugEvent('navigation', () => ({
          key: e.key as any,
          shiftKey: false,
          navType: 'internal_jump',
          from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
          to: { slotId: this.caret.slotId, offset: this.caret.offset },
          equation: { from: 0, to: 0, isInline: true },
          handled: nav.handled,
        }));
        return;
      }

      // 2. Tab Navigation
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const fromCaret = { ...this.caret };
        const nav = handleTabKey(this.ast, this.caret, e.shiftKey);
        if (nav.handled) {
          this.caret = nav.caret;
          this.updateVisualState();
        }
        logDebugEvent('navigation', () => ({
          key: 'Tab',
          shiftKey: e.shiftKey,
          navType: 'tab_jump',
          from: { slotId: fromCaret.slotId, offset: fromCaret.offset },
          to: { slotId: this.caret.slotId, offset: this.caret.offset },
          equation: { from: 0, to: 0, isInline: true },
          handled: nav.handled,
        }));
        return;
      }

      // 3. Backspace
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        this.pushHistorySnapshot();
        const res = handleBackspace(this.ast, this.caret);
        if (res.handled) {
          this.ast = res.root;
          this.caret = res.caret;
          this.rerender();
          this.emitChange();
        } else {
          this.undoStack.pop();
        }
        return;
      }

      // 4. Delete
      if (e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        this.pushHistorySnapshot();
        const res = handleDelete(this.ast, this.caret);
        if (res.handled) {
          this.ast = res.root;
          this.caret = res.caret;
          this.rerender();
          this.emitChange();
        } else {
          this.undoStack.pop();
        }
        return;
      }

      // 5. Space (Shortcut Trigger)
      if (e.key === ' ') {
        if (this.justExpandedShortcut) {
          e.preventDefault();
          e.stopPropagation();
          this.justExpandedShortcut = false;
          return;
        }

        const clonedRoot = cloneSlot(this.ast);
        const targetSlot = findSlotById(clonedRoot, this.caret.slotId);
        if (targetSlot) {
          const expanded = expandShortcutInSlot(targetSlot, this.caret.offset, ' ');
          if (expanded.expanded && expanded.newSlot && expanded.newCaret) {
            e.preventDefault();
            e.stopPropagation();
            this.pushHistorySnapshot();
            targetSlot.children = expanded.newSlot.children;
            updateParentPointers(clonedRoot);
            this.ast = clonedRoot;
            this.caret = expanded.newCaret;
            this.justExpandedShortcut = true;
            this.rerender();
            this.emitChange();
            return;
          }
        }
      }

      // 6. Character Insertion
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        this.pushHistorySnapshot();
        const res = insertCharacter(this.ast, this.caret, e.key);
        if (res.handled) {
          this.ast = res.root;
          this.caret = res.caret;

          // Check if typed character completed a custom shortcut
          const targetSlot = findSlotById(this.ast, this.caret.slotId);
          if (targetSlot) {
            const expanded = expandShortcutInSlot(targetSlot, this.caret.offset, e.key);
            if (expanded.expanded && expanded.newSlot && expanded.newCaret) {
              targetSlot.children = expanded.newSlot.children;
              updateParentPointers(this.ast);
              this.caret = expanded.newCaret;
              this.justExpandedShortcut = true;
            }
          }

          this.rerender();
          this.emitChange();
        } else {
          this.undoStack.pop();
        }
        return;
      }
    });
  }

  public getXml(): string {
    return serializeMathML(this.ast);
  }

  public destroy(): void {
    if (this.activeDragCleanup) {
      this.activeDragCleanup();
      this.activeDragCleanup = null;
    }
    this.dom.remove();
  }
}
