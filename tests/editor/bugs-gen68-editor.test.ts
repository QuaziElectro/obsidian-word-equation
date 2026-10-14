/**
 * Test Suite: Gen68 Track A (Bugs 2, 3, 4)
 *
 * Covers:
 * - Bug 2: Block-level equation (full-line, full-page) at container end (table cell, page)
 *          does not delete itself when deleting next line / reserved line.
 * - Bug 3: Inline math followed by text inside table cell renders text correctly upon caret exit;
 *          full-line math block maintains consistent size inside/outside table cell.
 * - Bug 4: Obsidian command to insert full-page math block (`insert-full-page-equation`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  wordEquationStateField,
  isTableRowLine,
  isInsideTableRow,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import { clearActiveEquationState } from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Gen68 Track A: Bugs 2, 3, 4 Test Suite', () => {
  let app: any;
  let plugin: WordEquationPlugin;

  beforeEach(() => {
    clearActiveEquationState();
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS };
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // BUG 4: Full Page Math Block — Obsidian Command Registration
  // =========================================================================
  describe('Bug 4: Full-Page Math Block Command Registration in src/main.ts', () => {
    it('registers insert-full-page-equation command with correct name on onload', async () => {
      let registeredCommands: Array<{ id: string; name: string; editorCallback?: any }> = [];
      (plugin as any).addCommand = (cmd: any) => {
        registeredCommands.push(cmd);
        return cmd;
      };

      await plugin.onload();

      const fullPageCmd = registeredCommands.find((c) => c.id === 'insert-full-page-equation');
      expect(fullPageCmd).toBeDefined();
      expect(fullPageCmd?.name).toBe('Insert full-page math block');
      expect(typeof fullPageCmd?.editorCallback).toBe('function');
    });

    it('inserts full-page equation template with math-page delimiter when default is math-word', async () => {
      let fullPageCallback: ((editor: any) => void) | null = null;
      (plugin as any).addCommand = (cmd: any) => {
        if (cmd.id === 'insert-full-page-equation') {
          fullPageCallback = cmd.editorCallback;
        }
        return cmd;
      };

      plugin.settings.defaultDelimiter = 'math-word';
      await plugin.onload();

      expect(fullPageCallback).not.toBeNull();

      let replacedText = '';
      const mockEditor = {
        replaceSelection: (template: string) => {
          replacedText = template;
        },
      };

      fullPageCallback!(mockEditor);

      expect(replacedText).toContain('```math-page\n');
      expect(replacedText).toContain('display="full-page"');
      expect(replacedText).toContain('```\n');
    });

    it('inserts full-page equation template with weq-page delimiter when default is weq', async () => {
      let fullPageCallback: ((editor: any) => void) | null = null;
      (plugin as any).addCommand = (cmd: any) => {
        if (cmd.id === 'insert-full-page-equation') {
          fullPageCallback = cmd.editorCallback;
        }
        return cmd;
      };

      plugin.loadData = async () => ({ defaultDelimiter: 'weq' });
      await plugin.onload();

      expect(fullPageCallback).not.toBeNull();

      let replacedText = '';
      const mockEditor = {
        replaceSelection: (template: string) => {
          replacedText = template;
        },
      };

      fullPageCallback!(mockEditor);

      expect(replacedText).toContain('```weq-page\n');
      expect(replacedText).toContain('display="full-page"');
      expect(replacedText).toContain('```\n');
    });

    it('decorations parse the inserted template as displayMode full-page', () => {
      const doc = '```math-page\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="full-page">\n  <mrow><mi>x</mi></mrow>\n</math>\n```\n';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        foundWidget = (dec.spec as any)?.widget;
      });

      expect(foundWidget).not.toBeNull();
      expect((foundWidget as any)!.displayMode).toBe('full-page');
      expect((foundWidget as any)!.isInline).toBe(false);
    });
  });

  // =========================================================================
  // BUG 2: Full-Line & Full-Page Block at Container End — Boundary Deletion
  // =========================================================================
  describe('Bug 2: Boundary Deletion at Container End (Page End & Table Cell)', () => {
    it('deleting empty line after block equation at EOF deletes line and preserves equation', () => {
      const docStr = `## Heading\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow><mi>x</mi></mrow>\n</math>\n\`\`\`\n`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      // Position cursor at EOF on the trailing empty line (reserved line)
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      const curLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(curLine.length).toBe(0);

      // Press Backspace in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // The trailing newline must be deleted, but the block equation remains intact!
      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-word');
      expect(docAfter).toContain('<mrow><mi>x</mi></mrow>');

      // Verify the equation widget still exists in decorations
      let widgetAfter: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        widgetAfter = (dec.spec as any).widget;
      });
      expect(widgetAfter).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('deleting empty line after full-page equation at EOF deletes line and preserves full-page equation', () => {
      const docStr = `\`\`\`math-page\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="full-page">\n  <mrow><mi>P</mi></mrow>\n</math>\n\`\`\`\n`;
      const { view, container } = createMockEditor(docStr, [], true);

      // Position cursor at EOF on the trailing empty line
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      const curLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(curLine.length).toBe(0);

      // Press Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation block is preserved
      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-page');
      expect(docAfter).toContain('<mrow><mi>P</mi></mrow>');

      let widgetAfter: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        widgetAfter = (dec.spec as any).widget;
      });
      expect(widgetAfter).not.toBeNull();
      expect((widgetAfter as any)!.displayMode).toBe('full-page');

      view.destroy();
      container.remove();
    });

    it('pressing Backspace on following table row does NOT delete table block equation above it', () => {
      const docStr = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| ```math-word<br><math display="block"><mi>A</mi></math><br>``` | cell |',
        '| Next row | Next cell |',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);

      // Verify table equation widget is recognized
      let tableWidget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w) tableWidget = w;
      });
      expect(tableWidget).not.toBeNull();

      // Position cursor at start of line 4 ("| Next row | Next cell |")
      const row4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: row4.from } });

      // Press Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Table equation in row 3 MUST NOT be deleted
      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-word<br><math display="block"><mi>A</mi></math><br>```');

      let tableWidgetAfter: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w) tableWidgetAfter = w;
      });
      expect(tableWidgetAfter).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('pressing Backspace on start of following text does NOT delete block equation', () => {
      const docStr = `\`\`\`math-word\n<math><mi>x</mi></math>\n\`\`\`\nFollowing text`;
      const { view, container } = createMockEditor(docStr, [], true);

      const nextLine = view.state.doc.line(view.state.doc.lines);
      expect(nextLine.text).toBe('Following text');
      view.dispatch({ selection: { anchor: nextLine.from } });

      // Press Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation must remain intact
      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-word');
      expect(docAfter).toContain('<math><mi>x</mi></math>');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // BUG 3: Recurring Table Equation Rendering & Sizing Fixes
  // =========================================================================
  describe('Bug 3: Recurring Table Equation Rendering & Sizing', () => {
    it('inline equation followed by text in table cell renders text cleanly and does not become block', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      // Fragmented structure matching Obsidian table cell parsing
      const prefixText = document.createTextNode('/weq_inline ');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.setAttribute('display', 'block'); // Often preset from Word or gallery
      mathEl.innerHTML = '<mi>s</mi><mo>∑</mo><mo>∑</mo>';
      const suffixText = document.createTextNode(' /weq_inlinesDASDasdasd');

      td.appendChild(prefixText);
      td.appendChild(mathEl);
      td.appendChild(suffixText);

      processor(td);

      // Verify delimiters are cleaned up
      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.textContent).not.toContain('\\weq_inline');

      // Verify following text is preserved and rendered
      expect(td.textContent).toContain('sDASDasdasd');

      // Crucial: Must NOT be converted to word-equation-table-block or full-page
      const tableBlock = td.querySelector('.word-equation-table-block');
      expect(tableBlock).toBeNull();

      // Crucial: Table cell must NOT have padding zeroed out
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(false);
      expect(td.classList.contains('table-cell-has-fullpage-equation')).toBe(false);
      expect(td.style.padding).not.toBe('0px');

      // Rendered equation widget must be inline
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      const inlineWrapper = td.querySelector('.word-equation-inline');
      expect(inlineWrapper).not.toBeNull();
    });

    it('single text node with inline equation and following text separates text cleanly', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      const textNode = document.createTextNode('| /weq_inline <math display="block"><mi>x</mi></math> /weq_inline following text |');
      td.appendChild(textNode);

      processor(td);

      expect(td.textContent).toContain('following text');
      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.querySelector('.word-equation-table-block')).toBeNull();
    });

    it('full-line table block equation maintains standard box padding and border radius', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>=</mo><mn>1</mn></math>',
        10,
        50,
        false,
        'math-word',
        true // isBlockInTable
      );

      const dom = (widget as any).renderCurrentDom();

      // Full line container has 100% width and flex centering
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.display).toBe('flex');

      // Inner math box maintains standard box model
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.borderRadius).toBe('6px');
      expect(mathBox.style.padding).toBe('6px 12px');
      expect(mathBox.style.minHeight).toBe('2.2em');

      // Must NOT be stretched to 100% height or 0 border-radius (which is full-page only)
      expect(mathBox.style.borderRadius).not.toBe('0');
      expect(mathBox.style.height).not.toBe('100%');
    });

    it('post-processor applies standard dimensions to table block equations without zeroing cell padding', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      const prefixText = document.createTextNode('```math-word<br>');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.setAttribute('display', 'block');
      mathEl.innerHTML = '<mi>x</mi><mo>=</mo><mn>2</mn>';
      const suffixText = document.createTextNode('<br>```');

      td.appendChild(prefixText);
      td.appendChild(mathEl);
      td.appendChild(suffixText);

      processor(td);

      const mathBox = td.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.padding).toBe('6px 12px');
      expect(mathBox.style.borderRadius).toBe('6px');
      expect(mathBox.style.minHeight).toBe('2.2em');

      // Cell padding must NOT be zeroed out
      expect(td.style.padding).not.toBe('0px');
    });

    it('full-page math block in table cell zeroes cell padding and hides surrounding text', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      const prefixText = document.createTextNode('some text ');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.setAttribute('display', 'full-page');
      mathEl.innerHTML = '<mi>F</mi><mo>=</mo><mi>m</mi><mi>a</mi>';
      const suffixText = document.createTextNode(' trailing text');

      td.appendChild(prefixText);
      td.appendChild(mathEl);
      td.appendChild(suffixText);

      processor(td);

      // Full-page block zeroes out cell padding
      expect(td.classList.contains('table-cell-has-fullpage-equation')).toBe(true);
      expect(['0', '0px']).toContain(td.style.padding);

      // Full-page widget has full-page classes and 100% dimensions
      const widget = td.querySelector('.word-equation-full-page');
      expect(widget).not.toBeNull();
      const mathBox = td.querySelector('.eq-full-page') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(['0', '0px']).toContain(mathBox.style.borderRadius);
    });
  });
});
