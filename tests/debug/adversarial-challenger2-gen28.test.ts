import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WordEquationPlugin from '../../src/main';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
} from '../../src/debug/debug-logger';
import { App, MarkdownView, WorkspaceLeaf, TFile } from '../mocks/obsidian';

describe('Adversarial Stress Verification — Fresh Vault Startup & Cold Boot Listeners (Challenger 2 Gen28)', () => {
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
    document.body.innerHTML = '';
  });

  // =========================================================================
  // 1. Cold Boot Listener Lifecycle & Global Listener Unhooking (R3)
  // =========================================================================
  describe('1. Cold Boot Listener Lifecycle & Global Listener Unhooking', () => {
    it('verifies pointerdown unhooks all global listeners (pointerdown, mousedown, keydown) immediately', async () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const targetEl = document.createElement('div');
      targetEl.className = 'word-equation-math';
      targetEl.setAttribute('data-slot-id', 'test_slot_alpha');
      document.body.appendChild(targetEl);

      plugin.captureStartupInitializationState();

      // Trigger first pointerdown on an element
      targetEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 250 }));

      // Assert that removeEventListener was called for pointerdown, mousedown, keydown
      const removedTypes = removeEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(removedTypes).toContain('pointerdown');
      expect(removedTypes).toContain('mousedown');
      expect(removedTypes).toContain('keydown');

      // Wait for setTimeout(recordFirstInteraction, 0)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const firstEvents = logger.getEvents().filter(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(firstEvents.length).toBe(1);
      expect(firstEvents[0].details.firstInteraction.targetSlotId).toBe('test_slot_alpha');
      expect(firstEvents[0].details.firstInteraction.eventType).toBe('pointerdown');

      // Trigger subsequent interactions (mousedown, keydown, pointerdown)
      targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      targetEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      targetEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Must strictly remain 1 event (no second firing)
      const afterEvents = logger.getEvents().filter(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(afterEvents.length).toBe(1);
    });

    it('verifies keydown on an element unhooks listeners when first interaction is via keyboard', async () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const inputEl = document.createElement('div');
      inputEl.className = 'cm-content';
      document.body.appendChild(inputEl);

      plugin.captureStartupInitializationState();

      // First interaction is keydown on an element
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const removedTypes = removeEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(removedTypes).toContain('pointerdown');
      expect(removedTypes).toContain('mousedown');
      expect(removedTypes).toContain('keydown');

      await new Promise((resolve) => setTimeout(resolve, 50));

      const firstEvents = logger.getEvents().filter(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(firstEvents.length).toBe(1);
      expect(firstEvents[0].details.firstInteraction.eventType).toBe('keydown');
      expect(firstEvents[0].details.firstInteraction.key).toBe('ArrowRight');
      expect(firstEvents[0].details.firstInteraction.targetTag).toBe('div');
    });

    it('verifies multiple captureStartupInitializationState calls do not leak listeners or create duplicate handlers', async () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);

      // Simulate multiple layoutReady or vault initialization triggers
      plugin.captureStartupInitializationState();
      plugin.captureStartupInitializationState();
      plugin.captureStartupInitializationState();

      // Old listeners should have been cleaned up on repeated calls
      expect(removeEventListenerSpy).toHaveBeenCalled();

      // Now trigger first interaction on element
      containerEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
      await new Promise((resolve) => setTimeout(resolve, 150));

      const firstEvents = logger.getEvents().filter(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(firstEvents.length).toBe(1);
    });

    it('verifies plugin onunload cleanly tears down document listeners even if no interaction occurred', () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      plugin.captureStartupInitializationState();
      expect(removeEventListenerSpy).not.toHaveBeenCalled();

      // Unload plugin
      plugin.onunload();

      const removedTypes = removeEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(removedTypes).toContain('pointerdown');
      expect(removedTypes).toContain('mousedown');
      expect(removedTypes).toContain('keydown');

      // Subsequent interaction on element must NOT record anything
      const testEl = document.createElement('div');
      document.body.appendChild(testEl);
      testEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      const events = logger.getEvents().filter(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(events.length).toBe(0);
    });

    it('EMPIRICAL BUG REPRODUCTION: demonstrates uncaught TypeError when first interaction target is Document (non-Element)', async () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      plugin.captureStartupInitializationState();

      let uncaughtError: any = null;
      const onError = (ev: ErrorEvent) => {
        ev.preventDefault();
        uncaughtError = ev.error || ev.message;
      };
      window.addEventListener('error', onError);

      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
      } finally {
        window.removeEventListener('error', onError);
      }

      // Proves that when e.target is Document, target.tagName is undefined,
      // triggering TypeError in handleFirstInteraction
      expect(uncaughtError).not.toBeNull();
      expect(String(uncaughtError?.message || uncaughtError)).toContain('toLowerCase');
    });
  });

  // =========================================================================
  // 2. Cold Boot Edge Cases: Empty Vault, Missing Elements, and Note Switching
  // =========================================================================
  describe('2. Cold Boot Edge Cases: Empty Vault & Missing Elements', () => {
    it('survives captureStartupInitializationState on a completely empty vault with no active leaf or view', () => {
      mockApp.workspace.activeLeaf = null;
      mockApp.workspace.activeView = null;

      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      expect(() => {
        plugin.captureStartupInitializationState();
      }).not.toThrow();

      const initEvent = logger.getEvents().find(
        (e) => e.type === 'initialization' && e.details?.stage === 'vault_layout_ready'
      );
      expect(initEvent).toBeDefined();
      expect(initEvent?.details.startupState.activeFilePath).toBeNull();
      expect(initEvent?.details.startupState.docLength).toBe(0);
      expect(initEvent?.details.startupState.detectedEquationCount).toBe(0);
      expect(initEvent?.details.startupState.hasActiveEquationSession).toBe(false);
    });

    it('handles malformed equation DOM nodes gracefully without throwing', async () => {
      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      // Malformed equation element: missing data attributes, missing classes, invalid structure
      const malformedDiv = document.createElement('div');
      malformedDiv.className = 'word-equation-block';
      document.body.appendChild(malformedDiv);

      expect(() => {
        plugin.captureStartupInitializationState();
      }).not.toThrow();

      const initEvent = logger.getEvents().find(
        (e) => e.type === 'initialization' && e.details?.stage === 'vault_layout_ready'
      );
      expect(initEvent?.details.startupState.detectedEquationCount).toBe(1);
      expect(initEvent?.details.startupState.equations[0]).toEqual({
        from: 0,
        to: 0,
        isInline: false,
        isEmpty: false,
      });

      // Click on malformed element
      malformedDiv.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const firstEvent = logger.getEvents().find(
        (e) => e.type === 'initialization' && e.details?.stage === 'first_caret_interaction'
      );
      expect(firstEvent).toBeDefined();
      expect(firstEvent?.details.firstInteraction.targetTag).toBe('div');
      expect(firstEvent?.details.firstInteraction.targetSlotId).toBeNull();
    });

    it('simulates rapid note switching before layoutReady without corruption', async () => {
      const f1 = new TFile('note1.md');
      const f2 = new TFile('note2.md');
      mockApp.vault.files.set('note1.md', '```math-word\n<math><mn>1</mn></math>\n```');
      mockApp.vault.files.set('note2.md', '# Note 2 content');

      const leaf = new WorkspaceLeaf(mockApp);
      const view = new MarkdownView(leaf);
      view.file = f1;
      view.editor.setValue(mockApp.vault.files.get('note1.md')!);
      mockApp.workspace.activeLeaf = leaf;
      mockApp.workspace.activeView = view;

      const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      plugin.settings.debugMode = true;
      logger.setEnabled(true);

      // Switch note rapidly
      view.file = f2;
      view.editor.setValue(mockApp.vault.files.get('note2.md')!);

      plugin.captureStartupInitializationState();

      const initEvent = logger.getEvents().find(
        (e) => e.type === 'initialization' && e.details?.stage === 'vault_layout_ready'
      );
      expect(initEvent?.details.startupState.activeFilePath).toBe('note2.md');
      expect(initEvent?.details.startupState.docLength).toBe(16);
    });
  });

  // =========================================================================
  // 3. File System Resilience: Disk Errors, Missing Files, Concurrent Flushes
  // =========================================================================
  describe('3. File System Resilience & Concurrent Flushes', () => {
    it('handles adapter write rejection gracefully without unhandled promise errors', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock adapter.write to throw error (e.g. disk locked, out of space, EBUSY)
      mockApp.vault.adapter.write = vi.fn().mockRejectedValue(new Error('EBUSY: resource locked'));

      logger.record('caret', { slotId: 'root', offset: 0 });

      // Explicit flush
      await expect(logger.flush()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('handles concurrent flush calls correctly via pendingFlush queue without losing events', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      let writeCallCount = 0;
      let lastWrittenPayload = '';

      mockApp.vault.adapter.write = vi.fn().mockImplementation(async (path, data) => {
        writeCallCount++;
        // Simulate asynchronous I/O delay
        await new Promise((resolve) => setTimeout(resolve, 20));
        lastWrittenPayload = data;
      });

      // Record first batch of events and trigger first flush
      logger.record('caret', { slotId: 's1', offset: 1 });
      const p1 = logger.flush();

      // Record second batch of events while first write is in flight
      logger.record('caret', { slotId: 's2', offset: 2 });
      logger.record('navigation', { key: 'ArrowRight' });
      const p2 = logger.flush();

      await Promise.all([p1, p2]);

      expect(writeCallCount).toBeGreaterThanOrEqual(2);
      const parsedLast = JSON.parse(lastWrittenPayload);
      expect(parsedLast.length).toBe(3);
      expect(parsedLast[0].details.slotId).toBe('s1');
      expect(parsedLast[1].details.slotId).toBe('s2');
      expect(parsedLast[2].details.key).toBe('ArrowRight');
    });

    it('handles clear while a flush is pending without crashing', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);

      logger.record('caret', { slotId: 's1', offset: 0 });
      // Schedule debounce flush
      const clearPromise = logger.clear();
      await clearPromise;

      expect(logger.getEvents().length).toBe(0);
      const content = await mockApp.vault.adapter.read('.obsidian/plugins/obsidian-word-equation/debug-log.json');
      expect(content).toBe('[]');
    });
  });
});
