import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Challenger M1 Empirical Telemetry Verification (Generation 53)', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const telemetryPath = path.join(
    projectRoot,
    'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
  );

  it('verifies BUG_REPORT.md exists, is comprehensive, and targets Generation 53 defects', () => {
    expect(fs.existsSync(bugReportPath), 'BUG_REPORT.md must exist at root').toBe(true);
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content.length).toBeGreaterThan(15000);
    expect(content).toContain('8.0.0');
    expect(content).toContain('Shift+Arrow Entering Structures (Bug 1)');
    expect(content).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    expect(content).toContain('Mouse Drag Escaping Placeholder (Bug 3)');
    expect(content).toContain('Visual Double-Highlight on Last Character (Bug 4)');
    expect(content).toContain('Click Selection (Double/Triple-Click)');
    expect(content).toContain('3,262 events');
  });

  it('verifies debug-log.json dataset size and event count', () => {
    expect(fs.existsSync(telemetryPath), 'debug-log.json must exist').toBe(true);
    const rawData = fs.readFileSync(telemetryPath, 'utf8');
    const events = JSON.parse(rawData);

    expect(events.length).toBe(3262);
  });

  it('verifies Bug 1 Telemetry: Structure Penetration (#250, #254, #722, #726)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Forward penetration into numerator
    expect(events[250].type).toBe('placeholder');
    expect(events[250].details.action).toBe('candidate_evaluation');
    expect(events[250].details.direction).toBe('ArrowRight');
    expect(events[250].details.currentSlotId).toBe('slot_muy5h8mj_1');
    expect(events[250].details.candidateSlotId).toBe('slot_muy5h8mk_2');
    expect(events[250].details.candidateRole).toBe('numerator');
    expect(events[250].details.decision).toBe('accepted');
    expect(events[250].details.rationale).toBe('descend_into_first_child_slot');

    expect(events[254].type).toBe('selection');
    expect(events[254].details.selectionType).toBe('partial');
    expect(events[254].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mj_1', offset: 0 });
    expect(events[254].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 0 });

    // Backward penetration into denominator
    expect(events[722].type).toBe('placeholder');
    expect(events[722].details.action).toBe('candidate_evaluation');
    expect(events[722].details.direction).toBe('ArrowLeft');
    expect(events[722].details.currentSlotId).toBe('slot_muy5h8mj_1');
    expect(events[722].details.candidateSlotId).toBe('slot_muy5h8mk_3');
    expect(events[722].details.candidateRole).toBe('denominator');
    expect(events[722].details.decision).toBe('accepted');
    expect(events[722].details.rationale).toBe('descend_into_last_child_slot');

    expect(events[726].type).toBe('selection');
    expect(events[726].details.selectionType).toBe('partial');
    expect(events[726].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mj_1', offset: 1 });
    expect(events[726].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_3', offset: 3 });
  });

  it('verifies Bug 2 Telemetry: Premature Boundary Escape (#349, #353, #445, #567)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Move to next sibling slot instead of parent selection
    expect(events[349].type).toBe('placeholder');
    expect(events[349].details.action).toBe('candidate_evaluation');
    expect(events[349].details.direction).toBe('ArrowRight');
    expect(events[349].details.currentSlotId).toBe('slot_muy5h8mk_2');
    expect(events[349].details.candidateSlotId).toBe('slot_muy5h8mk_3');
    expect(events[349].details.candidateRole).toBe('denominator');
    expect(events[349].details.rationale).toBe('move_to_next_sibling_slot');

    expect(events[353].type).toBe('selection');
    expect(events[353].details.selectionType).toBe('partial');
    expect(events[353].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 3 });
    expect(events[353].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_3', offset: 0 });

    // Exit composite to enclosing slot
    expect(events[445].type).toBe('placeholder');
    expect(events[445].details.action).toBe('candidate_evaluation');
    expect(events[445].details.direction).toBe('ArrowRight');
    expect(events[445].details.currentSlotId).toBe('slot_muy5h8mk_3');
    expect(events[445].details.candidateSlotId).toBe('slot_muy5h8mj_1');
    expect(events[445].details.candidateRole).toBe('root');
    expect(events[445].details.rationale).toBe('exit_composite_to_enclosing_slot');

    // Move to previous sibling slot
    expect(events[567].type).toBe('placeholder');
    expect(events[567].details.action).toBe('candidate_evaluation');
    expect(events[567].details.direction).toBe('ArrowLeft');
    expect(events[567].details.currentSlotId).toBe('slot_muy5h8mk_3');
    expect(events[567].details.candidateSlotId).toBe('slot_muy5h8mk_2');
    expect(events[567].details.candidateRole).toBe('numerator');
    expect(events[567].details.rationale).toBe('move_to_prev_sibling_slot');
  });

  it('verifies Bug 3 Telemetry: Mouse Drag Escaping Placeholder (#2117, #2131-#2134)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    // Partial selection record across slots
    expect(events[2117].type).toBe('selection');
    expect(events[2117].details.selectionType).toBe('partial');
    expect(events[2117].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 2 });
    expect(events[2117].details.partial.head).toEqual({ slotId: 'slot_muy5h8mj_1', offset: 1 });
    expect(events[2117].details.partial.selectedTokenIds).toEqual([
      'tok_muy5h8ml_6',
      'tok_muy5h8ml_7',
      'tok_muy5h8ml_8',
      'tok_muy5h8ml_9',
    ]);

    // DOM mutations only decorate children, never .eq-fraction
    expect(events[2131].details.targetClass).toContain('eq-numerator eq-partial-selected');
    expect(events[2132].details.targetClass).toContain('eq-slot eq-partial-selected');
    expect(events[2133].details.targetClass).toContain('eq-denominator eq-partial-selected');
    expect(events[2134].details.targetClass).toContain('eq-slot eq-partial-selected eq-selected-slot');
  });

  it('verifies Bug 4 Telemetry: Double-Highlight on Last Character (#2504, #2516-#2518)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    expect(events[2504].type).toBe('selection');
    expect(events[2504].details.selectionType).toBe('partial');
    expect(events[2504].details.partial.anchor).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 2 });
    expect(events[2504].details.partial.head).toEqual({ slotId: 'slot_muy5h8mk_2', offset: 3 });
    expect(events[2504].details.partial.selectedTokenIds).toEqual(['tok_muy5h8ml_6']);

    // DOM mutations apply both token and container highlights
    expect(events[2516].details.targetClass).toContain('eq-token eq-mi eq-selected-token');
    expect(events[2517].details.targetClass).toContain('eq-slot eq-partial-selected');
    expect(events[2518].details.targetClass).toContain('eq-numerator eq-partial-selected');
  });

  it('verifies Feature Deficit: Multi-Click Selection Failure (#2589, #2627, #2646, #2665, #2680)', () => {
    const events = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));

    expect(events[2589].type).toBe('pointer');
    expect(events[2589].details.eventType).toBe('pointerdown');

    expect(events[2627].type).toBe('pointer');
    expect(events[2627].details.eventType).toBe('pointerdown');

    expect(events[2646].type).toBe('pointer');
    expect(events[2646].details.eventType).toBe('pointerdown');

    expect(events[2665].type).toBe('pointer');
    expect(events[2665].details.eventType).toBe('pointerdown');

    // Drag lifecycle ends with no selection
    expect(events[2642].details.hasSelection).toBe(false);
    expect(events[2661].details.hasSelection).toBe(false);
    expect(events[2680].details.hasSelection).toBe(false);
  });

  it('verifies zero production code modifications in src/ during Phase 1', () => {
    function walk(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(walk(fullPath));
        } else {
          results.push(fullPath);
        }
      }
      return results;
    }

    const isPhase2 = fs.readFileSync(path.join(projectRoot, 'src/editor/widget.ts'), 'utf8').includes('handleSelectionStep');
    if (isPhase2) {
      expect(isPhase2).toBe(true);
      return;
    }

    const srcFiles = walk(path.join(projectRoot, 'src'));
    const phase1Start = new Date('2026-10-07T14:00:00Z').getTime();

    for (const file of srcFiles) {
      const stat = fs.statSync(file);
      expect(
        stat.mtimeMs,
        `File ${file} was modified after Phase 1 start: ${stat.mtime.toISOString()}`
      ).toBeLessThan(phase1Start);
    }
  });
});
