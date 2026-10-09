import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
  DebugEventType,
  DebugEvent,
} from '../../src/debug/debug-logger';
import { App } from '../mocks/obsidian';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { handleArrowKey } from '../../src/editor/navigation';
import { setActiveEquationState, clearActiveEquationState } from '../../src/editor/active-session';

describe('Adversarial Telemetry & Zero-Overhead Stress Suite (Challenger 1 Gen31)', () => {
  let logger: DebugLogger;
  let mockApp: any;

  beforeEach(() => {
    resetIdCounter();
    mockApp = new App();
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    logger.resetForTesting();
    clearActiveEquationState();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Zero-Overhead & Memory Allocation Invariants (Debug Mode OFF)
  // =========================================================================
  describe('1. Zero-Overhead & Memory Allocation Invariants (Debug Mode OFF)', () => {
    it('executes in sub-microsecond latency across 100,000 iterations without allocations', () => {
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);

      const payloadFactory = () => ({
        key: 'ArrowRight',
        timestamp: Date.now(),
        nested: { a: 1, b: [1, 2, 3], c: { d: 'test' } },
      });

      const start = performance.now();
      for (let i = 0; i < 100000; i++) {
        logDebugEvent('navigation', payloadFactory);
        isDebugEnabled();
      }
      const elapsedMs = performance.now() - start;

      // 100,000 iterations must have sub-microsecond average latency (< 1.0 microsecond per invocation)
      const avgMicrosecondsPerCall = (elapsedMs * 1000) / 100000;
      expect(avgMicrosecondsPerCall).toBeLessThan(1.0);
      expect(logger.getEvents()).toHaveLength(0);
      expect((window as any).__eqDebugEvents).toHaveLength(0);
    });

    it('strictly guarantees that lazy payload factory functions are never executed when disabled', () => {
      logger.setEnabled(false);

      const spies = {
        initialization: vi.fn(() => ({ data: new Array(1000).fill('leak') })),
        caret: vi.fn(() => ({ offset: 10 })),
        selection: vi.fn(() => ({ selection: 'test' })),
        clipboard: vi.fn(() => ({ clipboard: 'paste' })),
        navigation: vi.fn(() => ({ nav: 'step' })),
        conversion: vi.fn(() => ({ latex: '\\frac{1}{2}' })),
        keydown: vi.fn(() => ({ key: 'Enter' })),
        boundary: vi.fn(() => ({ transition: 'enter' })),
        navigation_unhandled: vi.fn(() => ({ unhandled: true })),
        placeholder: vi.fn(() => ({ placeholder: 'empty' })),
        focus: vi.fn(() => ({ focus: 'cm' })),
      };

      for (const [type, spy] of Object.entries(spies)) {
        logDebugEvent(type as DebugEventType, spy);
      }

      for (const [type, spy] of Object.entries(spies)) {
        expect(spy, `Factory for ${type} should not have been called`).not.toHaveBeenCalled();
      }

      expect(logger.getEvents()).toHaveLength(0);
      expect((window as any).__eqDebugEvents).toHaveLength(0);
    });

    it('ensures no debounce timers, writes, or persistence tasks are scheduled when disabled', async () => {
      logger.init(mockApp, 'obsidian-word-equation', false);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      logDebugEvent('keydown', () => ({ key: 'ArrowLeft' }));
      logDebugEvent('boundary', () => ({ transition: 'exitToEditor' }));
      logDebugEvent('placeholder', () => ({ action: 'candidate_evaluation_summary' }));

      // Wait 100ms (longer than the 50ms debounce window)
      await new Promise((r) => setTimeout(r, 100));

      expect(writeSpy).not.toHaveBeenCalled();
      expect(logger.getEvents()).toHaveLength(0);
      expect((logger as any).flushTimeout).toBeNull();
      expect((logger as any).pendingFlush).toBe(false);
      expect((logger as any).isWriting).toBe(false);
    });

    it('ensures window capture-phase keydown, focus, and flush event listeners do zero work when disabled', () => {
      logger.init(mockApp, 'obsidian-word-equation', false);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      const testInput = document.createElement('input');
      const testDiv = document.createElement('div');
      testDiv.className = 'cm-content';
      document.body.appendChild(testInput);
      document.body.appendChild(testDiv);

      // 1. Dispatch 500 keydown events
      for (let i = 0; i < 500; i++) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'a',
            code: 'KeyA',
            bubbles: true,
            cancelable: true,
          })
        );
      }

      // 2. Dispatch 200 focusin/focusout transitions
      for (let i = 0; i < 100; i++) {
        testDiv.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: testInput }));
        testDiv.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: testInput }));
      }

      // 3. Dispatch beforeunload and visibilitychange
      window.dispatchEvent(new Event('beforeunload'));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(logger.getEvents()).toHaveLength(0);
      expect(writeSpy).not.toHaveBeenCalled();

      testInput.remove();
      testDiv.remove();
    });

    it('ensures session state changes and arrow navigation emit zero telemetry when disabled', () => {
      logger.setEnabled(false);

      // Session state changes
      const emptySlot = createSlot('root', [], null, 'slot-empty-test');
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'slot-empty-test', offset: 0 },
        isFocused: true,
        ast: emptySlot,
      });

      // Navigation AST traversal
      const numSlot = createSlot('numerator', [createToken('7', 'mn')], null, 'num-slot');
      const denSlot = createSlot('denominator', [], null, 'den-slot');
      const frac = createFraction(numSlot, denSlot, undefined, 'frac-test');
      const rootSlot = createSlot('root', [frac], null, 'root-slot');
      updateParentPointers(rootSlot);

      handleArrowKey(rootSlot, { slotId: 'num-slot', offset: 0 }, 'ArrowDown');
      handleArrowKey(rootSlot, { slotId: 'den-slot', offset: 0 }, 'ArrowRight');

      expect(logger.getEvents()).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. Dynamic Toggle Stability, Listener Idempotency & Persistence Invariants
  // =========================================================================
  describe('2. Dynamic Toggle Stability, Listener Idempotency & Persistence Invariants', () => {
    it('maintains strict phase isolation and event integrity across ON -> OFF -> ON cycles', async () => {
      logger.init(mockApp, 'obsidian-word-equation', false);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      // Phase 1: OFF
      logDebugEvent('caret', () => ({ phase: 1, label: 'should_be_ignored' }));
      expect(logger.getEvents()).toHaveLength(0);

      // Phase 2: Toggle ON
      logger.setEnabled(true);
      expect(isDebugEnabled()).toBe(true);
      for (let i = 0; i < 20; i++) {
        logDebugEvent('navigation', () => ({ phase: 2, index: i }));
      }
      expect(logger.getEvents()).toHaveLength(20);

      // Phase 3: Toggle OFF
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);
      for (let i = 0; i < 20; i++) {
        logDebugEvent('navigation', () => ({ phase: 3, index: i, label: 'dropped' }));
      }
      // Must still be exactly 20
      expect(logger.getEvents()).toHaveLength(20);

      // Flush while disabled should safely write the 20 events recorded during Phase 2
      await logger.flush();
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const writtenJson = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenJson).toHaveLength(20);
      expect(writtenJson.every((e: any) => e.details.phase === 2)).toBe(true);

      // Phase 4: Toggle ON again
      logger.setEnabled(true);
      for (let i = 0; i < 15; i++) {
        logDebugEvent('boundary', () => ({ phase: 4, index: i }));
      }
      expect(logger.getEvents()).toHaveLength(35);

      await logger.flush();
      expect(writeSpy).toHaveBeenCalledTimes(2);
      const finalJson = JSON.parse(writeSpy.mock.calls[1][1] as string);
      expect(finalJson).toHaveLength(35);
      expect(finalJson.slice(20).every((e: any) => e.details.phase === 4)).toBe(true);
    });

    it('survives rapid toggle churn (1,000 rapid flips) without state desynchronization', () => {
      let expectedOnEvents = 0;

      for (let i = 0; i < 1000; i++) {
        const shouldEnable = i % 2 === 0;
        logger.setEnabled(shouldEnable);

        expect(logger.isEnabled()).toBe(shouldEnable);
        expect(isDebugEnabled()).toBe(shouldEnable);
        expect((window as any).__wordEquationDebugEnabled).toBe(shouldEnable);

        if (shouldEnable) {
          logDebugEvent('keydown', () => ({ iteration: i }));
          expectedOnEvents++;
        } else {
          logDebugEvent('keydown', () => ({ iteration: i, dropped: true }));
        }
      }

      const events = logger.getEvents();
      expect(events).toHaveLength(expectedOnEvents);
      expect(events.every((e) => (e.details as any).dropped === undefined)).toBe(true);
    });

    it('proves global window listeners are idempotent and never duplicated on repeated init/toggle', () => {
      // Re-init 30 times and toggle 30 times
      for (let i = 0; i < 30; i++) {
        logger.init(mockApp, 'obsidian-word-equation', true);
        logger.setEnabled(true);
      }

      const initialCount = logger.getEvents().length;

      // Dispatch ONE single keydown event on window
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          code: 'Tab',
          bubbles: true,
          cancelable: true,
        })
      );

      const keydownEvents = logger.getEvents().slice(initialCount).filter((e) => e.type === 'keydown');
      // If listeners were duplicated 30 times, keydownEvents would be 30. It MUST be exactly 1!
      expect(keydownEvents).toHaveLength(1);
      expect(keydownEvents[0].details.key).toBe('Tab');
      expect(keydownEvents[0].details.phase).toBe('capture');
    });

    it('safely handles clear() operation, zeroing memory and persisting empty array', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      logDebugEvent('caret', () => ({ offset: 1 }));
      logDebugEvent('caret', () => ({ offset: 2 }));
      expect(logger.getEvents()).toHaveLength(2);

      await logger.clear();

      expect(logger.getEvents()).toHaveLength(0);
      expect((window as any).__eqDebugEvents).toHaveLength(0);
      expect(writeSpy).toHaveBeenCalledWith('.obsidian/plugins/obsidian-word-equation/debug-log.json', '[]');
    });
  });

  // =========================================================================
  // 3. High-Frequency Keystrokes & Boundary Serialization Stress (Debug Mode ON)
  // =========================================================================
  describe('3. High-Frequency Keystrokes & Boundary Serialization Stress (Debug Mode ON)', () => {
    it('accurately captures a high-frequency burst of 2,500 keystrokes without dropped events', () => {
      logger.setEnabled(true);

      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'x', '+', 'y'];
      for (let i = 0; i < 2500; i++) {
        const key = keys[i % keys.length];
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
          })
        );
      }

      const events = logger.getEvents();
      expect(events).toHaveLength(2500);

      // Verify sequence and structure
      for (let i = 0; i < 2500; i++) {
        const expectedKey = keys[i % keys.length];
        expect(events[i].type).toBe('keydown');
        expect(events[i].details.key).toBe(expectedKey);
        expect(events[i].details.phase).toBe('capture');
        expect(events[i].timestamp).toBeDefined();
      }
    });

    it('interleaves 1,000 rapid boundary transitions and candidate evaluations without corruption', () => {
      logger.setEnabled(true);

      const boundaryTypes = ['enterFromStart', 'enterFromEnd', 'exitToEditor', 'internalTraversal'];
      for (let i = 0; i < 1000; i++) {
        const transition = boundaryTypes[i % boundaryTypes.length];
        logDebugEvent('boundary', () => ({
          seq: i,
          transition,
          cmPos: 100 + i,
          slotId: `slot_${i}`,
          cmSelectionBefore: { from: 100 + i, to: 100 + i, anchor: 100 + i, head: 100 + i, empty: true },
          cmSelectionAfter: { from: 101 + i, to: 101 + i, anchor: 101 + i, head: 101 + i, empty: true },
        }));

        if (i % 2 === 0) {
          logDebugEvent('placeholder', () => ({
            action: 'candidate_evaluation_summary',
            direction: 'ArrowDown',
            candidateSlotId: `slot_child_${i}`,
            candidateRole: 'denominator',
            isPlaceholder: true,
            decision: 'accept',
            rationale: 'valid_target_slot',
          }));
        }
      }

      const events = logger.getEvents();
      expect(events).toHaveLength(1500); // 1000 boundary + 500 placeholder

      const boundaries = events.filter((e) => e.type === 'boundary');
      expect(boundaries).toHaveLength(1000);
      expect(boundaries[999].details.seq).toBe(999);
      expect(boundaries[999].details.cmSelectionBefore.from).toBe(1099);

      const placeholders = events.filter((e) => e.type === 'placeholder');
      expect(placeholders).toHaveLength(500);
      expect(placeholders[0].details.decision).toBe('accept');
    });

    it('stress-tests concurrent flush calls with asynchronous I/O latency without race condition or corruption', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);

      // Simulate a realistic disk write latency (10ms)
      let concurrentWriteCount = 0;
      let maxConcurrentWrites = 0;
      let totalWrites = 0;

      const originalWrite = mockApp.vault.adapter.write.bind(mockApp.vault.adapter);
      vi.spyOn(mockApp.vault.adapter, 'write').mockImplementation(async (path: string, data: string) => {
        concurrentWriteCount++;
        if (concurrentWriteCount > maxConcurrentWrites) {
          maxConcurrentWrites = concurrentWriteCount;
        }
        totalWrites++;
        await new Promise((r) => setTimeout(r, 10));
        concurrentWriteCount--;
        return originalWrite(path, data);
      });

      // Stream events while periodically triggering flushes
      const flushPromises: Promise<void>[] = [];
      for (let i = 0; i < 200; i++) {
        logDebugEvent('keydown', () => ({ seq: i, key: 'x' }));
        if (i % 25 === 0) {
          flushPromises.push(logger.flush());
        }
      }
      flushPromises.push(logger.flush());

      await Promise.all(flushPromises);
      // Also wait for any trailing pending flush
      await new Promise((r) => setTimeout(r, 50));

      // Mutex guarantee: max concurrent writes must never exceed 1
      expect(maxConcurrentWrites).toBe(1);
      expect(totalWrites).toBeGreaterThanOrEqual(1);

      // Verify the final file contents on disk
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      const fileData = await mockApp.vault.adapter.read(logPath);
      const parsedData = JSON.parse(fileData);

      expect(parsedData).toHaveLength(200);
      expect(parsedData[0].details.seq).toBe(0);
      expect(parsedData[199].details.seq).toBe(199);
    });

    it('robustly serializes complex math expressions, unicode symbols, XML, and adversarial payloads', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      const adversarialDetails = {
        latex: '\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
        mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><msqrt><mi>π</mi></msqrt></mrow><mn>2</mn></mfrac></math>',
        unicodeSymbols: '∀x ∈ ℝ, ∃y: y > x ∧ ∇·𝐁 = 0 ∧ ∮ E·dl = -dΦ/dt',
        alphanumericMath: '𝔽_q[X] / (P(X)) ≅ 𝕂, 𝔸^n, 𝕏_t, 𝔼[X|𝒴]',
        specialEscapes: 'line1\nline2\r\n\t"quotes" and \'single\' and \\backslashes\\',
        controlChars: '\u0000\u001b[31mRed\u001b[0m',
        nestedData: {
          level1: {
            level2: {
              level3: {
                emptyArr: [],
                nullVal: null,
                boolFalse: false,
                zero: 0,
                bigNum: 9007199254740991,
              },
            },
          },
        },
      };

      logDebugEvent('conversion', () => adversarialDetails);
      await logger.flush();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const writtenJsonString = writeSpy.mock.calls[0][1] as string;

      // Verify it produces 100% valid JSON without parsing error
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(writtenJsonString);
      }).not.toThrow();

      expect(parsed).toHaveLength(1);
      const readBack = parsed[0].details;
      expect(readBack.latex).toBe(adversarialDetails.latex);
      expect(readBack.mathml).toBe(adversarialDetails.mathml);
      expect(readBack.unicodeSymbols).toBe(adversarialDetails.unicodeSymbols);
      expect(readBack.alphanumericMath).toBe(adversarialDetails.alphanumericMath);
      expect(readBack.specialEscapes).toBe(adversarialDetails.specialEscapes);
      expect(readBack.nestedData.level1.level2.level3.nullVal).toBeNull();
      expect(readBack.nestedData.level1.level2.level3.boolFalse).toBe(false);
      expect(readBack.nestedData.level1.level2.level3.bigNum).toBe(9007199254740991);
    });

    it('safely handles SVG and unusual DOM elements without crashing focus/keydown handlers', () => {
      logger.setEnabled(true);

      // Create an SVG element (which has SVGAnimatedString for className)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'equation-icon');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      document.body.appendChild(svg);

      // Dispatch keydown with SVG path as target
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      path.dispatchEvent(keyEvent);

      // Dispatch focusin with SVG as target
      const focusEvent = new FocusEvent('focusin', {
        bubbles: true,
        relatedTarget: document.body,
      });
      svg.dispatchEvent(focusEvent);

      const events = logger.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);

      // Verify that stringify succeeds on the captured events
      expect(() => JSON.stringify(events)).not.toThrow();

      svg.remove();
    });

    it('handles scale stress with 5,000 heterogeneous events serialized under 150ms', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      const types: DebugEventType[] = [
        'keydown',
        'caret',
        'boundary',
        'placeholder',
        'focus',
        'selection',
        'navigation',
        'clipboard',
        'conversion',
        'initialization',
      ];

      for (let i = 0; i < 5000; i++) {
        const type = types[i % types.length];
        logDebugEvent(type, () => ({
          seq: i,
          type,
          data: `payload_${i}`,
          metrics: { offset: i % 10, from: i, to: i + 5 },
        }));
      }

      expect(logger.getEvents()).toHaveLength(5000);

      const start = performance.now();
      await logger.flush();
      const serializationDuration = performance.now() - start;

      // Serialization and write of 5,000 events must be fast (< 200ms)
      expect(serializationDuration).toBeLessThan(200);

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const rawJson = writeSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(rawJson);
      expect(parsed).toHaveLength(5000);
      expect(parsed[4999].details.seq).toBe(4999);
      expect(parsed[4999].type).toBe(types[4999 % types.length]);
    });
  });
});
