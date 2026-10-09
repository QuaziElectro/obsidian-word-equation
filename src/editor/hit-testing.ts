/**
 * Mouse Hit-Testing & Coordinate-to-Caret Mapping
 * Maps mouse click coordinates (x, y) and clicked target elements to exact AST SlotNode and caret offset.
 */

import { SlotNode, CaretPosition, FractionNode, RadicalNode, RootNode } from '../core/types';
import { findSlotById, findNodeById } from '../core/ast';

export function handleMouseClick(
  root: SlotNode,
  rootEl: HTMLElement,
  clickX: number,
  clickY: number,
  explicitTarget?: HTMLElement | null
): CaretPosition {
  // 1. Resolve clicked target element
  let targetEl: HTMLElement | null =
    explicitTarget && typeof Node !== 'undefined' && explicitTarget instanceof Node && explicitTarget instanceof Element
      ? (explicitTarget as HTMLElement)
      : null;
  if (!targetEl && typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
    const el = document.elementFromPoint(clickX, clickY) as HTMLElement | null;
    if (el && typeof Node !== 'undefined' && el instanceof Node && rootEl.contains(el)) {
      targetEl = el;
    }
  }

  // 2. If targetEl was found inside rootEl, evaluate target element hierarchy
  if (targetEl && typeof Node !== 'undefined' && targetEl instanceof Node && rootEl.contains(targetEl)) {
    // (a) Clicked directly on placeholder box
    const placeholder = targetEl.closest('.eq-placeholder') as HTMLElement | null;
    if (placeholder) {
      const slotId = placeholder.getAttribute('data-placeholder-for');
      if (slotId && findSlotById(root, slotId)) {
        return { slotId, offset: 0 };
      }
      const slotEl = placeholder.closest('.eq-slot') as HTMLElement | null;
      const parentSlotId = slotEl?.getAttribute('data-slot-id');
      if (parentSlotId && findSlotById(root, parentSlotId)) {
        return { slotId: parentSlotId, offset: 0 };
      }
    }

    // (b) Clicked directly on a token (.eq-token with data-node-id)
    const tokenEl = targetEl.closest('.eq-token') as HTMLElement | null;
    if (tokenEl) {
      const slotEl = tokenEl.closest('.eq-slot') as HTMLElement | null;
      const nodeId = tokenEl.getAttribute('data-node-id');
      const slotId = slotEl?.getAttribute('data-slot-id');

      if (slotId && nodeId) {
        const slot = findSlotById(root, slotId);
        if (slot) {
          const nodeIndex = slot.children.findIndex((c) => c.id === nodeId);
          if (nodeIndex !== -1) {
            const rect = tokenEl.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            const offset = clickX <= midX ? nodeIndex : nodeIndex + 1;
            return { slotId: slot.id, offset };
          }
        }
      }
    }

    // (c) Clicked directly inside a slot
    const slotEl = targetEl.closest('.eq-slot') as HTMLElement | null;
    if (slotEl) {
      // Check if targetEl is a structural element or wrapper that belongs outside this slot
      // e.g. clicking on .eq-fraction-bar, .eq-radical-surd, or td.eq-matrix-cell where slotEl is the parent container
      const structEl = targetEl.closest('.eq-fraction, .eq-radical, .eq-matrix-cell, .eq-superscript, .eq-subscript, .eq-under, .eq-over') as HTMLElement | null;
      const isStructCloser = Boolean(structEl && slotEl.contains(structEl) && structEl !== slotEl);

      if (!isStructCloser) {
        const slotId = slotEl.getAttribute('data-slot-id');
        if (slotId) {
          const slot = findSlotById(root, slotId);
          if (slot) {
            if (slot.children.length === 0) {
              return { slotId: slot.id, offset: 0 };
            }
            const offset = calculateOffsetInSlot(slotEl, slot, clickX);
            return { slotId: slot.id, offset };
          }
        }
      }
    }

    // (d) Clicked on structural boxes: fraction, radical, script, matrix
    const fracEl = targetEl.closest('.eq-fraction') as HTMLElement | null;
    if (fracEl) {
      const fracId = fracEl.getAttribute('data-node-id');
      const fracNode = fracId ? (findNodeById(root, fracId) as FractionNode | null) : null;
      if (fracNode && fracNode.type === 'fraction') {
        const numEl = fracEl.querySelector('.eq-numerator') as HTMLElement | null;
        const denEl = fracEl.querySelector('.eq-denominator') as HTMLElement | null;
        if (numEl && denEl) {
          const numRect = numEl.getBoundingClientRect();
          const denRect = denEl.getBoundingClientRect();
          const numCenterY = numRect.top + numRect.height / 2;
          const denCenterY = denRect.top + denRect.height / 2;
          if (Math.abs(clickY - numCenterY) <= Math.abs(clickY - denCenterY)) {
            const slotEl = numEl.querySelector('.eq-slot') as HTMLElement | null;
            return {
              slotId: fracNode.numerator.id,
              offset: slotEl ? calculateOffsetInSlot(slotEl, fracNode.numerator, clickX) : 0,
            };
          } else {
            const slotEl = denEl.querySelector('.eq-slot') as HTMLElement | null;
            return {
              slotId: fracNode.denominator.id,
              offset: slotEl ? calculateOffsetInSlot(slotEl, fracNode.denominator, clickX) : 0,
            };
          }
        }
      }
    }

    const radEl = targetEl.closest('.eq-radical') as HTMLElement | null;
    if (radEl) {
      const radId = radEl.getAttribute('data-node-id');
      const radNode = radId ? (findNodeById(root, radId) as RadicalNode | RootNode | null) : null;
      if (radNode) {
        if (radNode.type === 'radical') {
          const slotEl = radEl.querySelector('.eq-radicand .eq-slot') as HTMLElement | null;
          return {
            slotId: radNode.radicand.id,
            offset: slotEl ? calculateOffsetInSlot(slotEl, radNode.radicand, clickX) : 0,
          };
        } else if (radNode.type === 'root') {
          const idxEl = radEl.querySelector('.eq-radical-index .eq-slot') as HTMLElement | null;
          const radElSlot = radEl.querySelector('.eq-radicand .eq-slot') as HTMLElement | null;
          if (idxEl && (idxEl.contains(targetEl) || targetEl.closest('.eq-radical-index'))) {
            return {
              slotId: radNode.index.id,
              offset: calculateOffsetInSlot(idxEl, radNode.index, clickX),
            };
          }
          return {
            slotId: radNode.radicand.id,
            offset: radElSlot ? calculateOffsetInSlot(radElSlot, radNode.radicand, clickX) : 0,
          };
        }
      }
    }

    const supEl = targetEl.closest('.eq-superscript') as HTMLElement | null;
    if (supEl) {
      const slotEl = supEl.querySelector('.eq-slot') as HTMLElement | null;
      const slotId = slotEl?.getAttribute('data-slot-id');
      if (slotEl && slotId) {
        const slot = findSlotById(root, slotId);
        if (slot) {
          return { slotId: slot.id, offset: calculateOffsetInSlot(slotEl, slot, clickX) };
        }
      }
    }

    const subEl = targetEl.closest('.eq-subscript') as HTMLElement | null;
    if (subEl) {
      const slotEl = subEl.querySelector('.eq-slot') as HTMLElement | null;
      const slotId = slotEl?.getAttribute('data-slot-id');
      if (slotEl && slotId) {
        const slot = findSlotById(root, slotId);
        if (slot) {
          return { slotId: slot.id, offset: calculateOffsetInSlot(slotEl, slot, clickX) };
        }
      }
    }

    const cellEl = targetEl.closest('.eq-matrix-cell') as HTMLElement | null;
    if (cellEl) {
      const slotEl = cellEl.querySelector('.eq-slot') as HTMLElement | null;
      const slotId = slotEl?.getAttribute('data-slot-id');
      if (slotEl && slotId) {
        const slot = findSlotById(root, slotId);
        if (slot) {
          return { slotId: slot.id, offset: calculateOffsetInSlot(slotEl, slot, clickX) };
        }
      }
    }

    // (e) Fallback: Clicked inside a slot (if structural handler fell through)
    const fallbackSlotEl = targetEl.closest('.eq-slot') as HTMLElement | null;
    if (fallbackSlotEl) {
      const slotId = fallbackSlotEl.getAttribute('data-slot-id');
      if (slotId) {
        const slot = findSlotById(root, slotId);
        if (slot) {
          if (slot.children.length === 0) {
            return { slotId: slot.id, offset: 0 };
          }
          const offset = calculateOffsetInSlot(fallbackSlotEl, slot, clickX);
          return { slotId: slot.id, offset };
        }
      }
    }
  }

  // 3. Fallback: Geometric containment (point-in-rect) - pick the innermost slot (smallest area)
  const allSlotEls = Array.from(rootEl.querySelectorAll('.eq-slot')) as HTMLElement[];
  const containingSlots: { slotEl: HTMLElement; slot: SlotNode; area: number }[] = [];

  for (const sEl of allSlotEls) {
    const rect = sEl.getBoundingClientRect();
    if (
      clickX >= rect.left &&
      clickX <= rect.right &&
      clickY >= rect.top &&
      clickY <= rect.bottom
    ) {
      const sId = sEl.getAttribute('data-slot-id');
      const s = sId ? findSlotById(root, sId) : null;
      if (s) {
        containingSlots.push({ slotEl: sEl, slot: s, area: rect.width * rect.height });
      }
    }
  }

  if (containingSlots.length > 0) {
    containingSlots.sort((a, b) => a.area - b.area);
    const best = containingSlots[0];
    return { slotId: best.slot.id, offset: calculateOffsetInSlot(best.slotEl, best.slot, clickX) };
  }

  // 4. Fallback: Full 2D boundary clamping when clicked/dragged outside root bounds
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
      if (clickY < rootRect.top) {
        return { slotId: root.id, offset: 0 };
      }
      if (clickY > rootRect.bottom) {
        return { slotId: root.id, offset: root.children.length };
      }
    }
  }

  // 5. Fallback: Closest slot by distance to rectangle boundary
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
  const slot = findSlotById(root, slotId) || root;
  const offset = calculateOffsetInSlot(bestSlotEl, slot, clickX);

  return { slotId: slot.id, offset };
}

function calculateOffsetInSlot(
  slotEl: HTMLElement,
  slot: SlotNode,
  clickX: number
): number {
  if (slot.children.length === 0) {
    return 0;
  }

  const childEls = Array.from(slotEl.children).filter(
    (el) => !el.classList.contains('eq-caret') && !el.classList.contains('eq-placeholder')
  ) as HTMLElement[];

  if (childEls.length === 0) {
    return 0;
  }

  // Check if click is before the first element
  const firstRect = childEls[0].getBoundingClientRect();
  if (clickX <= firstRect.left) {
    return 0;
  }

  // Check if click is after the last element
  const lastRect = childEls[childEls.length - 1].getBoundingClientRect();
  if (clickX >= lastRect.right) {
    return slot.children.length;
  }

  // Find the child element whose bounds or midpoint contains clickX
  for (let i = 0; i < childEls.length; i++) {
    const rect = childEls[i].getBoundingClientRect();
    if (clickX >= rect.left && clickX <= rect.right) {
      const textLen = childEls[i].textContent?.length || 1;
      if (textLen > 1) {
        const charWidth = rect.width / textLen;
        const relX = clickX - rect.left;
        const charOffset = Math.round(relX / charWidth);
        return charOffset <= 0 ? i : i + 1;
      }
      const midX = rect.left + rect.width / 2;
      return clickX <= midX ? i : i + 1;
    }
  }

  return slot.children.length;
}

