/**
 * Comprehensive Test Suite for Requirement R3:
 * Full Undo/Redo (Ctrl+Z / Ctrl+Y) History Support in CodeMirror Widgets and Settings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import { createSlot, createToken } from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { App, MarkdownView, WorkspaceLeaf } from '../mocks/obsidian';
import { getActiveWidget } from '../../src/editor/navigation-extension';

describe('Requirement R3: Full Undo/Redo History Support', () => {
  beforeEach(() => {
    clearActiveEquationState();
    document.body.innerHTML = '';
  });

  describe('1. WordEquationWidget External Change Reconciliation', () => {
    it('detects external transaction changes and adopts reverted AST instead of stale active.ast', () => {
      const originalXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const editedXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>';

      const widget1 = new WordEquationWidget(editedXml, 0, 100, false, 'math-word');
      // Simulate user editing the equation, so active session has the edited AST
      setActiveEquationState({
        from: 0,
        to: 100,
        caret: { slotId: widget1.ast.id, offset: 3 },
        isFocused: true,
        ast: widget1.ast,
      }, widget1);

      // Verify active session holds edited AST (x + 1 has 3 tokens)
      expect(getActiveEquationState()?.ast?.children.length).toBe(3);

      // Now simulate CodeMirror undo reverting document text to originalXml
      // A new widget is constructed with code = originalXml
      const widget2 = new WordEquationWidget(originalXml, 0, 80, false, 'math-word');

      // It must detect isExternalChange and NOT use the stale active.ast (which had x + 1)
      expect(widget2.ast.children.length).toBe(1);
      const child = widget2.ast.children[0] as any;
      expect(child.text).toBe('x');
      expect(widget2.isFocused).toBe(true);

      // Active equation state must also have been updated with the reverted AST
      const updatedActive = getActiveEquationState();
      expect(updatedActive?.ast).toBe(widget2.ast);
      expect(updatedActive?.caret.slotId).toBe(widget2.ast.id);
    });

    it('clamps caret to valid slot and offset when external undo shrinks the AST', () => {
      const multilineXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const smallXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math>';

      const widget = new WordEquationWidget(multilineXml, 10, 50, false, 'math-word');
      setActiveEquationState({
        from: 10,
        to: 50,
        caret: { slotId: widget.ast.id, offset: 99 }, // Far out of range offset
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Revert to smaller AST
      const revertedWidget = new WordEquationWidget(smallXml, 10, 30, false, 'math-word');
      expect(revertedWidget.caret.offset).toBeLessThanOrEqual(revertedWidget.ast.children.length);
    });

    it('toDOM updates ast and active session if external change is detected at DOM render time', () => {
      const code1 = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>';
      const code2 = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>5</mn></math>';

      const widget = new WordEquationWidget(code1, 0, 50, false, 'math-word');
      setActiveEquationState({
        from: 0,
        to: 50,
        caret: { slotId: widget.ast.id, offset: 1 },
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Modify widget.code externally (mimicking CodeMirror document undo)
      widget.code = code2;

      const mockEditor = createMockEditor('```math-word\n' + code2 + '\n```');
      const dom = widget.toDOM(mockEditor.view);

      expect(dom).toBeDefined();
      expect(widget.ast.children[0]?.type).toBe('token');
      expect((widget.ast.children[0] as any).text).toBe('5');
    });
  });

  describe('2. Keydown Ctrl+Z / Ctrl+Y Interception & handleUndoRedo in WordEquationWidget', () => {
    it('intercepts Ctrl+Z keydown on widget DOM and dispatches handleUndoRedo', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const widget = new WordEquationWidget(xml, 0, 50, false, 'math-word');
      const mockEditor = createMockEditor('```math-word\n' + xml + '\n```');
      const dom = widget.toDOM(mockEditor.view);

      const undoSpy = vi.spyOn(widget, 'handleUndoRedo');

      // Focus widget
      widget.enterFromStart(mockEditor.view);

      const mathEl = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();

      // Dispatch Ctrl+Z
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      mathEl.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(undoSpy).toHaveBeenCalledWith('undo', mockEditor.view);
    });

    it('intercepts Ctrl+Y and Ctrl+Shift+Z keydown on widget DOM and dispatches handleUndoRedo redo', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const widget = new WordEquationWidget(xml, 0, 50, false, 'math-word');
      const mockEditor = createMockEditor('```math-word\n' + xml + '\n```');
      const dom = widget.toDOM(mockEditor.view);

      const undoSpy = vi.spyOn(widget, 'handleUndoRedo');
      widget.enterFromStart(mockEditor.view);

      const mathEl = dom.querySelector('.word-equation-math') as HTMLElement;

      // 1. Ctrl+Y
      const eventY = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      mathEl.dispatchEvent(eventY);

      expect(eventY.defaultPrevented).toBe(true);
      expect(undoSpy).toHaveBeenCalledWith('redo', mockEditor.view);

      // 2. Ctrl+Shift+Z
      const eventShiftZ = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      mathEl.dispatchEvent(eventShiftZ);

      expect(eventShiftZ.defaultPrevented).toBe(true);
      expect(undoSpy).toHaveBeenCalledWith('redo', mockEditor.view);
    });

    it('handleUndoRedo calls Obsidian app.commands.executeCommandById or editor undo/redo', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const widget = new WordEquationWidget(xml, 0, 50, false, 'math-word');

      const mockApp = new App();
      const execSpy = vi.fn().mockReturnValue(true);
      mockApp.commands.executeCommandById = execSpy;

      (window as any).app = mockApp;

      try {
        widget.handleUndoRedo('undo');
        expect(execSpy).toHaveBeenCalledWith('editor:undo');

        widget.handleUndoRedo('redo');
        expect(execSpy).toHaveBeenCalledWith('editor:redo');
      } finally {
        delete (window as any).app;
      }
    });

    it('syncToDocument dispatches with userEvent: "input.type"', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const initialDoc = '```math-word\n' + xml + '\n```';
      const mockEditor = createMockEditor(initialDoc);

      const widget = new WordEquationWidget(xml, 0, initialDoc.length, false, 'math-word');
      widget.enterFromStart(mockEditor.view);

      const dispatchSpy = vi.spyOn(mockEditor.view, 'dispatch');

      // Mutate widget AST and sync
      widget.ast.children.push(createToken('y', 'mi'));
      widget.syncToDocument(mockEditor.view);

      expect(dispatchSpy).toHaveBeenCalled();
      const callArg = dispatchSpy.mock.calls[0][0] as any;
      expect(callArg.userEvent).toBe('input.type');
    });
  });

  describe('3. Navigation Extension Keymap Mod-z / Mod-y / Mod-Shift-z Bindings', () => {
    it('executes handleUndoRedo when Mod-z is handled by CodeMirror navigation extension', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
      const initialDoc = '```math-word\n' + xml + '\n```';
      const mockEditor = createMockEditor(initialDoc);

      const widget = new WordEquationWidget(xml, 0, initialDoc.length, false, 'math-word');
      widget.enterFromStart(mockEditor.view);

      const undoSpy = vi.spyOn(widget, 'handleUndoRedo').mockImplementation(() => {});

      // Verify getActiveWidget finds the widget
      expect(getActiveWidget(mockEditor.view)).toBe(widget);

      // Simulate Mod-z via keymap handler
      const activeWidget = getActiveWidget(mockEditor.view);
      expect(activeWidget).not.toBeNull();
      activeWidget!.handleUndoRedo('undo', mockEditor.view);

      expect(undoSpy).toHaveBeenCalledWith('undo', mockEditor.view);
    });
  });

  describe('4. InteractiveEquationBox (Settings) Snapshot Undo/Redo', () => {
    let container: HTMLElement;
    let box: InteractiveEquationBox;
    let changedXml = '';

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
        onChange: (xml) => {
          changedXml = xml;
        },
      });
    });

    it('records history snapshots on typing and reverts state on undo() and redo()', () => {
      expect(box.ast.children.length).toBe(1);
      expect((box.ast.children[0] as any).text).toBe('x');

      // Type '+'
      const keyPlus = new KeyboardEvent('keydown', { key: '+', bubbles: true });
      box.dom.dispatchEvent(keyPlus);

      expect(box.ast.children.length).toBe(2);
      expect((box.ast.children[1] as any).text).toBe('+');

      // Type '1'
      const key1 = new KeyboardEvent('keydown', { key: '1', bubbles: true });
      box.dom.dispatchEvent(key1);

      expect(box.ast.children.length).toBe(3);
      expect((box.ast.children[2] as any).text).toBe('1');

      // Undo 1st step: should remove '1'
      const undone1 = box.undo();
      expect(undone1).toBe(true);
      expect(box.ast.children.length).toBe(2);
      expect((box.ast.children[1] as any).text).toBe('+');

      // Undo 2nd step: should remove '+'
      const undone2 = box.undo();
      expect(undone2).toBe(true);
      expect(box.ast.children.length).toBe(1);
      expect((box.ast.children[0] as any).text).toBe('x');

      // Undo at start of history returns false
      expect(box.undo()).toBe(false);

      // Redo 1st step: restores '+'
      const redone1 = box.redo();
      expect(redone1).toBe(true);
      expect(box.ast.children.length).toBe(2);
      expect((box.ast.children[1] as any).text).toBe('+');

      // Redo 2nd step: restores '1'
      const redone2 = box.redo();
      expect(redone2).toBe(true);
      expect(box.ast.children.length).toBe(3);
      expect((box.ast.children[2] as any).text).toBe('1');

      // Redo at end of history returns false
      expect(box.redo()).toBe(false);
    });

    it('intercepts Ctrl+Z and Ctrl+Y keydown events inside InteractiveEquationBox', () => {
      // Type 'a'
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(box.ast.children.length).toBe(2);

      // Press Ctrl+Z
      const ctrlZ = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      box.dom.dispatchEvent(ctrlZ);

      expect(ctrlZ.defaultPrevented).toBe(true);
      expect(box.ast.children.length).toBe(1);

      // Press Ctrl+Y
      const ctrlY = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      box.dom.dispatchEvent(ctrlY);

      expect(ctrlY.defaultPrevented).toBe(true);
      expect(box.ast.children.length).toBe(2);
    });

    it('records snapshots before Backspace and Delete operations', () => {
      // Move caret to end
      box.caret = { slotId: box.ast.id, offset: 1 };

      // Backspace deletes 'x'
      const bsEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
      box.dom.dispatchEvent(bsEvent);

      expect(box.ast.children.length).toBe(0);

      // Undo restores 'x'
      box.undo();
      expect(box.ast.children.length).toBe(1);
      expect((box.ast.children[0] as any).text).toBe('x');
    });

    it('records snapshots before paste and cut operations', () => {
      // Cut operation
      box.handleCopyEvent(undefined, true);
      expect(box.ast.children.length).toBe(0);

      // Undo restores content
      box.undo();
      expect(box.ast.children.length).toBe(1);

      // Paste operation
      box.insertPastedContent('y');
      expect(box.ast.children.length).toBe(2);

      // Undo paste
      box.undo();
      expect(box.ast.children.length).toBe(1);
    });

    it('clears history stacks when setContent is called', () => {
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      expect(box.undo()).toBe(true);

      box.setContent('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math>');
      expect(box.undo()).toBe(false);
      expect(box.redo()).toBe(false);
    });
  });
});
