/**
 * Robust MathML XML -> Math AST Parser
 * Conforms to W3C MathML Core specification.
 */

import {
  MathNode,
  SlotNode,
} from './types';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
  createRoot,
  createMatrix,
  createFenced,
  createUnderOver,
  updateParentPointers,
} from './ast';

let nodeDOMParser: any = null;

function getDOMParserInstance(): DOMParser | null {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser();
  }
  if (nodeDOMParser) {
    return nodeDOMParser;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- Dynamic require of jsdom in headless testing environments where DOMParser is not globally available
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM();
    nodeDOMParser = new dom.window.DOMParser();
    return nodeDOMParser;
  } catch {
    return null;
  }
}

/**
 * Parses a MathML XML string into an editable SlotNode AST.
 */
export function parseMathML(xml: string): SlotNode {
  const trimmed = xml.trim();
  if (!trimmed) {
    return createSlot('root', []);
  }

  const parser = getDOMParserInstance();
  if (!parser) {
    return fallbackParse(trimmed);
  }

  let doc: Document;
  try {
    let cleanXml = trimmed;
    if (!cleanXml.startsWith('<math') && !cleanXml.startsWith('<?xml')) {
      cleanXml = `<math xmlns="http://www.w3.org/1998/Math/MathML">${cleanXml}</math>`;
    }
    doc = parser.parseFromString(cleanXml, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      // Try text/html parser as second chance
      doc = parser.parseFromString(cleanXml, 'text/html');
    }
  } catch {
    return fallbackParse(trimmed);
  }

  const mathEl =
    doc.querySelector('math') || doc.body?.firstElementChild || doc.documentElement;

  if (!mathEl) {
    return createSlot('root', []);
  }

  const rootSlot = createSlot('root', []);
  parseChildrenIntoSlot(mathEl, rootSlot);
  updateParentPointers(rootSlot);
  return rootSlot;
}

function parseChildrenIntoSlot(element: Element, targetSlot: SlotNode): void {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === 3) {
      // Text node
      const txt = child.textContent?.trim();
      if (txt) {
        targetSlot.children.push(createToken(txt, 'mtext'));
      }
    } else if (child.nodeType === 1) {
      const el = child as Element;
      const parsedNode = parseElement(el);
      if (parsedNode) {
        if (Array.isArray(parsedNode)) {
          for (const n of parsedNode) {
            targetSlot.children.push(n);
          }
        } else {
          targetSlot.children.push(parsedNode);
        }
      }
    }
  }
}

function parseElement(el: Element): MathNode | MathNode[] | null {
  const tag = el.localName?.toLowerCase() || el.tagName.toLowerCase();

  switch (tag) {
    case 'math': {
      const slot = createSlot('root', []);
      parseChildrenIntoSlot(el, slot);
      return slot.children;
    }

    case 'mrow': {
      const tempSlot = createSlot('root', []);
      parseChildrenIntoSlot(el, tempSlot);
      return tempSlot.children;
    }

    case 'mi': {
      const text = el.textContent || '';
      const attrs = extractAttributes(el);
      return createToken(text, 'mi', attrs);
    }

    case 'mn': {
      const text = el.textContent || '';
      const attrs = extractAttributes(el);
      return createToken(text, 'mn', attrs);
    }

    case 'mo': {
      const text = el.textContent || '';
      const attrs = extractAttributes(el);
      return createToken(text, 'mo', attrs);
    }

    case 'mtext': {
      const text = el.textContent || '';
      const attrs = extractAttributes(el);
      return createToken(text, 'mtext', attrs);
    }

    case 'mfrac': {
      const children = getElementChildNodes(el);
      const numSlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', []);
      if (children[0]) parseIntoSlot(children[0], numSlot);
      if (children[1]) parseIntoSlot(children[1], denSlot);
      const thickness = el.getAttribute('linethickness') || undefined;
      return createFraction(numSlot, denSlot, thickness);
    }

    case 'msup': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const supSlot = createSlot('sup', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], supSlot);
      return createSuperscript(baseSlot, supSlot);
    }

    case 'msub': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const subSlot = createSlot('sub', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], subSlot);
      return createSubscript(baseSlot, subSlot);
    }

    case 'msubsup': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const subSlot = createSlot('sub', []);
      const supSlot = createSlot('sup', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], subSlot);
      if (children[2]) parseIntoSlot(children[2], supSlot);
      return createSubSup(baseSlot, subSlot, supSlot);
    }

    case 'msqrt': {
      const radicandSlot = createSlot('radicand', []);
      parseChildrenIntoSlot(el, radicandSlot);
      return createRadical(radicandSlot);
    }

    case 'mroot': {
      const children = getElementChildNodes(el);
      const radicandSlot = createSlot('radicand', []);
      const indexSlot = createSlot('index', []);
      if (children[0]) parseIntoSlot(children[0], radicandSlot);
      if (children[1]) parseIntoSlot(children[1], indexSlot);
      return createRoot(radicandSlot, indexSlot);
    }

    case 'mtable': {
      const rowElements = Array.from(el.children).filter(
        (c) => (c.localName || c.tagName).toLowerCase() === 'mtr'
      );
      const rows: SlotNode[][] = [];
      for (const rowEl of rowElements) {
        const cellElements = Array.from(rowEl.children).filter(
          (c) => (c.localName || c.tagName).toLowerCase() === 'mtd'
        );
        const rowSlots: SlotNode[] = [];
        for (const cellEl of cellElements) {
          const cellSlot = createSlot('cell', []);
          parseChildrenIntoSlot(cellEl, cellSlot);
          rowSlots.push(cellSlot);
        }
        if (rowSlots.length > 0) {
          rows.push(rowSlots);
        }
      }
      if (rows.length === 0) {
        rows.push([createSlot('cell', [])]);
      }
      return createMatrix(rows);
    }

    case 'mfenced': {
      const open = el.getAttribute('open') ?? '(';
      const close = el.getAttribute('close') ?? ')';
      const contentSlot = createSlot('fenced', []);
      parseChildrenIntoSlot(el, contentSlot);
      return createFenced(contentSlot, open, close);
    }

    case 'mover': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const overSlot = createSlot('over', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], overSlot);
      const accent = el.getAttribute('accent') === 'true';
      return createUnderOver(baseSlot, undefined, overSlot, accent);
    }

    case 'munder': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const underSlot = createSlot('under', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], underSlot);
      const accent = el.getAttribute('accentunder') === 'true';
      return createUnderOver(baseSlot, underSlot, undefined, accent);
    }

    case 'munderover': {
      const children = getElementChildNodes(el);
      const baseSlot = createSlot('base', []);
      const underSlot = createSlot('under', []);
      const overSlot = createSlot('over', []);
      if (children[0]) parseIntoSlot(children[0], baseSlot);
      if (children[1]) parseIntoSlot(children[1], underSlot);
      if (children[2]) parseIntoSlot(children[2], overSlot);
      const accent =
        el.getAttribute('accent') === 'true' ||
        el.getAttribute('accentunder') === 'true';
      return createUnderOver(baseSlot, underSlot, overSlot, accent);
    }

    case 'mpadded':
    case 'mstyle':
    case 'semantics': {
      const tempSlot = createSlot('root', []);
      parseChildrenIntoSlot(el, tempSlot);
      return tempSlot.children;
    }

    default: {
      // Unknown element, extract text content or wrap
      const text = el.textContent?.trim();
      if (text) {
        return createToken(text, 'mtext');
      }
      return null;
    }
  }
}

function parseIntoSlot(el: Element, slot: SlotNode): void {
  const tag = (el.localName || el.tagName).toLowerCase();
  if (tag === 'mrow') {
    parseChildrenIntoSlot(el, slot);
  } else {
    const parsed = parseElement(el);
    if (parsed) {
      if (Array.isArray(parsed)) {
        for (const n of parsed) slot.children.push(n);
      } else {
        slot.children.push(parsed);
      }
    }
  }
}

function getElementChildNodes(el: Element): Element[] {
  return Array.from(el.children);
}

function extractAttributes(el: Element): Record<string, string> | undefined {
  if (!el.attributes || el.attributes.length === 0) return undefined;
  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name !== 'xmlns') {
      attrs[attr.name] = attr.value;
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/**
 * Fallback parser for regex/string extraction when XML DOM parser is completely unavailable.
 */
function fallbackParse(xml: string): SlotNode {
  const root = createSlot('root', []);
  const clean = xml.replace(/<math[^>]*>/i, '').replace(/<\/math>/i, '');
  if (!clean.trim()) return root;

  // Basic regex match for common tags
  const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>/gis;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(clean)) !== null) {
    const tag = match[1].toLowerCase();
    const content = match[3];
    if (tag === 'mi') {
      root.children.push(createToken(content, 'mi'));
    } else if (tag === 'mn') {
      root.children.push(createToken(content, 'mn'));
    } else if (tag === 'mo') {
      root.children.push(createToken(content, 'mo'));
    } else if (tag === 'mtext') {
      root.children.push(createToken(content, 'mtext'));
    }
  }

  if (root.children.length === 0) {
    // Strip tags and insert as text
    const stripped = clean.replace(/<[^>]+>/g, '').trim();
    if (stripped) {
      root.children.push(createToken(stripped, 'mtext'));
    }
  }

  updateParentPointers(root);
  return root;
}
