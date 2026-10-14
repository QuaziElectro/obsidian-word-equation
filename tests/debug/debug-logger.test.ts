import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
  DebugEvent,
  teardownGlobalTelemetry,
} from '../../src/debug/debug-logger';
import { App, Notice, MarkdownView, WorkspaceLeaf, TFile } from '../mocks/obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import { updateVisualCaretDom, updatePartialSelectionDom } from '../../src/editor/selection';
import { setActiveEquationState, clearActiveEquationState } from '../../src/editor/active-session';
import { createSlot, createToken, createFraction } from '../../src/core/ast';
import { convertCurrentNote, convertEntireVault } from '../../src/conversion/commands';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

describe('DebugLogger Subsystem (Milestone 1)', () => {
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

  describe('Singleton Pattern and Window Bridges', () => {
    it('returns the same singleton instance', () => {
      const logger1 = getDebugLogger();
      const logger2 = DebugLogger.getInstance();
      expect(logger1).toBe(logger2);
    });

    it('exposes window bridges for CDP and test inspection', () => {
      expect((window as any).__wordEquationDebugLogger).toBe(logger);
      expect((window as any).__wordEquationDebugEnabled).toBe(false);
      expect((window as any).__eqDebugEvents).toEqual([]);
    });
  });

  describe('Toggle Behavior and Fast-Branch Check', () => {
    it('initializes to disabled by default', () => {
      expect(logger.isEnabled()).toBe(false);
      expect(isDebugEnabled()).toBe(false);
      expect((window as any).__wordEquationDebugEnabled).toBe(false);
    });

    it('toggles enabled and disabled state properly', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
      expect(isDebugEnabled()).toBe(true);
      expect((window as any).__wordEquationDebugEnabled).toBe(true);

      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);
      expect(isDebugEnabled()).toBe(false);
      expect((window as any).__wordEquationDebugEnabled).toBe(false);
    });
  });

  describe('Zero-Overhead Contract When Disabled', () => {
    it('does not evaluate lazy payload factory when disabled', () => {
      const factorySpy = vi.fn(() => ({ key: 'should-not-run' }));
      expect(isDebugEnabled()).toBe(false);

      logDebugEvent('caret', factorySpy);

      expect(factorySpy).not.toHaveBeenCalled();
      expect(logger.getEvents().length).toBe(0);
    });

    it('does not append any events when disabled', () => {
      logDebugEvent('navigation', { key: 'ArrowRight', handled: true });
      logDebugEvent('selection', { selectionType: 'full' });

      expect(logger.getEvents()).toEqual([]);
      expect((window as any).__eqDebugEvents).toEqual([]);
    });

    it('incurs negligible sub-millisecond execution time across 50,000 disabled iterations', () => {
      logger.setEnabled(false);
      const factory = () => ({ x: 1, y: 2, complex: 'string' });

      const start = performance.now();
      for (let i = 0; i < 50000; i++) {
        logDebugEvent('caret', factory);
      }
      const duration = performance.now() - start;

      // 50,000 branch checks should take less than 100ms (< 2 microseconds per call)
      expect(duration).toBeLessThan(100);
      expect(logger.getEvents().length).toBe(0);
    });
  });

  describe('Event Recording and Schema Validation Across All 6 Domains', () => {
    beforeEach(() => {
      logger.init(mockApp, 'obsidian-word-equation', true);
    });

    it('records events with timestamp and payload when enabled', () => {
      logDebugEvent('caret', {
        slotId: 'root',
        offset: 2,
        domOffset: 2,
        isPlaceholder: false,
      });

      const events = logger.getEvents();
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.type).toBe('caret');
      expect(event.details).toEqual({
        slotId: 'root',
        offset: 2,
        domOffset: 2,
        isPlaceholder: false,
      });
      expect(Date.parse(event.timestamp)).not.toBeNaN();
      expect((window as any).__eqDebugEvents).toBe(events);
    });

    it('evaluates lazy factory payload when enabled', () => {
      const factory = vi.fn(() => ({ action: 'copy', isMathML: true }));
      logDebugEvent('clipboard', factory);

      expect(factory).toHaveBeenCalledTimes(1);
      const events = logger.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('clipboard');
      expect(events[0].details).toEqual({ action: 'copy', isMathML: true });
    });

    it('records multiple events in chronological order', () => {
      logDebugEvent('initialization', { stage: 'vault_layout_ready' });
      logDebugEvent('navigation', { key: 'ArrowLeft' });
      logDebugEvent('conversion', { direction: 'latex-to-mathml', status: 'success' });

      const events = logger.getEvents();
      expect(events.length).toBe(3);
      expect(events[0].type).toBe('initialization');
      expect(events[1].type).toBe('navigation');
      expect(events[2].type).toBe('conversion');
    });

    it('validates Caret Position Tracking event schema (Domain 1)', () => {
      logDebugEvent('caret', () => ({
        source: 'editor_widget',
        equation: { from: 10, to: 25, isInline: true },
        caret: { slotId: 'slot_1', offset: 3, slotRole: 'numerator', isAtEnd: false },
        dom: {
          tagName: 'span',
          targetSlotSelector: '[data-slot-id="slot_1"]',
          role: 'eq-slot eq-numerator',
          domOffset: 3,
          isPlaceholder: false,
        },
        codeMirrorRange: { from: 10, to: 25 },
      }));

      const event = logger.getEvents().find((e) => e.type === 'caret')!;
      expect(event).toBeDefined();
      expect(event.details.source).toBe('editor_widget');
      expect(event.details.equation).toEqual({ from: 10, to: 25, isInline: true });
      expect(event.details.caret.slotId).toBe('slot_1');
      expect(event.details.caret.slotRole).toBe('numerator');
      expect(event.details.dom.isPlaceholder).toBe(false);
    });

    it('validates Selection Boundary Tracking event schema (Domain 2)', () => {
      logDebugEvent('selection', () => ({
        selectionType: 'partial',
        equation: { from: 5, to: 40, isInline: false },
        partial: {
          anchor: { slotId: 'num_slot', offset: 0 },
          head: { slotId: 'den_slot', offset: 1 },
          normalizedStart: { slotId: 'num_slot', offset: 0 },
          normalizedEnd: { slotId: 'den_slot', offset: 1 },
          isBackward: false,
          selectedSlotIds: ['num_slot', 'den_slot'],
          selectedTokenIds: ['tok_1', 'tok_2'],
        },
        highlightedSlotId: null,
      }));

      const event = logger.getEvents().find((e) => e.type === 'selection')!;
      expect(event).toBeDefined();
      expect(event.details.selectionType).toBe('partial');
      expect(event.details.partial.selectedSlotIds).toContain('num_slot');
      expect(event.details.partial.selectedTokenIds).toEqual(['tok_1', 'tok_2']);
    });

    it('validates Clipboard Tracking event schema (Domain 3)', () => {
      logDebugEvent('clipboard', () => ({
        action: 'paste',
        context: 'equation_widget',
        payload: {
          types: ['application/mathml+xml', 'text/plain'],
          plainTextSnippet: '<math><mi>x</mi></math>',
          mathmlSnippet: '<math><mi>x</mi></math>',
          isMathML: true,
          characterCount: 23,
        },
        destination: { slotId: 'slot_root', offset: 2 },
        success: true,
      }));

      const event = logger.getEvents().find((e) => e.type === 'clipboard')!;
      expect(event).toBeDefined();
      expect(event.details.action).toBe('paste');
      expect(event.details.context).toBe('equation_widget');
      expect(event.details.payload.isMathML).toBe(true);
      expect(event.details.destination).toEqual({ slotId: 'slot_root', offset: 2 });
    });

    it('validates Navigation Tracking event schema (Domain 4)', () => {
      logDebugEvent('navigation', () => ({
        key: 'ArrowRight',
        shiftKey: false,
        navType: 'exit_equation',
        from: { slotId: 'slot_den', offset: 2 },
        to: { cmPos: 45 },
        exitDirection: 'after',
        equation: { from: 10, to: 40, isInline: false },
        handled: true,
      }));

      const event = logger.getEvents().find((e) => e.type === 'navigation')!;
      expect(event).toBeDefined();
      expect(event.details.key).toBe('ArrowRight');
      expect(event.details.navType).toBe('exit_equation');
      expect(event.details.exitDirection).toBe('after');
      expect(event.details.to.cmPos).toBe(45);
    });

    it('validates Conversion Tracking event schema (Domain 5)', () => {
      logDebugEvent('conversion', () => ({
        scope: 'note',
        direction: 'latex-to-mathml',
        filePath: 'notes/math.md',
        equationCount: 3,
        durationMs: 12,
        status: 'success',
        inputSnippet: '$$x^2 + y^2 = z^2$$',
        outputSnippet: '<math xmlns="http://www.w3.org/1998/Math/MathML">...',
      }));

      const event = logger.getEvents().find((e) => e.type === 'conversion')!;
      expect(event).toBeDefined();
      expect(event.details.scope).toBe('note');
      expect(event.details.direction).toBe('latex-to-mathml');
      expect(event.details.equationCount).toBe(3);
      expect(event.details.status).toBe('success');
    });

    it('validates Vault Initialization and Fresh Load Tracking schema (Domain 6, R3)', () => {
      logDebugEvent('initialization', () => ({
        stage: 'first_caret_interaction',
        startupState: {
          activeFilePath: 'index.md',
          activeViewType: 'markdown',
          docLength: 120,
          cmSelection: { from: 0, to: 0, head: 0, anchor: 0 },
          detectedEquationCount: 1,
          equations: [{ from: 10, to: 40, isInline: false, isEmpty: false }],
          activeElementTag: 'body',
          activeElementClass: '',
          hasActiveEquationSession: false,
        },
        firstInteraction: {
          eventType: 'pointerdown',
          clientX: 150,
          clientY: 220,
          targetTag: 'span',
          targetClass: 'eq-placeholder',
          targetSlotId: 'slot_frac_num',
          targetPlaceholderFor: 'slot_frac_num',
          resultingCaret: { slotId: 'slot_frac_num', offset: 0 },
          equationActivated: true,
        },
      }));

      const event = logger.getEvents().find((e) => e.type === 'initialization')!;
      expect(event).toBeDefined();
      expect(event.details.stage).toBe('first_caret_interaction');
      expect(event.details.startupState.detectedEquationCount).toBe(1);
      expect(event.details.firstInteraction.equationActivated).toBe(true);
      expect(event.details.firstInteraction.resultingCaret).toEqual({ slotId: 'slot_frac_num', offset: 0 });
    });

    it('verifies updateVisualCaretDom automatically logs caret event', () => {
      const container = document.createElement('div');
      container.className = 'word-equation-block';
      container.setAttribute('data-equation-from', '10');
      container.setAttribute('data-equation-to', '30');
      const slotEl = document.createElement('span');
      slotEl.className = 'eq-slot';
      slotEl.setAttribute('data-slot-id', 'test_slot_abc');
      slotEl.setAttribute('data-slot-role', 'numerator');
      container.appendChild(slotEl);

      updateVisualCaretDom(container, { slotId: 'test_slot_abc', offset: 0 }, true);

      const caretEvents = logger.getEvents().filter((e) => e.type === 'caret');
      expect(caretEvents.length).toBeGreaterThanOrEqual(1);
      const lastCaret = caretEvents[caretEvents.length - 1];
      expect(lastCaret.details.caret.slotId).toBe('test_slot_abc');
      expect(lastCaret.details.caret.slotRole).toBe('numerator');
      expect(lastCaret.details.dom.targetSlotSelector).toBe('[data-slot-id="test_slot_abc"]');
    });

    it('verifies updatePartialSelectionDom automatically logs selection event', () => {
      const container = document.createElement('div');
      container.className = 'word-equation-block';
      container.setAttribute('data-equation-from', '15');
      container.setAttribute('data-equation-to', '35');

      const tok1 = createToken('a', 'mi');
      const tok2 = createToken('+', 'mo');
      const slot = createSlot('root', [tok1, tok2], null, 'sel_slot_1');

      const slotEl = document.createElement('span');
      slotEl.className = 'eq-slot';
      slotEl.setAttribute('data-slot-id', 'sel_slot_1');
      const t1 = document.createElement('span');
      t1.className = 'eq-token';
      t1.setAttribute('data-node-id', tok1.id);
      slotEl.appendChild(t1);
      container.appendChild(slotEl);

      updatePartialSelectionDom(container, slot, {
        anchor: { slotId: 'sel_slot_1', offset: 0 },
        head: { slotId: 'sel_slot_1', offset: 1 },
      });

      const selEvents = logger.getEvents().filter((e) => e.type === 'selection');
      expect(selEvents.length).toBeGreaterThanOrEqual(1);
      const lastSel = selEvents[selEvents.length - 1];
      expect(lastSel.details.selectionType).toBe('partial');
      expect(lastSel.details.partial.selectedTokenIds).toContain(tok1.id);
    });

    it('verifies setActiveEquationState automatically logs caret event', () => {
      setActiveEquationState({
        from: 20,
        to: 50,
        caret: { slotId: 'active_slot_xyz', offset: 1 },
        isFocused: true,
      });

      const caretEvents = logger.getEvents().filter((e) => e.type === 'caret');
      expect(caretEvents.length).toBeGreaterThanOrEqual(1);
      const lastCaret = caretEvents[caretEvents.length - 1];
      expect(lastCaret.details.caret.slotId).toBe('active_slot_xyz');
      expect(lastCaret.details.equation.from).toBe(20);
      expect(lastCaret.details.equation.to).toBe(50);
      clearActiveEquationState();
    });
  });

  describe('Debounced Flush and Persistence to Vault Adapter', () => {
    beforeEach(() => {
      logger.init(mockApp, 'obsidian-word-equation', true);
    });

    it('debounces writes and persists formatted JSON array to default configDir', async () => {
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('caret', { slotId: 'frac-num', offset: 1 });
      logDebugEvent('navigation', { key: 'ArrowRight', handled: true });

      // Before flush, adapter has not received the write yet
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(false);

      // Explicitly await flush
      await logger.flush();

      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const fileContent = mockApp.vault.adapter.files.get(logPath)!;
      const parsed = JSON.parse(fileContent);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].type).toBe('caret');
      expect(parsed[1].type).toBe('navigation');
      // Verify formatted JSON with newlines
      expect(fileContent).toContain('\n  {\n');
    });

    it('persists to custom vault configDir if configured', async () => {
      mockApp.vault.configDir = '.custom-obsidian-config';
      const expectedPath = '.custom-obsidian-config/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('conversion', { direction: 'mathml-to-latex', equationCount: 5 });
      await logger.flush();

      expect(mockApp.vault.adapter.files.has(expectedPath)).toBe(true);
      const parsed = JSON.parse(mockApp.vault.adapter.files.get(expectedPath)!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].details.equationCount).toBe(5);
    });

    it('automatically flushes after debounce interval', async () => {
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('selection', { selectionType: 'partial' });
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(false);

      // Wait 60ms to let the 50ms debounce timer fire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const parsed = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(parsed.length).toBe(1);
    });
  });

  describe('Clear Log Operation', () => {
    beforeEach(() => {
      logger.init(mockApp, 'obsidian-word-equation', true);
    });

    it('clears memory events, window array, and resets file to empty array on disk', async () => {
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';

      logDebugEvent('caret', { slotId: 'root', offset: 0 });
      await logger.flush();
      expect(logger.getEvents().length).toBe(1);

      await logger.clear();

      expect(logger.getEvents()).toEqual([]);
      expect((window as any).__eqDebugEvents).toEqual([]);
      expect(mockApp.vault.adapter.files.get(logPath)).toBe('[]');
    });
  });

  describe('Plugin Lifecycle Integration (src/main.ts)', () => {
    let plugin: WordEquationPlugin;

    beforeEach(() => {
      DEFAULT_SETTINGS.debugMode = false;
      plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
    });

    it('initializes debug logger with plugin settings in onload', async () => {
      plugin.loadData = async () => ({ debugMode: true });
      await plugin.onload();

      expect(logger.isEnabled()).toBe(true);
      expect(isDebugEnabled()).toBe(true);
    });

    it('updates debug logger when settings change in saveSettings', async () => {
      await plugin.onload();
      expect(logger.isEnabled()).toBe(false);

      plugin.settings.debugMode = true;
      await plugin.saveSettings();

      expect(logger.isEnabled()).toBe(true);

      plugin.settings.debugMode = false;
      await plugin.saveSettings();

      expect(logger.isEnabled()).toBe(false);
    });

    it('flushes debug logger on onunload', async () => {
      const logPath = '.obsidian/plugins/obsidian-word-equation/debug-log.json';
      await plugin.onload();
      plugin.settings.debugMode = true;
      await plugin.saveSettings();

      logDebugEvent('navigation', { from: 1, to: 2 });
      expect(mockApp.vault.adapter.files.has(logPath)).toBe(false);

      plugin.onunload();
      // Allow async flush in onunload to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockApp.vault.adapter.files.has(logPath)).toBe(true);
      const parsed = JSON.parse(mockApp.vault.adapter.files.get(logPath)!);
      expect(parsed.length).toBe(1);
    });
  });

  describe('Settings Tab Integration (src/settings/settings-tab.ts)', () => {
    let plugin: WordEquationPlugin;
    let tab: WordEquationSettingTab;

    beforeEach(async () => {
      Notice.notices = [];
      plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
      await plugin.onload();
      tab = new WordEquationSettingTab(mockApp, plugin);
    });

    it('renders Enable Debug Mode toggle and Clear Debug Log button', () => {
      tab.display();
      const container = tab.containerEl;

      const settingItems = Array.from(container.querySelectorAll('.setting-item'));
      const debugToggleItem = settingItems.find((el) =>
        el.textContent?.includes('Enable Debug Mode')
      );
      const clearLogItem = settingItems.find((el) =>
        el.textContent?.includes('Clear Debug Log')
      );

      expect(debugToggleItem).toBeDefined();
      expect(clearLogItem).toBeDefined();
    });

    it('clicking Clear Debug Log button resets log and shows notice', async () => {
      logger.setEnabled(true);
      logDebugEvent('caret', { slotId: 'test' });
      await logger.flush();
      expect(logger.getEvents().length).toBe(1);

      tab.display();
      const clearBtn = Array.from(tab.containerEl.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Clear Log')
      );
      expect(clearBtn).toBeDefined();

      clearBtn!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(logger.getEvents().length).toBe(0);
      expect(Notice.notices.length).toBeGreaterThan(0);
      expect(Notice.notices[Notice.notices.length - 1].message).toBe('Debug log cleared.');
    });
  });

  describe('Milestone 2: Comprehensive Event Tracking Hooks Across All Domains', () => {
    beforeEach(() => {
      logger.init(mockApp, 'obsidian-word-equation', true);
    });

    describe('1. Caret Position Tracking Hooks', () => {
      it('captures full DOM and slot details in updateVisualCaretDom', () => {
        const rootEl = document.createElement('div');
        rootEl.className = 'word-equation-block';
        rootEl.setAttribute('data-equation-from', '10');
        rootEl.setAttribute('data-equation-to', '30');

        const slotEl = document.createElement('span');
        slotEl.className = 'eq-slot eq-numerator';
        slotEl.setAttribute('data-slot-id', 'num_slot_1');
        slotEl.setAttribute('data-slot-role', 'numerator');

        const tokEl = document.createElement('span');
        tokEl.className = 'eq-token';
        tokEl.textContent = '1';
        slotEl.appendChild(tokEl);
        rootEl.appendChild(slotEl);

        updateVisualCaretDom(rootEl, { slotId: 'num_slot_1', offset: 1 }, true);

        const events = logger.getEvents().filter((e) => e.type === 'caret');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[events.length - 1];

        expect(event.details.caret.slotId).toBe('num_slot_1');
        expect(event.details.caret.offset).toBe(1);
        expect(event.details.caret.slotRole).toBe('numerator');
        expect(event.details.caret.isAtEnd).toBe(true);
        expect(event.details.dom.tagName).toBe('span');
        expect(event.details.dom.targetSlotSelector).toBe('[data-slot-id="num_slot_1"]');
      });

      it('captures caret with AST role and parent type in setActiveEquationState', () => {
        const numSlot = createSlot('numerator', [createToken('1', 'mn')], null, 'slot_num');
        const denSlot = createSlot('denominator', [createToken('2', 'mn')], null, 'slot_den');
        const frac = createFraction(numSlot, denSlot);
        const root = createSlot('root', [frac], null, 'root_slot');

        setActiveEquationState({
          from: 5,
          to: 25,
          caret: { slotId: 'slot_num', offset: 0 },
          isFocused: true,
          ast: root,
        });

        const events = logger.getEvents().filter((e) => e.type === 'caret');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[events.length - 1];

        expect(event.details.caret.slotId).toBe('slot_num');
        expect(event.details.caret.offset).toBe(0);
        expect(event.details.caret.slotRole).toBe('numerator');
        expect(event.details.caret.parentType).toBe('fraction');
        expect(event.details.caret.isAtEnd).toBe(false);
        expect(event.details.codeMirrorRange).toEqual({ from: 5, to: 25 });
        clearActiveEquationState();
      });

      it('does NOT record caret events when debug mode is disabled', () => {
        logger.setEnabled(false);
        const rootEl = document.createElement('div');
        rootEl.className = 'word-equation-block';
        updateVisualCaretDom(rootEl, { slotId: 'slot_test', offset: 0 }, true);
        setActiveEquationState({
          from: 0,
          to: 10,
          caret: { slotId: 'slot_test', offset: 0 },
          isFocused: true,
        });
        clearActiveEquationState();
        expect(logger.getEvents().filter((e) => e.type === 'caret').length).toBe(0);
      });
    });

    describe('2. Selection Boundary Tracking Hooks', () => {
      it('captures partial selection with token IDs and backward flag', () => {
        const rootEl = document.createElement('div');
        rootEl.className = 'word-equation-block';
        rootEl.setAttribute('data-equation-from', '0');
        rootEl.setAttribute('data-equation-to', '20');

        const tok1 = createToken('a', 'mi');
        const tok2 = createToken('b', 'mi');
        const rootAst = createSlot('root', [tok1, tok2], null, 'root_slot');

        const slotEl = document.createElement('span');
        slotEl.className = 'eq-slot';
        slotEl.setAttribute('data-slot-id', 'root_slot');

        const t1El = document.createElement('span');
        t1El.className = 'eq-token';
        t1El.setAttribute('data-node-id', tok1.id);
        const t2El = document.createElement('span');
        t2El.className = 'eq-token';
        t2El.setAttribute('data-node-id', tok2.id);
        slotEl.appendChild(t1El);
        slotEl.appendChild(t2El);
        rootEl.appendChild(slotEl);

        // Backward selection from offset 2 to 0
        updatePartialSelectionDom(rootEl, rootAst, {
          anchor: { slotId: 'root_slot', offset: 2 },
          head: { slotId: 'root_slot', offset: 0 },
        });

        const events = logger.getEvents().filter((e) => e.type === 'selection');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[events.length - 1];

        expect(event.details.selectionType).toBe('partial');
        expect(event.details.partial.isBackward).toBe(true);
        expect(event.details.partial.anchor).toEqual({ slotId: 'root_slot', offset: 2 });
        expect(event.details.partial.head).toEqual({ slotId: 'root_slot', offset: 0 });
        expect(event.details.partial.selectedTokenIds).toContain(tok1.id);
        expect(event.details.partial.selectedTokenIds).toContain(tok2.id);
      });

      it('captures slot_highlight selection when highlightedSlotId is passed', () => {
        const rootEl = document.createElement('div');
        rootEl.className = 'word-equation-block';
        const rootAst = createSlot('root', [], null, 'root_slot');

        updatePartialSelectionDom(rootEl, rootAst, null, 'target_placeholder_id');

        const events = logger.getEvents().filter((e) => e.type === 'selection');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[events.length - 1];

        expect(event.details.selectionType).toBe('slot_highlight');
        expect(event.details.highlightedSlotId).toBe('target_placeholder_id');
      });

      it('does NOT record selection events when debug mode is disabled', () => {
        logger.setEnabled(false);
        const rootEl = document.createElement('div');
        const rootAst = createSlot('root', [], null, 'root_slot');
        updatePartialSelectionDom(rootEl, rootAst, {
          anchor: { slotId: 'root_slot', offset: 0 },
          head: { slotId: 'root_slot', offset: 1 },
        });
        expect(logger.getEvents().filter((e) => e.type === 'selection').length).toBe(0);
      });
    });

    describe('3. Clipboard Tracking Hooks', () => {
      it('captures copy and cut events in WordEquationWidget', () => {
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
        const widget = new WordEquationWidget(xml, 0, 10, false);
        const dom = widget.toDOM(new EditorView({ state: EditorState.create({ doc: xml }) }));
        widget.isFocused = true;

        const clipboardData: any = {
          data: {},
          types: ['application/mathml+xml', 'text/plain'],
          setData(type: string, val: string) {
            this.data[type] = val;
          },
        };

        const copyEvent = new Event('copy', { bubbles: true, cancelable: true }) as any;
        copyEvent.clipboardData = clipboardData;
        widget.handleCopyEvent(copyEvent, false);

        const events = logger.getEvents().filter((e) => e.type === 'clipboard');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const lastEvent = events[events.length - 1];

        expect(lastEvent.details.action).toBe('copy');
        expect(lastEvent.details.context).toBe('equation_widget');
        expect(lastEvent.details.payload.isMathML).toBe(true);
        expect(lastEvent.details.payload.characterCount).toBeGreaterThan(0);
        expect(lastEvent.details.success).toBe(true);
      });

      it('captures paste events in WordEquationWidget', () => {
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
        const widget = new WordEquationWidget(xml, 0, 10, false);
        const view = new EditorView({ state: EditorState.create({ doc: xml }) });
        widget.toDOM(view);
        widget.isFocused = true;

        const clipboardData: any = {
          getData(type: string) {
            if (type === 'text/plain') return '<math><mi>y</mi></math>';
            return '';
          },
          types: ['text/plain'],
        };

        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
        pasteEvent.clipboardData = clipboardData;
        widget.handlePasteEvent(pasteEvent);

        const events = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details.action === 'paste');
        expect(events.length).toBeGreaterThanOrEqual(1);
        const lastEvent = events[events.length - 1];

        expect(lastEvent.details.action).toBe('paste');
        expect(lastEvent.details.context).toBe('equation_widget');
        expect(lastEvent.details.payload.isMathML).toBe(true);
        expect(lastEvent.details.success).toBe(true);
        expect(lastEvent.details.destination.slotId).toBeDefined();
      });

      it('captures copy and paste in InteractiveEquationBox', () => {
        const container = document.createElement('div');
        const box = new InteractiveEquationBox({
          container,
          initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math>',
          onChange: () => {},
        });

        const clipboardData: any = {
          data: {},
          types: ['application/mathml+xml', 'text/plain'],
          setData(type: string, val: string) {
            this.data[type] = val;
          },
          getData() {
            return '<math><mn>42</mn></math>';
          },
        };

        const copyEvt = new Event('copy', { bubbles: true, cancelable: true }) as any;
        copyEvt.clipboardData = clipboardData;
        box.handleCopyEvent(copyEvt, false);

        const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
        pasteEvt.clipboardData = clipboardData;
        box.handlePasteEvent(pasteEvt);

        const events = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details.context === 'settings_box');
        expect(events.length).toBe(2);
        expect(events[0].details.action).toBe('copy');
        expect(events[1].details.action).toBe('paste');
      });

      it('does NOT record clipboard events when debug mode is disabled', () => {
        logger.setEnabled(false);
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
        const widget = new WordEquationWidget(xml, 0, 10, false);
        const copyEvent = new Event('copy', { bubbles: true, cancelable: true }) as any;
        copyEvent.clipboardData = { setData() {}, types: [] };
        widget.handleCopyEvent(copyEvent, false);
        expect(logger.getEvents().filter((e) => e.type === 'clipboard').length).toBe(0);
      });
    });

    describe('4. Navigation Tracking Hooks', () => {
      it('captures enterFromStart and enterFromEnd boundary entry', () => {
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math>';
        const widget = new WordEquationWidget(xml, 5, 25, false);
        const view = new EditorView({ state: EditorState.create({ doc: 'text ' + xml }) });

        widget.enterFromStart(view, 'ArrowRight');
        let navEvents = logger.getEvents().filter((e) => e.type === 'navigation');
        expect(navEvents.length).toBeGreaterThanOrEqual(1);
        let lastNav = navEvents[navEvents.length - 1];
        expect(lastNav.details.navType).toBe('enter_equation');
        expect(lastNav.details.key).toBe('ArrowRight');
        expect(lastNav.details.to.offset).toBe(0);

        widget.enterFromEnd(view, 'ArrowLeft');
        navEvents = logger.getEvents().filter((e) => e.type === 'navigation');
        lastNav = navEvents[navEvents.length - 1];
        expect(lastNav.details.navType).toBe('enter_equation');
        expect(lastNav.details.key).toBe('ArrowLeft');
      });

      it('captures internal jumps and exit transitions in handleArrowNavigation', () => {
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math>';
        const widget = new WordEquationWidget(xml, 0, 30, false);
        const view = new EditorView({ state: EditorState.create({ doc: xml }) });
        widget.toDOM(view);
        widget.isFocused = true;
        widget.caret = { slotId: widget.ast.id, offset: 0 };

        // Step right internally
        widget.handleArrowNavigation('ArrowRight', false, view);
        let navEvents = logger.getEvents().filter((e) => e.type === 'navigation');
        expect(navEvents.length).toBeGreaterThanOrEqual(1);
        let lastNav = navEvents[navEvents.length - 1];
        expect(lastNav.details.navType).toBe('internal_jump');
        expect(lastNav.details.key).toBe('ArrowRight');
        expect(lastNav.details.handled).toBe(true);

        // Move to end and step right to trigger exit
        widget.caret = { slotId: widget.ast.id, offset: widget.ast.children.length };
        widget.handleArrowNavigation('ArrowRight', false, view);
        navEvents = logger.getEvents().filter((e) => e.type === 'navigation');
        lastNav = navEvents[navEvents.length - 1];
        expect(lastNav.details.navType).toBe('exit_equation');
        expect(lastNav.details.exitDirection).toBe('after');
      });

      it('does NOT record navigation events when debug mode is disabled', () => {
        logger.setEnabled(false);
        const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math>';
        const widget = new WordEquationWidget(xml, 0, 10, false);
        const view = new EditorView({ state: EditorState.create({ doc: xml }) });
        widget.enterFromStart(view);
        widget.handleArrowNavigation('ArrowRight', false, view);
        expect(logger.getEvents().filter((e) => e.type === 'navigation').length).toBe(0);
      });
    });

    describe('5. Conversion Tracking Hooks', () => {
      it('captures convertCurrentNote execution details', async () => {
        const file = new TFile('test-note.md');
        const content = '# Test\n$$x^2 + y^2$$';
        mockApp.vault.files.set('test-note.md', content);

        const leaf = new WorkspaceLeaf(mockApp);
        const view = new MarkdownView(leaf);
        view.file = file;
        view.editor.setValue(content);
        mockApp.workspace.activeLeaf = leaf;
        mockApp.workspace.activeView = view;

        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        await plugin.onload();
        plugin.settings.debugMode = true;
        logger.setEnabled(true);

        const summary = await convertCurrentNote(plugin, 'latex-to-mathml');
        expect(summary.convertedCount).toBe(1);

        const convEvents = logger.getEvents().filter((e) => e.type === 'conversion');
        expect(convEvents.length).toBeGreaterThanOrEqual(1);
        const lastConv = convEvents[convEvents.length - 1];
        expect(lastConv.details.scope).toBe('note');
        expect(lastConv.details.direction).toBe('latex-to-mathml');
        expect(lastConv.details.equationCount).toBe(1);
        expect(lastConv.details.status).toBe('success');
        expect(lastConv.details.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('captures convertEntireVault execution details', async () => {
        const f1 = new TFile('file1.md');
        const f2 = new TFile('file2.md');
        mockApp.vault.files.set('file1.md', '$$a + b$$');
        mockApp.vault.files.set('file2.md', '$$c + d$$');
        mockApp.vault.getMarkdownFiles = () => [f1, f2];

        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        await plugin.onload();
        plugin.settings.debugMode = true;
        logger.setEnabled(true);

        const summary = await convertEntireVault(plugin, 'latex-to-mathml');
        expect(summary.equationsConverted).toBe(2);

        const convEvents = logger.getEvents().filter((e) => e.type === 'conversion' && e.details.scope === 'vault');
        expect(convEvents.length).toBe(1);
        const lastConv = convEvents[0];
        expect(lastConv.details.scope).toBe('vault');
        expect(lastConv.details.filesModified).toBe(2);
        expect(lastConv.details.equationCount).toBe(2);
        expect(lastConv.details.status).toBe('success');
      });

      it('does NOT record conversion events when debug mode is disabled', async () => {
        logger.setEnabled(false);
        const file = new TFile('test-note.md');
        mockApp.vault.files.set('test-note.md', '$$x$$');
        const leaf = new WorkspaceLeaf(mockApp);
        const view = new MarkdownView(leaf);
        view.file = file;
        mockApp.workspace.activeLeaf = leaf;
        mockApp.workspace.activeView = view;

        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        plugin.settings.debugMode = false;
        await convertCurrentNote(plugin, 'latex-to-mathml');
        expect(logger.getEvents().filter((e) => e.type === 'conversion').length).toBe(0);
      });
    });

    describe('6. Initialization Tracking Hooks (R3)', () => {
      it('captures startup initialization state on vault layout ready', async () => {
        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        plugin.settings.debugMode = true;
        logger.setEnabled(true);

        plugin.captureStartupInitializationState();

        const initEvents = logger.getEvents().filter((e) => e.type === 'initialization');
        expect(initEvents.length).toBeGreaterThanOrEqual(1);
        const event = initEvents[0];

        expect(event.details.stage).toBe('vault_layout_ready');
        expect(event.details.startupState).toBeDefined();
        expect(typeof event.details.startupState.docLength).toBe('number');
        expect(typeof event.details.startupState.detectedEquationCount).toBe('number');
        expect(Array.isArray(event.details.startupState.equations)).toBe(true);
      });

      it('captures first caret interaction listener state and ensures one-time execution', async () => {
        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        plugin.settings.debugMode = true;
        logger.setEnabled(true);

        const targetEl = document.createElement('span');
        targetEl.className = 'eq-placeholder';
        targetEl.setAttribute('data-slot-id', 'init_slot_123');
        document.body.appendChild(targetEl);

        plugin.captureStartupInitializationState();

        const initEventsBefore = logger.getEvents().filter((e) => e.type === 'initialization');
        expect(initEventsBefore.length).toBe(1);
        expect(initEventsBefore[0].details.stage).toBe('vault_layout_ready');

        // Dispatch first pointerdown event
        targetEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 150 }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const initEventsAfterFirst = logger.getEvents().filter(
          (e) => e.type === 'initialization' && e.details.stage === 'first_caret_interaction'
        );
        expect(initEventsAfterFirst.length).toBe(1);
        expect(initEventsAfterFirst[0].details.firstInteraction.targetSlotId).toBe('init_slot_123');

        // Dispatch second interaction to verify one-time execution
        targetEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 250 }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const initEventsAfterSecond = logger.getEvents().filter(
          (e) => e.type === 'initialization' && e.details.stage === 'first_caret_interaction'
        );
        expect(initEventsAfterSecond.length).toBe(1);

        targetEl.remove();
      });

      it('does NOT record initialization events when debug mode is disabled', () => {
        logger.setEnabled(false);
        const plugin = new WordEquationPlugin(mockApp, { id: 'obsidian-word-equation' } as any);
        plugin.settings.debugMode = false;
        plugin.captureStartupInitializationState();
        expect(logger.getEvents().filter((e) => e.type === 'initialization').length).toBe(0);
      });
    });
  });
});

