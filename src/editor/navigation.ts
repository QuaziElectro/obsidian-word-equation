/**
 * 2D / 1D Keyboard Navigation Engine for Word-like Equation Boxes
 * Handles ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Tab, and Shift-Tab.
 */

import {
  SlotNode,
  CaretPosition,
  NavigationResult,
  SelectionRange,
} from '../core/types';
import {
  findSlotById,
  findParentNodeOfSlot,
  findParentSlotOfNode,
  getChildSlots,
  getAllSlotsInOrder,
  isSlotEmpty,
} from '../core/ast';
import { isDebugEnabled, logDebugEvent } from '../debug/debug-logger';

export function handleArrowKey(
  root: SlotNode,
  current: CaretPosition,
  key: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown'
): NavigationResult {
  let result: NavigationResult;
  switch (key) {
    case 'ArrowRight':
      result = navigateRight(root, current);
      break;
    case 'ArrowLeft':
      result = navigateLeft(root, current);
      break;
    case 'ArrowUp':
      result = navigateUp(root, current);
      break;
    case 'ArrowDown':
      result = navigateDown(root, current);
      break;
  }

  if (isDebugEnabled()) {
    const destSlot = result.handled ? findSlotById(root, result.caret.slotId) : null;
    const isDestPlaceholder = destSlot ? isSlotEmpty(destSlot) : false;
    logDebugEvent('placeholder', () => ({
      action: 'candidate_evaluation_summary',
      direction: key,
      fromSlotId: current.slotId,
      toSlotId: result.handled ? result.caret.slotId : undefined,
      handled: result.handled,
      exitDirection: result.exitDirection,
      isPlaceholder: isDestPlaceholder,
      slotRole: destSlot?.role,
    }));
  }

  return result;
}

export function handleTabKey(
  root: SlotNode,
  current: CaretPosition,
  shiftKey = false
): NavigationResult {
  const allSlots = getAllSlotsInOrder(root);
  const emptySlots = allSlots.filter((s) => s.children.length === 0);
  const targetList = emptySlots.length > 0 ? emptySlots : allSlots;

  if (targetList.length === 0) {
    return { caret: current, handled: false };
  }

  const currentIndex = targetList.findIndex((s) => s.id === current.slotId);

  if (shiftKey) {
    // Navigate backwards
    if (currentIndex <= 0) {
      const prev = targetList[targetList.length - 1];
      return {
        caret: { slotId: prev.id, offset: prev.children.length },
        handled: true,
      };
    }
    const prev = targetList[currentIndex - 1];
    return {
      caret: { slotId: prev.id, offset: prev.children.length },
      handled: true,
    };
  } else {
    // Navigate forwards
    if (currentIndex === -1 || currentIndex >= targetList.length - 1) {
      const first = targetList[0];
      return {
        caret: { slotId: first.id, offset: 0 },
        handled: true,
      };
    }
    const next = targetList[currentIndex + 1];
    return {
      caret: { slotId: next.id, offset: 0 },
      handled: true,
    };
  }
}

function navigateRight(root: SlotNode, current: CaretPosition): NavigationResult {
  const slot = findSlotById(root, current.slotId);
  if (!slot) {
    return { caret: current, handled: false };
  }

  // 1. If not at the end of the slot
  if (current.offset < slot.children.length) {
    const node = slot.children[current.offset];
    const childSlots = getChildSlots(node);

    if (childSlots.length > 0) {
      // Enter the first child slot
      const targetSlot = childSlots[0];
      if (isDebugEnabled()) {
        const isTargetPlaceholder = isSlotEmpty(targetSlot);
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowRight',
          currentSlotId: slot.id,
          candidateSlotId: targetSlot.id,
          candidateRole: targetSlot.role,
          isPlaceholder: isTargetPlaceholder,
          decision: 'accepted',
          rationale: 'descend_into_first_child_slot',
        }));
      }
      return {
        caret: { slotId: targetSlot.id, offset: 0 },
        handled: true,
      };
    }

    // Atom token: step past it
    return {
      caret: { slotId: slot.id, offset: current.offset + 1 },
      handled: true,
    };
  }

  // 2. At the end of the slot: check siblings within parent composite box
  const parentNode = findParentNodeOfSlot(root, slot.id);
  if (!parentNode) {
    // We are at root end
    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowRight',
        currentSlotId: slot.id,
        decision: 'exit_boundary',
        rationale: 'at_root_boundary_exit_after',
      }));
    }
    return {
      caret: current,
      handled: false,
      exitDirection: 'after',
    };
  }

  const siblings = getChildSlots(parentNode);
  const currentSlotIndex = siblings.findIndex((s) => s.id === slot.id);

  if (currentSlotIndex !== -1 && currentSlotIndex < siblings.length - 1) {
    // Move to next sibling slot within the same composite box
    const nextSlot = siblings[currentSlotIndex + 1];
    if (isDebugEnabled()) {
      const isNextPlaceholder = isSlotEmpty(nextSlot);
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowRight',
        currentSlotId: slot.id,
        candidateSlotId: nextSlot.id,
        candidateRole: nextSlot.role,
        isPlaceholder: isNextPlaceholder,
        decision: 'accepted',
        rationale: 'move_to_next_sibling_slot',
      }));
    }
    return {
      caret: { slotId: nextSlot.id, offset: 0 },
      handled: true,
    };
  }

  // 3. Exiting parent composite box into its enclosing slot
  const enclosingSlot = findParentSlotOfNode(root, parentNode.id);
  if (!enclosingSlot) {
    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowRight',
        currentSlotId: slot.id,
        decision: 'exit_boundary',
        rationale: 'no_enclosing_slot_exit_after',
      }));
    }
    return {
      caret: current,
      handled: false,
      exitDirection: 'after',
    };
  }

  const parentNodeIndex = enclosingSlot.children.findIndex(
    (n) => n.id === parentNode.id
  );
  if (isDebugEnabled()) {
    logDebugEvent('placeholder', () => ({
      action: 'candidate_evaluation',
      direction: 'ArrowRight',
      currentSlotId: slot.id,
      candidateSlotId: enclosingSlot.id,
      candidateRole: enclosingSlot.role,
      isPlaceholder: isSlotEmpty(enclosingSlot),
      decision: 'accepted',
      rationale: 'exit_composite_to_enclosing_slot',
    }));
  }
  return {
    caret: {
      slotId: enclosingSlot.id,
      offset: parentNodeIndex !== -1 ? parentNodeIndex + 1 : enclosingSlot.children.length,
    },
    handled: true,
  };
}

function navigateLeft(root: SlotNode, current: CaretPosition): NavigationResult {
  const slot = findSlotById(root, current.slotId);
  if (!slot) {
    return { caret: current, handled: false };
  }

  // 1. If offset > 0
  if (current.offset > 0) {
    const prevNode = slot.children[current.offset - 1];
    const childSlots = getChildSlots(prevNode);

    if (childSlots.length > 0) {
      // Enter the last child slot at its end
      const lastSlot = childSlots[childSlots.length - 1];
      if (isDebugEnabled()) {
        const isLastPlaceholder = isSlotEmpty(lastSlot);
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowLeft',
          currentSlotId: slot.id,
          candidateSlotId: lastSlot.id,
          candidateRole: lastSlot.role,
          isPlaceholder: isLastPlaceholder,
          decision: 'accepted',
          rationale: 'descend_into_last_child_slot',
        }));
      }
      return {
        caret: { slotId: lastSlot.id, offset: lastSlot.children.length },
        handled: true,
      };
    }

    // Atom token: step back
    return {
      caret: { slotId: slot.id, offset: current.offset - 1 },
      handled: true,
    };
  }

  // 2. At offset 0 of the slot: check previous sibling in parent composite box
  const parentNode = findParentNodeOfSlot(root, slot.id);
  if (!parentNode) {
    // At root start
    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowLeft',
        currentSlotId: slot.id,
        decision: 'exit_boundary',
        rationale: 'at_root_boundary_exit_before',
      }));
    }
    return {
      caret: current,
      handled: false,
      exitDirection: 'before',
    };
  }

  const siblings = getChildSlots(parentNode);
  const currentSlotIndex = siblings.findIndex((s) => s.id === slot.id);

  if (currentSlotIndex > 0) {
    // Move to previous sibling slot at its end
    const prevSlot = siblings[currentSlotIndex - 1];
    if (isDebugEnabled()) {
      const isPrevPlaceholder = isSlotEmpty(prevSlot);
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowLeft',
        currentSlotId: slot.id,
        candidateSlotId: prevSlot.id,
        candidateRole: prevSlot.role,
        isPlaceholder: isPrevPlaceholder,
        decision: 'accepted',
        rationale: 'move_to_prev_sibling_slot',
      }));
    }
    return {
      caret: { slotId: prevSlot.id, offset: prevSlot.children.length },
      handled: true,
    };
  }

  // 3. Exiting parent composite box backwards into enclosing slot
  const enclosingSlot = findParentSlotOfNode(root, parentNode.id);
  if (!enclosingSlot) {
    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowLeft',
        currentSlotId: slot.id,
        decision: 'exit_boundary',
        rationale: 'no_enclosing_slot_exit_before',
      }));
    }
    return {
      caret: current,
      handled: false,
      exitDirection: 'before',
    };
  }

  const parentNodeIndex = enclosingSlot.children.findIndex(
    (n) => n.id === parentNode.id
  );
  if (isDebugEnabled()) {
    logDebugEvent('placeholder', () => ({
      action: 'candidate_evaluation',
      direction: 'ArrowLeft',
      currentSlotId: slot.id,
      candidateSlotId: enclosingSlot.id,
      candidateRole: enclosingSlot.role,
      isPlaceholder: isSlotEmpty(enclosingSlot),
      decision: 'accepted',
      rationale: 'exit_composite_to_enclosing_slot_backwards',
    }));
  }
  return {
    caret: {
      slotId: enclosingSlot.id,
      offset: parentNodeIndex !== -1 ? parentNodeIndex : 0,
    },
    handled: true,
  };
}

function getBottomSlot(slot: SlotNode): SlotNode {
  if (slot.children.length === 0) return slot;
  const lastChild = slot.children[slot.children.length - 1];
  if (lastChild.type === 'fraction') {
    return getBottomSlot(lastChild.denominator);
  }
  if (lastChild.type === 'matrix' && lastChild.rows.length > 0) {
    const lastRow = lastChild.rows[lastChild.rows.length - 1];
    if (lastRow.length > 0) return getBottomSlot(lastRow[0]);
  }
  if (lastChild.type === 'underover' && lastChild.under) {
    return getBottomSlot(lastChild.under);
  }
  if (lastChild.type === 'subsup') {
    return getBottomSlot(lastChild.sub);
  }
  return slot;
}

function getTopSlot(slot: SlotNode): SlotNode {
  if (slot.children.length === 0) return slot;
  const firstChild = slot.children[0];
  if (firstChild.type === 'fraction') {
    return getTopSlot(firstChild.numerator);
  }
  if (firstChild.type === 'matrix' && firstChild.rows.length > 0 && firstChild.rows[0].length > 0) {
    return getTopSlot(firstChild.rows[0][0]);
  }
  if (firstChild.type === 'underover' && firstChild.over) {
    return getTopSlot(firstChild.over);
  }
  if (firstChild.type === 'subsup') {
    return getTopSlot(firstChild.sup);
  }
  if (firstChild.type === 'superscript') {
    return getTopSlot(firstChild.sup);
  }
  return slot;
}

export function findSlotAbove(root: SlotNode, current: CaretPosition): NavigationResult {
  const slot = findSlotById(root, current.slotId);
  if (!slot) return { caret: current, handled: false };

  const parentNode = findParentNodeOfSlot(root, slot.id);
  if (!parentNode) {
    // If inside root slot, check if root.children contains composite structures
    const compositeChildren = root.children
      .map((child, idx) => ({ child, idx, childSlots: getChildSlots(child) }))
      .filter((item) => item.childSlots.length > 0);

    if (compositeChildren.length > 0) {
      let best = compositeChildren[0];
      let bestDist = Math.abs(compositeChildren[0].idx - current.offset);
      for (let i = 1; i < compositeChildren.length; i++) {
        const dist = Math.abs(compositeChildren[i].idx - current.offset);
        if (dist < bestDist) {
          bestDist = dist;
          best = compositeChildren[i];
        }
      }
      const targetNode = best.child;
      let targetSlot: SlotNode | null = null;
      if (targetNode.type === 'fraction') {
        targetSlot = getBottomSlot(targetNode.denominator);
      } else if (targetNode.type === 'superscript') {
        targetSlot = targetNode.sup;
      } else if (targetNode.type === 'subsup') {
        targetSlot = targetNode.sup;
      } else if (targetNode.type === 'underover' && targetNode.over) {
        targetSlot = targetNode.over;
      } else if (targetNode.type === 'matrix' && targetNode.rows.length > 0 && targetNode.rows[targetNode.rows.length - 1].length > 0) {
        targetSlot = targetNode.rows[targetNode.rows.length - 1][0];
      } else if (targetNode.type === 'radical') {
        targetSlot = targetNode.radicand;
      } else if (targetNode.type === 'root') {
        targetSlot = targetNode.radicand;
      } else if (targetNode.type === 'fenced') {
        targetSlot = targetNode.content;
      }

      if (targetSlot) {
        if (isDebugEnabled()) {
          const isTargetPlaceholder = isSlotEmpty(targetSlot);
          logDebugEvent('placeholder', () => ({
            action: 'candidate_evaluation',
            direction: 'ArrowUp',
            currentSlotId: current.slotId,
            candidateSlotId: targetSlot!.id,
            candidateRole: targetSlot!.role,
            isPlaceholder: isTargetPlaceholder,
            decision: 'accepted',
            rationale: 'vertical_enter_from_root',
          }));
        }
        const newOffset = Math.min(current.offset, targetSlot.children.length);
        return {
          caret: { slotId: targetSlot.id, offset: newOffset },
          handled: true,
        };
      }
    }

    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowUp',
        currentSlotId: current.slotId,
        decision: 'exit_boundary',
        rationale: 'no_composite_child_above',
      }));
    }
    return { caret: current, handled: false, exitDirection: 'up' };
  }

  // Inside fraction: denominator -> numerator, or nested numerator -> climb ancestor fractions
  if (parentNode.type === 'fraction') {
    if (slot.id === parentNode.denominator.id) {
      const target = getBottomSlot(parentNode.numerator);
      if (isDebugEnabled()) {
        const isTargetPlaceholder = isSlotEmpty(target);
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowUp',
          currentSlotId: slot.id,
          candidateSlotId: target.id,
          candidateRole: target.role,
          isPlaceholder: isTargetPlaceholder,
          decision: 'accepted',
          rationale: 'fraction_denominator_to_numerator',
        }));
      }
      const newOffset = Math.min(current.offset, target.children.length);
      return {
        caret: { slotId: target.id, offset: newOffset },
        handled: true,
      };
    } else {
      // Current slot is numerator of parent fraction: climb to enclosing ancestor fraction above this one
      let ancestorSlot = findParentSlotOfNode(root, parentNode.id);
      while (ancestorSlot) {
        const ancestorNode = findParentNodeOfSlot(root, ancestorSlot.id);
        if (!ancestorNode) break;
        if (ancestorNode.type === 'fraction' && ancestorSlot.id === ancestorNode.denominator.id) {
          const target = getBottomSlot(ancestorNode.numerator);
          if (isDebugEnabled()) {
            const isTargetPlaceholder = isSlotEmpty(target);
            logDebugEvent('placeholder', () => ({
              action: 'candidate_evaluation',
              direction: 'ArrowUp',
              currentSlotId: slot.id,
              candidateSlotId: target.id,
              candidateRole: target.role,
              isPlaceholder: isTargetPlaceholder,
              decision: 'accepted',
              rationale: 'nested_fraction_climb_numerator',
            }));
          }
          const newOffset = Math.min(current.offset, target.children.length);
          return {
            caret: { slotId: target.id, offset: newOffset },
            handled: true,
          };
        }
        ancestorSlot = findParentSlotOfNode(root, ancestorNode.id);
      }
      if (isDebugEnabled()) {
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowUp',
          currentSlotId: slot.id,
          decision: 'exit_boundary',
          rationale: 'at_top_of_nested_fractions',
        }));
      }
      return { caret: current, handled: false, exitDirection: 'up' };
    }
  }

  // Inside matrix: row r -> row r - 1
  if (parentNode.type === 'matrix') {
    for (let r = 0; r < parentNode.rows.length; r++) {
      const c = parentNode.rows[r].findIndex((cell) => cell.id === slot.id);
      if (c !== -1) {
        if (r > 0) {
          const target = parentNode.rows[r - 1][c];
          const newOffset = Math.min(current.offset, target.children.length);
          return {
            caret: { slotId: target.id, offset: newOffset },
            handled: true,
          };
        }
        break;
      }
    }
  }

  // Inside subscript or base with superscript
  if (parentNode.type === 'subsup') {
    if (slot.id === parentNode.sub.id) {
      return {
        caret: {
          slotId: parentNode.sup.id,
          offset: Math.min(current.offset, parentNode.sup.children.length),
        },
        handled: true,
      };
    }
    if (slot.id === parentNode.base.id) {
      return {
        caret: {
          slotId: parentNode.sup.id,
          offset: 0,
        },
        handled: true,
      };
    }
  }

  if (parentNode.type === 'superscript' && slot.id === parentNode.base.id) {
    return {
      caret: {
        slotId: parentNode.sup.id,
        offset: 0,
      },
      handled: true,
    };
  }

  // UnderOver: under -> base or base -> over
  if (parentNode.type === 'underover') {
    if (parentNode.under && slot.id === parentNode.under.id) {
      return {
        caret: {
          slotId: parentNode.base.id,
          offset: Math.min(current.offset, parentNode.base.children.length),
        },
        handled: true,
      };
    }
    if (parentNode.over && slot.id === parentNode.base.id) {
      return {
        caret: {
          slotId: parentNode.over.id,
          offset: Math.min(current.offset, parentNode.over.children.length),
        },
        handled: true,
      };
    }
  }

  return { caret: current, handled: false, exitDirection: 'up' };
}

export function findSlotBelow(root: SlotNode, current: CaretPosition): NavigationResult {
  const slot = findSlotById(root, current.slotId);
  if (!slot) return { caret: current, handled: false };

  const parentNode = findParentNodeOfSlot(root, slot.id);
  if (!parentNode) {
    // If inside root slot, check if root.children contains composite structures
    const compositeChildren = root.children
      .map((child, idx) => ({ child, idx, childSlots: getChildSlots(child) }))
      .filter((item) => item.childSlots.length > 0);

    if (compositeChildren.length > 0) {
      let best = compositeChildren[0];
      let bestDist = Math.abs(compositeChildren[0].idx - current.offset);
      for (let i = 1; i < compositeChildren.length; i++) {
        const dist = Math.abs(compositeChildren[i].idx - current.offset);
        if (dist < bestDist) {
          bestDist = dist;
          best = compositeChildren[i];
        }
      }
      const targetNode = best.child;
      let targetSlot: SlotNode | null = null;
      if (targetNode.type === 'fraction') {
        targetSlot = getTopSlot(targetNode.numerator);
      } else if (targetNode.type === 'matrix' && targetNode.rows.length > 0 && targetNode.rows[0].length > 0) {
        targetSlot = targetNode.rows[0][0];
      } else if (targetNode.type === 'subscript') {
        targetSlot = targetNode.sub;
      } else if (targetNode.type === 'subsup') {
        targetSlot = targetNode.sub;
      } else if (targetNode.type === 'underover' && targetNode.under) {
        targetSlot = targetNode.under;
      } else if (targetNode.type === 'radical') {
        targetSlot = targetNode.radicand;
      } else if (targetNode.type === 'root') {
        targetSlot = targetNode.radicand;
      } else if (targetNode.type === 'fenced') {
        targetSlot = targetNode.content;
      }

      if (targetSlot) {
        if (isDebugEnabled()) {
          const isTargetPlaceholder = isSlotEmpty(targetSlot);
          logDebugEvent('placeholder', () => ({
            action: 'candidate_evaluation',
            direction: 'ArrowDown',
            currentSlotId: current.slotId,
            candidateSlotId: targetSlot!.id,
            candidateRole: targetSlot!.role,
            isPlaceholder: isTargetPlaceholder,
            decision: 'accepted',
            rationale: 'vertical_enter_from_root',
          }));
        }
        const newOffset = Math.min(current.offset, targetSlot.children.length);
        return {
          caret: { slotId: targetSlot.id, offset: newOffset },
          handled: true,
        };
      }
    }

    if (isDebugEnabled()) {
      logDebugEvent('placeholder', () => ({
        action: 'candidate_evaluation',
        direction: 'ArrowDown',
        currentSlotId: current.slotId,
        decision: 'exit_boundary',
        rationale: 'no_composite_child_below',
      }));
    }
    return { caret: current, handled: false, exitDirection: 'down' };
  }

  // Inside fraction: numerator -> denominator, or nested denominator -> climb ancestor fractions
  if (parentNode.type === 'fraction') {
    if (slot.id === parentNode.numerator.id) {
      const target = getTopSlot(parentNode.denominator);
      if (isDebugEnabled()) {
        const isTargetPlaceholder = isSlotEmpty(target);
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowDown',
          currentSlotId: slot.id,
          candidateSlotId: target.id,
          candidateRole: target.role,
          isPlaceholder: isTargetPlaceholder,
          decision: 'accepted',
          rationale: 'fraction_numerator_to_denominator',
        }));
      }
      const newOffset = Math.min(current.offset, target.children.length);
      return {
        caret: { slotId: target.id, offset: newOffset },
        handled: true,
      };
    } else {
      // Current slot is denominator of parent fraction: climb to enclosing ancestor fraction below this one
      let ancestorSlot = findParentSlotOfNode(root, parentNode.id);
      while (ancestorSlot) {
        const ancestorNode = findParentNodeOfSlot(root, ancestorSlot.id);
        if (!ancestorNode) break;
        if (ancestorNode.type === 'fraction' && ancestorSlot.id === ancestorNode.numerator.id) {
          const target = getTopSlot(ancestorNode.denominator);
          if (isDebugEnabled()) {
            const isTargetPlaceholder = isSlotEmpty(target);
            logDebugEvent('placeholder', () => ({
              action: 'candidate_evaluation',
              direction: 'ArrowDown',
              currentSlotId: slot.id,
              candidateSlotId: target.id,
              candidateRole: target.role,
              isPlaceholder: isTargetPlaceholder,
              decision: 'accepted',
              rationale: 'nested_fraction_descend_denominator',
            }));
          }
          const newOffset = Math.min(current.offset, target.children.length);
          return {
            caret: { slotId: target.id, offset: newOffset },
            handled: true,
          };
        }
        ancestorSlot = findParentSlotOfNode(root, ancestorNode.id);
      }
      if (isDebugEnabled()) {
        logDebugEvent('placeholder', () => ({
          action: 'candidate_evaluation',
          direction: 'ArrowDown',
          currentSlotId: slot.id,
          decision: 'exit_boundary',
          rationale: 'at_bottom_of_nested_fractions',
        }));
      }
      return { caret: current, handled: false, exitDirection: 'down' };
    }
  }

  // Inside matrix: row r -> row r + 1
  if (parentNode.type === 'matrix') {
    for (let r = 0; r < parentNode.rows.length; r++) {
      const c = parentNode.rows[r].findIndex((cell) => cell.id === slot.id);
      if (c !== -1) {
        if (r < parentNode.rows.length - 1) {
          const target = parentNode.rows[r + 1][c];
          const newOffset = Math.min(current.offset, target.children.length);
          return {
            caret: { slotId: target.id, offset: newOffset },
            handled: true,
          };
        }
        break;
      }
    }
  }

  // Inside superscript or subsup
  if (parentNode.type === 'subsup') {
    if (slot.id === parentNode.sup.id) {
      return {
        caret: {
          slotId: parentNode.sub.id,
          offset: Math.min(current.offset, parentNode.sub.children.length),
        },
        handled: true,
      };
    }
  }

  if (parentNode.type === 'superscript' && slot.id === parentNode.sup.id) {
    return {
      caret: {
        slotId: parentNode.base.id,
        offset: parentNode.base.children.length,
      },
      handled: true,
    };
  }

  // UnderOver: over -> base or base -> under
  if (parentNode.type === 'underover') {
    if (parentNode.over && slot.id === parentNode.over.id) {
      return {
        caret: {
          slotId: parentNode.base.id,
          offset: Math.min(current.offset, parentNode.base.children.length),
        },
        handled: true,
      };
    }
    if (parentNode.under && slot.id === parentNode.base.id) {
      return {
        caret: {
          slotId: parentNode.under.id,
          offset: Math.min(current.offset, parentNode.under.children.length),
        },
        handled: true,
      };
    }
  }

  return { caret: current, handled: false, exitDirection: 'down' };
}

function navigateUp(root: SlotNode, current: CaretPosition): NavigationResult {
  return findSlotAbove(root, current);
}

function navigateDown(root: SlotNode, current: CaretPosition): NavigationResult {
  return findSlotBelow(root, current);
}

export interface SelectionStepResult {
  selection: SelectionRange;
  caret: CaretPosition;
  handled: boolean;
  exitDirection?: 'before' | 'after';
  highlightedSlotId?: string | null;
}

/**
 * Handles 2-stage hierarchical scope ladder when selection head is at a slot boundary.
 * Stage 1: Select/highlight placeholder contents if not already fully selected.
 * Stage 2: Hierarchically elevate selection to enclose parent composite structure in enclosingSlot.
 */
export function handleHierarchicalBoundaryExpansion(
  root: SlotNode,
  activeSel: SelectionRange,
  slot: SlotNode,
  direction: 'ArrowRight' | 'ArrowLeft',
  currentHighlightedSlotId?: string | null
): SelectionStepResult {
  // 1. Root boundary: no parent structure to expand to; allow exit into markdown
  if (slot.role === 'root' || slot.id === root.id) {
    return {
      selection: activeSel,
      caret: activeSel.head,
      handled: false,
      exitDirection: direction === 'ArrowRight' ? 'after' : 'before',
      highlightedSlotId: null,
    };
  }

  // 2. Empty placeholder handling
  if (slot.children.length === 0) {
    if (currentHighlightedSlotId !== slot.id) {
      // Stage 1: Highlight empty placeholder
      const newSel: SelectionRange = {
        anchor: { slotId: slot.id, offset: 0 },
        head: { slotId: slot.id, offset: 0 },
      };
      return {
        selection: newSel,
        caret: newSel.head,
        handled: true,
        highlightedSlotId: slot.id,
      };
    }
    // Stage 2: Empty placeholder already highlighted; proceed to expand to parent structure below
  } else {
    // 3. Non-empty placeholder: check if slot contents are fully selected
    const isFullySelectedForward =
      activeSel.anchor.slotId === slot.id &&
      activeSel.anchor.offset === 0 &&
      activeSel.head.slotId === slot.id &&
      activeSel.head.offset === slot.children.length;

    const isFullySelectedBackward =
      activeSel.anchor.slotId === slot.id &&
      activeSel.anchor.offset === slot.children.length &&
      activeSel.head.slotId === slot.id &&
      activeSel.head.offset === 0;

    const isFullySelected = isFullySelectedForward || isFullySelectedBackward;

    if (!isFullySelected) {
      // Stage 1: Select entire placeholder contents in requested direction
      if (direction === 'ArrowRight') {
        const newSel: SelectionRange = {
          anchor: { slotId: slot.id, offset: 0 },
          head: { slotId: slot.id, offset: slot.children.length },
        };
        return {
          selection: newSel,
          caret: newSel.head,
          handled: true,
          highlightedSlotId: null,
        };
      } else {
        const newSel: SelectionRange = {
          anchor: { slotId: slot.id, offset: slot.children.length },
          head: { slotId: slot.id, offset: 0 },
        };
        return {
          selection: newSel,
          caret: newSel.head,
          handled: true,
          highlightedSlotId: null,
        };
      }
    }
  }

  // 4. Stage 2: Hierarchical elevation to parent composite structure
  const parentNode = findParentNodeOfSlot(root, slot.id);
  if (!parentNode) {
    return {
      selection: activeSel,
      caret: activeSel.head,
      handled: false,
      exitDirection: direction === 'ArrowRight' ? 'after' : 'before',
      highlightedSlotId: null,
    };
  }

  const enclosingSlot = findParentSlotOfNode(root, parentNode.id);
  if (!enclosingSlot) {
    return {
      selection: activeSel,
      caret: activeSel.head,
      handled: false,
      exitDirection: direction === 'ArrowRight' ? 'after' : 'before',
      highlightedSlotId: null,
    };
  }

  const pIdx = enclosingSlot.children.findIndex((c) => c.id === parentNode.id);
  if (pIdx === -1) {
    return {
      selection: activeSel,
      caret: activeSel.head,
      handled: false,
      exitDirection: direction === 'ArrowRight' ? 'after' : 'before',
      highlightedSlotId: null,
    };
  }

  if (direction === 'ArrowRight') {
    const newSel: SelectionRange = {
      anchor: { slotId: enclosingSlot.id, offset: pIdx },
      head: { slotId: enclosingSlot.id, offset: pIdx + 1 },
    };
    return {
      selection: newSel,
      caret: newSel.head,
      handled: true,
      highlightedSlotId: null,
    };
  } else {
    // ArrowLeft: Backward selection of parent structure
    const newSel: SelectionRange = {
      anchor: { slotId: enclosingSlot.id, offset: pIdx + 1 },
      head: { slotId: enclosingSlot.id, offset: pIdx },
    };
    return {
      selection: newSel,
      caret: newSel.head,
      handled: true,
      highlightedSlotId: null,
    };
  }
}

/**
 * Core selection stepper for horizontal keyboard arrow inputs (Shift+ArrowRight / Shift+ArrowLeft).
 * Guarantees atomic stepping over composite math structures without descending into child slots,
 * reversible selection traversal with collapse on head-anchor collision, and seamless boundary expansion.
 */
export function handleSelectionStep(
  root: SlotNode,
  currentSel: SelectionRange | null,
  caret: CaretPosition,
  direction: 'ArrowRight' | 'ArrowLeft',
  currentHighlightedSlotId?: string | null
): SelectionStepResult | null {
  const activeSel: SelectionRange = currentSel
    ? { anchor: { ...currentSel.anchor }, head: { ...currentSel.head } }
    : { anchor: { ...caret }, head: { ...caret } };

  const head = activeSel.head;
  const slot = findSlotById(root, head.slotId);
  if (!slot) return null;

  if (direction === 'ArrowRight') {
    if (head.offset < slot.children.length) {
      // ATOMIC STEP: Step past token OR composite structure in current slot
      const nextHead: CaretPosition = { slotId: slot.id, offset: head.offset + 1 };
      return {
        selection: { anchor: activeSel.anchor, head: nextHead },
        caret: nextHead,
        handled: true,
        highlightedSlotId: null,
      };
    } else {
      // At slot end boundary -> Hierarchical Boundary Expansion
      return handleHierarchicalBoundaryExpansion(
        root,
        activeSel,
        slot,
        'ArrowRight',
        currentHighlightedSlotId
      );
    }
  } else if (direction === 'ArrowLeft') {
    if (head.offset > 0) {
      // ATOMIC STEP: Step back past token OR composite structure in current slot
      const nextHead: CaretPosition = { slotId: slot.id, offset: head.offset - 1 };
      return {
        selection: { anchor: activeSel.anchor, head: nextHead },
        caret: nextHead,
        handled: true,
        highlightedSlotId: null,
      };
    } else {
      // At slot start boundary -> Hierarchical Boundary Expansion
      return handleHierarchicalBoundaryExpansion(
        root,
        activeSel,
        slot,
        'ArrowLeft',
        currentHighlightedSlotId
      );
    }
  }

  return null;
}

