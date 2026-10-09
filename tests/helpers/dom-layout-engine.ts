/**
 * DOM Layout Simulation Engine
 * Injects styles.css, calculates recursive 2D bounding boxes for math elements,
 * polyfills document.elementFromPoint, and simulates user interactions.
 */

import fs from 'fs';
import path from 'path';

export interface BoxDimensions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function setupAccurateDomEnvironment(): void {
  // 1. Inject real styles.css into document.head
  const cssPath = path.resolve(__dirname, '../../styles.css');
  if (fs.existsSync(cssPath) && !document.getElementById('eq-test-stylesheet')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'eq-test-stylesheet';
    styleEl.textContent = fs.readFileSync(cssPath, 'utf-8');
    document.head.appendChild(styleEl);
  }

  // 2. Install PointerEvent polyfill if missing in environment
  if (typeof (globalThis as any).PointerEvent === 'undefined') {
    (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
      public pointerId: number;
      public width: number;
      public height: number;
      public pressure: number;
      public tiltX: number;
      public tiltY: number;
      public pointerType: string;
      public isPrimary: boolean;
      constructor(type: string, params: any = {}) {
        super(type, params);
        this.pointerId = params.pointerId || 0;
        this.width = params.width || 1;
        this.height = params.height || 1;
        this.pressure = params.pressure || 0;
        this.tiltX = params.tiltX || 0;
        this.tiltY = params.tiltY || 0;
        this.pointerType = params.pointerType || 'mouse';
        this.isPrimary = params.isPrimary !== undefined ? params.isPrimary : true;
      }
    };
  }

  // 3. Install document.elementFromPoint polyfill
  document.elementFromPoint = (x: number, y: number): Element | null => {
    function findDeepest(el: Element): Element | null {
      const rect = el.getBoundingClientRect();
      const hasExplicitRect = rect.width > 0 || rect.height > 0;
      if (hasExplicitRect && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)) {
        return null;
      }
      for (let i = el.children.length - 1; i >= 0; i--) {
        const hit = findDeepest(el.children[i]);
        if (hit) return hit;
      }
      return hasExplicitRect ? el : null;
    }
    return findDeepest(document.body);
  };
}

export function computeAndApplyLayout(rootEl: HTMLElement, startX = 50, startY = 50): void {
  function makeRect(x: number, y: number, w: number, h: number): DOMRect {
    return {
      x,
      y,
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
      toJSON: () => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }),
    } as DOMRect;
  }

  function layoutNode(
    node: HTMLElement,
    curX: number,
    curY: number,
    fontSize: number
  ): { width: number; height: number } {
    if (node.classList.contains('eq-token')) {
      const textLen = node.textContent?.length || 1;
      const charWidth = fontSize * 0.55;
      const pad = node.classList.contains('eq-mo') ? 4 : 1;
      const w = textLen * charWidth + pad * 2;
      const h = fontSize * 1.2;
      node.getBoundingClientRect = () => makeRect(curX, curY, w, h);
      return { width: w, height: h };
    }

    if (node.classList.contains('eq-placeholder')) {
      const w = fontSize * 0.9;
      const h = fontSize * 1.0;
      node.getBoundingClientRect = () => makeRect(curX, curY, w, h);
      // If placeholder has child caret
      const childCaret = node.querySelector('.eq-caret') as HTMLElement | null;
      if (childCaret) {
        layoutNode(childCaret, curX + 2, curY, fontSize);
      }
      return { width: w, height: h };
    }

    if (node.classList.contains('eq-caret')) {
      const w = 2.0;
      const h = fontSize * 1.1;
      node.getBoundingClientRect = () => makeRect(curX, curY, w, h);
      return { width: w, height: h };
    }

    if (node.classList.contains('eq-fraction')) {
      const num = node.querySelector('.eq-numerator') as HTMLElement | null;
      const den = node.querySelector('.eq-denominator') as HTMLElement | null;
      let maxWidth = 20;
      let totalH = 4;
      let numH = 15;

      if (num) {
        const numSize = layoutNode(num, curX, curY, fontSize * 0.9);
        maxWidth = Math.max(maxWidth, numSize.width);
        numH = numSize.height;
      }
      if (den) {
        const denSize = layoutNode(den, curX, curY + numH + 4, fontSize * 0.9);
        maxWidth = Math.max(maxWidth, denSize.width);
        totalH = numH + denSize.height + 6;
      }
      node.getBoundingClientRect = () => makeRect(curX, curY, maxWidth, totalH);
      return { width: maxWidth, height: totalH };
    }

    if (node.classList.contains('eq-radical')) {
      let runningRadX = curX;
      let radH = fontSize * 1.3;
      const idx = node.querySelector('.eq-radical-index') as HTMLElement | null;
      if (idx) {
        const idxSize = layoutNode(idx, runningRadX, curY, fontSize * 0.7);
        runningRadX += idxSize.width + 2;
      }
      // Surd symbol representation
      runningRadX += 10;
      const radicand = node.querySelector('.eq-radicand') as HTMLElement | null;
      if (radicand) {
        const radSize = layoutNode(radicand, runningRadX, curY, fontSize);
        runningRadX += radSize.width;
        radH = Math.max(radH, radSize.height);
      }
      const totalW = runningRadX - curX;
      node.getBoundingClientRect = () => makeRect(curX, curY, totalW, radH);
      return { width: totalW, height: radH };
    }

    if (node.classList.contains('eq-superscript') || node.classList.contains('eq-subscript')) {
      const scriptFontSize = fontSize * 0.75;
      const children = Array.from(node.children) as HTMLElement[];
      let runX = curX;
      let maxH = scriptFontSize * 1.2;
      for (const child of children) {
        const d = layoutNode(child, runX, curY, scriptFontSize);
        runX += d.width;
        maxH = Math.max(maxH, d.height);
      }
      const totalW = Math.max(fontSize * 0.4, runX - curX);
      node.getBoundingClientRect = () => makeRect(curX, curY, totalW, maxH);
      return { width: totalW, height: maxH };
    }

    if (node.classList.contains('eq-matrix')) {
      const openBracket = node.querySelector('.eq-matrix-bracket') as HTMLElement | null;
      let runX = curX;
      let totalH = fontSize * 1.5;
      if (openBracket) {
        const bDim = layoutNode(openBracket, runX, curY, fontSize);
        runX += bDim.width + 2;
        totalH = Math.max(totalH, bDim.height);
      }
      const table = node.querySelector('.eq-matrix-table') as HTMLElement | null;
      if (table) {
        const tableX = runX;
        const tableY = curY;
        const rows = Array.from(table.querySelectorAll('.eq-matrix-row')) as HTMLElement[];
        let rowY = curY;
        let maxTableW = 0;
        for (const row of rows) {
          const thisRowY = rowY;
          const cells = Array.from(row.querySelectorAll('.eq-matrix-cell')) as HTMLElement[];
          let cellX = tableX;
          let maxCellH = fontSize * 1.2;
          for (const cell of cells) {
            const cellDim = layoutNode(cell, cellX, thisRowY, fontSize);
            cellX += cellDim.width + 6;
            maxCellH = Math.max(maxCellH, cellDim.height);
          }
          const rowW = cellX - tableX;
          const finalCellH = maxCellH;
          row.getBoundingClientRect = () => makeRect(tableX, thisRowY, rowW, finalCellH);
          maxTableW = Math.max(maxTableW, rowW);
          rowY += maxCellH + 4;
        }
        const tableH = rowY - tableY;
        const finalTableW = maxTableW;
        table.getBoundingClientRect = () => makeRect(tableX, tableY, finalTableW, tableH);
        runX += maxTableW + 2;
        totalH = Math.max(totalH, tableH);
      }
      const closeBrackets = Array.from(node.querySelectorAll('.eq-matrix-bracket'));
      if (closeBrackets.length > 1) {
        const close = closeBrackets[closeBrackets.length - 1] as HTMLElement;
        const bDim = layoutNode(close, runX, curY, fontSize);
        runX += bDim.width;
        totalH = Math.max(totalH, bDim.height);
      }
      const matrixW = runX - curX;
      node.getBoundingClientRect = () => makeRect(curX, curY, matrixW, totalH);
      return { width: matrixW, height: totalH };
    }

    // Generic slot / element traversal
    let runningX = curX;
    let maxH = fontSize * 1.2;

    const children = Array.from(node.children) as HTMLElement[];
    for (const child of children) {
      if (child.classList.contains('eq-caret')) {
        layoutNode(child, runningX, curY, fontSize);
        continue;
      }
      const childDim = layoutNode(child, runningX, curY, fontSize);
      runningX += childDim.width;
      maxH = Math.max(maxH, childDim.height);
    }

    const totalW = Math.max(fontSize * 0.5, runningX - curX);
    node.getBoundingClientRect = () => makeRect(curX, curY, totalW, maxH);
    return { width: totalW, height: maxH };
  }

  const fontSize = 16;
  layoutNode(rootEl, startX, startY, fontSize);
}

export function simulateClickAt(container: HTMLElement, clientX: number, clientY: number): void {
  const target = (document.elementFromPoint(clientX, clientY) as HTMLElement) || container;
  target.dispatchEvent(
    new MouseEvent('mousedown', {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    })
  );
}

export function simulateArrowKey(
  target: HTMLElement,
  key: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown'
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
  );
}
