import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { resetIdCounter, createRadical, createToken, createSlot } from '../../src/core/ast';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { getDebugLogger } from '../../src/debug/debug-logger';
import { registerConversionCommands, convertCurrentNote } from '../../src/conversion/commands';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import WordEquationPlugin from '../../src/main';

describe('Adversarial Challenger 2 (Gen 64): Empirical Verification Suite for R4, R5, and R6', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    getDebugLogger().resetForTesting();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // REQUIREMENT R4: Radical Rendering without .innerHTML, SVG DOM & Hit-Testing
  // =========================================================================
  describe('Requirement R4: Radical Rendering & DOM Security', () => {
    it('R4.1: renders radical with exact SVG namespace, tag names, and SVG attributes without using .innerHTML', () => {
      const ast = parseMathML('<math><msqrt><mi>x</mi></msqrt></math>');
      expect(ast).toBeDefined();

      // Spy on innerHTML setter on Element prototype
      const innerHtmlSpy = vi.spyOn(Element.prototype, 'innerHTML', 'set');

      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      // Verify innerHTML was NEVER invoked during rendering
      expect(innerHtmlSpy).not.toHaveBeenCalled();

      // Locate surd and SVG elements
      const surd = rendered.querySelector('.eq-radical-surd');
      expect(surd).not.toBeNull();
      expect(surd!.getAttribute('aria-hidden')).toBe('true');

      const svg = surd!.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.tagName.toLowerCase()).toBe('svg');
      expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg!.getAttribute('viewBox')).toBe('0 0 12 24');
      expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg!.getAttribute('class')).toBe('eq-radical-svg');

      // Locate path element
      const pathEl = svg!.querySelector('path');
      expect(pathEl).not.toBeNull();
      expect(pathEl!.tagName.toLowerCase()).toBe('path');
      expect(pathEl!.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(pathEl!.getAttribute('d')).toBe('M1 13 L3 13 L6 23 L11 1 L12 1');
      expect(pathEl!.getAttribute('fill')).toBe('none');
      expect(pathEl!.getAttribute('stroke')).toBe('currentColor');
      expect(pathEl!.getAttribute('stroke-width')).toBe('1.3');
      expect(pathEl!.getAttribute('stroke-linecap')).toBe('square');
      expect(pathEl!.getAttribute('stroke-linejoin')).toBe('miter');

      // Locate radicand and ensure slot exists
      const radicand = rendered.querySelector('.eq-radicand');
      expect(radicand).not.toBeNull();
      const token = radicand!.querySelector('.eq-token');
      expect(token).not.toBeNull();
      expect(token!.textContent).toBe('x');
    });

    it('R4.2: renders mroot (root with index) with valid SVG and index slot structure', () => {
      const ast = parseMathML('<math><mroot><mi>y</mi><mn>3</mn></mroot></math>');
      expect(ast).toBeDefined();

      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      const radContainer = rendered.querySelector('.eq-radical');
      expect(radContainer).not.toBeNull();

      // Index slot
      const indexEl = radContainer!.querySelector('.eq-radical-index');
      expect(indexEl).not.toBeNull();
      expect(indexEl!.textContent).toContain('3');

      // Surd SVG
      const surd = radContainer!.querySelector('.eq-radical-surd');
      expect(surd).not.toBeNull();
      const svg = surd!.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');

      // Radicand
      const radicand = radContainer!.querySelector('.eq-radicand');
      expect(radicand).not.toBeNull();
      expect(radicand!.textContent).toContain('y');
    });

    it('R4.3: renders deeply nested radicals and fractions with independent valid SVG instances', () => {
      // Expression: \frac{\sqrt{a + \sqrt{b}}}{\sqrt[4]{\frac{c}{d}}}
      const ast = parseMathML(`
        <math>
          <mfrac>
            <mrow>
              <msqrt>
                <mrow>
                  <mi>a</mi>
                  <mo>+</mo>
                  <msqrt><mi>b</mi></msqrt>
                </mrow>
              </msqrt>
            </mrow>
            <mrow>
              <mroot>
                <mfrac><mi>c</mi><mi>d</mi></mfrac>
                <mn>4</mn>
              </mroot>
            </mrow>
          </mfrac>
        </math>
      `);

      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      const svgs = rendered.querySelectorAll('svg.eq-radical-svg');
      expect(svgs.length).toBe(3); // Outer sqrt, inner sqrt(b), and denominator mroot

      for (let i = 0; i < svgs.length; i++) {
        const svg = svgs[i];
        expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
        const p = svg.querySelector('path');
        expect(p).not.toBeNull();
        expect(p!.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(p!.getAttribute('d')).toBe('M1 13 L3 13 L6 23 L11 1 L12 1');
      }
    });

    it('R4.4: safely escapes hostile slot content and never uses .innerHTML for token contents', () => {
      // Construct AST directly with hostile strings
      const hostileSlot = createSlot('radicand', [
        createToken('<script>alert("pwned")</script>', 'mi'),
        createToken('"><img src=x onerror=alert(1)>', 'mo'),
      ]);
      const radNode = createRadical(hostileSlot);
      const rootSlot = createSlot('root', [radNode]);

      const innerHtmlSpy = vi.spyOn(Element.prototype, 'innerHTML', 'set');
      const renderer = new DomRenderer(document);
      const rendered = renderer.render(rootSlot);
      container.appendChild(rendered);

      expect(innerHtmlSpy).not.toHaveBeenCalled();
      // Ensure no script or img elements were injected
      expect(rendered.querySelectorAll('script').length).toBe(0);
      expect(rendered.querySelectorAll('img').length).toBe(0);
      expect(rendered.textContent).toContain('<script>alert("pwned")</script>');
    });

    it('R4.5: hit-testing maps clicks on radical surd SVG and paths directly to radicand slot', () => {
      const ast = parseMathML('<math><msqrt><mi>x</mi></msqrt></math>');
      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      const surd = rendered.querySelector('.eq-radical-surd') as HTMLElement;
      const svg = surd.querySelector('svg') as unknown as HTMLElement;
      const pathEl = svg.querySelector('path') as unknown as HTMLElement;
      const radicandSlot = rendered.querySelector('.eq-radicand .eq-slot') as HTMLElement;
      const radicandSlotId = radicandSlot.getAttribute('data-slot-id');

      expect(radicandSlotId).toBeTruthy();

      // Click on surd container
      const hitSurd = handleMouseClick(ast, rendered, 10, 10, surd);
      expect(hitSurd.slotId).toBe(radicandSlotId);

      // Click on svg element
      const hitSvg = handleMouseClick(ast, rendered, 10, 10, svg);
      expect(hitSvg.slotId).toBe(radicandSlotId);

      // Click on path element inside SVG
      const hitPath = handleMouseClick(ast, rendered, 10, 10, pathEl);
      expect(hitPath.slotId).toBe(radicandSlotId);
    });

    it('R4.6: hit-testing maps clicks on root index vs radicand correctly', () => {
      const ast = parseMathML('<math><mroot><mi>x</mi><mn>3</mn></mroot></math>');
      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      const indexSlot = rendered.querySelector('.eq-radical-index .eq-slot') as HTMLElement;
      const indexSlotId = indexSlot.getAttribute('data-slot-id');

      const radicandSlot = rendered.querySelector('.eq-radicand .eq-slot') as HTMLElement;
      const radicandSlotId = radicandSlot.getAttribute('data-slot-id');

      // Click on index token
      const indexToken = rendered.querySelector('.eq-radical-index .eq-token') as HTMLElement;
      const hitIndex = handleMouseClick(ast, rendered, 5, 5, indexToken);
      expect(hitIndex.slotId).toBe(indexSlotId);

      // Click on surd: should go to radicand
      const surd = rendered.querySelector('.eq-radical-surd') as HTMLElement;
      const hitSurd = handleMouseClick(ast, rendered, 15, 15, surd);
      expect(hitSurd.slotId).toBe(radicandSlotId);
    });
    it('R4.7: fallback creation when createElementNS is not available uses createElement safely without .innerHTML', () => {
      // Mock document without createElementNS
      const mockDoc = {
        createElement: (tag: string) => document.createElement(tag),
        createElementNS: undefined,
      } as any;

      const innerHtmlSpy = vi.spyOn(Element.prototype, 'innerHTML', 'set');
      const renderer = new DomRenderer(mockDoc);
      const ast = parseMathML('<math><msqrt><mi>k</mi></msqrt></math>');
      const rendered = renderer.render(ast);

      expect(innerHtmlSpy).not.toHaveBeenCalled();
      const surd = rendered.querySelector('.eq-radical-surd');
      expect(surd).not.toBeNull();
      const svg = surd!.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('class')).toBe('eq-radical-svg');
      const pathEl = svg!.querySelector('path');
      expect(pathEl).not.toBeNull();
      expect(pathEl!.getAttribute('d')).toBe('M1 13 L3 13 L6 23 L11 1 L12 1');
    });

    it('R4.8: nested radical in fraction denominator accurately resolves hit-testing', () => {
      const ast = parseMathML('<math><mfrac><mn>1</mn><msqrt><mi>k</mi></msqrt></mfrac></math>');
      const renderer = new DomRenderer(document);
      const rendered = renderer.render(ast);
      container.appendChild(rendered);

      const numSlot = rendered.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numSlot.getAttribute('data-slot-id');

      const denRadSlot = rendered.querySelector('.eq-denominator .eq-radicand .eq-slot') as HTMLElement;
      const denRadSlotId = denRadSlot.getAttribute('data-slot-id');

      // Clicking token inside denominator radicand targets radicand slot
      const denToken = rendered.querySelector('.eq-denominator .eq-radicand .eq-token') as HTMLElement;
      const hitDenToken = handleMouseClick(ast, rendered, 20, 20, denToken);
      expect(hitDenToken.slotId).toBe(denRadSlotId);

      // Clicking numerator token targets numerator slot
      const numToken = rendered.querySelector('.eq-numerator .eq-token') as HTMLElement;
      const hitNum = handleMouseClick(ast, rendered, 5, 5, numToken);
      expect(hitNum.slotId).toBe(numSlotId);
    });
  });

  // =========================================================================
  // REQUIREMENT R5: Floating Promises, Deprecated APIs & Telemetry Invariants
  // =========================================================================
  describe('Requirement R5: Floating Promises & Deprecated APIs Audit', () => {
    it('R5.8: vault read / modify failure during convertCurrentNote handles rejection gracefully', async () => {
      const failingPlugin = {
        app: {
          workspace: {
            getActiveViewOfType: () => ({ file: { path: 'fail.md' }, editor: { setValue: () => {} } }),
            getActiveFile: () => ({ path: 'fail.md' }),
            getLeaf: () => null,
          },
          vault: {
            read: async () => {
              throw new Error('Disk I/O failure');
            },
            modify: async () => {},
          },
        },
      } as any;

      // Must catch error internally and return { convertedCount: 0 } without throwing unhandled rejection
      const result = await convertCurrentNote(failingPlugin, 'latex-to-mathml');
      expect(result).toEqual({ convertedCount: 0 });
    });

    it('R5.9: telemetry correctly records isPropagationStopped without altering original event or calling stopPropagation', () => {
      const logger = getDebugLogger();
      logger.setEnabled(true);

      const stopPropSpy = vi.spyOn(Event.prototype, 'stopPropagation');

      const testTarget = document.createElement('div');
      testTarget.className = 'word-equation-math';
      container.appendChild(testTarget);

      // Create an event that has defaultPrevented = true
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      ev.preventDefault();
      expect(ev.defaultPrevented).toBe(true);

      testTarget.dispatchEvent(ev);

      // Logger should NOT have called stopPropagation
      expect(stopPropSpy).not.toHaveBeenCalled();

      const events = logger.getEvents();
      const escEvent = events.find((e) => (e.details as any)?.key === 'Escape');
      expect(escEvent).toBeDefined();
      expect((escEvent!.details as any).isPropagationStopped).toBe(true);
      expect((escEvent!.details as any).cancelBubble).toBeUndefined();
    });

    it('R5.1: conversion command registrations return void and execute async functions with proper floating promise guards', async () => {
      const registeredCommands: Array<{ id: string; name: string; callback: () => void }> = [];
      const fakePlugin = {
        addCommand: (cmd: any) => {
          registeredCommands.push(cmd);
        },
        app: {
          workspace: {
            getActiveViewOfType: () => null,
            getLeaf: () => null,
          },
          vault: {
            getMarkdownFiles: () => [],
            read: async () => '',
            modify: async () => {},
          },
        },
      } as any;

      registerConversionCommands(fakePlugin);
      expect(registeredCommands.length).toBe(4);

      // Trigger all four command callbacks
      for (const cmd of registeredCommands) {
        expect(typeof cmd.callback).toBe('function');
        // Must execute synchronously and return undefined (void)
        const ret = cmd.callback();
        expect(ret).toBeUndefined();
      }
    });

    it('R5.2: InteractiveEquationBox emitChange and handleCopy safely handle promises without floating unhandled rejections', () => {
      let changeFired = false;
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math><mi>x</mi></math>',
        onChange: async (_xml: string) => {
          changeFired = true;
          return Promise.resolve();
        },
      });

      // Trigger emitChange via private method reflection
      (box as any).emitChange();
      expect(changeFired).toBe(true);

      // Trigger handleCopyEvent with mocked clipboard
      const clipboardData: Record<string, string> = {};
      const fakeClipboardEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clipboardData: {
          setData: (type: string, val: string) => {
            clipboardData[type] = val;
          },
        },
      } as any;

      expect(() => box.handleCopyEvent(fakeClipboardEvent, false)).not.toThrow();
      expect(clipboardData['text/plain']).toBeDefined();
    });

    it('R5.3: plugin lifecycle onunload is strictly synchronous void and does not return a Promise', () => {
      const plugin = new WordEquationPlugin({} as any, { id: 'word-equation' } as any);
      expect(typeof plugin.onunload).toBe('function');

      const ret = plugin.onunload();
      // Must strictly be undefined (void), NOT a Promise
      expect(ret).toBeUndefined();
      expect((ret as any) instanceof Promise).toBe(false);
    });

    it('R5.4: static audit verifies ZERO activeLeaf occurrences across entire src/ directory', () => {
      const srcDir = path.resolve(__dirname, '../../src');

      function scanDir(dir: string): string[] {
        let files: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files = files.concat(scanDir(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const tsFiles = scanDir(srcDir);
      expect(tsFiles.length).toBeGreaterThan(10);

      const violations: Array<{ file: string; line: number; text: string }> = [];
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('activeLeaf')) {
            violations.push({ file: path.relative(srcDir, file), line: idx + 1, text: line.trim() });
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it('R5.5: runtime workspace activeLeaf poison trap is NEVER triggered by plugin commands', async () => {
      const poisonWorkspace = {
        get activeLeaf(): any {
          throw new Error('VIOLATION: deprecated activeLeaf was accessed!');
        },
        getActiveViewOfType: vi.fn().mockReturnValue(null),
        getLeaf: vi.fn().mockReturnValue({ view: { file: null, editor: null } }),
        getLeavesOfType: vi.fn().mockReturnValue([]),
      };

      const pluginMock = {
        app: {
          workspace: poisonWorkspace,
          vault: {
            getMarkdownFiles: () => [],
            read: async () => '',
            modify: async () => {},
          },
        },
      } as any;

      // Executing convertCurrentNote should NOT trigger the poison getter
      await expect(convertCurrentNote(pluginMock, 'latex-to-mathml')).resolves.not.toThrow();

      // Executing insertMathFromGallery fallback should NOT trigger the poison getter
      const wordPlugin = new WordEquationPlugin(pluginMock.app, { id: 'word-equation' } as any);
      expect(() => wordPlugin.insertMathFromGallery('<math><mi>x</mi></math>')).not.toThrow();

      expect(poisonWorkspace.getLeaf).toHaveBeenCalled();
    });

    it('R5.6: static audit verifies ZERO cancelBubble occurrences across entire src/ directory', () => {
      const srcDir = path.resolve(__dirname, '../../src');

      function scanDir(dir: string): string[] {
        let files: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files = files.concat(scanDir(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const tsFiles = scanDir(srcDir);
      const violations: Array<{ file: string; line: number; text: string }> = [];
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('cancelBubble')) {
            violations.push({ file: path.relative(srcDir, file), line: idx + 1, text: line.trim() });
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it('R5.7: telemetry listeners operate in strictly passive mode without stopping propagation or mutating events', () => {
      const logger = getDebugLogger();
      logger.setEnabled(true);

      // Create a test DOM tree with parent and child
      const parentEl = document.createElement('div');
      parentEl.className = 'test-parent';
      const targetEl = document.createElement('div');
      targetEl.className = 'word-equation-math';
      parentEl.appendChild(targetEl);
      container.appendChild(parentEl);

      let parentReceivedBubble = false;
      let parentReceivedCapture = false;

      parentEl.addEventListener(
        'keydown',
        () => {
          parentReceivedCapture = true;
        },
        true
      );

      parentEl.addEventListener(
        'keydown',
        () => {
          parentReceivedBubble = true;
        },
        false
      );

      // Spy on stopPropagation and stopImmediatePropagation
      const stopPropSpy = vi.spyOn(Event.prototype, 'stopPropagation');
      const stopImmSpy = vi.spyOn(Event.prototype, 'stopImmediatePropagation');

      // Dispatch keyboard event to child
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });

      targetEl.dispatchEvent(keyEvent);

      // Assert telemetry never stopped propagation
      expect(stopPropSpy).not.toHaveBeenCalled();
      expect(stopImmSpy).not.toHaveBeenCalled();
      expect(parentReceivedCapture).toBe(true);
      expect(parentReceivedBubble).toBe(true);
      expect(keyEvent.defaultPrevented).toBe(false);

      // Check captured telemetry events
      const events = logger.getEvents();
      const keyEvents = events.filter((e) => e.type === 'keydown' || (e.details as any)?.key === 'ArrowRight');
      expect(keyEvents.length).toBeGreaterThan(0);

      // Ensure logged event data does not have cancelBubble property
      for (const entry of keyEvents) {
        expect((entry.details as any).cancelBubble).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // REQUIREMENT R6: Integrity Verification
  // =========================================================================
  describe('Requirement R6: Regressions & Invariant Assurance', () => {
    it('R6.1: ensures DomRenderer handles undefined and headless document instances cleanly', () => {
      // Create headless DomRenderer
      const renderer = new DomRenderer();
      expect(renderer).toBeDefined();

      const ast = parseMathML('<math><mi>z</mi></math>');
      const el = renderer.render(ast);
      expect(el).toBeDefined();
      expect(el.textContent).toContain('z');
    });

    it('R6.2: ensures static styles in styles.css provide adequate styling for radical SVG', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      expect(cssContent).toContain('.eq-radical');
      expect(cssContent).toContain('.eq-radical-surd');
      expect(cssContent).toContain('.eq-radical-svg');
    });
  });
});
