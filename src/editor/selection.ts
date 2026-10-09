/**
 * AST Selection, Character Insertion, and Backspace/Delete Dissolution Engine
 */

import {
  SlotNode,
  CaretPosition,
  MathNode,
  TokenKind,
  SelectionRange,
} from '../core/types';
import {
  createSlot,
  createToken,
  findSlotById,
  findParentNodeOfSlot,
  findParentSlotOfNode,
  getChildSlots,
  getAllSlotsInOrder,
  cloneSlot,
  updateParentPointers,
  comparePositions,
  isSlotEmpty,
  findFirstEditableSlot,
} from '../core/ast';
import { logDebugEvent } from '../debug/debug-logger';

export interface EditResult {
  root: SlotNode;
  caret: CaretPosition;
  handled: boolean;
  exitDirection?: 'before' | 'after';
}

export function insertCharacter(
  root: SlotNode,
  caret: CaretPosition,
  char: string
): EditResult {
  const clonedRoot = cloneSlot(root);
  const targetSlot = findSlotById(clonedRoot, caret.slotId);

  if (!targetSlot) {
    return { root, caret, handled: false };
  }

  let kind: TokenKind = 'mi';
  if (/[0-9]/.test(char)) {
    kind = 'mn';
  } else if (/[+\-*/=<>±×÷≤≥≠≈∈]/.test(char)) {
    kind = 'mo';
  } else if (/[a-zA-Z]/.test(char)) {
    kind = 'mi';
  } else {
    kind = 'mo';
  }

  const newToken = createToken(char, kind);
  newToken.parentSlotId = targetSlot.id;

  targetSlot.children.splice(caret.offset, 0, newToken);
  updateParentPointers(clonedRoot);

  return {
    root: clonedRoot,
    caret: { slotId: targetSlot.id, offset: caret.offset + 1 },
    handled: true,
  };
}

export function handleBackspace(
  root: SlotNode,
  caret: CaretPosition
): EditResult {
  const clonedRoot = cloneSlot(root);
  const slot = findSlotById(clonedRoot, caret.slotId);

  if (!slot) {
    return { root, caret, handled: false };
  }

  // 1. If offset > 0, delete preceding item
  if (caret.offset > 0) {
    const prevIndex = caret.offset - 1;
    const prevNode = slot.children[prevIndex];

    if (prevNode.type === 'token') {
      if (prevNode.text.length > 1) {
        prevNode.text = prevNode.text.slice(0, -1);
        updateParentPointers(clonedRoot);
        return {
          root: clonedRoot,
          caret: { slotId: slot.id, offset: caret.offset },
          handled: true,
        };
      } else {
        slot.children.splice(prevIndex, 1);
        updateParentPointers(clonedRoot);
        return {
          root: clonedRoot,
          caret: { slotId: slot.id, offset: prevIndex },
          handled: true,
        };
      }
    }

    // Preceding item is a composite box
    const childSlots = getChildSlots(prevNode);
    const isEmptyBox = childSlots.every((s) => s.children.length === 0);

    if (isEmptyBox) {
      // Dissolve empty composite box
      slot.children.splice(prevIndex, 1);
      updateParentPointers(clonedRoot);
      return {
        root: clonedRoot,
        caret: { slotId: slot.id, offset: prevIndex },
        handled: true,
      };
    } else {
      // Non-empty box: move caret to inside the end of its last slot
      const lastSlot = childSlots[childSlots.length - 1];
      return {
        root: clonedRoot,
        caret: { slotId: lastSlot.id, offset: lastSlot.children.length },
        handled: true,
      };
    }
  }

  // 2. offset === 0: handle boundary dissolution or moving to prior slot
  const parentNode = findParentNodeOfSlot(clonedRoot, slot.id);
  if (!parentNode) {
    // At root offset 0: exit equation to markdown before
    return {
      root,
      caret,
      handled: false,
      exitDirection: 'before',
    };
  }

  // Inside fraction
  if (parentNode.type === 'fraction') {
    if (slot.id === parentNode.denominator.id) {
      // Move caret to numerator end
      return {
        root: clonedRoot,
        caret: {
          slotId: parentNode.numerator.id,
          offset: parentNode.numerator.children.length,
        },
        handled: true,
      };
    } else if (slot.id === parentNode.numerator.id && slot.children.length === 0) {
      if (!isSlotEmpty(parentNode.denominator)) {
        return {
          root: clonedRoot,
          caret: {
            slotId: parentNode.denominator.id,
            offset: parentNode.denominator.children.length,
          },
          handled: true,
        };
      }
    }
  }

  // Inside script
  if (parentNode.type === 'superscript' || parentNode.type === 'subscript') {
    const isSup = parentNode.type === 'superscript' && slot.id === parentNode.sup.id;
    const isSub = parentNode.type === 'subscript' && slot.id === parentNode.sub.id;
    if (isSup || isSub) {
      // Dissolve empty script or return to base
      if (slot.children.length === 0) {
        const enclosingSlot = findParentSlotOfNode(clonedRoot, parentNode.id);
        if (enclosingSlot) {
          const idx = enclosingSlot.children.findIndex((n) => n.id === parentNode.id);
          // Replace script box with its base children
          enclosingSlot.children.splice(idx, 1, ...parentNode.base.children);
          updateParentPointers(clonedRoot);
          return {
            root: clonedRoot,
            caret: {
              slotId: enclosingSlot.id,
              offset: idx + parentNode.base.children.length,
            },
            handled: true,
          };
        }
      }
      return {
        root: clonedRoot,
        caret: {
          slotId: parentNode.base.id,
          offset: parentNode.base.children.length,
        },
        handled: true,
      };
    }
  }

  // Inside subsup
  if (parentNode.type === 'subsup') {
    if (slot.id === parentNode.sup.id) {
      return {
        root: clonedRoot,
        caret: {
          slotId: parentNode.sub.id,
          offset: parentNode.sub.children.length,
        },
        handled: true,
      };
    }
    if (slot.id === parentNode.sub.id) {
      return {
        root: clonedRoot,
        caret: {
          slotId: parentNode.base.id,
          offset: parentNode.base.children.length,
        },
        handled: true,
      };
    }
  }

  // Generic exit to enclosing slot
  const enclosingSlot = findParentSlotOfNode(clonedRoot, parentNode.id);
  if (enclosingSlot) {
    const idx = enclosingSlot.children.findIndex((n) => n.id === parentNode.id);
    return {
      root: clonedRoot,
      caret: { slotId: enclosingSlot.id, offset: Math.max(0, idx) },
      handled: true,
    };
  }

  return { root: clonedRoot, caret, handled: false };
}

export function handleDelete(
  root: SlotNode,
  caret: CaretPosition
): EditResult {
  const clonedRoot = cloneSlot(root);
  const slot = findSlotById(clonedRoot, caret.slotId);

  if (!slot) {
    return { root, caret, handled: false };
  }

  if (caret.offset < slot.children.length) {
    const targetNode = slot.children[caret.offset];
    if (targetNode.type === 'token' && targetNode.text.length > 1) {
      targetNode.text = targetNode.text.slice(1);
    } else {
      slot.children.splice(caret.offset, 1);
    }
    updateParentPointers(clonedRoot);
    return {
      root: clonedRoot,
      caret,
      handled: true,
    };
  }

  return { root, caret, handled: false };
}

/**
 * In-place DOM Caret Injection & Synchronization
 * Repositions .eq-caret in the DOM without destroying equation nodes.
 */
export function updateVisualCaretDom(
  rootEl: HTMLElement,
  caret: CaretPosition | null,
  isFocused: boolean
): void {
  // 1. Remove existing caret elements
  const existingCarets = rootEl.querySelectorAll('.eq-caret');
  existingCarets.forEach((c) => c.remove());

  // 2. Unfocus all placeholders and restore symbol
  const focusedPlaceholders = rootEl.querySelectorAll('.eq-placeholder.eq-focused');
  focusedPlaceholders.forEach((p) => {
    p.classList.remove('eq-focused');
    if (p.children.length === 0) {
      p.textContent = '⬚';
    }
  });

  const mathEl = rootEl.classList.contains('word-equation-math')
    ? rootEl
    : (rootEl.querySelector('.word-equation-math') as HTMLElement | null);

  if (mathEl) {
    if (isFocused) {
      mathEl.classList.add('eq-active');
      mathEl.classList.remove('eq-selected');
    } else {
      mathEl.classList.remove('eq-active');
    }
  }

  if (rootEl.classList.contains('word-equation-block') || rootEl.classList.contains('word-equation-inline')) {
    if (isFocused) {
      rootEl.classList.add('eq-active');
      rootEl.classList.remove('eq-selected');
    } else {
      rootEl.classList.remove('eq-active');
    }
  }

  if (!isFocused || !caret) {
    return;
  }

  // 3. Locate target slot element
  let targetSlotEl = (rootEl.getAttribute('data-slot-id') === caret.slotId
    ? rootEl
    : rootEl.querySelector(`[data-slot-id="${caret.slotId}"]`)) as HTMLElement | null;
  if (!targetSlotEl) {
    const ph = rootEl.querySelector(`[data-placeholder-for="${caret.slotId}"]`) as HTMLElement | null;
    if (ph && ph.closest('.eq-slot')) {
      targetSlotEl = ph.closest('.eq-slot') as HTMLElement;
    }
  }

  // Tier 1: Re-render widget to resynchronize DOM slot IDs if desynchronized
  if (!targetSlotEl) {
    const widget = (rootEl as any).__widget;
    if (widget && typeof widget.rerender === 'function') {
      widget.rerender();
      targetSlotEl = (rootEl.getAttribute('data-slot-id') === caret.slotId
        ? rootEl
        : rootEl.querySelector(`[data-slot-id="${caret.slotId}"]`)) as HTMLElement | null;
      if (!targetSlotEl) {
        const ph = rootEl.querySelector(`[data-placeholder-for="${caret.slotId}"]`) as HTMLElement | null;
        if (ph && ph.closest('.eq-slot')) {
          targetSlotEl = ph.closest('.eq-slot') as HTMLElement;
        }
      }
    }
  }

  // Tier 2: If slot ID is invalid/stale, descend to first leaf editable slot of AST
  if (!targetSlotEl) {
    const widget = (rootEl as any).__widget;
    if (widget?.ast) {
      const safeCaret = findFirstEditableSlot(widget.ast);
      widget.caret = safeCaret;
      caret = safeCaret;
      targetSlotEl = (rootEl.getAttribute('data-slot-id') === caret.slotId
        ? rootEl
        : rootEl.querySelector(`[data-slot-id="${caret.slotId}"]`)) as HTMLElement | null;
      if (!targetSlotEl) {
        const ph = rootEl.querySelector(`[data-placeholder-for="${caret.slotId}"]`) as HTMLElement | null;
        if (ph && ph.closest('.eq-slot')) {
          targetSlotEl = ph.closest('.eq-slot') as HTMLElement;
        }
      }
    }
  }

  // Tier 3: Search for any empty placeholder in the equation
  if (!targetSlotEl) {
    const anyPlaceholder = rootEl.querySelector('.eq-placeholder') as HTMLElement | null;
    if (anyPlaceholder && anyPlaceholder.closest('.eq-slot')) {
      targetSlotEl = anyPlaceholder.closest('.eq-slot') as HTMLElement;
    }
  }

  // Tier 4: Fall back to root slot ONLY IF root slot has 0 child mathematical nodes
  if (!targetSlotEl) {
    const rootSlot = (rootEl.getAttribute('data-slot-id')
      ? rootEl
      : rootEl.querySelector('.eq-slot')) as HTMLElement | null;
    if (rootSlot) {
      const nonCaretChildren = Array.from(rootSlot.children).filter(
        (el) => !el.classList.contains('eq-caret') && !el.classList.contains('eq-placeholder')
      );
      if (nonCaretChildren.length === 0) {
        targetSlotEl = rootSlot;
      }
    }
  }

  // If slot cannot be safely resolved without corrupting layout, abort cleanly
  if (!targetSlotEl) return;

  const doc = rootEl.ownerDocument || document;
  const caretEl = doc.createElement('span');
  caretEl.className = 'eq-caret';
  caretEl.setAttribute('data-caret', 'true');
  caretEl.setAttribute('aria-hidden', 'true');
  caretEl.textContent = '|';

  // 4. Handle placeholder slot
  const placeholderEl = Array.from(targetSlotEl.children).find(
    (el) =>
      el.classList.contains('eq-placeholder') &&
      (el.getAttribute('data-placeholder-for') === caret.slotId ||
        el.getAttribute('data-placeholder-for') === targetSlotEl!.getAttribute('data-slot-id'))
  ) as HTMLElement | undefined;
  if (placeholderEl) {
    placeholderEl.classList.add('eq-focused');
    placeholderEl.textContent = '';
    placeholderEl.appendChild(caretEl);
  } else {
    // 5. Handle non-empty slot: insert before child at caret.offset
    const childEls = Array.from(targetSlotEl.children).filter(
      (el) => !el.classList.contains('eq-caret') && !el.classList.contains('eq-placeholder')
    );

    if (caret.offset >= childEls.length) {
      targetSlotEl.appendChild(caretEl);
    } else {
      targetSlotEl.insertBefore(caretEl, childEls[caret.offset]);
    }
  }

  // 6. Reset animation so caret is instantly visible
  try {
    caretEl.style.animation = 'none';
    if (typeof (caretEl as any).offsetWidth === 'number') {
      void (caretEl as any).offsetWidth;
    }
    caretEl.style.animation = '';
  } catch {
    // Ignore in non-layout environments
  }

  logDebugEvent('caret', () => {
    const role = targetSlotEl?.getAttribute('data-slot-role') || undefined;
    const fromAttr = rootEl.getAttribute('data-equation-from');
    const toAttr = rootEl.getAttribute('data-equation-to');
    const widget = (rootEl as any).__widget;
    const from = widget ? widget.from : (fromAttr !== null ? Number(fromAttr) : undefined);
    const to = widget ? widget.to : (toAttr !== null ? Number(toAttr) : undefined);
    const isInline = widget ? Boolean(widget.isInline) : rootEl.classList.contains('word-equation-inline');

    const nonCaretChildren = targetSlotEl
      ? Array.from(targetSlotEl.children).filter(
          (el) => !el.classList.contains('eq-caret') && !el.classList.contains('eq-placeholder')
        )
      : [];

    const parentNode = widget?.ast ? findParentNodeOfSlot(widget.ast, caret.slotId) : null;

    return {
      source: widget
        ? 'editor_widget'
        : rootEl.closest('.word-equation-settings-box')
        ? 'settings_box'
        : 'editor_widget',
      equation: {
        from: from ?? 0,
        to: to ?? 0,
        isInline,
      },
      caret: {
        slotId: caret.slotId,
        offset: caret.offset,
        slotRole: role,
        parentType: parentNode?.type,
        isAtEnd: placeholderEl ? false : caret.offset >= nonCaretChildren.length,
      },
      dom: {
        tagName: targetSlotEl ? targetSlotEl.tagName.toLowerCase() : '',
        targetSlotSelector: targetSlotEl
          ? targetSlotEl.id
            ? `#${targetSlotEl.id}`
            : `[data-slot-id="${caret.slotId}"]`
          : '',
        role: role || targetSlotEl?.className || '',
        domOffset: caret.offset,
        isPlaceholder: Boolean(placeholderEl),
      },
      codeMirrorRange: from !== undefined && to !== undefined ? { from, to } : undefined,
    };
  });
}

/**
 * Update selection highlight DOM class (.eq-selected) on equation elements.
 */
export function updateEquationSelectionDom(
  rootEl: HTMLElement,
  isSelected: boolean
): void {
  const mathEls = rootEl.classList.contains('word-equation-math')
    ? [rootEl]
    : Array.from(rootEl.querySelectorAll<HTMLElement>('.word-equation-math'));

  if (isSelected) {
    const hasPartial = Boolean(
      rootEl.querySelector('.eq-selected-token, .eq-partial-selected') ||
      (rootEl as any).__widget?.selection
    );
    if (hasPartial) {
      rootEl.classList.remove('eq-selected');
      mathEls.forEach((m) => m.classList.remove('eq-selected'));
      return;
    }

    rootEl.classList.add('eq-selected');
    mathEls.forEach((m) => m.classList.add('eq-selected'));
  } else {
    rootEl.classList.remove('eq-selected');
    mathEls.forEach((m) => m.classList.remove('eq-selected'));
  }
}

export function normalizeSelection(
  root: SlotNode | MathNode,
  sel: SelectionRange
): { start: CaretPosition; end: CaretPosition; isBackward: boolean } {
  const cmp = comparePositions(root, sel.anchor, sel.head);
  if (cmp <= 0) {
    return { start: sel.anchor, end: sel.head, isBackward: false };
  } else {
    return { start: sel.head, end: sel.anchor, isBackward: true };
  }
}

export function isNodeSelected(
  root: SlotNode | MathNode,
  node: MathNode,
  start: CaretPosition,
  end: CaretPosition
): boolean {
  const rootSlot: SlotNode =
    'children' in root && 'role' in root
      ? (root as SlotNode)
      : createSlot('root', [root as MathNode]);

  const parentSlot = findParentSlotOfNode(rootSlot, node.id);
  if (!parentSlot) return false;
  const idx = parentSlot.children.findIndex((c) => c.id === node.id);
  if (idx === -1) return false;

  const nodeStart: CaretPosition = { slotId: parentSlot.id, offset: idx };
  const nodeEnd: CaretPosition = { slotId: parentSlot.id, offset: idx + 1 };

  return (
    comparePositions(rootSlot, nodeStart, end) < 0 &&
    comparePositions(rootSlot, nodeEnd, start) > 0
  );
}

export function deleteSelection(
  root: SlotNode,
  selection: SelectionRange
): { root: SlotNode; caret: CaretPosition } {
  const clonedRoot = cloneSlot(root);
  const { start, end } = normalizeSelection(clonedRoot, selection);

  if (start.slotId === end.slotId) {
    const slot = findSlotById(clonedRoot, start.slotId);
    if (slot) {
      const deleteCount = Math.max(0, end.offset - start.offset);
      slot.children.splice(start.offset, deleteCount);
      updateParentPointers(clonedRoot);
      return {
        root: clonedRoot,
        caret: { slotId: start.slotId, offset: start.offset },
      };
    }
  }

  // Cross-boundary selection:
  const startSlot = findSlotById(clonedRoot, start.slotId);
  const endSlot = findSlotById(clonedRoot, end.slotId);

  // 1. Delete from start.offset to end of startSlot
  if (startSlot && start.offset < startSlot.children.length) {
    startSlot.children.splice(start.offset);
  }

  // 2. Delete from 0 to end.offset in endSlot
  if (endSlot && end.offset > 0) {
    endSlot.children.splice(0, end.offset);
  }

  // 3. Clear any slots strictly between start and end
  const allSlots = getAllSlotsInOrder(clonedRoot);
  for (const s of allSlots) {
    if (s.id === start.slotId || s.id === end.slotId) continue;
    const slotStart: CaretPosition = { slotId: s.id, offset: 0 };
    const slotEnd: CaretPosition = { slotId: s.id, offset: s.children.length };
    if (
      comparePositions(clonedRoot, slotStart, start) > 0 &&
      comparePositions(clonedRoot, slotEnd, end) < 0
    ) {
      s.children = [];
    }
  }

  updateParentPointers(clonedRoot);

  return {
    root: clonedRoot,
    caret: { slotId: start.slotId, offset: start.offset },
  };
}

export function deleteParentStructure(
  root: SlotNode,
  slotId: string
): { root: SlotNode; caret: CaretPosition; handled: boolean; deletedRoot?: boolean } {
  const clonedRoot = cloneSlot(root);
  const parentNode = findParentNodeOfSlot(clonedRoot, slotId);
  if (!parentNode) {
    // slotId is the root slot
    return {
      root: clonedRoot,
      caret: { slotId: root.id, offset: 0 },
      handled: true,
      deletedRoot: true,
    };
  }

  // If parent structure has any sibling placeholder that is NOT empty, do not dissolve!
  // Move caret to the end of that non-empty sibling placeholder.
  // (Excluding script exponent/subscript slots which dissolve to base when empty)
  const isScriptSlot =
    (parentNode.type === 'superscript' || parentNode.type === 'subscript') &&
    slotId !== parentNode.base.id;

  if (!isScriptSlot) {
    const siblingSlots = getChildSlots(parentNode).filter((s) => s.id !== slotId);
    const nonEmptySibling = siblingSlots.find((s) => !isSlotEmpty(s));
    if (nonEmptySibling) {
      return {
        root: clonedRoot,
        caret: {
          slotId: nonEmptySibling.id,
          offset: nonEmptySibling.children.length,
        },
        handled: true,
      };
    }
  }

  // Inside superscript / subscript: dissolve to base
  if (parentNode.type === 'superscript' || parentNode.type === 'subscript') {
    const enclosingSlot = findParentSlotOfNode(clonedRoot, parentNode.id);
    if (enclosingSlot) {
      const idx = enclosingSlot.children.findIndex((n) => n.id === parentNode.id);
      enclosingSlot.children.splice(idx, 1, ...parentNode.base.children);
      updateParentPointers(clonedRoot);
      return {
        root: clonedRoot,
        caret: {
          slotId: enclosingSlot.id,
          offset: idx + parentNode.base.children.length,
        },
        handled: true,
      };
    }
  }

  // Inside fraction, radical, root, matrix, etc.
  const enclosingSlot = findParentSlotOfNode(clonedRoot, parentNode.id);
  if (enclosingSlot) {
    const idx = enclosingSlot.children.findIndex((n) => n.id === parentNode.id);
    enclosingSlot.children.splice(idx, 1);
    updateParentPointers(clonedRoot);
    return {
      root: clonedRoot,
      caret: {
        slotId: enclosingSlot.id,
        offset: Math.max(0, idx),
      },
      handled: true,
    };
  }

  return { root, caret: { slotId, offset: 0 }, handled: false };
}

export function updatePartialSelectionDom(
  rootEl: HTMLElement,
  rootAst: SlotNode,
  selection: SelectionRange | null,
  highlightedSlotId?: string | null
): void {
  // 1. Clear previous partial selection classes
  const prevTokens = rootEl.querySelectorAll('.eq-selected-token');
  prevTokens.forEach((el) => el.classList.remove('eq-selected-token'));

  const prevSlots = rootEl.querySelectorAll(
    '.eq-selected-slot, .eq-partial-selected, .eq-placeholder-highlighted'
  );
  prevSlots.forEach((el) => {
    el.classList.remove('eq-selected-slot', 'eq-partial-selected', 'eq-placeholder-highlighted');
  });

  const prevStructures = rootEl.querySelectorAll('.eq-selected-structure');
  prevStructures.forEach((el) => el.classList.remove('eq-selected-structure'));
  rootEl.classList.remove('eq-selected-structure');

  rootEl.classList.remove('eq-selected-slot', 'eq-partial-selected', 'eq-placeholder-highlighted');

  const hasActiveSelection = Boolean(
    highlightedSlotId ||
      (selection &&
        (selection.anchor.slotId !== selection.head.slotId ||
          selection.anchor.offset !== selection.head.offset))
  );

  if (hasActiveSelection) {
    rootEl.classList.remove('eq-selected');
    rootEl.querySelectorAll('.eq-selected').forEach((el) => el.classList.remove('eq-selected'));
  }

  // 2. If highlightedSlotId is set (Rule 3 stage 1)
  if (highlightedSlotId) {
    let targetSlotEl =
      rootEl.getAttribute('data-slot-id') === highlightedSlotId
        ? rootEl
        : (rootEl.querySelector(`[data-slot-id="${highlightedSlotId}"]`) as HTMLElement | null);
    if (!targetSlotEl) {
      const ph = rootEl.querySelector(`[data-placeholder-for="${highlightedSlotId}"]`);
      if (ph) {
        targetSlotEl = ph.closest('.eq-slot') as HTMLElement | null;
      }
    }
    if (targetSlotEl) {
      if (
        targetSlotEl.getAttribute('data-slot-role') !== 'root' &&
        targetSlotEl.getAttribute('data-slot-id') !== rootAst.id
      ) {
        targetSlotEl.classList.add('eq-placeholder-highlighted', 'eq-selected-slot', 'eq-partial-selected');
      }
      const childTokens = targetSlotEl.querySelectorAll('.eq-token, .eq-placeholder');
      childTokens.forEach((t) => t.classList.add('eq-selected-token'));

      const num = targetSlotEl.closest('.eq-numerator');
      if (num) num.classList.add('eq-partial-selected');
      const den = targetSlotEl.closest('.eq-denominator');
      if (den) den.classList.add('eq-partial-selected');
    }

    logDebugEvent('selection', () => {
      const widget = (rootEl as any).__widget;
      const fromAttr = rootEl.getAttribute('data-equation-from');
      const toAttr = rootEl.getAttribute('data-equation-to');
      const from = widget ? widget.from : (fromAttr !== null ? Number(fromAttr) : 0);
      const to = widget ? widget.to : (toAttr !== null ? Number(toAttr) : 0);
      const isInline = widget ? Boolean(widget.isInline) : rootEl.classList.contains('word-equation-inline');

      return {
        selectionType: 'slot_highlight',
        equation: { from, to, isInline },
        highlightedSlotId,
        partial: undefined,
      };
    });
    return;
  }

  // 3. If selection is active and non-collapsed
  if (
    !selection ||
    (selection.anchor.slotId === selection.head.slotId &&
      selection.anchor.offset === selection.head.offset)
  ) {
    return;
  }

  const { start, end } = normalizeSelection(rootAst, selection);
  const allSlots = getAllSlotsInOrder(rootAst);
  const selectedSlotIds: string[] = [];
  const selectedTokenIds: string[] = [];

  for (const slot of allSlots) {
    let slotEl =
      rootEl.getAttribute('data-slot-id') === slot.id
        ? rootEl
        : (rootEl.querySelector(`[data-slot-id="${slot.id}"]`) as HTMLElement | null);
    if (!slotEl) {
      const ph = rootEl.querySelector(`[data-placeholder-for="${slot.id}"]`);
      if (ph) slotEl = ph.closest('.eq-slot') as HTMLElement | null;
    }
    if (!slotEl) continue;

    let hasSelected = false;
    let selectedCount = 0;

    if (slot.children.length === 0) {
      const pos: CaretPosition = { slotId: slot.id, offset: 0 };
      if (
        comparePositions(rootAst, pos, start) >= 0 &&
        comparePositions(rootAst, pos, end) <= 0
      ) {
        const ph = slotEl.querySelector('.eq-placeholder');
        if (ph) {
          ph.classList.add('eq-selected-token');
        }
        hasSelected = true;
        selectedCount = 1;
        selectedSlotIds.push(slot.id);
      }
    } else {
      for (let i = 0; i < slot.children.length; i++) {
        const childNode = slot.children[i];
        const nodeStart: CaretPosition = { slotId: slot.id, offset: i };
        const nodeEnd: CaretPosition = { slotId: slot.id, offset: i + 1 };

        if (childNode.type === 'token') {
          if (
            comparePositions(rootAst, nodeStart, end) < 0 &&
            comparePositions(rootAst, nodeEnd, start) > 0
          ) {
            hasSelected = true;
            selectedCount++;
            selectedTokenIds.push(childNode.id);
            const childEl = slotEl.querySelector(`[data-node-id="${childNode.id}"]`);
            if (childEl) {
              childEl.classList.add('eq-selected-token');
            }
          }
        } else if (childNode.type !== 'placeholder') {
          // Composite structure: must be fully encompassed by selection in parent slot
          if (
            comparePositions(rootAst, start, nodeStart) <= 0 &&
            comparePositions(rootAst, end, nodeEnd) >= 0
          ) {
            hasSelected = true;
            selectedCount++;
            const structEl =
              slotEl.querySelector(`[data-node-id="${childNode.id}"]`) ||
              rootEl.querySelector(`[data-node-id="${childNode.id}"]`);
            if (structEl) {
              const hasParentSelectedStruct = Boolean(structEl.parentElement?.closest('.eq-selected-structure'));
              if (!hasParentSelectedStruct) {
                structEl.classList.add('eq-selected-structure');
              }
            }
          }
        }
      }
    }

    if (hasSelected) {
      if (!selectedSlotIds.includes(slot.id)) {
        selectedSlotIds.push(slot.id);
      }

      const isCrossBoundary = start.slotId !== end.slotId;

      if (isCrossBoundary) {
        if (slot.role !== 'root' && slot.id !== rootAst.id) {
          slotEl.classList.add('eq-partial-selected');
          if (selectedCount === slot.children.length && slot.children.length > 0) {
            slotEl.classList.add('eq-selected-slot');
          }
        }
        const num = slotEl.closest('.eq-numerator');
        if (num) num.classList.add('eq-partial-selected');
        const den = slotEl.closest('.eq-denominator');
        if (den) den.classList.add('eq-partial-selected');
      }
    }
  }

  logDebugEvent('selection', () => {
    const widget = (rootEl as any).__widget;
    const fromAttr = rootEl.getAttribute('data-equation-from');
    const toAttr = rootEl.getAttribute('data-equation-to');
    const from = widget ? widget.from : (fromAttr !== null ? Number(fromAttr) : 0);
    const to = widget ? widget.to : (toAttr !== null ? Number(toAttr) : 0);
    const isInline = widget ? Boolean(widget.isInline) : rootEl.classList.contains('word-equation-inline');

    const structElements = Array.from(rootEl.querySelectorAll('.eq-selected-structure'));
    const highlightTrace = {
      selectedStructureCount: structElements.length,
      nestedStackingDetected: structElements.some((el) => Boolean(el.parentElement?.closest('.eq-selected-structure'))),
      appliedClassHierarchy: structElements.map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: el.className,
        isNested: Boolean(el.parentElement?.closest('.eq-selected-structure')),
      })),
    };

    return {
      selectionType: 'partial',
      equation: { from, to, isInline },
      partial: {
        anchor: { slotId: selection.anchor.slotId, offset: selection.anchor.offset },
        head: { slotId: selection.head.slotId, offset: selection.head.offset },
        normalizedStart: { slotId: start.slotId, offset: start.offset },
        normalizedEnd: { slotId: end.slotId, offset: end.offset },
        isBackward: comparePositions(rootAst, selection.anchor, selection.head) > 0,
        selectedSlotIds,
        selectedTokenIds,
      },
      highlightedSlotId: highlightedSlotId || null,
      highlightTrace,
    };
  });
}

