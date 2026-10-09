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
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- Dynamic require of jsdom in headless testing environments where document is not globally available
      const { JSDOM } = require('jsdom');
      this.doc = new JSDOM().window.document;
    }
  }

  private createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: { cls?: string; attr?: Record<string, string>; text?: string }
  ): HTMLElementTagNameMap[K] {
    if (typeof (this.doc as any).createEl === 'function') {
      return (this.doc as any).createEl(tag, o);
    }
    const el = this.doc.createElement(tag);
    if (o?.cls) el.className = o.cls;
    if (o?.text) el.textContent = o.text;
    if (o?.attr) {
      for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
    }
    return el;
  }

  public render(root: SlotNode, ctx: RenderContext = {}): HTMLElement {
    const rootContainer = this.createEl(ctx.inline ? 'span' : 'div', {
      cls: ctx.inline ? 'word-equation-inline' : 'word-equation-block',
      attr: { contenteditable: 'false' },
    });

    const mathBox = this.createEl(ctx.inline ? 'span' : 'div', {
      cls: 'word-equation-math',
      attr: { contenteditable: 'false', 'data-equation-root': 'true' },
    });
    if (ctx.isFocused) {
      mathBox.classList.add('eq-active');
    }
    mathBox.tabIndex = ctx.readOnly ? -1 : 0;

    const renderedSlot = this.renderSlot(root, ctx);
    mathBox.appendChild(renderedSlot);
    rootContainer.appendChild(mathBox);

    return rootContainer;
  }

  public renderSlot(slot: SlotNode, ctx: RenderContext): HTMLElement {
    const slotEl = this.createEl('span', {
      cls: 'eq-slot',
      attr: { 'data-slot-id': slot.id, 'data-slot-role': slot.role },
    });

    const isCaretInSlot = ctx.caret && ctx.caret.slotId === slot.id;
    const caretOffset = isCaretInSlot ? ctx.caret!.offset : -1;

    if (slot.children.length === 0) {
      const placeholder = this.createEl('span', {
        cls: 'eq-placeholder',
        attr: { 'data-placeholder-for': slot.id },
      });

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
    }
  }

  private renderToken(node: MathNode & { type: 'token' }): HTMLElement {
    const el = this.createEl('span', {
      cls: `eq-token eq-${node.tokenKind}`,
      attr: { 'data-node-id': node.id },
      text: node.text,
    });
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        el.setAttribute(`data-${k}`, v);
      }
    }
    return el;
  }

  private renderPlaceholder(node: MathNode & { type: 'placeholder' }): HTMLElement {
    return this.createEl('span', {
      cls: 'eq-placeholder',
      attr: { 'data-node-id': node.id },
      text: '⬚',
    });
  }

  private renderFraction(
    node: MathNode & { type: 'fraction' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-fraction',
      attr: { 'data-node-id': node.id },
    });

    const num = this.createEl('div', { cls: 'eq-numerator' });
    num.appendChild(this.renderSlot(node.numerator, ctx));

    const den = this.createEl('div', { cls: 'eq-denominator' });
    den.appendChild(this.renderSlot(node.denominator, ctx));

    container.appendChild(num);
    container.appendChild(den);
    return container;
  }

  private renderSuperscript(
    node: MathNode & { type: 'superscript' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-script-box',
      attr: { 'data-node-id': node.id },
    });

    container.appendChild(this.renderSlot(node.base, ctx));

    const sup = this.createEl('span', { cls: 'eq-superscript' });
    sup.appendChild(this.renderSlot(node.sup, ctx));

    container.appendChild(sup);
    return container;
  }

  private renderSubscript(
    node: MathNode & { type: 'subscript' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-script-box',
      attr: { 'data-node-id': node.id },
    });

    container.appendChild(this.renderSlot(node.base, ctx));

    const sub = this.createEl('span', { cls: 'eq-subscript' });
    sub.appendChild(this.renderSlot(node.sub, ctx));

    container.appendChild(sub);
    return container;
  }

  private renderSubSup(
    node: MathNode & { type: 'subsup' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-script-box',
      attr: { 'data-node-id': node.id },
    });

    container.appendChild(this.renderSlot(node.base, ctx));

    const scriptsWrapper = this.createEl('span', { cls: 'eq-subsup-scripts' });

    const sup = this.createEl('span', { cls: 'eq-superscript' });
    sup.appendChild(this.renderSlot(node.sup, ctx));

    const sub = this.createEl('span', { cls: 'eq-subscript' });
    sub.appendChild(this.renderSlot(node.sub, ctx));

    scriptsWrapper.appendChild(sup);
    scriptsWrapper.appendChild(sub);
    container.appendChild(scriptsWrapper);
    return container;
  }

  private createSurdElement(): HTMLElement {
    const surd = this.createEl('span', {
      cls: 'eq-radical-surd',
      attr: { 'aria-hidden': 'true' },
    });
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
    const container = this.createEl('span', {
      cls: 'eq-radical',
      attr: { 'data-node-id': node.id },
    });

    const surd = this.createSurdElement();

    const radicand = this.createEl('span', { cls: 'eq-radicand' });
    radicand.appendChild(this.renderSlot(node.radicand, ctx));

    container.appendChild(surd);
    container.appendChild(radicand);
    return container;
  }

  private renderRoot(
    node: MathNode & { type: 'root' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-radical',
      attr: { 'data-node-id': node.id },
    });

    const idx = this.createEl('span', { cls: 'eq-radical-index' });
    idx.appendChild(this.renderSlot(node.index, ctx));

    const surd = this.createSurdElement();

    const radicand = this.createEl('span', { cls: 'eq-radicand' });
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
    const container = this.createEl('span', {
      cls: 'eq-matrix',
      attr: { 'data-node-id': node.id },
    });

    if (node.openBracket) {
      const open = this.createEl('span', {
        cls: 'eq-matrix-bracket',
        text: node.openBracket,
      });
      container.appendChild(open);
    }

    const table = this.createEl('table', { cls: 'eq-matrix-table' });

    for (const row of node.rows) {
      const tr = this.createEl('tr', { cls: 'eq-matrix-row' });
      for (const cell of row) {
        const td = this.createEl('td', { cls: 'eq-matrix-cell' });
        td.appendChild(this.renderSlot(cell, ctx));
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    container.appendChild(table);

    if (node.closeBracket) {
      const close = this.createEl('span', {
        cls: 'eq-matrix-bracket',
        text: node.closeBracket,
      });
      container.appendChild(close);
    }

    return container;
  }

  private renderFenced(
    node: MathNode & { type: 'fenced' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-fenced',
      attr: { 'data-node-id': node.id },
    });

    if (node.open) {
      const open = this.createEl('span', {
        cls: 'eq-fence-open eq-token eq-mo',
        text: node.open,
      });
      container.appendChild(open);
    }

    container.appendChild(this.renderSlot(node.content, ctx));

    if (node.close) {
      const close = this.createEl('span', {
        cls: 'eq-fence-close eq-token eq-mo',
        text: node.close,
      });
      container.appendChild(close);
    }

    return container;
  }

  private renderUnderOver(
    node: MathNode & { type: 'underover' },
    ctx: RenderContext
  ): HTMLElement {
    const container = this.createEl('span', {
      cls: 'eq-underover',
      attr: { 'data-node-id': node.id },
    });

    if (node.over) {
      const overEl = this.createEl('span', { cls: 'eq-over' });
      overEl.appendChild(this.renderSlot(node.over, ctx));
      container.appendChild(overEl);
    }

    const baseEl = this.createEl('span', { cls: 'eq-base' });
    baseEl.appendChild(this.renderSlot(node.base, ctx));
    container.appendChild(baseEl);

    if (node.under) {
      const underEl = this.createEl('span', { cls: 'eq-under' });
      underEl.appendChild(this.renderSlot(node.under, ctx));
      container.appendChild(underEl);
    }

    return container;
  }

  private createCaretElement(): HTMLElement {
    return this.createEl('span', {
      cls: 'eq-caret',
      attr: { 'data-caret': 'true', 'aria-hidden': 'true' },
      text: '|',
    });
  }
}

export function renderEquationDom(
  root: SlotNode,
  ctx: RenderContext = {}
): HTMLElement {
  const renderer = new DomRenderer(ctx.document);
  return renderer.render(root, ctx);
}
