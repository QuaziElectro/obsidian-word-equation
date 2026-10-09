/**
 * DOM and JSDOM Layout Mock Helpers
 */

export interface MockRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function setMockRect(el: HTMLElement, rect: MockRect): void {
  const fullRect = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => fullRect,
  };
  el.getBoundingClientRect = () => fullRect as DOMRect;
}

export function mockSlotLayout(slotEl: HTMLElement, startX = 0, startY = 0, charWidth = 10, height = 20): void {
  const children = Array.from(slotEl.children) as HTMLElement[];
  let currentX = startX;

  for (const child of children) {
    const textLen = child.textContent?.length || 1;
    const width = textLen * charWidth;
    setMockRect(child, {
      left: currentX,
      top: startY,
      width,
      height,
    });
    currentX += width;
  }

  setMockRect(slotEl, {
    left: startX,
    top: startY,
    width: Math.max(charWidth, currentX - startX),
    height,
  });
}
