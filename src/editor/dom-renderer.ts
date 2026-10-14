/**
 * AST to Interactive Styled DOM Renderer
 * Renders Math AST with slot IDs, caret positions, and visual box styling.
 */

import {
  MathNode,
  SlotNode,
  CaretPosition,
  SelectionRange,
} from '../core/types';

export interface RenderContext {
  caret?: CaretPosition | null;
  selection?: SelectionRange | null;
  isFocused?: boolean;
  readOnly?: boolean;
  inline?: boolean;
  document?: Document;
}

export class DomRenderer {
  private doc: Document;

  constructor(doc?: Document) {
    if (doc) {
      this.doc = doc;
    } else if (typeof document !== 'undefined') {
      this.doc = document;
    } else {
      // In headless environment without global document
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { JSDOM } = require('jsdom');
      this.doc = new JSDOM().window.document;
    }
  }

  public render(root: SlotNode, ctx: RenderContext = {}): HTMLElement {
    const rootContainer = this.doc.createElement(ctx.inline ? 'span' : 'div');
    rootContainer.className = ctx.inline ? 'word-equation-inline' : 'word-equation-block';
    rootContainer.setAttribute('contenteditable', 'false');

    const mathBox = this.doc.createElement(ctx.inline ? 'span' : 'div');
    mathBox.className = 'word-equation-math';
    mathBox.setAttribute('contenteditable', 'false');
    if (ctx.isFocused) {
      mathBox.classList.add('eq-active');
    }
    mathBox.tabIndex = ctx.readOnly ? -1 : 0;
    mathBox.setAttribute('data-equation-root', 'true');

    const renderedSlot = this.renderSlot(root, ctx);
    mathBox.appendChild(renderedSlot);
    rootContainer.appendChild(mathBox);

    return rootContainer;
  }

  public renderSlot(slot: SlotNode, ctx: RenderContext): HTMLElement {
    const slotEl = this.doc.createElement('span');
    slotEl.className = 'eq-slot';
    slotEl.setAttribute('data-slot-id', slot.id);
    slotEl.setAttribute('data-slot-role', slot.role);

    const isCaretInSlot = ctx.caret && ctx.caret.slotId === slot.id;
    const caretOffset = isCaretInSlot ? ctx.caret!.offset : -1;

    if (slot.children.length === 0) {
      const placeholder = this.doc.createElement('span');
      placeholder.className = 'eq-placeholder';
      placeholder.setAttribute('data-placeholder-for', slot.id);

      if (isCaretInSlot) {
        placeholder.classList.add('eq-focused');
        if (!ctx.readOnly) {
          const caret = this.createCaretElement();
          placeholder.textContent = '';
          placeholder.appendChild(caret);
        } else {
          placeholder.textContent = '⬚';
        }
      } else {
        placeholder.textContent = '⬚';
      }
      slotEl.appendChild(placeholder);
      return slotEl;
    }

    // Non-empty slot: insert nodes and insert caret at caretOffset
    for (let i = 0; i < slot.children.length; i++) {
      if (i === caretOffset && !ctx.readOnly) {
        slotEl.appendChild(this.createCaretElement());
      }
      const child = slot.children[i];
      const childEl = this.renderNode(child, ctx);
      slotEl.appendChild(childEl);
    }

    if (caretOffset === slot.children.length && !ctx.readOnly) {
      slotEl.appendChild(this.createCaretElement());
    }

    return slotEl;
  }

  public renderNode(node: MathNode, ctx: RenderContext): HTMLElement {
    switch (node.type) {
      case 'token':
        return this.renderToken(node);
      case 'placeholder':
        return this.renderPlaceholder(node);
      case 'fraction':
        return this.renderFraction(node, ctx);
      case 'superscript':
        return this.renderSuperscript(node, ctx);
      case 'subscript':
        return this.renderSubscript(node, ctx);
      case 'subsup':
        return this.renderSubSup(node, ctx);
      case 'radical':
        return this.renderRadical(node, ctx);
      case 'root':
        return this.renderRoot(node, ctx);
      case 'matrix':
        return this.renderMatrix(node, ctx);
      case 'fenced':
        return this.renderFenced(node, ctx);
      case 'underover':
        return this.renderUnderOver(node, ctx);
      case 'enclosed':
        return this.renderEnclosed(node, ctx);
      case 'phantom':
        return this.renderPhantom(node, ctx);
      case 'space':
        return this.renderSpace(node);
      case 'multiscripts':
        return this.renderMultiscripts(node, ctx);
    }
  }

  private renderToken(node: MathNode & { type: 'token' }): HTMLElement {
    const el = this.doc.createElement('span');
    el.className = `eq-token eq-${node.tokenKind}`;
    el.setAttribute('data-node-id', node.id);
    el.textContent = node.text;
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        el.setAttribute(`data-${k}`, v);
      }
    }
    return el;
  }

  private renderPlaceholder(node: MathNode & { type: 'placeholder' }): HTMLElement {
    const el = this.doc.createElement('span');
    el.className = 'eq-placeholder';
    el.setAttribute('data-node-id', node.id);
    el.textContent = '⬚';
    return el;
  }

  private renderFraction(
    node: MathNode & { type: 'fraction' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-fraction';
    container.setAttribute('data-node-id', node.id);

    const num = this.doc.createElement('div');
    num.className = 'eq-numerator';
    num.appendChild(this.renderSlot(node.numerator, ctx));

    const den = this.doc.createElement('div');
    den.className = 'eq-denominator';
    den.appendChild(this.renderSlot(node.denominator, ctx));

    container.appendChild(num);
    container.appendChild(den);
    return container;
  }

  private renderSuperscript(
    node: MathNode & { type: 'superscript' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-script-box';
    container.setAttribute('data-node-id', node.id);

    container.appendChild(this.renderSlot(node.base, ctx));

    const sup = this.doc.createElement('span');
    sup.className = 'eq-superscript';
    sup.appendChild(this.renderSlot(node.sup, ctx));

    container.appendChild(sup);
    return container;
  }

  private renderSubscript(
    node: MathNode & { type: 'subscript' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-script-box';
    container.setAttribute('data-node-id', node.id);

    container.appendChild(this.renderSlot(node.base, ctx));

    const sub = this.doc.createElement('span');
    sub.className = 'eq-subscript';
    sub.appendChild(this.renderSlot(node.sub, ctx));

    container.appendChild(sub);
    return container;
  }

  private renderSubSup(
    node: MathNode & { type: 'subsup' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-script-box';
    container.setAttribute('data-node-id', node.id);

    container.appendChild(this.renderSlot(node.base, ctx));

    const scriptsWrapper = this.doc.createElement('span');
    scriptsWrapper.className = 'eq-subsup-scripts';

    const sup = this.doc.createElement('span');
    sup.className = 'eq-superscript';
    sup.appendChild(this.renderSlot(node.sup, ctx));

    const sub = this.doc.createElement('span');
    sub.className = 'eq-subscript';
    sub.appendChild(this.renderSlot(node.sub, ctx));

    scriptsWrapper.appendChild(sup);
    scriptsWrapper.appendChild(sub);
    container.appendChild(scriptsWrapper);
    return container;
  }

  private createSurdElement(): HTMLElement {
    const surd = this.doc.createElement('span');
    surd.className = 'eq-radical-surd';
    surd.setAttribute('aria-hidden', 'true');
    surd.innerHTML =
      '<svg viewBox="0 0 12 24" preserveAspectRatio="none" class="eq-radical-svg">' +
      '<path d="M1 13 L3 13 L6 23 L11 1 L12 1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" stroke-linejoin="miter"/>' +
      '</svg>';
    return surd;
  }

  private renderRadical(
    node: MathNode & { type: 'radical' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-radical';
    container.setAttribute('data-node-id', node.id);

    const surd = this.createSurdElement();

    const radicand = this.doc.createElement('span');
    radicand.className = 'eq-radicand';
    radicand.appendChild(this.renderSlot(node.radicand, ctx));

    container.appendChild(surd);
    container.appendChild(radicand);
    return container;
  }

  private renderRoot(
    node: MathNode & { type: 'root' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-radical';
    container.setAttribute('data-node-id', node.id);

    const idx = this.doc.createElement('span');
    idx.className = 'eq-radical-index';
    idx.appendChild(this.renderSlot(node.index, ctx));

    const surd = this.createSurdElement();

    const radicand = this.doc.createElement('span');
    radicand.className = 'eq-radicand';
    radicand.appendChild(this.renderSlot(node.radicand, ctx));

    container.appendChild(idx);
    container.appendChild(surd);
    container.appendChild(radicand);
    return container;
  }

  private renderMatrix(
    node: MathNode & { type: 'matrix' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-matrix';
    container.setAttribute('data-node-id', node.id);

    if (node.openBracket) {
      const open = this.doc.createElement('span');
      open.className = 'eq-matrix-bracket';
      open.textContent = node.openBracket;
      container.appendChild(open);
    }

    const table = this.doc.createElement('table');
    table.className = 'eq-matrix-table';

    for (const row of node.rows) {
      const tr = this.doc.createElement('tr');
      tr.className = 'eq-matrix-row';
      for (const cell of row) {
        const td = this.doc.createElement('td');
        td.className = 'eq-matrix-cell';
        td.appendChild(this.renderSlot(cell, ctx));
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    container.appendChild(table);

    if (node.closeBracket) {
      const close = this.doc.createElement('span');
      close.className = 'eq-matrix-bracket';
      close.textContent = node.closeBracket;
      container.appendChild(close);
    }

    return container;
  }

  private renderFenced(
    node: MathNode & { type: 'fenced' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-fenced';
    container.setAttribute('data-node-id', node.id);

    if (node.open) {
      const open = this.doc.createElement('span');
      open.className = 'eq-fence-open eq-token eq-mo';
      open.textContent = node.open;
      container.appendChild(open);
    }

    container.appendChild(this.renderSlot(node.content, ctx));

    if (node.close) {
      const close = this.doc.createElement('span');
      close.className = 'eq-fence-close eq-token eq-mo';
      close.textContent = node.close;
      container.appendChild(close);
    }

    return container;
  }

  private renderUnderOver(
    node: MathNode & { type: 'underover' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-underover';
    container.setAttribute('data-node-id', node.id);
    container.style.display = 'inline-flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.verticalAlign = 'middle';

    if (node.over) {
      const overEl = this.doc.createElement('span');
      overEl.className = 'eq-over';
      overEl.style.fontSize = '0.7em';
      overEl.appendChild(this.renderSlot(node.over, ctx));
      container.appendChild(overEl);
    }

    const baseEl = this.doc.createElement('span');
    baseEl.className = 'eq-base';
    baseEl.appendChild(this.renderSlot(node.base, ctx));
    container.appendChild(baseEl);

    if (node.under) {
      const underEl = this.doc.createElement('span');
      underEl.className = 'eq-under';
      underEl.style.fontSize = '0.7em';
      underEl.appendChild(this.renderSlot(node.under, ctx));
      container.appendChild(underEl);
    }

    return container;
  }

  private renderEnclosed(
    node: MathNode & { type: 'enclosed' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = `eq-enclosed eq-enclosed-${node.notation || 'box'}`;
    container.setAttribute('data-node-id', node.id);
    container.setAttribute('data-notation', node.notation || 'box');
    container.appendChild(this.renderSlot(node.content, ctx));
    return container;
  }

  private renderPhantom(
    node: MathNode & { type: 'phantom' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-phantom';
    container.setAttribute('data-node-id', node.id);
    container.appendChild(this.renderSlot(node.content, ctx));
    return container;
  }

  private renderSpace(
    node: MathNode & { type: 'space' }
  ): HTMLElement {
    const el = this.doc.createElement('span');
    el.className = 'eq-space';
    el.setAttribute('data-node-id', node.id);
    el.style.display = 'inline-block';
    el.style.width = node.width || '1em';
    return el;
  }

  private renderMultiscripts(
    node: MathNode & { type: 'multiscripts' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.doc.createElement('span');
    container.className = 'eq-multiscripts';
    container.setAttribute('data-node-id', node.id);

    if (node.preSub || node.preSup) {
      const preBox = this.doc.createElement('span');
      preBox.className = 'eq-prescripts';
      if (node.preSup) {
        const sup = this.doc.createElement('span');
        sup.className = 'eq-superscript';
        sup.appendChild(this.renderSlot(node.preSup, ctx));
        preBox.appendChild(sup);
      }
      if (node.preSub) {
        const sub = this.doc.createElement('span');
        sub.className = 'eq-subscript';
        sub.appendChild(this.renderSlot(node.preSub, ctx));
        preBox.appendChild(sub);
      }
      container.appendChild(preBox);
    }

    container.appendChild(this.renderSlot(node.base, ctx));

    if (node.postSub || node.postSup) {
      const postBox = this.doc.createElement('span');
      postBox.className = 'eq-postscripts';
      if (node.postSup) {
        const sup = this.doc.createElement('span');
        sup.className = 'eq-superscript';
        sup.appendChild(this.renderSlot(node.postSup, ctx));
        postBox.appendChild(sup);
      }
      if (node.postSub) {
        const sub = this.doc.createElement('span');
        sub.className = 'eq-subscript';
        sub.appendChild(this.renderSlot(node.postSub, ctx));
        postBox.appendChild(sub);
      }
      container.appendChild(postBox);
    }

    return container;
  }

  private createCaretElement(): HTMLElement {
    const caret = this.doc.createElement('span');
    caret.className = 'eq-caret';
    caret.setAttribute('data-caret', 'true');
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '|';
    return caret;
  }
}

export function renderEquationDom(
  root: SlotNode,
  ctx: RenderContext = {}
): HTMLElement {
  const renderer = new DomRenderer(ctx.document);
  return renderer.render(root, ctx);
}
