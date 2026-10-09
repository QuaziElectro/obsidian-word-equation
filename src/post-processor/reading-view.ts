/**
 * Obsidian Reading View Markdown Post-Processor
 * Renders MathML equations in preview / reading mode with authentic Word styling.
 */

import { MarkdownPostProcessorContext } from 'obsidian';
import { parseMathML } from '../core/mathml-parser';
import { parseLinearEquation } from '../core/linear-parser';
import { DomRenderer } from '../editor/dom-renderer';
import { SlotNode } from '../core/types';

export function createReadingViewProcessor() {
  const renderer = new DomRenderer();

  return (
    source: string,
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext
  ): void => {
    const trimmed = source.trim();
    let ast: SlotNode;

    try {
      if (trimmed.startsWith('<math') || trimmed.includes('</math>') || trimmed.startsWith('<m')) {
        ast = parseMathML(trimmed);
      } else {
        ast = parseLinearEquation(trimmed);
      }

      const rendered = renderer.render(ast, {
        readOnly: true,
        isFocused: false,
      });

      const emptyEl = (element: HTMLElement) => {
        if (typeof (element as any).empty === 'function') {
          (element as any).empty();
        } else {
          element.innerHTML = '';
        }
      };

      emptyEl(el);
      el.appendChild(rendered);
    } catch (err) {
      if (typeof (el as any).empty === 'function') {
        (el as any).empty();
      } else {
        el.innerHTML = '';
      }
      if (typeof (el as any).createDiv === 'function') {
        (el as any).createDiv({
          cls: 'word-equation-error',
          text: `[Equation Error: ${(err as Error).message || 'Invalid equation'}]`,
        });
      } else {
        const errEl = document.createElement('div');
        errEl.className = 'word-equation-error';
        errEl.textContent = `[Equation Error: ${(err as Error).message || 'Invalid equation'}]`;
        el.appendChild(errEl);
      }
    }
  };
}
