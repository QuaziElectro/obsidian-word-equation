/**
 * Word-like Real-Time Shortcut Expansion Engine
 * Expands symbols, fractions, scripts, radicals, and custom shortcuts both in equation blocks and in Markdown.
 */

import {
  SlotNode,
  CaretPosition,
  ShortcutExpansionResult,
  MarkdownExpansionResult,
  MathNode,
  MATHML_NAMESPACE,
} from '../core/types';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
  cloneSlot,
  updateParentPointers,
  slotToPlainText,
} from '../core/ast';
import { parseLinearEquation } from '../core/linear-parser';
import { parseMathML } from '../core/mathml-parser';
import { lookupSymbol, SHORTCUT_MAP, getCustomShortcuts } from './catalog';

export function expandShortcutInMarkdown(
  textBefore: string
): MarkdownExpansionResult | null {
  // 1. Check custom shortcuts first (longest trigger first)
  const customList = getCustomShortcuts().slice().sort((a, b) => b.trigger.length - a.trigger.length);
  for (const item of customList) {
    const raw = item.trigger;
    if (!raw) continue;
    const stripped = raw.startsWith('\\') ? raw.slice(1) : raw;
    const candidates = Array.from(new Set([`\\${stripped}`, raw, stripped])).sort((a, b) => b.length - a.length);
    const matchedCandidate = candidates.find((cand) => textBefore.endsWith(cand));
    if (matchedCandidate) {
      const isMathML = /<math|<m[a-z]+/i.test(item.expansion);
      let replacement = item.expansion;
      if (isMathML) {
        let xml = item.expansion.trim();
        if (!xml.startsWith('<math')) {
          xml = `<math xmlns="${MATHML_NAMESPACE}" display="block">\n  ${xml}\n</math>`;
        }
        replacement = `\`\`\`math-word\n${xml}\n\`\`\``;
      }
      return {
        matched: true,
        replacement,
        triggerLength: matchedCandidate.length,
      };
    }
  }

  // 2. Check for inline triggers: /weq_inline and $weq
  if (/(?:^|\s)\/weq_inline$/.test(textBefore)) {
    return {
      matched: true,
      replacement: '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math> /weq_inline',
      triggerLength: 11,
    };
  }

  if (/(?:^|\s)\$weq$/.test(textBefore)) {
    return {
      matched: true,
      replacement: '$weq <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math> $weq',
      triggerLength: 4,
    };
  }

  // 3. Check for block triggers: $$$ and /weq
  if (/(?:^|\s)\$\$\$$/.test(textBefore)) {
    return {
      matched: true,
      replacement:
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```',
      triggerLength: 3,
    };
  }

  if (/(?:^|\s)\/weq$/.test(textBefore)) {
    return {
      matched: true,
      replacement:
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```',
      triggerLength: 4,
    };
  }

  // 4. Check for symbol trigger \<name>
  const match = textBefore.match(/\\([a-zA-Z]+)$/);
  if (match) {
    const trigger = match[0];
    const entry = SHORTCUT_MAP.get(trigger);
    if (entry) {
      return {
        matched: true,
        replacement: entry.replacement,
        triggerLength: trigger.length,
      };
    }
  }

  return null;
}

export function expandShortcutInSlot(
  slot: SlotNode,
  caretOffset: number,
  triggerKey: string
): ShortcutExpansionResult {
  const clonedSlot = cloneSlot(slot);

  // 1. Gather preceding tokens up to caretOffset
  const precedingNodes = clonedSlot.children.slice(0, caretOffset);
  if (precedingNodes.length === 0) {
    return { expanded: false };
  }

  // 2. Check for custom shortcuts first (longest trigger first)
  const customList = getCustomShortcuts().slice().sort((a, b) => b.trigger.length - a.trigger.length);
  for (const cs of customList) {
    const rawTrigger = cs.trigger;
    if (!rawTrigger) continue;
    const stripped = rawTrigger.startsWith('\\') ? rawTrigger.slice(1) : rawTrigger;
    const candidates = Array.from(new Set([`\\${stripped}`, rawTrigger, stripped])).sort(
      (a, b) => b.length - a.length
    );

    for (const candidate of candidates) {
      let collected = '';
      let count = 0;
      for (let i = precedingNodes.length - 1; i >= 0; i--) {
        const n = precedingNodes[i];
        if (n.type === 'token') {
          collected = n.text + collected;
          count++;
          if (collected.length >= candidate.length) {
            break;
          }
        } else {
          break;
        }
      }

      if (collected === candidate) {
        let startIndex = caretOffset - count;
        // Check if there is an unconsumed leading backslash immediately preceding
        if (startIndex > 0 && !candidate.startsWith('\\')) {
          const prevNode = precedingNodes[startIndex - 1];
          if (prevNode.type === 'token' && prevNode.text === '\\') {
            startIndex--;
            count++;
          }
        }

        const isMathML = /<math|<m[a-z]+/i.test(cs.expansion);

        if (isMathML) {
          let xml = cs.expansion.trim();
          if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
            xml = `<math xmlns="${MATHML_NAMESPACE}">\n  <mrow>${xml}</mrow>\n</math>`;
          } else if (!xml.includes('xmlns=')) {
            xml = xml.replace(/<math/i, `<math xmlns="${MATHML_NAMESPACE}"`);
          }
          const parsed = parseMathML(xml);
          const nodesToInsert = parsed.children.length > 0 ? parsed.children : [createToken(cs.expansion, 'mi')];
          for (const n of nodesToInsert) {
            n.parentSlotId = clonedSlot.id;
          }
          clonedSlot.children.splice(startIndex, count, ...nodesToInsert);
          updateParentPointers(clonedSlot);

          // Place new caret into the first child slot of the inserted structural box
          let newCaret: CaretPosition = { slotId: clonedSlot.id, offset: startIndex + nodesToInsert.length };
          const firstNode = nodesToInsert[0];
          if (firstNode) {
            if (firstNode.type === 'fraction') {
              newCaret = { slotId: firstNode.numerator.id, offset: 0 };
            } else if (firstNode.type === 'radical') {
              newCaret = { slotId: firstNode.radicand.id, offset: 0 };
            } else if (firstNode.type === 'root') {
              newCaret = { slotId: firstNode.radicand.id, offset: 0 };
            } else if (firstNode.type === 'superscript') {
              newCaret = { slotId: firstNode.base.id, offset: 0 };
            } else if (firstNode.type === 'subscript') {
              newCaret = { slotId: firstNode.base.id, offset: 0 };
            } else if (firstNode.type === 'subsup') {
              newCaret = { slotId: firstNode.base.id, offset: 0 };
            } else if (firstNode.type === 'fenced') {
              newCaret = { slotId: firstNode.content.id, offset: 0 };
            } else if (firstNode.type === 'underover') {
              newCaret = { slotId: firstNode.base.id, offset: 0 };
            }
          }

          return {
            expanded: true,
            newSlot: clonedSlot,
            newCaret,
            replacementText: cs.expansion,
          };
        } else {
          // String expansion: check if single grapheme cluster (e.g. 'ᾱ', '⊗', '‖') or multi-character (e.g. 'aa')
          const sym = cs.expansion;
          let nodesToInsert: MathNode[] = [];
          const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter
            ? Array.from(new Intl.Segmenter().segment(sym)).map((s) => s.segment)
            : [sym];

          if (graphemes.length <= 1) {
            const isOp = ['+', '-', '±', '×', '÷', '≤', '≥', '≠', '≈', '∈', '∑', '∏', '∫', '→', '⇒', '⇔', '⊗', '⊕', '⊙', '≊'].includes(sym);
            const tokenKind = isOp ? 'mo' : (/[0-9]/.test(sym) ? 'mn' : 'mi');
            nodesToInsert = [createToken(sym, tokenKind)];
          } else {
            const parsedLinear = parseLinearEquation(sym);
            if (parsedLinear.children.length > 0) {
              nodesToInsert = parsedLinear.children;
            } else {
              const isOp = ['+', '-', '±', '×', '÷', '≤', '≥', '≠', '≈', '∈', '∑', '∏', '∫', '→', '⇒', '⇔', '⊗', '⊕', '⊙', '≊'].includes(sym);
              const tokenKind = isOp ? 'mo' : (/[0-9]/.test(sym) ? 'mn' : 'mi');
              nodesToInsert = [createToken(sym, tokenKind)];
            }
          }

          for (const n of nodesToInsert) {
            n.parentSlotId = clonedSlot.id;
          }
          clonedSlot.children.splice(startIndex, count, ...nodesToInsert);
          updateParentPointers(clonedSlot);

          let newCaret: CaretPosition = { slotId: clonedSlot.id, offset: startIndex + nodesToInsert.length };
          const firstNode = nodesToInsert[0];
          if (firstNode && (firstNode.type === 'fraction' || firstNode.type === 'radical' || firstNode.type === 'root')) {
            if (firstNode.type === 'fraction') {
              newCaret = { slotId: firstNode.numerator.id, offset: 0 };
            } else {
              newCaret = { slotId: firstNode.radicand.id, offset: 0 };
            }
          }

          return {
            expanded: true,
            newSlot: clonedSlot,
            newCaret,
            replacementText: cs.expansion,
          };
        }
      }
    }
  }

  // 3. For non-custom shortcuts, only expand on Space or Enter delimiter
  if (triggerKey !== ' ' && triggerKey !== 'Enter') {
    return { expanded: false };
  }

  // 3. Check for simple symbol expansion e.g. \alpha, \pm, \infty
  let buffer = '';
  let tokenCount = 0;
  for (let i = precedingNodes.length - 1; i >= 0; i--) {
    const n = precedingNodes[i];
    if (n.type === 'token') {
      buffer = n.text + buffer;
      tokenCount++;
      if (buffer.startsWith('\\')) {
        break;
      }
    } else {
      break;
    }
  }

  if (buffer.startsWith('\\')) {
    const sym = lookupSymbol(buffer);
    if (sym) {
      const startIndex = caretOffset - tokenCount;
      const isOp = ['+', '-', '±', '×', '÷', '≤', '≥', '≠', '≈', '∈', '∑', '∏', '∫', '→', '⇒', '⇔'].includes(sym);
      const tokenKind = isOp ? 'mo' : 'mi';
      const replacementToken = createToken(sym, tokenKind);

      clonedSlot.children.splice(startIndex, tokenCount, replacementToken);
      updateParentPointers(clonedSlot);

      return {
        expanded: true,
        newSlot: clonedSlot,
        newCaret: { slotId: clonedSlot.id, offset: startIndex + 1 },
        replacementText: sym,
      };
    }
  }

  // 4. Structural expansions on Space:
  // Convert preceding tokens buffer to text and check if it forms a linear equation expression
  // e.g. (a+b)/(c+d), x^2, x_i, \sqrt(x)
  const fullText = slotToPlainText(clonedSlot);
  const parsedLinear = parseLinearEquation(fullText);

  if (
    parsedLinear.children.length > 0 &&
    parsedLinear.children.some((n) => n.type !== 'token')
  ) {
    // A structural element was formed!
    clonedSlot.children = parsedLinear.children;
    updateParentPointers(clonedSlot);

    return {
      expanded: true,
      newSlot: clonedSlot,
      newCaret: { slotId: clonedSlot.id, offset: clonedSlot.children.length },
    };
  }

  return { expanded: false };
}

