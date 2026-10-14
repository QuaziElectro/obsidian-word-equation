import { describe, it, expect, beforeEach } from 'vitest';
import { Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  wordEquationStateField,
  buildEquationDecorations,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { createReadingViewProcessor } from '../../src/post-processor/reading-view';
import { createMockEditor } from '../helpers/cm6-mock';
import { resetIdCounter } from '../../src/core/ast';

import { setLivePreviewEffect } from '../mocks/obsidian';

describe('Editor StateField, Syntax Hiding & Widget Lifecycle Test Suite', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('Equation Detection & Decoration Replacement', () => {
    it('detects math-word fenced code block and creates replace decoration', () => {
      const docStr = `# Heading\n\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\n\nSome trailing text`;
      const doc = Text.of(docStr.split('\n'));
      const decorations = buildEquationDecorations(doc);

      expect(decorations.size).toBe(1);

      let foundWidget: WordEquationWidget | null = null;
      let fromPos = -1;
      let toPos = -1;

      decorations.between(0, doc.length, (from, to, dec) => {
        fromPos = from;
        toPos = to;
        foundWidget = (dec.spec as any).widget as WordEquationWidget;
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget).toBeInstanceOf(WordEquationWidget);
      expect(fromPos).toBe(docStr.indexOf('```math-word'));
      expect(toPos).toBe(docStr.indexOf('```\n\nSome') + 3);
      expect((foundWidget as any).code).toContain('<mi>x</mi>');
    });

    it('detects weq shorthand delimiter and creates replace decoration', () => {
      const docStr = `\`\`\`weq\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n\`\`\``;
      const doc = Text.of(docStr.split('\n'));
      const decorations = buildEquationDecorations(doc);

      expect(decorations.size).toBe(1);

      decorations.between(0, doc.length, (from, to, dec) => {
        const widget = (dec.spec as any).widget;
        expect(widget).toBeInstanceOf(WordEquationWidget);
        expect((dec.spec as any).block).toBe(true);
      });
    });

    it('detects multiple equation blocks in the same document', () => {
      const docStr = `First equation:\n\`\`\`math-word\n<math><mn>1</mn></math>\n\`\`\`\nMiddle text\n\`\`\`weq\n<math><mn>2</mn></math>\n\`\`\`\nEnd.`;
      const doc = Text.of(docStr.split('\n'));
      const decorations = buildEquationDecorations(doc);

      expect(decorations.size).toBe(2);
    });

    it('returns empty decoration set for documents without equation blocks', () => {
      const docStr = `# Markdown Note\n\nHere is regular text and standard LaTeX: $$x^2 + y^2 = z^2$$`;
      const doc = Text.of(docStr.split('\n'));
      const decorations = buildEquationDecorations(doc);

      expect(decorations.size).toBe(0);
    });
  });

  describe('Source Mode & Live Preview Coexistence (R1: Source Mode Visibility)', () => {
    it('in Live Preview mode, replaces markdown equation with visual widget decoration', () => {
      const initialDoc = `Paragraph 1\n\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>\n\`\`\`\n\nParagraph 2`;
      const { state, view, container } = createMockEditor(initialDoc, [], true); // Live Preview = true

      const fieldDecorations = state.field(wordEquationStateField);
      expect(fieldDecorations.size).toBe(1);

      const blockStart = initialDoc.indexOf('```math-word');
      const blockEnd = initialDoc.indexOf('```\n\nParagraph 2') + 3;

      fieldDecorations.between(0, state.doc.length, (from, to, dec) => {
        expect(from).toBe(blockStart);
        expect(to).toBe(blockEnd);
        expect((dec.spec as any).block).toBe(true);
      });

      view.destroy();
      container.remove();
    });

    it('in Source mode, does NOT hide raw text of equation and returns Decoration.none', () => {
      const initialDoc = `Paragraph 1\n\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>\n\`\`\`\n\nParagraph 2`;
      // Initialize editor with isLivePreview = false (Source Mode)
      const { state, view, container } = createMockEditor(initialDoc, [], false);

      const fieldDecorations = state.field(wordEquationStateField);
      // In Source Mode, decorations MUST be empty so raw text/MathML is completely visible
      expect(fieldDecorations.size).toBe(0);

      // Verify that the view displays verbatim text without any replacement widget
      expect(view.contentDOM.textContent).toContain('```math-word');
      expect(view.contentDOM.textContent).toContain('<math');
      expect(view.contentDOM.querySelector('.word-equation-block')).toBeNull();

      view.destroy();
      container.remove();
    });

    it('dynamically toggles between Source Mode and Live Preview without doc change', () => {
      const initialDoc = `\`\`\`math-word\n<math><mi>x</mi></math>\n\`\`\``;
      const { view, container } = createMockEditor(initialDoc, [], false); // Start in Source Mode

      // Verify initial state is Source Mode: no decorations
      expect(view.state.field(wordEquationStateField).size).toBe(0);

      // Switch to Live Preview
      view.dispatch({
        effects: setLivePreviewEffect.of(true),
      });
      expect(view.state.field(wordEquationStateField).size).toBe(1);

      // Switch back to Source Mode
      view.dispatch({
        effects: setLivePreviewEffect.of(false),
      });
      expect(view.state.field(wordEquationStateField).size).toBe(0);

      view.destroy();
      container.remove();
    });

    it('updates decorations dynamically when document changes in Live Preview', () => {
      const { view, container } = createMockEditor('Initial plain text', [], true);
      expect(view.state.field(wordEquationStateField).size).toBe(0);

      // Insert equation block via transaction
      const insertText = '\n```math-word\n<math><mi>x</mi></math>\n```\n';
      view.dispatch({
        changes: { from: view.state.doc.length, insert: insertText },
      });

      expect(view.state.field(wordEquationStateField).size).toBe(1);

      view.destroy();
      container.remove();
    });
  });

  describe('Inline Equation Mode (R1: Inline Delimiters & Rendering)', () => {
    it('renders /weq_inline custom syntax as an inline equation rather than a block', () => {
      const docStr = `Before text /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math> /weq_inline after text.`;
      const { state, view, container } = createMockEditor(docStr, [], true);

      const decorations = state.field(wordEquationStateField);
      expect(decorations.size).toBe(1);

      let isBlock: boolean | undefined;
      let targetWidget: WordEquationWidget | null = null;

      decorations.between(0, state.doc.length, (from, to, dec) => {
        isBlock = (dec.spec as any).block;
        targetWidget = (dec.spec as any).widget as WordEquationWidget;
      });

      // Confirms custom syntax renders as an inline equation rather than a block
      expect(isBlock).toBe(false);
      expect(targetWidget).not.toBeNull();
      expect(targetWidget!.isInline).toBe(true);
      expect(targetWidget!.delimiter).toBe('/weq_inline');

      // Verify DOM rendering
      const dom = targetWidget!.toDOM(view);
      expect(dom.tagName.toLowerCase()).toBe('span');
      expect(dom.className).toContain('word-equation-inline');

      view.destroy();
      container.remove();
    });

    it('renders $weq custom syntax as an inline equation rather than a block', () => {
      const docStr = `Inline equation $weq <math><mfrac><mn>1</mn><mn>2</mn></mfrac></math> $weq in a sentence.`;
      const { state, view, container } = createMockEditor(docStr, [], true);

      const decorations = state.field(wordEquationStateField);
      expect(decorations.size).toBe(1);

      decorations.between(0, state.doc.length, (from, to, dec) => {
        expect((dec.spec as any).block).toBe(false);
        const widget = (dec.spec as any).widget as WordEquationWidget;
        expect(widget.isInline).toBe(true);
        expect(widget.delimiter).toBe('$weq');
      });

      view.destroy();
      container.remove();
    });

    it('supports multiple inline equations on a single line', () => {
      const docStr = `Here is $weq <math><mi>x</mi></math> $weq and another /weq_inline <math><mi>y</mi></math> /weq_inline on same line.`;
      const { state, view, container } = createMockEditor(docStr, [], true);

      const decorations = state.field(wordEquationStateField);
      expect(decorations.size).toBe(2);

      const blocks: boolean[] = [];
      decorations.between(0, state.doc.length, (from, to, dec) => {
        blocks.push((dec.spec as any).block);
      });

      expect(blocks).toEqual([false, false]);

      view.destroy();
      container.remove();
    });

    it('syncToDocument preserves inline delimiter syntax when edited', () => {
      const docStr = `/weq_inline <math><mi>x</mi></math> /weq_inline`;
      const { state, view, container } = createMockEditor(docStr, [], true);

      const decorations = state.field(wordEquationStateField);
      let widget: WordEquationWidget | null = null;
      decorations.between(0, state.doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });

      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Trigger character insertion inside inline equation
      widget!.enterFromEnd(view);
      const keyEvent = new KeyboardEvent('keydown', { key: '2' });
      dom.dispatchEvent(keyEvent);

      // Verify the document updated with inline delimiter /weq_inline, NOT block ```math-word
      const updatedDoc = view.state.doc.toString();
      expect(updatedDoc).toContain('/weq_inline');
      expect(updatedDoc).not.toContain('```math-word');

      view.destroy();
      container.remove();
    });
  });

  describe('WordEquationWidget Lifecycle', () => {
    it('toDOM renders complete visual equation element hierarchy', () => {
      const code = `<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>`;
      const widget = new WordEquationWidget(code, 0, code.length);

      const { view, container } = createMockEditor('');
      const dom = widget.toDOM(view);

      expect(dom).toBeInstanceOf(HTMLElement);
      expect(dom.className).toBe('word-equation-block');
      expect(dom.querySelector('.word-equation-math')).not.toBeNull();
      expect(dom.querySelector('.eq-fraction')).not.toBeNull();
      expect(dom.querySelector('.eq-numerator')).not.toBeNull();
      expect(dom.querySelector('.eq-denominator')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('eq compares equality based on code, from, and to', () => {
      const w1 = new WordEquationWidget('<math><mi>x</mi></math>', 0, 30);
      const w2 = new WordEquationWidget('<math><mi>x</mi></math>', 0, 30);
      const w3 = new WordEquationWidget('<math><mi>y</mi></math>', 0, 30);
      const w4 = new WordEquationWidget('<math><mi>x</mi></math>', 10, 40);

      expect(w1.eq(w2)).toBe(true);
      expect(w1.eq(w3)).toBe(false);
      expect(w1.eq(w4)).toBe(false);
    });

    it('ignoreEvent returns true for keyboard and mouse events so CM6 does not interfere', () => {
      const widget = new WordEquationWidget('<math><mi>x</mi></math>', 0, 30);

      const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      const mouseEvent = new MouseEvent('click');
      const customEvent = new CustomEvent('custom');

      expect(widget.ignoreEvent(keyEvent)).toBe(true);
      expect(widget.ignoreEvent(mouseEvent)).toBe(true);
      expect(widget.ignoreEvent(customEvent)).toBe(false);
    });

    it('updateDOM updates internal AST and re-renders contents', () => {
      const widget = new WordEquationWidget('<math><mi>x</mi></math>', 0, 30);
      const { view, container } = createMockEditor('');
      const dom = widget.toDOM(view);

      expect(dom.textContent).toContain('x');

      widget.code = '<math><mi>y</mi></math>';
      widget.updateDOM(dom, view);

      expect(dom.textContent).toContain('y');

      view.destroy();
      container.remove();
    });
  });

  describe('Reading View Markdown Post-Processor', () => {
    it('processes MathML codeblock in reading view into styled DOM', () => {
      const processor = createReadingViewProcessor();
      const el = document.createElement('div');
      const source = `<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>`;

      processor(source, el, {} as any);

      expect(el.querySelector('.word-equation-block')).not.toBeNull();
      expect(el.querySelector('.eq-fraction')).not.toBeNull();
      expect(el.textContent).toContain('1');
      expect(el.textContent).toContain('2');
    });

    it('processes linear equation syntax in reading view', () => {
      const processor = createReadingViewProcessor();
      const el = document.createElement('div');
      const source = `x^2 + y_i`;

      processor(source, el, {} as any);

      expect(el.querySelector('.word-equation-block')).not.toBeNull();
      expect(el.querySelector('.eq-superscript')).not.toBeNull();
      expect(el.querySelector('.eq-subscript')).not.toBeNull();
    });

    it('handles malformed equation syntax gracefully without throwing', () => {
      const processor = createReadingViewProcessor();
      const el = document.createElement('div');
      const source = `<<<invalid xml>>>`;

      expect(() => {
        processor(source, el, {} as any);
      }).not.toThrow();

      expect(el.children.length).toBeGreaterThan(0);
    });
  });
});
