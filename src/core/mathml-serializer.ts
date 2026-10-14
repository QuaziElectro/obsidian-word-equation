/**
 * Standard Presentation MathML XML Serializer
 * Converts Math AST to valid, clean W3C MathML XML.
 */

import {
  MathNode,
  SlotNode,
  MATHML_NAMESPACE,
} from './types';

export interface SerializeOptions {
  display?: 'block' | 'inline';
  pretty?: boolean;
  indentStep?: string;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeMathML(
  root: SlotNode,
  options: SerializeOptions = {}
): string {
  const display = options.display || 'block';
  const pretty = options.pretty ?? true;
  const indentStep = options.indentStep || '  ';

  function serializeSlotChildren(slot: SlotNode, indentLevel: number): string {
    if (slot.children.length === 0) {
      return '';
    }

    const items: string[] = [];
    for (const child of slot.children) {
      items.push(serializeNode(child, indentLevel));
    }

    if (pretty) {
      return items.join('\n');
    }
    return items.join('');
  }

  function serializeSlotAsSingleElement(
    slot: SlotNode,
    indentLevel: number
  ): string {
    if (slot.children.length === 0) {
      const pad = pretty ? indentStep.repeat(indentLevel) : '';
      return `${pad}<mrow></mrow>`;
    }
    if (slot.children.length === 1) {
      return serializeNode(slot.children[0], indentLevel);
    }
    const pad = pretty ? indentStep.repeat(indentLevel) : '';
    const inner = serializeSlotChildren(slot, indentLevel + 1);
    if (pretty) {
      return `${pad}<mrow>\n${inner}\n${pad}</mrow>`;
    }
    return `<mrow>${inner}</mrow>`;
  }

  function serializeNode(node: MathNode, indentLevel: number): string {
    const pad = pretty ? indentStep.repeat(indentLevel) : '';
    const padChild = pretty ? indentStep.repeat(indentLevel + 1) : '';

    switch (node.type) {
      case 'token': {
        let attrStr = '';
        if (node.attributes) {
          for (const [k, v] of Object.entries(node.attributes)) {
            attrStr += ` ${k}="${escapeXml(v)}"`;
          }
        }
        return `${pad}<${node.tokenKind}${attrStr}>${escapeXml(node.text)}</${node.tokenKind}>`;
      }

      case 'placeholder': {
        return `${pad}<mrow></mrow>`;
      }

      case 'fraction': {
        const thicknessAttr = node.linethickness
          ? ` linethickness="${escapeXml(node.linethickness)}"`
          : '';
        const num = serializeSlotAsSingleElement(node.numerator, indentLevel + 1);
        const den = serializeSlotAsSingleElement(
          node.denominator,
          indentLevel + 1
        );
        if (pretty) {
          return `${pad}<mfrac${thicknessAttr}>\n${num}\n${den}\n${pad}</mfrac>`;
        }
        return `<mfrac${thicknessAttr}>${num}${den}</mfrac>`;
      }

      case 'superscript': {
        const base = serializeSlotAsSingleElement(node.base, indentLevel + 1);
        const sup = serializeSlotAsSingleElement(node.sup, indentLevel + 1);
        if (pretty) {
          return `${pad}<msup>\n${base}\n${sup}\n${pad}</msup>`;
        }
        return `<msup>${base}${sup}</msup>`;
      }

      case 'subscript': {
        const base = serializeSlotAsSingleElement(node.base, indentLevel + 1);
        const sub = serializeSlotAsSingleElement(node.sub, indentLevel + 1);
        if (pretty) {
          return `${pad}<msub>\n${base}\n${sub}\n${pad}</msub>`;
        }
        return `<msub>${base}${sub}</msub>`;
      }

      case 'subsup': {
        const base = serializeSlotAsSingleElement(node.base, indentLevel + 1);
        const sub = serializeSlotAsSingleElement(node.sub, indentLevel + 1);
        const sup = serializeSlotAsSingleElement(node.sup, indentLevel + 1);
        if (pretty) {
          return `${pad}<msubsup>\n${base}\n${sub}\n${sup}\n${pad}</msubsup>`;
        }
        return `<msubsup>${base}${sub}${sup}</msubsup>`;
      }

      case 'radical': {
        const radContent = serializeSlotChildren(node.radicand, indentLevel + 1);
        if (pretty) {
          return `${pad}<msqrt>\n${radContent}\n${pad}</msqrt>`;
        }
        return `<msqrt>${radContent}</msqrt>`;
      }

      case 'root': {
        const rad = serializeSlotAsSingleElement(node.radicand, indentLevel + 1);
        const idx = serializeSlotAsSingleElement(node.index, indentLevel + 1);
        if (pretty) {
          return `${pad}<mroot>\n${rad}\n${idx}\n${pad}</mroot>`;
        }
        return `<mroot>${rad}${idx}</mroot>`;
      }

      case 'matrix': {
        const rowsOutput: string[] = [];
        for (const row of node.rows) {
          const cellsOutput: string[] = [];
          for (const cell of row) {
            const cellContent = serializeSlotAsSingleElement(
              cell,
              indentLevel + 3
            );
            if (pretty) {
              cellsOutput.push(
                `${indentStep.repeat(indentLevel + 2)}<mtd>\n${cellContent}\n${indentStep.repeat(indentLevel + 2)}</mtd>`
              );
            } else {
              cellsOutput.push(`<mtd>${cellContent}</mtd>`);
            }
          }
          if (pretty) {
            rowsOutput.push(
              `${indentStep.repeat(indentLevel + 1)}<mtr>\n${cellsOutput.join('\n')}\n${indentStep.repeat(indentLevel + 1)}</mtr>`
            );
          } else {
            rowsOutput.push(`<mtr>${cellsOutput.join('')}</mtr>`);
          }
        }

        const table = pretty
          ? `${padChild}<mtable>\n${rowsOutput.join('\n')}\n${padChild}</mtable>`
          : `<mtable>${rowsOutput.join('')}</mtable>`;

        if (node.openBracket || node.closeBracket) {
          const open = escapeXml(node.openBracket || '(');
          const close = escapeXml(node.closeBracket || ')');
          if (pretty) {
            return `${pad}<mrow>\n${padChild}<mo fence="true" stretchy="true">${open}</mo>\n${table}\n${padChild}<mo fence="true" stretchy="true">${close}</mo>\n${pad}</mrow>`;
          }
          return `<mrow><mo fence="true" stretchy="true">${open}</mo>${table}<mo fence="true" stretchy="true">${close}</mo></mrow>`;
        }
        return table;
      }

      case 'fenced': {
        const content = serializeSlotChildren(node.content, indentLevel + 1);
        if (!node.open && !node.close) {
          if (pretty) {
            return `${pad}<mrow>\n${content}\n${pad}</mrow>`;
          }
          return `<mrow>${content}</mrow>`;
        }
        const open = escapeXml(node.open);
        const close = escapeXml(node.close);
        if (pretty) {
          return `${pad}<mrow>\n${padChild}<mo fence="true" stretchy="true">${open}</mo>\n${content}\n${padChild}<mo fence="true" stretchy="true">${close}</mo>\n${pad}</mrow>`;
        }
        return `<mrow><mo fence="true" stretchy="true">${open}</mo>${content}<mo fence="true" stretchy="true">${close}</mo></mrow>`;
      }

      case 'underover': {
        const accentAttr = node.accent ? ' accent="true"' : '';
        const base = serializeSlotAsSingleElement(node.base, indentLevel + 1);

        if (node.under && node.over) {
          const under = serializeSlotAsSingleElement(node.under, indentLevel + 1);
          const over = serializeSlotAsSingleElement(node.over, indentLevel + 1);
          if (pretty) {
            return `${pad}<munderover${accentAttr}>\n${base}\n${under}\n${over}\n${pad}</munderover>`;
          }
          return `<munderover${accentAttr}>${base}${under}${over}</munderover>`;
        } else if (node.over) {
          const over = serializeSlotAsSingleElement(node.over, indentLevel + 1);
          if (pretty) {
            return `${pad}<mover${accentAttr}>\n${base}\n${over}\n${pad}</mover>`;
          }
          return `<mover${accentAttr}>${base}${over}</mover>`;
        } else if (node.under) {
          const under = serializeSlotAsSingleElement(node.under, indentLevel + 1);
          if (pretty) {
            return `${pad}<munder${accentAttr}>\n${base}\n${under}\n${pad}</munder>`;
          }
          return `<munder${accentAttr}>${base}${under}</munder>`;
        }
        return base;
      }

      case 'enclosed': {
        const notation = escapeXml(node.notation || 'box');
        const content = serializeSlotAsSingleElement(node.content, indentLevel + 1);
        if (pretty) {
          return `${pad}<menclose notation="${notation}">\n${content}\n${pad}</menclose>`;
        }
        return `<menclose notation="${notation}">${content}</menclose>`;
      }

      case 'phantom': {
        const content = serializeSlotAsSingleElement(node.content, indentLevel + 1);
        if (pretty) {
          return `${pad}<mphantom>\n${content}\n${pad}</mphantom>`;
        }
        return `<mphantom>${content}</mphantom>`;
      }

      case 'space': {
        const width = escapeXml(node.width || '1em');
        return `${pad}<mspace width="${width}"/>`;
      }

      case 'multiscripts': {
        const base = serializeSlotAsSingleElement(node.base, indentLevel + 1);
        const postSub = node.postSub ? serializeSlotAsSingleElement(node.postSub, indentLevel + 1) : `${padChild}<none/>`;
        const postSup = node.postSup ? serializeSlotAsSingleElement(node.postSup, indentLevel + 1) : `${padChild}<none/>`;
        let prescriptsPart = '';
        if (node.preSub || node.preSup) {
          const preSub = node.preSub ? serializeSlotAsSingleElement(node.preSub, indentLevel + 1) : `${padChild}<none/>`;
          const preSup = node.preSup ? serializeSlotAsSingleElement(node.preSup, indentLevel + 1) : `${padChild}<none/>`;
          prescriptsPart = pretty
            ? `\n${padChild}<mprescripts/>\n${preSub}\n${preSup}`
            : `<mprescripts/>${preSub}${preSup}`;
        }
        if (pretty) {
          return `${pad}<mmultiscripts>\n${base}\n${postSub}\n${postSup}${prescriptsPart}\n${pad}</mmultiscripts>`;
        }
        return `<mmultiscripts>${base}${postSub}${postSup}${prescriptsPart}</mmultiscripts>`;
      }
    }
  }

  const rootChildren = serializeSlotChildren(root, 1);
  if (pretty) {
    return `<math xmlns="${MATHML_NAMESPACE}" display="${display}">\n${rootChildren}\n</math>`;
  }
  return `<math xmlns="${MATHML_NAMESPACE}" display="${display}">${rootChildren}</math>`;
}
