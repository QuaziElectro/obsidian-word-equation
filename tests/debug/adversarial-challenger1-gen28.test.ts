import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
  DebugEventType,
} from '../../src/debug/debug-logger';
import { App } from '../mocks/obsidian';

describe('Adversarial Stress Verification — Debug Mode Subsystem (Challenger 1 Gen28)', () => {
  let logger: DebugLogger;
  let mockApp: any;

  beforeEach(() => {
    mockApp = new App();
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    logger.resetForTesting();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. High-Throughput Event Storming & Memory Buffer Stability
  // =========================================================================
  describe('1. High-Throughput Event Storming & Memory Stability', () => {
    it('handles 10,000 rapid sequential events across all 6 domains without dropping data', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const types: DebugEventType[] = [
        'caret',
        'selection',
        'clipboard',
        'navigation',
        'conversion',
        'initialization',
      ];

      const count = 10000;
      const start = performance.now();

      for (let i = 0; i < count; i++) {
        const type = types[i % types.length];
        logDebugEvent(type, () => ({
          index: i,
          type,
          data: `payload-token-${i}`,
          nested: { level1: { level2: i * 2 } },
        }));
      }

      const elapsed = performance.now() - start;
      const events = logger.getEvents();

      // Buffer integrity
      expect(events.length).toBe(count);
      expect((window as any).__eqDebugEvents.length).toBe(count);

      // Verify sequence and timestamp validity
      for (let i = 0; i < 50; i++) {
        expect(events[i].details.index).toBe(i);
        expect(events[i].type).toBe(types[i % types.length]);
        expect(Date.parse(events[i].timestamp)).not.toBeNaN();
      }

      // Verify persistence of the entire 10,000 events
      await logger.flush();
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const savedJson = mockApp.vault.adapter.files.get(logPath)!;
      const parsed = JSON.parse(savedJson);

      expect(parsed.length).toBe(count);
      expect(parsed[count - 1].details.index).toBe(count - 1);
      expect(elapsed).toBeLessThan(2000); // 10k events recorded under 2 seconds
    });

    it('remains stable and does not leak memory under cyclic storm waves (5,000 events x 4 waves)', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      for (let wave = 0; wave < 4; wave++) {
        for (let i = 0; i < 5000; i++) {
          logDebugEvent('navigation', () => ({
            wave,
            seq: i,
            key: 'ArrowRight',
          }));
        }

        expect(logger.getEvents().length).toBe(5000);
        await logger.flush();
        expect(JSON.parse(mockApp.vault.adapter.files.get(logPath)!).length).toBe(5000);

        // Clear and verify memory reset
        await logger.clear();
        expect(logger.getEvents().length).toBe(0);
        expect((window as any).__eqDebugEvents.length).toBe(0);
        expect(mockApp.vault.adapter.files.get(logPath)).toBe('[]');
      }
    });
  });

  // =========================================================================
  // 2. Debounced Flushing & Async Concurrency Ingestion
  // =========================================================================
  describe('2. Debounced Flushing & Async Concurrency Ingestion', () => {
    it('correctly handles pendingFlush when flush() is called during an in-flight async adapter write', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      // Simulate a delayed disk adapter write
      let writeCount = 0;
      const originalWrite = mockApp.vault.adapter.write.bind(mockApp.vault.adapter);
      mockApp.vault.adapter.write = vi.fn(async (path: string, data: string) => {
        writeCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return originalWrite(path, data);
      });

      // Record first batch and trigger flush
      logDebugEvent('caret', { batch: 1 });
      const flushPromise1 = logger.flush();

      // Record second batch while first write is in-flight (isWriting === true)
      logDebugEvent('navigation', { batch: 2 });
      logDebugEvent('clipboard', { batch: 2 });

      // Explicitly trigger flush while isWriting is true to set pendingFlush
      const flushPromise2 = logger.flush();

      await flushPromise1;
      await flushPromise2;

      // Since pendingFlush was set, the logger automatically executed a second flush
      expect(writeCount).toBe(2);
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);

      const saved = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(saved.length).toBe(3);
      expect(saved[0].details.batch).toBe(1);
      expect(saved[1].details.batch).toBe(2);
      expect(saved[2].details.batch).toBe(2);
    });

    it('debounces and flushes events recorded during an in-flight write after debounce interval', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      let writeCount = 0;
      const originalWrite = mockApp.vault.adapter.write.bind(mockApp.vault.adapter);
      mockApp.vault.adapter.write = vi.fn(async (path: string, data: string) => {
        writeCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return originalWrite(path, data);
      });

      logDebugEvent('caret', { wave: 1 });
      const p1 = logger.flush();

      // Events arrive during write, scheduling 50ms debounced flush
      logDebugEvent('navigation', { wave: 2 });
      await p1;

      // At this point (20ms), wave 1 is written, but wave 2 debounce timer is still pending
      expect(writeCount).toBe(1);

      // Wait 100ms for 50ms debounce timer + 20ms mock adapter write delay to fully finish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Debounce timer has fired second write and persisted to disk
      expect(writeCount).toBe(2);
      const saved = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(saved.length).toBe(2);
      expect(saved[1].details.wave).toBe(2);
    });

    it('survives 50 concurrent flush() calls without race condition crashes or file corruption', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      for (let i = 0; i < 100; i++) {
        logDebugEvent('caret', { i });
      }

      // Call flush concurrently 50 times
      const flushPromises = Array.from({ length: 50 }, () => logger.flush());
      await Promise.all(flushPromises);

      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const saved = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(saved.length).toBe(100);
      expect(saved[99].details.i).toBe(99);
    });

    it('safely handles clear() invoked during an active flush without throwing', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('conversion', { step: 1 });

      // Start flush
      const flushPromise = logger.flush();
      // Concurrently clear
      const clearPromise = logger.clear();

      await Promise.all([flushPromise, clearPromise]);

      expect(logger.getEvents().length).toBe(0);
      expect(mockApp.vault.adapter.files.get(logPath)).toBe('[]');
    });
  });

  // =========================================================================
  // 3. Rapid Toggle Flipping Under Concurrent Event Dispatch
  // =========================================================================
  describe('3. Rapid Toggle Flipping Under Concurrent Event Dispatch', () => {
    it('maintains strict synchronization across 200 rapid toggle flips during event dispatch', () => {
      logger.init(mockApp, 'obsidian-word-equation', false);

      let enabledCount = 0;
      let disabledCount = 0;

      for (let i = 0; i < 200; i++) {
        const targetState = i % 2 === 0;
        logger.setEnabled(targetState);

        expect(logger.isEnabled()).toBe(targetState);
        expect(isDebugEnabled()).toBe(targetState);
        expect((window as any).__wordEquationDebugEnabled).toBe(targetState);

        const spyClosure = vi.fn(() => ({ iteration: i }));
        logDebugEvent('caret', spyClosure);

        if (targetState) {
          enabledCount++;
          expect(spyClosure).toHaveBeenCalledTimes(1);
        } else {
          disabledCount++;
          expect(spyClosure).not.toHaveBeenCalled();
        }
      }

      expect(logger.getEvents().length).toBe(enabledCount);
      expect(enabledCount).toBe(100);
      expect(disabledCount).toBe(100);
    });

    it('ensures turning debugMode OFF instantly halts event collection and ignores queued closures', () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      logDebugEvent('caret', { active: true });
      expect(logger.getEvents().length).toBe(1);

      // Instantly disable
      logger.setEnabled(false);

      const uncalledClosure = vi.fn(() => {
        throw new Error('This closure must NEVER be called when disabled');
      });

      // Should not throw because closure must not be evaluated
      expect(() => {
        logDebugEvent('selection', uncalledClosure);
        logDebugEvent('navigation', uncalledClosure);
        logDebugEvent('clipboard', uncalledClosure);
      }).not.toThrow();

      expect(uncalledClosure).not.toHaveBeenCalled();
      expect(logger.getEvents().length).toBe(1);
    });
  });

  // =========================================================================
  // 4. Zero-Overhead Fast-Branch Microbenchmark & Closure Isolation
  // =========================================================================
  describe('4. Zero-Overhead Branch Microbenchmark & Closure Isolation', () => {
    it('never evaluates closures or executes DOM queries when debugMode is false across all 6 domains', () => {
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);

      const mockQuerySelector = vi.spyOn(document, 'querySelector');
      const factories = {
        initialization: vi.fn(() => ({ dom: document.querySelector('.some-slot') })),
        caret: vi.fn(() => ({ dom: document.querySelector('.eq-caret') })),
        selection: vi.fn(() => ({ dom: document.querySelector('.eq-selected') })),
        clipboard: vi.fn(() => ({ text: 'secret-clipboard' })),
        navigation: vi.fn(() => ({ key: 'ArrowDown' })),
        conversion: vi.fn(() => ({ mathml: '<math></math>' })),
      };

      for (const [type, fn] of Object.entries(factories)) {
        logDebugEvent(type as DebugEventType, fn);
      }

      for (const fn of Object.values(factories)) {
        expect(fn).not.toHaveBeenCalled();
      }
      expect(mockQuerySelector).not.toHaveBeenCalled();
      expect(logger.getEvents().length).toBe(0);
    });

    it('executes 100,000 disabled branch checks in < 50ms (< 500ns per call)', () => {
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);

      const heavyClosure = () => ({
        data: new Array(100).fill('should-not-exist'),
        time: Date.now(),
      });

      // Warm-up JIT
      for (let i = 0; i < 5000; i++) {
        logDebugEvent('caret', heavyClosure);
      }

      const iterations = 100000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logDebugEvent('caret', heavyClosure);
      }
      const duration = performance.now() - start;

      // 100,000 branch checks should take less than 50ms (average < 500ns per check)
      expect(duration).toBeLessThan(50);
      expect(logger.getEvents().length).toBe(0);
    });
  });

  // =========================================================================
  // 5. Serialization Edge Cases & Resilient Error Recovery
  // =========================================================================
  describe('5. Serialization Edge Cases & Resilient Error Recovery', () => {
    it('recovers gracefully from circular references during flush() without crashing or locking the logger', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const circularObj: any = { tag: 'circular' };
      circularObj.self = circularObj;

      // Record circular object
      logger.record('caret', { badPayload: circularObj });

      // flush() must catch the TypeError and not reject
      await expect(logger.flush()).resolves.not.toThrow();

      // Ensure console.error logged the issue
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMsg = consoleErrorSpy.mock.calls[0][0];
      expect(errorMsg).toContain('[WordEquation DebugLogger] Error persisting debug log:');

      // The logger internal state (isWriting) must be reset back to false!
      // Verify we can clear and record normal events again
      await logger.clear();
      expect(logger.getEvents().length).toBe(0);

      logDebugEvent('navigation', { recovered: true });
      await expect(logger.flush()).resolves.not.toThrow();

      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      const fileData = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(fileData.length).toBe(1);
      expect(fileData[0].details.recovered).toBe(true);
    });

    it('safely serializes undefined fields, functions, null, and deeply nested structures', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      // 40 levels of nesting
      let deep: any = { value: 'leaf' };
      for (let i = 0; i < 40; i++) {
        deep = { level: i, child: deep };
      }

      logDebugEvent('conversion', () => ({
        nullValue: null,
        undefinedValue: undefined,
        funcValue: () => 'ignored_in_json',
        deepTree: deep,
      }));

      await logger.flush();
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);

      const parsed = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].details.nullValue).toBeNull();
      expect(parsed[0].details.undefinedValue).toBeUndefined();
      expect(parsed[0].details.funcValue).toBeUndefined();
      expect(parsed[0].details.deepTree.child.child).toBeDefined();
    });

    it('preserves complex Unicode, LaTeX, MathML entities, and astral characters with bitwise fidelity', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      const complexMathPayload = {
        mathML: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mo>∑</mo><msubsup><mo>∫</mo><mn>0</mn><mi>∞</mi></msubsup><mfrac><mrow><mo>∂</mo><mi>ψ</mi></mrow><mrow><mo>∂</mo><mi>x</mi></mrow></mfrac><mo>+</mo><msqrt><mrow><mi>α</mi><mo>×</mo><mi>β</mi></mrow></msqrt></mrow></math>',
        latex: '\\oint_C \\vec{F} \\cdot d\\vec{r} = \\iint_S (\\nabla \\times \\vec{F}) \\cdot d\\vec{S}',
        astralSymbols: '𝒳𝒴𝒵 𝟘𝟙𝟚 🚀 🧪 ⚡',
        specialControls: 'Line1\nLine2\tTabbed\r\nQuoted "Text" and \\Backslash\\',
      };

      logDebugEvent('clipboard', () => complexMathPayload);
      await logger.flush();

      const savedContent = mockApp.vault.adapter.files.get(logPath)!;
      const parsed = JSON.parse(savedContent);

      expect(parsed.length).toBe(1);
      expect(parsed[0].details.mathML).toBe(complexMathPayload.mathML);
      expect(parsed[0].details.latex).toBe(complexMathPayload.latex);
      expect(parsed[0].details.astralSymbols).toBe(complexMathPayload.astralSymbols);
      expect(parsed[0].details.specialControls).toBe(complexMathPayload.specialControls);
    });

    it('handles massive 1MB payload strings without memory exhaustion', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      // 1MB repetitive MathML payload string
      const chunk = '<math><mi>x</mi><mo>+</mo><mn>1</mn></math>';
      const repeats = Math.ceil((1024 * 1024) / chunk.length);
      const largeString = chunk.repeat(repeats);

      logDebugEvent('clipboard', () => ({
        action: 'paste',
        size: largeString.length,
        largeString,
      }));

      await logger.flush();

      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const saved = mockApp.vault.adapter.files.get(logPath)!;
      expect(saved.length).toBeGreaterThan(1024 * 1024);

      const parsed = JSON.parse(saved);
      expect(parsed[0].details.size).toBe(largeString.length);
      expect(parsed[0].details.largeString.length).toBe(largeString.length);
    });
  });

  // =========================================================================
  // 6. Resilient Lifecycle Edge Cases
  // =========================================================================
  describe('6. Resilient Lifecycle Edge Cases', () => {
    it('safely handles flush() and clear() when App or vault adapter is missing', async () => {
      logger.resetForTesting();
      expect(logger.isEnabled()).toBe(false);

      // No app attached
      await expect(logger.flush()).resolves.not.toThrow();
      await expect(logger.clear()).resolves.not.toThrow();

      // App without adapter
      const incompleteApp: any = { vault: {} };
      logger.init(incompleteApp, 'obsidian-word-equation', true);

      logDebugEvent('caret', { slotId: 'root' });
      await expect(logger.flush()).resolves.not.toThrow();
      await expect(logger.clear()).resolves.not.toThrow();
    });

    it('cancels scheduled debounce timer when resetForTesting() is called', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('selection', { scheduled: true });
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(false);

      // Immediately reset
      logger.resetForTesting();

      // Wait 70ms past the 50ms debounce threshold
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Adapter should NOT have received a write because timer was cancelled
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(false);
    });

    it('safely handles re-entrant logDebugEvent calls inside lazy closure factories', () => {
      logger.init(mockApp, 'obsidian-word-equation', true);

      logDebugEvent('caret', () => {
        // Nested re-entrant debug event
        logDebugEvent('navigation', () => ({
          nested: true,
          key: 'ArrowLeft',
        }));
        return { parent: true, slotId: 'root' };
      });

      const events = logger.getEvents();
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('navigation');
      expect(events[0].details.nested).toBe(true);
      expect(events[1].type).toBe('caret');
      expect(events[1].details.parent).toBe(true);
    });

    it('survives chaos monkey testing: asynchronous toggle flips during continuous event dispatch', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);

      let isRunning = true;
      let totalEventsAttempted = 0;

      // Background chaos toggler
      const toggleChaos = (async () => {
        let flipState = false;
        while (isRunning) {
          flipState = !flipState;
          logger.setEnabled(flipState);
          await new Promise((r) => setTimeout(r, 2));
        }
      })();

      // Event producer
      const producer = (async () => {
        for (let i = 0; i < 1000; i++) {
          totalEventsAttempted++;
          logDebugEvent('caret', () => ({
            id: i,
            timestamp: performance.now(),
          }));
          if (i % 100 === 0) {
            await new Promise((r) => setTimeout(r, 1));
          }
        }
      })();

      await producer;
      isRunning = false;
      await toggleChaos;

      const recordedCount = logger.getEvents().length;
      // Some events were recorded when enabled, some dropped when disabled
      expect(recordedCount).toBeGreaterThan(0);
      expect(recordedCount).toBeLessThanOrEqual(totalEventsAttempted);

      // Verify final buffer can be flushed cleanly
      logger.setEnabled(true);
      await expect(logger.flush()).resolves.not.toThrow();

      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      const fileData = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(fileData.length).toBe(recordedCount);
    });

    it('handles special JS values (NaN, Infinity, Date, RegExp) according to JSON specs without error', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const testDate = new Date('2026-09-24T12:00:00.000Z');

      logDebugEvent('conversion', () => ({
        nanVal: NaN,
        posInf: Infinity,
        negInf: -Infinity,
        dateVal: testDate,
        regexVal: /test-pattern/g,
      }));

      await logger.flush();
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      const fileData = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);

      expect(fileData.length).toBe(1);
      const details = fileData[0].details;
      // In JSON, NaN and Infinity become null
      expect(details.nanVal).toBeNull();
      expect(details.posInf).toBeNull();
      expect(details.negInf).toBeNull();
      // Date becomes ISO string
      expect(details.dateVal).toBe(testDate.toISOString());
      // RegExp serializes to empty object
      expect(details.regexVal).toEqual({});
    });
  });
});

