/**
 * Adversarial Stress Test Suite: Gen68 Track A (Bugs 2, 3, 4)
 *
 * Authored by: challenger_1_gen68 (Empirical Challenger)
 * Scope:
 * - Bug 2: Container boundary deletion stress testing (CRLF, multiline empty, table rows, inner Backspace)
 * - Bug 3: Table equation rendering with complex trailing text, special chars, multiple inline blocks, metric consistency
 * - Bug 4: Command palette registration and template generation across setting modes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  wordEquationStateField,
  isTableRowLine,
  isInsideTableRow,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';
import { parseMathML } from '../../src/core/mathml-parser';

describe('Adversarial Stress Suite — Track A (Bugs 2, 3, 4)', () => {
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
  // SECTION 1: BUG 2 — CONTAINER BOUNDARY DELETION STRESS HARNESS
  // =========================================================================
  describe('Adversarial Bug 2: Boundary Deletion at Container Ends', () => {
    it('STRESS-1: CRLF line endings (\\r\\n) at EOF — Backspace on reserved empty line preserves equation', () => {
      // Test Windows CRLF line endings
      const docStr = '## Section\r\n```math-word\r\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\r\n  <mrow><mi>z</mi></mrow>\r\n</math>\r\n```\r\n';
      const { view, container } = createMockEditor(docStr, [], true);

      // Verify widget exists
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      // Put cursor at doc end on the empty line
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      const curLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(curLine.length).toBe(0);

      // Trigger Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-word');
      expect(docAfter).toContain('<mrow><mi>z</mi></mrow>');

      // Verify widget is still registered
      let widgetAfter: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        widgetAfter = (dec.spec as any).widget;
      });
      expect(widgetAfter).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('STRESS-2: Multiple consecutive empty lines after block equation at EOF', () => {
      // 3 empty lines following the block equation
      const docStr = '```math-word\n<math display="block"><mi>y</mi></math>\n```\n\n\n';
      const { view, container } = createMockEditor(docStr, [], true);

      // Initial lines count: 3 (code block) + 3 (empty lines) = 6 lines
      const totalLines = view.state.doc.lines;
      expect(totalLines).toBeGreaterThanOrEqual(5);

      // Position at absolute EOF (line 6)
      view.dispatch({ selection: { anchor: view.state.doc.length } });

      // First Backspace deletes trailing empty line
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(view.state.doc.toString()).toContain('```math-word');
      expect(view.state.doc.toString()).toContain('<mi>y</mi>');

      // Second Backspace on previous empty line
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(view.state.doc.toString()).toContain('```math-word');
      expect(view.state.doc.toString()).toContain('<mi>y</mi>');

      // Block equation remains intact throughout
      let foundWidget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        foundWidget = (dec.spec as any).widget;
      });
      expect(foundWidget).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('STRESS-3: Following text after block equation — Backspace at start and middle of text does NOT delete equation', () => {
      const docStr = '```math-word\n<math display="block"><mi>w</mi></math>\n```\nParagraph text following equation';
      const { view, container } = createMockEditor(docStr, [], true);

      const paragraphLine = view.state.doc.line(view.state.doc.lines);
      expect(paragraphLine.text).toBe('Paragraph text following equation');

      // Place cursor at the start of paragraph
      view.dispatch({ selection: { anchor: paragraphLine.from } });

      // Backspace at start of paragraph
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation must NOT be deleted
      let docText = view.state.doc.toString();
      expect(docText).toContain('```math-word');
      expect(docText).toContain('<mi>w</mi>');

      // Place cursor in the middle of paragraph
      view.dispatch({ selection: { anchor: paragraphLine.from + 5 } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      docText = view.state.doc.toString();
      expect(docText).toContain('```math-word');
      expect(docText).toContain('<mi>w</mi>');

      view.destroy();
      container.remove();
    });

    it('STRESS-4: Block equation in intermediate table row — Backspace on next row does NOT delete equation', () => {
      const docStr = [
        '| Header 1 | Header 2 | Header 3 |',
        '| --- | --- | --- |',
        '| Row 1 | Cell 1 | Cell 2 |',
        '| Row 2 | ```math-word<br><math display="block"><mi>E</mi></math><br>``` | Cell 4 |',
        '| Row 3 | Cell 5 | Cell 6 |',
        '| Row 4 | Cell 7 | Cell 8 |',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);

      // Check equation exists in Row 2 (line 4)
      let tableWidget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        const w = (dec.spec as any).widget;
        if (w) tableWidget = w;
      });
      expect(tableWidget).not.toBeNull();

      // Put cursor at start of Row 3 (line 5)
      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from } });

      // Press Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation in line 4 is preserved
      expect(view.state.doc.toString()).toContain('```math-word<br><math display="block"><mi>E</mi></math><br>```');

      // Put cursor at middle of Row 3
      view.dispatch({ selection: { anchor: line5.from + 6 } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation still preserved
      expect(view.state.doc.toString()).toContain('```math-word<br><math display="block"><mi>E</mi></math><br>```');

      view.destroy();
      container.remove();
    });

    it('STRESS-5: Full-page equation in table cell — Backspace on next row does NOT delete full-page equation', () => {
      const docStr = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| ```math-page<br><math display="full-page"><mi>P</mi></math><br>``` | other |',
        '| Next row | next |',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);

      // Put cursor at start of next row (line 4)
      const line4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: line4.from } });

      // Press Backspace
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Full-page equation in row 3 is preserved
      expect(view.state.doc.toString()).toContain('```math-page<br><math display="full-page"><mi>P</mi></math><br>```');

      view.destroy();
      container.remove();
    });

    it('STRESS-6: Delete key immediately before block equation in table cell does NOT delete it', () => {
      const docStr = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| ```math-word<br><math display="block"><mi>T</mi></math><br>``` | other |',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);

      // Line 3: "| ```math-word..."
      const line3 = view.state.doc.line(3);
      // Position cursor at "| " right before ```math-word
      view.dispatch({ selection: { anchor: line3.from + 2 } });

      // Press Delete
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Table equation must NOT be destroyed by Delete key
      expect(view.state.doc.toString()).toContain('```math-word<br><math display="block"><mi>T</mi></math><br>```');

      view.destroy();
      container.remove();
    });

    it('STRESS-7: Backspace inside an empty equation correctly deletes the empty equation', () => {
      const emptyDoc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```\n';
      const { view, container } = createMockEditor(emptyDoc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, emptyDoc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      // Mount widget DOM via toDOM(view) to attach keydown listeners
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      // Focus the widget via enterFromStart
      widget!.enterFromStart(view);
      expect(getActiveEquationState()).not.toBeNull();

      // Dispatch Backspace on the active widget DOM
      const keyEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      dom.dispatchEvent(keyEvent);

      // After Backspace on empty equation, the equation is deleted from document
      const docAfter = view.state.doc.toString();
      expect(docAfter).not.toContain('<mrow></mrow>');
      expect(getActiveEquationState()).toBeNull();

      view.destroy();
      container.remove();
    });

    it('STRESS-8: Backspace inside a non-empty equation deletes element and preserves equation', () => {
      const docStr = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>\n</math>\n```\n';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      widget!.enterFromStart(view);
      // Position caret at end of root slot (after 'b')
      widget!.caret = { slotId: widget!.ast.id, offset: widget!.ast.children.length };
      widget!.updateCaretOnly(dom);

      // Dispatch Backspace
      const keyEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      dom.dispatchEvent(keyEvent);

      // Equation remains, but last element was deleted
      const docAfter = view.state.doc.toString();
      expect(docAfter).toContain('```math-word');
      expect(widget!.ast.children.length).toBe(2); // 'a' and '+' remain

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // SECTION 2: BUG 3 — TABLE EQUATION RENDERING & BOX METRICS STRESS HARNESS
  // =========================================================================
  describe('Adversarial Bug 3: Table Equation Rendering & Box Metrics', () => {
    it('STRESS-9: Complex trailing text with symbols, quotes, markdown syntax, and special chars', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      const prefixText = document.createTextNode('/weq_inline ');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.setAttribute('display', 'block'); // Must be treated as inline due to /weq_inline!
      mathEl.innerHTML = '<mi>λ</mi><mo>=</mo><mn>42</mn>';
      const suffixText = document.createTextNode(' /weq_inline & < > " \' **bold** [link](http://obsidian.md) αβγ');

      td.appendChild(prefixText);
      td.appendChild(mathEl);
      td.appendChild(suffixText);

      processor(td);

      // No delimiters remain
      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.textContent).not.toContain('\\weq_inline');

      // Trailing special characters, quotes, and text remain fully intact
      expect(td.textContent).toContain('&');
      expect(td.textContent).toContain('<');
      expect(td.textContent).toContain('>');
      expect(td.textContent).toContain('"');
      expect(td.textContent).toContain("'");
      expect(td.textContent).toContain('**bold**');
      expect(td.textContent).toContain('[link](http://obsidian.md)');
      expect(td.textContent).toContain('αβγ');

      // Not transformed into table block or full page
      expect(td.querySelector('.word-equation-table-block')).toBeNull();
      expect(td.querySelector('.word-equation-full-page')).toBeNull();
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(false);
      expect(td.classList.contains('table-cell-has-fullpage-equation')).toBe(false);
      expect(td.style.padding).not.toBe('0px');
    });

    it('STRESS-10: Multiple inline equations in single table cell with interleaved text', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      td.innerHTML = 'Start text /weq_inline <math><mi>X</mi></math> /weq_inline middle text /weq_inline <math><mi>Y</mi></math> /weq_inline end text';

      processor(td);

      // Both equations rendered
      const renderedMaths = td.querySelectorAll('.word-equation-math');
      expect(renderedMaths.length).toBe(2);

      // All interleaved text preserved
      expect(td.textContent).toContain('Start text');
      expect(td.textContent).toContain('middle text');
      expect(td.textContent).toContain('end text');

      // No delimiter leaks
      expect(td.textContent).not.toContain('/weq_inline');

      // Cell padding unaffected
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(false);
      expect(td.style.padding).not.toBe('0px');
    });

    it('STRESS-11: Metric consistency between WordEquationWidget and post-processor DOM', () => {
      // 1. Widget rendering in editor mode
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>',
        0,
        50,
        false,
        'math-word',
        true // isBlockInTable
      );
      const editorDom = (widget as any).renderCurrentDom();
      const editorMathBox = editorDom.querySelector('.word-equation-math') as HTMLElement;

      // 2. Post-processor rendering in reading/unfocused mode
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.innerHTML = '```math-word<br><math display="block"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math><br>```';
      processor(td);
      const readingMathBox = td.querySelector('.word-equation-math') as HTMLElement;

      expect(editorMathBox).not.toBeNull();
      expect(readingMathBox).not.toBeNull();

      // Metric parity check
      expect(editorMathBox.style.padding).toBe('6px 12px');
      expect(readingMathBox.style.padding).toBe('6px 12px');

      expect(editorMathBox.style.borderRadius).toBe('6px');
      expect(readingMathBox.style.borderRadius).toBe('6px');

      expect(editorMathBox.style.minHeight).toBe('2.2em');
      expect(readingMathBox.style.minHeight).toBe('2.2em');

      // Neither must have 100% height or 0 border-radius
      expect(editorMathBox.style.height).not.toBe('100%');
      expect(readingMathBox.style.height).not.toBe('100%');
      expect(editorMathBox.style.borderRadius).not.toBe('0');
      expect(readingMathBox.style.borderRadius).not.toBe('0');
    });

    it('STRESS-12: Full-line vs Full-page styling isolation in styles.css', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(stylesPath, 'utf8');

      // 1. Verify full-page equations have padding: 0
      expect(cssContent).toMatch(/td\.table-cell-has-fullpage-equation[^}]*padding:\s*0\s*!important/);

      // 2. Check for conflicting override at the bottom of styles.css (lines 1160-1203)
      // If lines 1160-1203 still contain td.table-cell-has-block-equation { padding: 0 !important; }
      // or td .word-equation-table-block .word-equation-math { border-radius: 0 !important; },
      // they override the fix on lines 84-110 due to CSS source-order cascade rules!
      const hasOverridingBlockPadding = /td\.table-cell-has-block-equation[^{]*\{[^}]*padding:\s*0\s*!important/i.test(cssContent);
      const hasOverridingBorderRadius = /td \.word-equation-table-block \.word-equation-math[^{]*\{[^}]*border-radius:\s*0\s*!important/i.test(cssContent);

      expect(hasOverridingBlockPadding).toBe(false);
      expect(hasOverridingBorderRadius).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 3: BUG 4 — COMMAND PALETTE & DELIMITER SETTINGS
  // =========================================================================
  describe('Adversarial Bug 4: Command Registration and Settings Delimiters', () => {
    it('STRESS-13: Full command registration check in src/main.ts', async () => {
      const registeredCommands: Array<{ id: string; name: string; editorCallback?: any }> = [];
      (plugin as any).addCommand = (cmd: any) => {
        registeredCommands.push(cmd);
        return cmd;
      };

      await plugin.onload();

      const cmd = registeredCommands.find((c) => c.id === 'insert-full-page-equation');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('Insert full-page math block');
      expect(typeof cmd?.editorCallback).toBe('function');
    });

    it('STRESS-14: Template generation with defaultDelimiter math-word vs weq', async () => {
      let callback: ((editor: any) => void) | null = null;
      (plugin as any).addCommand = (cmd: any) => {
        if (cmd.id === 'insert-full-page-equation') {
          callback = cmd.editorCallback;
        }
        return cmd;
      };

      // Test Mode 1: math-word
      plugin.settings.defaultDelimiter = 'math-word';
      await plugin.onload();
      expect(callback).not.toBeNull();

      let output1 = '';
      callback!({ replaceSelection: (t: string) => (output1 = t) });
      expect(output1.startsWith('```math-page\n')).toBe(true);
      expect(output1).toContain('display="full-page"');
      expect(output1.endsWith('```\n')).toBe(true);

      // Test Mode 2: weq
      plugin.settings.defaultDelimiter = 'weq';
      let output2 = '';
      callback!({ replaceSelection: (t: string) => (output2 = t) });
      expect(output2.startsWith('```weq-page\n')).toBe(true);
      expect(output2).toContain('display="full-page"');
      expect(output2.endsWith('```\n')).toBe(true);
    });

    it('STRESS-15: CM6 EditorState parses generated template into full-page decoration', () => {
      const template = '```math-page\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="full-page">\n  <mrow></mrow>\n</math>\n```\n';
      const state = EditorState.create({
        doc: template,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let capturedWidget: WordEquationWidget | null = null;
      decSet.between(0, template.length, (from, to, dec) => {
        capturedWidget = (dec.spec as any).widget;
      });

      expect(capturedWidget).not.toBeNull();
      expect((capturedWidget as any).displayMode).toBe('full-page');
      expect((capturedWidget as any).isInline).toBe(false);
      expect((capturedWidget as any).delimiter).toBe('math-page');
    });
  });
});
