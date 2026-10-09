import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Challenger M1-1: Telemetry Citation Empirical Verification (Live v8.0.0 Report)', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const telemetryPath = path.join(
    projectRoot,
    'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
  );
  const widgetSourcePath = path.join(projectRoot, 'src/editor/widget.ts');
  const navigationSourcePath = path.join(projectRoot, 'src/editor/navigation.ts');
  const selectionSourcePath = path.join(projectRoot, 'src/editor/selection.ts');

  it('verifies BUG_REPORT.md exists, is substantial, and targets the selection defects', () => {
    expect(fs.existsSync(bugReportPath), 'BUG_REPORT.md must exist').toBe(true);
    const content = fs.readFileSync(bugReportPath, 'utf8');
    expect(content.length).toBeGreaterThan(15000);
    expect(content).toContain('Shift+Arrow Entering Structures (Bug 1)');
    expect(content).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    expect(content).toContain('Mouse Drag Escaping Placeholder (Bug 3)');
    expect(content).toContain('Visual Double-Highlight on Last Character (Bug 4)');
    expect(content).toContain('Click Selection (Double/Triple-Click)');
    expect(content).toContain('Document Version');
    expect(content).toContain('8.0.0');
    expect(content).toContain('3,262 events');
  });

  it('verifies debug-log.json dataset profile matches bug report metadata', () => {
    expect(fs.existsSync(telemetryPath), 'debug-log.json must exist').toBe(true);
    const stat = fs.statSync(telemetryPath);
    expect(stat.size).toBeGreaterThan(100000);

    const rawData = fs.readFileSync(telemetryPath, 'utf8');
    const events = JSON.parse(rawData);
    expect(events.length).toBe(3262);
    expect(events[0].timestamp).toBe('2026-10-07T13:35:32.644Z');
    expect(events[3261].timestamp).toBe('2026-10-07T13:41:47.214Z');
  });

  it('verifies Bug 1 Telemetry Citations (#250, #254, #722, #726)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Event #250: candidate_evaluation forward into numerator
    expect(events[250].type).toBe('placeholder');
    expect(events[250].details.action).toBe('candidate_evaluation');
    expect(events[250].details.direction).toBe('ArrowRight');
    expect(events[250].details.rationale).toBe('descend_into_first_child_slot');

    // Event #254: partial selection with anchor at root and head in numerator
    expect(events[254].type).toBe('selection');
    expect(events[254].details.selectionType).toBe('partial');
    expect(events[254].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mj_1', offset: 0 });
    expect(events[254].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 0 });

    // Event #722: candidate_evaluation backward into denominator
    expect(events[722].type).toBe('placeholder');
    expect(events[722].details.action).toBe('candidate_evaluation');
    expect(events[722].details.direction).toBe('ArrowLeft');
    expect(events[722].details.rationale).toBe('descend_into_last_child_slot');

    // Event #726: backward selection into denominator
    expect(events[726].type).toBe('selection');
    expect(events[726].details.selectionType).toBe('partial');
    expect(events[726].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mj_1', offset: 1 });
    expect(events[726].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_3', offset: 3 });
  });

  it('verifies Bug 2 Telemetry Citations (#349, #353, #445, #567)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Event #349: move to next sibling slot
    expect(events[349].type).toBe('placeholder');
    expect(events[349].details.rationale).toBe('move_to_next_sibling_slot');

    // Event #353: partial selection across sibling slots
    expect(events[353].type).toBe('selection');
    expect(events[353].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 3 });
    expect(events[353].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_3', offset: 0 });

    // Event #445: exit composite to enclosing slot
    expect(events[445].type).toBe('placeholder');
    expect(events[445].details.rationale).toBe('exit_composite_to_enclosing_slot');

    // Event #567: move to prev sibling slot
    expect(events[567].type).toBe('placeholder');
    expect(events[567].details.rationale).toBe('move_to_prev_sibling_slot');
  });

  it('verifies Bug 3 Telemetry Citations (#2117, #2131-#2134)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Event #2117: Partial selection with 4 tokens
    expect(events[2117].type).toBe('selection');
    expect(events[2117].details.selectionType).toBe('partial');
    expect(events[2117].details.partial.selectedTokenIds).toEqual([
      'tok_muy5h8ml_6',
      'tok_muy5h8ml_7',
      'tok_muy5h8ml_8',
      'tok_muy5h8ml_9',
    ]);

    // Events #2131-#2134: DOM mutations on children
    expect(events[2131].details.targetClass).toContain('eq-numerator eq-partial-selected');
    expect(events[2132].details.targetClass).toContain('eq-slot eq-partial-selected');
    expect(events[2133].details.targetClass).toContain('eq-denominator eq-partial-selected');
    expect(events[2134].details.targetClass).toContain('eq-slot eq-partial-selected eq-selected-slot');
  });

  it('verifies Bug 4 Telemetry Citations (#2504, #2516-#2518)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Event #2504: Single token selected
    expect(events[2504].type).toBe('selection');
    expect(events[2504].details.partial.selectedTokenIds).toEqual(['tok_muy5h8ml_6']);

    // Events #2516-#2518: Both token and container receive highlight
    expect(events[2516].details.targetClass).toContain('eq-token eq-mi eq-selected-token');
    expect(events[2517].details.targetClass).toContain('eq-slot eq-partial-selected');
    expect(events[2518].details.targetClass).toContain('eq-numerator eq-partial-selected');
  });

  it('verifies Feature Multi-Click Telemetry Citations (#2589, #2627, #2646, #2665, #2680)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    expect(events[2589].details.eventType).toBe('pointerdown');
    expect(events[2627].details.eventType).toBe('pointerdown');
    expect(events[2646].details.eventType).toBe('pointerdown');
    expect(events[2665].details.eventType).toBe('pointerdown');
    expect(events[2680].details.hasSelection).toBe(false);
  });

  it('verifies code-level citations and architectural analysis in BUG_REPORT.md', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('src/editor/widget.ts');
    expect(content).toContain('src/editor/navigation.ts');
    expect(content).toContain('src/editor/selection.ts');
    expect(content).toContain('handleSelectionStep');
    expect(content).toContain('handleHierarchicalBoundaryExpansion');
    expect(content).toContain('Drag Escape Elevation');
    expect(content).toContain('eq-selected-structure');
    expect(content).toContain('isCrossBoundary');

    // Verify source code files exist and contain referenced functions
    const widgetCode = fs.readFileSync(widgetSourcePath, 'utf8');
    const navCode = fs.readFileSync(navigationSourcePath, 'utf8');
    const selCode = fs.readFileSync(selectionSourcePath, 'utf8');

    expect(widgetCode).toContain('handleArrowNavigation');
    expect(widgetCode).toContain('elevateSelectionForDrag');
    expect(navCode).toContain('handleSelectionStep');
    expect(selCode).toContain('eq-selected-structure');
  });
});
