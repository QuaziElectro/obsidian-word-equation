/**
 * AST Construction, Manipulation, Traversal, and Cloning Utilities
 */

import {
  MathNode,
  SlotNode,
  TokenNode,
  FractionNode,
  SuperscriptNode,
  SubscriptNode,
  SubSupNode,
  RadicalNode,
  RootNode,
  MatrixNode,
  FencedNode,
  UnderOverNode,
  PlaceholderNode,
  SlotRole,
  TokenKind,
  CaretPosition,
  SelectionRange,
} from './types';

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function generateId(prefix = 'node'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createSlot(
  role: SlotRole = 'root',
  children: MathNode[] = [],
  parentNodeId: string | null = null,
  id?: string
): SlotNode {
  const slotId = id || generateId('slot');
  const slot: SlotNode = {
    id: slotId,
    role,
    parentNodeId,
    children: [],
  };
  for (const child of children) {
    child.parentSlotId = slotId;
    slot.children.push(child);
  }
  return slot;
}

export function createToken(
  text: string,
  tokenKind: TokenKind,
  attributes?: Record<string, string>,
  id?: string
): TokenNode {
  return {
    id: id || generateId('tok'),
    type: 'token',
    text,
    tokenKind,
    parentSlotId: null,
    attributes: attributes ? { ...attributes } : undefined,
  };
}

export function createFraction(
  numerator: SlotNode,
  denominator: SlotNode,
  linethickness?: string,
  id?: string
): FractionNode {
  const nodeId = id || generateId('frac');
  numerator.role = 'numerator';
  numerator.parentNodeId = nodeId;
  denominator.role = 'denominator';
  denominator.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'fraction',
    numerator,
    denominator,
    linethickness,
    parentSlotId: null,
  };
}

export function createSuperscript(
  base: SlotNode,
  sup: SlotNode,
  id?: string
): SuperscriptNode {
  const nodeId = id || generateId('msup');
  base.role = 'base';
  base.parentNodeId = nodeId;
  sup.role = 'sup';
  sup.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'superscript',
    base,
    sup,
    parentSlotId: null,
  };
}

export function createSubscript(
  base: SlotNode,
  sub: SlotNode,
  id?: string
): SubscriptNode {
  const nodeId = id || generateId('msub');
  base.role = 'base';
  base.parentNodeId = nodeId;
  sub.role = 'sub';
  sub.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'subscript',
    base,
    sub,
    parentSlotId: null,
  };
}

export function createSubSup(
  base: SlotNode,
  sub: SlotNode,
  sup: SlotNode,
  id?: string
): SubSupNode {
  const nodeId = id || generateId('msubsup');
  base.role = 'base';
  base.parentNodeId = nodeId;
  sub.role = 'sub';
  sub.parentNodeId = nodeId;
  sup.role = 'sup';
  sup.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'subsup',
    base,
    sub,
    sup,
    parentSlotId: null,
  };
}

export function createRadical(radicand: SlotNode, id?: string): RadicalNode {
  const nodeId = id || generateId('msqrt');
  radicand.role = 'radicand';
  radicand.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'radical',
    radicand,
    parentSlotId: null,
  };
}

export function createRoot(
  radicand: SlotNode,
  index: SlotNode,
  id?: string
): RootNode {
  const nodeId = id || generateId('mroot');
  radicand.role = 'radicand';
  radicand.parentNodeId = nodeId;
  index.role = 'index';
  index.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'root',
    radicand,
    index,
    parentSlotId: null,
  };
}

export function createMatrix(
  rows: SlotNode[][],
  openBracket = '',
  closeBracket = '',
  id?: string
): MatrixNode {
  const nodeId = id || generateId('mtable');
  for (const row of rows) {
    for (const cell of row) {
      cell.role = 'cell';
      cell.parentNodeId = nodeId;
    }
  }

  return {
    id: nodeId,
    type: 'matrix',
    rows,
    openBracket,
    closeBracket,
    parentSlotId: null,
  };
}

export function createFenced(
  content: SlotNode,
  open = '(',
  close = ')',
  id?: string
): FencedNode {
  const nodeId = id || generateId('mfenced');
  content.role = 'fenced';
  content.parentNodeId = nodeId;

  return {
    id: nodeId,
    type: 'fenced',
    content,
    open,
    close,
    parentSlotId: null,
  };
}

export function createUnderOver(
  base: SlotNode,
  under?: SlotNode,
  over?: SlotNode,
  accent = false,
  id?: string
): UnderOverNode {
  const nodeId = id || generateId('munderover');
  base.role = 'base';
  base.parentNodeId = nodeId;
  if (under) {
    under.role = 'under';
    under.parentNodeId = nodeId;
  }
  if (over) {
    over.role = 'over';
    over.parentNodeId = nodeId;
  }

  return {
    id: nodeId,
    type: 'underover',
    base,
    under,
    over,
    accent,
    parentSlotId: null,
  };
}

export function createPlaceholder(id?: string): PlaceholderNode {
  return {
    id: id || generateId('placeholder'),
    type: 'placeholder',
    parentSlotId: null,
  };
}

export function getChildSlots(node: MathNode): SlotNode[] {
  switch (node.type) {
    case 'token':
    case 'placeholder':
      return [];
    case 'fraction':
      return [node.numerator, node.denominator];
    case 'superscript':
      return [node.base, node.sup];
    case 'subscript':
      return [node.base, node.sub];
    case 'subsup':
      return [node.base, node.sub, node.sup];
    case 'radical':
      return [node.radicand];
    case 'root':
      return [node.radicand, node.index];
    case 'matrix':
      return node.rows.flat();
    case 'fenced':
      return [node.content];
    case 'underover': {
      const slots = [node.base];
      if (node.under) slots.push(node.under);
      if (node.over) slots.push(node.over);
      return slots;
    }
  }
}

export interface AstVisitor {
  enterNode?: (node: MathNode) => void;
  exitNode?: (node: MathNode) => void;
  enterSlot?: (slot: SlotNode) => void;
  exitSlot?: (slot: SlotNode) => void;
}

export function traverse(root: SlotNode, visitor: AstVisitor): void {
  function visitSlot(slot: SlotNode): void {
    visitor.enterSlot?.(slot);
    for (const child of slot.children) {
      visitNode(child);
    }
    visitor.exitSlot?.(slot);
  }

  function visitNode(node: MathNode): void {
    visitor.enterNode?.(node);
    const childSlots = getChildSlots(node);
    for (const childSlot of childSlots) {
      visitSlot(childSlot);
    }
    visitor.exitNode?.(node);
  }

  visitSlot(root);
}

export function findSlotById(root: SlotNode, slotId: string): SlotNode | null {
  if (root.id === slotId) return root;
  for (const child of root.children) {
    for (const s of getChildSlots(child)) {
      const found = findSlotById(s, slotId);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeById(root: SlotNode, nodeId: string): MathNode | null {
  for (const child of root.children) {
    if (child.id === nodeId) return child;
    for (const s of getChildSlots(child)) {
      const found = findNodeById(s, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findParentSlotOfNode(
  root: SlotNode,
  nodeId: string
): SlotNode | null {
  for (const child of root.children) {
    if (child.id === nodeId) return root;
    for (const s of getChildSlots(child)) {
      const found = findParentSlotOfNode(s, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findParentNodeOfSlot(
  root: SlotNode,
  slotId: string
): MathNode | null {
  for (const child of root.children) {
    const slots = getChildSlots(child);
    if (slots.some((s) => s.id === slotId)) {
      return child;
    }
    for (const s of slots) {
      const found = findParentNodeOfSlot(s, slotId);
      if (found) return found;
    }
  }
  return null;
}

export function cloneNode(node: MathNode, preserveIds = true): MathNode {
  switch (node.type) {
    case 'token':
      return {
        ...node,
        id: preserveIds ? node.id : generateId('tok'),
        attributes: node.attributes ? { ...node.attributes } : undefined,
      };
    case 'placeholder':
      return {
        ...node,
        id: preserveIds ? node.id : generateId('placeholder'),
      };
    case 'fraction':
      return createFraction(
        cloneSlot(node.numerator, preserveIds),
        cloneSlot(node.denominator, preserveIds),
        node.linethickness,
        preserveIds ? node.id : undefined
      );
    case 'superscript':
      return createSuperscript(
        cloneSlot(node.base, preserveIds),
        cloneSlot(node.sup, preserveIds),
        preserveIds ? node.id : undefined
      );
    case 'subscript':
      return createSubscript(
        cloneSlot(node.base, preserveIds),
        cloneSlot(node.sub, preserveIds),
        preserveIds ? node.id : undefined
      );
    case 'subsup':
      return createSubSup(
        cloneSlot(node.base, preserveIds),
        cloneSlot(node.sub, preserveIds),
        cloneSlot(node.sup, preserveIds),
        preserveIds ? node.id : undefined
      );
    case 'radical':
      return createRadical(
        cloneSlot(node.radicand, preserveIds),
        preserveIds ? node.id : undefined
      );
    case 'root':
      return createRoot(
        cloneSlot(node.radicand, preserveIds),
        cloneSlot(node.index, preserveIds),
        preserveIds ? node.id : undefined
      );
    case 'matrix':
      return createMatrix(
        node.rows.map((row) => row.map((cell) => cloneSlot(cell, preserveIds))),
        node.openBracket,
        node.closeBracket,
        preserveIds ? node.id : undefined
      );
    case 'fenced':
      return createFenced(
        cloneSlot(node.content, preserveIds),
        node.open,
        node.close,
        preserveIds ? node.id : undefined
      );
    case 'underover':
      return createUnderOver(
        cloneSlot(node.base, preserveIds),
        node.under ? cloneSlot(node.under, preserveIds) : undefined,
        node.over ? cloneSlot(node.over, preserveIds) : undefined,
        node.accent,
        preserveIds ? node.id : undefined
      );
  }
}

export function cloneSlot(slot: SlotNode, preserveIds = true): SlotNode {
  const newSlot: SlotNode = {
    id: preserveIds ? slot.id : generateId('slot'),
    role: slot.role,
    parentNodeId: slot.parentNodeId,
    children: [],
  };
  for (const child of slot.children) {
    const clonedChild = cloneNode(child, preserveIds);
    clonedChild.parentSlotId = newSlot.id;
    newSlot.children.push(clonedChild);
  }
  return newSlot;
}

export function areSlotsEqual(a: SlotNode, b: SlotNode): boolean {
  if (a.role !== b.role) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!areNodesEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}

export function areNodesEqual(a: MathNode, b: MathNode): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'token': {
      const tb = b as TokenNode;
      return a.text === tb.text && a.tokenKind === tb.tokenKind;
    }
    case 'placeholder':
      return true;
    case 'fraction': {
      const fb = b as FractionNode;
      return (
        areSlotsEqual(a.numerator, fb.numerator) &&
        areSlotsEqual(a.denominator, fb.denominator)
      );
    }
    case 'superscript': {
      const sb = b as SuperscriptNode;
      return (
        areSlotsEqual(a.base, sb.base) && areSlotsEqual(a.sup, sb.sup)
      );
    }
    case 'subscript': {
      const sb = b as SubscriptNode;
      return (
        areSlotsEqual(a.base, sb.base) && areSlotsEqual(a.sub, sb.sub)
      );
    }
    case 'subsup': {
      const sb = b as SubSupNode;
      return (
        areSlotsEqual(a.base, sb.base) &&
        areSlotsEqual(a.sub, sb.sub) &&
        areSlotsEqual(a.sup, sb.sup)
      );
    }
    case 'radical': {
      const rb = b as RadicalNode;
      return areSlotsEqual(a.radicand, rb.radicand);
    }
    case 'root': {
      const rb = b as RootNode;
      return (
        areSlotsEqual(a.radicand, rb.radicand) &&
        areSlotsEqual(a.index, rb.index)
      );
    }
    case 'matrix': {
      const mb = b as MatrixNode;
      if (a.rows.length !== mb.rows.length) return false;
      for (let r = 0; r < a.rows.length; r++) {
        if (a.rows[r].length !== mb.rows[r].length) return false;
        for (let c = 0; c < a.rows[r].length; c++) {
          if (!areSlotsEqual(a.rows[r][c], mb.rows[r][c])) return false;
        }
      }
      return true;
    }
    case 'fenced': {
      const fb = b as FencedNode;
      return (
        a.open === fb.open &&
        a.close === fb.close &&
        areSlotsEqual(a.content, fb.content)
      );
    }
    case 'underover': {
      const ub = b as UnderOverNode;
      if (!areSlotsEqual(a.base, ub.base)) return false;
      if ((a.under && !ub.under) || (!a.under && ub.under)) return false;
      if (a.under && ub.under && !areSlotsEqual(a.under, ub.under)) return false;
      if ((a.over && !ub.over) || (!a.over && ub.over)) return false;
      if (a.over && ub.over && !areSlotsEqual(a.over, ub.over)) return false;
      return a.accent === ub.accent;
    }
  }
}

export function slotToPlainText(slot: SlotNode): string {
  let res = '';
  for (const child of slot.children) {
    if (child.type === 'token') {
      res += child.text;
    } else if (child.type === 'fraction') {
      res += `(${slotToPlainText(child.numerator)})/(${slotToPlainText(child.denominator)})`;
    } else if (child.type === 'superscript') {
      res += `${slotToPlainText(child.base)}^(${slotToPlainText(child.sup)})`;
    } else if (child.type === 'subscript') {
      res += `${slotToPlainText(child.base)}_(${slotToPlainText(child.sub)})`;
    } else if (child.type === 'subsup') {
      res += `${slotToPlainText(child.base)}_(${slotToPlainText(child.sub)})^(${slotToPlainText(child.sup)})`;
    } else if (child.type === 'radical') {
      res += `\\sqrt(${slotToPlainText(child.radicand)})`;
    } else if (child.type === 'root') {
      res += `\\sqrt[${slotToPlainText(child.index)}](${slotToPlainText(child.radicand)})`;
    } else if (child.type === 'matrix') {
      const rowStrs = child.rows.map((row) =>
        row.map((cell) => slotToPlainText(cell)).join(' & ')
      );
      res += `[${rowStrs.join(' ; ')}]`;
    } else if (child.type === 'fenced') {
      res += `${child.open}${slotToPlainText(child.content)}${child.close}`;
    } else if (child.type === 'underover') {
      res += slotToPlainText(child.base);
      if (child.under) res += `_(${slotToPlainText(child.under)})`;
      if (child.over) res += `^(${slotToPlainText(child.over)})`;
    }
  }
  return res;
}

export function getAllSlotsInOrder(root: SlotNode): SlotNode[] {
  const slots: SlotNode[] = [];
  traverse(root, {
    enterSlot: (slot) => slots.push(slot),
  });
  return slots;
}

export function isEquationEmpty(root: SlotNode): boolean {
  if (!root || !root.children || root.children.length === 0) return true;
  const allSlots = getAllSlotsInOrder(root);
  for (const slot of allSlots) {
    for (const child of slot.children) {
      if (child.type === 'token') {
        if (child.text && child.text.trim().length > 0) return false;
      } else if (child.type === 'placeholder') {
        continue;
      } else {
        // Any structural box (fraction, matrix, radical, root, script, fenced, underover) is non-empty
        return false;
      }
    }
  }
  return true;
}

export function updateParentPointers(root: SlotNode): void {
  function fixSlot(slot: SlotNode, parentNodeId: string | null): void {
    slot.parentNodeId = parentNodeId;
    for (const child of slot.children) {
      child.parentSlotId = slot.id;
      for (const s of getChildSlots(child)) {
        fixSlot(s, child.id);
      }
    }
  }
  fixSlot(root, null);
}

interface SlotPathStep {
  slot: SlotNode;
  childIndex?: number;
  childNode?: MathNode;
  nextSlot?: SlotNode;
}

function getSlotPath(root: SlotNode, targetSlotId: string): SlotPathStep[] | null {
  if (root.id === targetSlotId) {
    return [{ slot: root }];
  }
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    const childSlots = getChildSlots(child);
    for (const childSlot of childSlots) {
      const subPath = getSlotPath(childSlot, targetSlotId);
      if (subPath) {
        return [
          {
            slot: root,
            childIndex: i,
            childNode: child,
            nextSlot: childSlot,
          },
          ...subPath,
        ];
      }
    }
  }
  return null;
}

export function isSlotEmpty(slot: SlotNode): boolean {
  if (!slot || !slot.children || slot.children.length === 0) return true;
  return slot.children.every((c) => {
    if (c.type === 'placeholder') return true;
    if (c.type === 'token') return !c.text || c.text.trim() === '';
    return false;
  });
}

/**
 * Recursively find the first leaf editable slot and position in a slot tree.
 * If the first child is a composite node (fraction, root, etc.), descends into its first child slot.
 */
export function findFirstEditableSlot(slot: SlotNode): CaretPosition {
  if (!slot || !slot.children || slot.children.length === 0) {
    return { slotId: slot.id, offset: 0 };
  }
  const firstChild = slot.children[0];
  const childSlots = getChildSlots(firstChild);
  if (childSlots.length > 0) {
    return findFirstEditableSlot(childSlots[0]);
  }
  return { slotId: slot.id, offset: 0 };
}

/**
 * Recursively find the last leaf editable slot and position in a slot tree.
 * If the last child is a composite node (fraction, root, etc.), descends into its last child slot.
 */
export function findLastEditableSlot(slot: SlotNode): CaretPosition {
  if (!slot || !slot.children || slot.children.length === 0) {
    return { slotId: slot.id, offset: 0 };
  }
  const lastChild = slot.children[slot.children.length - 1];
  const childSlots = getChildSlots(lastChild);
  if (childSlots.length > 0) {
    const lastSlot = childSlots[childSlots.length - 1];
    return findLastEditableSlot(lastSlot);
  }
  return { slotId: slot.id, offset: slot.children.length };
}

export function comparePositions(
  root: MathNode | SlotNode,
  a: CaretPosition,
  b: CaretPosition
): number {
  if (a.slotId === b.slotId) {
    return a.offset - b.offset;
  }

  const rootSlot: SlotNode =
    'children' in root && 'role' in root
      ? (root as SlotNode)
      : createSlot('root', [root as MathNode]);

  const pathA = getSlotPath(rootSlot, a.slotId);
  const pathB = getSlotPath(rootSlot, b.slotId);

  if (!pathA || !pathB) {
    return 0;
  }

  // Find lowest common ancestor slot
  let lcaDepth = 0;
  while (
    lcaDepth < pathA.length &&
    lcaDepth < pathB.length &&
    pathA[lcaDepth].slot.id === pathB[lcaDepth].slot.id
  ) {
    lcaDepth++;
  }
  lcaDepth--; // Deepest common slot index

  if (lcaDepth < 0) {
    return 0;
  }

  const isAInLca = lcaDepth === pathA.length - 1;
  const isBInLca = lcaDepth === pathB.length - 1;

  if (isAInLca && isBInLca) {
    return a.offset - b.offset;
  }

  const effA = isAInLca ? a.offset : pathA[lcaDepth].childIndex! + 0.5;
  const effB = isBInLca ? b.offset : pathB[lcaDepth].childIndex! + 0.5;

  if (effA !== effB) {
    return effA < effB ? -1 : 1;
  }

  // Both descend through the same composite node
  const childNode = pathA[lcaDepth].childNode!;
  const childSlots = getChildSlots(childNode);
  const slotIdxA = childSlots.findIndex((s) => s.id === pathA[lcaDepth].nextSlot!.id);
  const slotIdxB = childSlots.findIndex((s) => s.id === pathB[lcaDepth].nextSlot!.id);

  if (slotIdxA !== slotIdxB) {
    return slotIdxA - slotIdxB;
  }

  return 0;
}

export function elevateSelectionForDrag(
  root: SlotNode,
  anchor: CaretPosition,
  head: CaretPosition
): SelectionRange {
  if (anchor.slotId === head.slotId) {
    return { anchor, head };
  }

  const pathA = getSlotPath(root, anchor.slotId);
  const pathB = getSlotPath(root, head.slotId);

  if (!pathA || !pathB) {
    return { anchor, head };
  }

  let lcaDepth = 0;
  while (
    lcaDepth < pathA.length &&
    lcaDepth < pathB.length &&
    pathA[lcaDepth].slot.id === pathB[lcaDepth].slot.id
  ) {
    lcaDepth++;
  }
  lcaDepth--;

  if (lcaDepth < 0) {
    return { anchor, head };
  }

  const lcaSlot = pathA[lcaDepth].slot;
  const isAInLca = lcaDepth === pathA.length - 1;
  const isBInLca = lcaDepth === pathB.length - 1;

  const cmp = comparePositions(root, anchor, head);
  const isForward = cmp <= 0;

  if (isForward) {
    const elevatedAnchor: CaretPosition = isAInLca
      ? anchor
      : { slotId: lcaSlot.id, offset: pathA[lcaDepth].childIndex! };

    let elevatedHead: CaretPosition;
    if (isBInLca) {
      elevatedHead = head;
    } else {
      const bChildIdx = pathB[lcaDepth].childIndex!;
      elevatedHead = { slotId: lcaSlot.id, offset: bChildIdx + 1 };
    }

    return { anchor: elevatedAnchor, head: elevatedHead };
  } else {
    const elevatedAnchor: CaretPosition = isAInLca
      ? anchor
      : { slotId: lcaSlot.id, offset: pathA[lcaDepth].childIndex! + 1 };

    let elevatedHead: CaretPosition;
    if (isBInLca) {
      elevatedHead = head;
    } else {
      const bChildIdx = pathB[lcaDepth].childIndex!;
      elevatedHead = { slotId: lcaSlot.id, offset: bChildIdx };
    }

    return { anchor: elevatedAnchor, head: elevatedHead };
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

/**
 * Extracts the sub-AST corresponding to a selection range.
 * If the selection spans within a slot, extracts the selected children slice.
 * If cross-boundary, evaluates lowest common ancestor (LCA) slot or collected nodes.
 */
export function extractSelectionAST(
  root: SlotNode,
  selection: SelectionRange
): SlotNode {
  const { start, end } = normalizeSelection(root, selection);

  // 1. Intra-slot selection
  if (start.slotId === end.slotId) {
    const slot = findSlotById(root, start.slotId);
    if (!slot) return createSlot('root', []);
    const slice = slot.children
      .slice(start.offset, end.offset)
      .map((node) => cloneNode(node, true));
    const result = createSlot('root', slice);
    updateParentPointers(result);
    return result;
  }

  // 2. Cross-boundary selection: elevate to Lowest Common Ancestor (LCA) slot
  const elevated = elevateSelectionForDrag(root, start, end);
  const elevNorm = normalizeSelection(root, elevated);
  if (elevNorm.start.slotId === elevNorm.end.slotId) {
    const lcaSlot = findSlotById(root, elevNorm.start.slotId);
    if (lcaSlot) {
      const slice = lcaSlot.children
        .slice(elevNorm.start.offset, elevNorm.end.offset)
        .map((node) => cloneNode(node, true));
      const result = createSlot('root', slice);
      updateParentPointers(result);
      return result;
    }
  }

  // 3. Fallback: collect all encompassed nodes across slots
  const selectedNodes: MathNode[] = [];
  const allSlots = getAllSlotsInOrder(root);
  for (const slot of allSlots) {
    for (let i = 0; i < slot.children.length; i++) {
      const child = slot.children[i];
      const nStart: CaretPosition = { slotId: slot.id, offset: i };
      const nEnd: CaretPosition = { slotId: slot.id, offset: i + 1 };
      if (
        comparePositions(root, nStart, end) < 0 &&
        comparePositions(root, nEnd, start) > 0
      ) {
        selectedNodes.push(cloneNode(child, true));
      }
    }
  }
  const result = createSlot('root', selectedNodes);
  updateParentPointers(result);
  return result;
}


