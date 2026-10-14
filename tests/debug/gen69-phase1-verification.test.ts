import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  captureTableCellMetrics,
  DOMBoxMetrics,
  ComputedStyleMetrics,
  TableCellFocusTelemetryPayload,
} from '../../src/debug/debug-logger';
import { WordEquationWidget } from '../../src/editor/widget';
import { createSlot } from '../../src/core/ast';

describe('Generation 69 Phase 1 & Bug 2 Deep Telemetry Verification', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  let logger: DebugLogger;

  beforeEach(() => {
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    logger.resetForTesting();
    vi.restoreAllMocks();
  });

  describe('Bug 2 Deep Telemetry Instrumentation Specification', () => {
    it('respects debug mode toggle and provides zero-overhead when disabled', () => {
      expect(logger.isEnabled()).toBe(false);
      expect(isDebugEnabled()).toBe(false);

      const div = document.createElement('div');
      div.className = 'word-equation-block word-equation-table-block';

      const payload = captureTableCellMetrics(div, 'cell_entry', { from: 10, to: 20 });
      expect(payload).toBeNull();
      expect(logger.getEvents().length).toBe(0);

      const methodPayload = logger.captureTableCellMetrics(div, 'cell_entry', 10, 20);
      expect(methodPayload).toBeNull();
      expect(logger.getEvents().length).toBe(0);
    });

    it('captures live bounding rects, computed styles, class transitions, and outline state when enabled', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
      expect(isDebugEnabled()).toBe(true);

      // Construct realistic DOM hierarchy for a table cell with block equation
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'table-cell-custom';

      const widgetEl = document.createElement('div');
      widgetEl.className = 'word-equation-block word-equation-table-block';
      widgetEl.style.marginTop = '4px';
      widgetEl.style.marginBottom = '4px';
      widgetEl.style.padding = '2px';
      widgetEl.style.fontSize = '16px';

      const mathBox = document.createElement('div');
      mathBox.className = 'word-equation-math eq-active';
      mathBox.style.padding = '6px 12px';
      mathBox.style.border = '1px solid rgb(112, 93, 207)';
      mathBox.style.boxShadow = '0 0 0 2px rgba(112, 93, 207, 0.25)';

      const caret = document.createElement('span');
      caret.className = 'eq-caret';
      caret.textContent = '|';
      mathBox.appendChild(caret);

      widgetEl.appendChild(mathBox);
      td.appendChild(widgetEl);
      tr.appendChild(td);
      table.appendChild(tr);
      document.body.appendChild(table);

      // Mock bounding rects
      vi.spyOn(widgetEl, 'getBoundingClientRect').mockReturnValue({
        width: 320,
        height: 48,
        top: 100,
        bottom: 148,
        left: 50,
        right: 370,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      vi.spyOn(mathBox, 'getBoundingClientRect').mockReturnValue({
        width: 180,
        height: 38,
        top: 105,
        bottom: 143,
        left: 120,
        right: 300,
        x: 120,
        y: 105,
        toJSON: () => {},
      });

      vi.spyOn(td, 'getBoundingClientRect').mockReturnValue({
        width: 350,
        height: 60,
        top: 95,
        bottom: 155,
        left: 40,
        right: 390,
        x: 40,
        y: 95,
        toJSON: () => {},
      });

      // 1. Test cell_entry transition
      const entryPayload = captureTableCellMetrics(widgetEl, 'cell_entry', { from: 1131, to: 1222 });
      expect(entryPayload).not.toBeNull();
      if (!entryPayload) throw new Error('Expected entryPayload to exist');

      expect(entryPayload.transition).toBe('cell_entry');
      expect(entryPayload.equationFrom).toBe(1131);
      expect(entryPayload.equationTo).toBe(1222);
      expect(entryPayload.isBlockInTable).toBe(true);
      expect(entryPayload.containerTag).toBe('td');
      expect(entryPayload.containerClasses).toContain('table-cell-custom');
      expect(entryPayload.widgetClasses).toContain('word-equation-table-block');
      expect(entryPayload.mathBoxClasses).toContain('eq-active');
      expect(entryPayload.hasActiveOutline).toBe(true);
      expect(entryPayload.hasVisualCaret).toBe(true);

      // Verify Bounding Client Rects
      expect(entryPayload.widgetRect).toEqual({
        width: 320,
        height: 48,
        top: 100,
        bottom: 148,
        left: 50,
        right: 370,
      });
      expect(entryPayload.mathBoxRect).toEqual({
        width: 180,
        height: 38,
        top: 105,
        bottom: 143,
        left: 120,
        right: 300,
      });
      expect(entryPayload.parentCellRect).toEqual({
        width: 350,
        height: 60,
        top: 95,
        bottom: 155,
        left: 40,
        right: 390,
      });

      // Verify Computed Style Metrics
      expect(entryPayload.widgetComputedStyles).toBeDefined();
      expect(typeof entryPayload.widgetComputedStyles.marginTop).toBe('string');
      expect(typeof entryPayload.widgetComputedStyles.paddingTop).toBe('string');
      expect(typeof entryPayload.widgetComputedStyles.fontSize).toBe('string');
      expect(typeof entryPayload.mathBoxComputedStyles.boxShadow).toBe('string');

      // 2. Verify event recorded in DebugLogger
      const events = logger.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('table_cell_metrics');
      expect(events[0].details.transition).toBe('cell_entry');
      expect(events[0].details.equationFrom).toBe(1131);

      // 3. Test cell_exit transition with alternative signature
      mathBox.classList.remove('eq-active');
      caret.remove();

      const exitPayload = logger.captureTableCellMetrics(widgetEl, 'cell_exit', 1131, 1222);
      expect(exitPayload).not.toBeNull();
      if (!exitPayload) throw new Error('Expected exitPayload to exist');

      expect(exitPayload.transition).toBe('cell_exit');
      expect(exitPayload.hasActiveOutline).toBe(false);
      expect(exitPayload.hasVisualCaret).toBe(false);

      expect(logger.getEvents().length).toBe(2);
      expect(logger.getEvents()[1].details.transition).toBe('cell_exit');

      document.body.removeChild(table);
    });

    it('integrates with WordEquationWidget lifecycle hooks for table block equations', () => {
      logger.setEnabled(true);

      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>';
      const widget = new WordEquationWidget(
        xml,   // code
        100,   // from
        150,   // to
        false, // isInline = false
        'math-word', // delimiter
        true   // isBlockInTable = true
      );

      // 1. toDOM hook
      const mockView = {
        state: { doc: { lines: 1 } },
        dom: document.createElement('div'),
      } as any;
      const dom = widget.toDOM(mockView);
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);

      const eventsAfterToDOM = logger.getEvents().filter((e) => e.type === 'table_cell_metrics');
      expect(eventsAfterToDOM.length).toBeGreaterThanOrEqual(1);
      expect(eventsAfterToDOM[0].details.isBlockInTable).toBe(true);
      expect(eventsAfterToDOM[0].details.equationFrom).toBe(100);
      expect(eventsAfterToDOM[0].details.equationTo).toBe(150);

      // 2. updateCaretOnly hook on focus entry
      widget.isFocused = true;
      widget.updateCaretOnly(dom);

      const entryEvents = logger.getEvents().filter((e) => e.type === 'table_cell_metrics' && e.details.transition === 'cell_entry');
      expect(entryEvents.length).toBeGreaterThanOrEqual(1);

      // 3. updateCaretOnly hook on focus exit
      widget.isFocused = false;
      widget.updateCaretOnly(dom);

      const exitEvents = logger.getEvents().filter((e) => e.type === 'table_cell_metrics' && e.details.transition === 'cell_exit');
      expect(exitEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Phase 1 Acceptance Criteria: BUG_REPORT_1.md through BUG_REPORT_7.md', () => {
    it('verifies all 7 active bug reports exist at project root', () => {
      for (let i = 1; i <= 7; i++) {
        const reportPath = path.join(projectRoot, `BUG_REPORT_${i}.md`);
        expect(
          fs.existsSync(reportPath),
          `Expected BUG_REPORT_${i}.md to exist at project root`
        ).toBe(true);
      }
    });

    it('verifies each bug report contains comprehensive technical explanations, citations, and blueprints', () => {
      for (let i = 1; i <= 7; i++) {
        const reportPath = path.join(projectRoot, `BUG_REPORT_${i}.md`);
        const content = fs.readFileSync(reportPath, 'utf8');
        const stat = fs.statSync(reportPath);

        // Report must be substantial (>5KB)
        expect(stat.size, `BUG_REPORT_${i}.md must be at least 5KB`).toBeGreaterThan(5000);

        // Required structural sections
        expect(content).toMatch(/Executive Summary/i);
        expect(content).toMatch(/Telemetry|Empirical Evidence|debug-log/i);
        expect(content).toMatch(/Code-Level|Code Analysis|Failure Mechanism|Mechanism|Technical Specification|Root Cause|Sizing Analysis/i);
        expect(content).toMatch(/Reproduction\s+(?:Steps|Procedure|Instructions)|How to Reproduce|Verification(?:\s+Method|\s+&\s+Test\s+Plan)?/i);
        expect(content).toMatch(/Remediation|Blueprint/i);

        // Code references
        expect(content).toMatch(/src\/[a-zA-Z0-9_\-\/]+\.(?:ts|css)/);

        // Concrete telemetry event citations or code analysis
        const hasEventId = /Event[s]?\s*(?:#|no\.)?\s*\d+/i.test(content);
        const hasTelemetryTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content);
        const hasCodeAnalysis = /line[s]?\s+\d+/i.test(content);

        expect(
          hasEventId || hasTelemetryTimestamp || hasCodeAnalysis,
          `BUG_REPORT_${i}.md must cite telemetry event IDs, timestamps, or code line numbers`
        ).toBe(true);
      }
    });

    it('verifies that Bug 2 specifically contains the deep telemetry instrumentation specification', () => {
      const reportPath = path.join(projectRoot, 'BUG_REPORT_2.md');
      const content = fs.readFileSync(reportPath, 'utf8');

      expect(content).toMatch(/Deep Telemetry Instrumentation Specification/i);
      expect(content).toMatch(/DOMBoxMetrics/);
      expect(content).toMatch(/ComputedStyleMetrics/);
      expect(content).toMatch(/TableCellFocusTelemetryPayload/);
      expect(content).toMatch(/captureTableCellMetrics/);
    });

    it('verifies 0 lines of production code in src/ were modified outside logging hooks during Phase 1', () => {
      // Allowed modifications in src/: only debug-logger.ts and logging hooks in widget.ts
      const allowedModifiedFiles = new Set([
        path.normalize(path.join(projectRoot, 'src/debug/debug-logger.ts')),
        path.normalize(path.join(projectRoot, 'src/editor/widget.ts')),
      ]);

      const phase1InceptionTime = new Date('2026-10-13T22:27:42Z').getTime();
      const srcDir = path.join(projectRoot, 'src');
      const unauthorizedModifications: string[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > phase1InceptionTime && !allowedModifiedFiles.has(path.normalize(fullPath))) {
              unauthorizedModifications.push(
                `${path.relative(projectRoot, fullPath)} (modified: ${stat.mtime.toISOString()})`
              );
            }
          }
        }
      }

      scanDir(srcDir);

      expect(
        unauthorizedModifications,
        `Expected 0 production code modifications outside logging hooks, found: ${unauthorizedModifications.join(', ')}`
      ).toEqual([]);
    });
  });
});
