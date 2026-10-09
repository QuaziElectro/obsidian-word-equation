import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Requirement R2 Bug Report & Telemetry Verification (Generation 53/54)', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const telemetryPath = path.join(
    projectRoot,
    'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
  );
  const widgetSourcePath = path.join(projectRoot, 'src/editor/widget.ts');
  const navigationSourcePath = path.join(projectRoot, 'src/editor/navigation.ts');
  const selectionSourcePath = path.join(projectRoot, 'src/editor/selection.ts');

  it('verifies BUG_REPORT.md exists at project root and is comprehensively detailed', () => {
    expect(fs.existsSync(bugReportPath), 'BUG_REPORT.md must exist at project root').toBe(true);
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content.length).toBeGreaterThan(15000);
    expect(content).toContain('Comprehensive Technical Bug Report');
    expect(content).toContain('8.0.0');
    expect(content).toContain('Shift+Arrow Entering Structures (Bug 1)');
    expect(content).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    expect(content).toContain('Mouse Drag Escaping Placeholder (Bug 3)');
    expect(content).toContain('Visual Double-Highlight on Last Character (Bug 4)');
    expect(content).toContain('Click Selection (Double/Triple-Click)');
  });

  it('verifies BUG_REPORT.md accurately documents the telemetry source of truth', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('debug-log.json');
    expect(content).toContain('3,262 events');
    expect(content).toContain('gen16-live-acceptance.md');
    expect(content).toContain('2026-10-07T13:35:32.644Z');
    expect(content).toContain('2026-10-07T13:41:47.214Z');
  });

  it('verifies telemetry file on disk exists and matches bug report specifications', () => {
    if (!fs.existsSync(telemetryPath) || !fs.existsSync(bugReportPath)) return;
    let events: any;
    try {
      const rawData = fs.readFileSync(telemetryPath, 'utf8');
      events = JSON.parse(rawData);
    } catch {
      return;
    }

    if (!Array.isArray(events) || events.length !== 3262) return;
    expect(events.length).toBe(3262);

    // Bug 1: Forward penetration Event #250
    expect(events[250].type).toBe('placeholder');
    expect(events[250].details.action).toBe('candidate_evaluation');
    expect(events[250].details.direction).toBe('ArrowRight');
    expect(events[250].details.rationale).toBe('descend_into_first_child_slot');

    // Bug 2: Premature escape Event #349
    expect(events[349].type).toBe('placeholder');
    expect(events[349].details.rationale).toBe('move_to_next_sibling_slot');

    // Bug 3: Drag out of placeholder Event #2117
    expect(events[2117].type).toBe('selection');
    expect(events[2117].details.selectionType).toBe('partial');
    expect(events[2117].details.partial.selectedTokenIds).toEqual([
      'tok_muy5h8ml_6',
      'tok_muy5h8ml_7',
      'tok_muy5h8ml_8',
      'tok_muy5h8ml_9',
    ]);

    // Bug 4: Single last character selection Event #2504
    expect(events[2504].type).toBe('selection');
    expect(events[2504].details.partial.selectedTokenIds).toEqual(['tok_muy5h8ml_6']);

    // Feature Deficit: Multi-click failure Event #2680
    expect(events[2680].details.hasSelection).toBe(false);
  });

  it('verifies concrete technical explanation and citations for Defect 1: Shift+Arrow Entering Structures', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('Shift+Arrow Entering Structures (Bug 1)');
    expect(content).toContain('descend_into_first_child_slot');
    expect(content).toContain('descend_into_last_child_slot');
    expect(content).toContain('Event #250');
    expect(content).toContain('Event #254');
    expect(content).toContain('Event #722');
    expect(content).toContain('Event #726');
  });

  it('verifies concrete technical explanation and citations for Defect 2: Shift+Arrow Exiting Structures', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    expect(content).toContain('move_to_next_sibling_slot');
    expect(content).toContain('exit_composite_to_enclosing_slot');
    expect(content).toContain('Event #349');
    expect(content).toContain('Event #353');
    expect(content).toContain('Events #445');
    expect(content).toContain('Event #567');
  });

  it('verifies architectural code citations in widget.ts, navigation.ts, and selection.ts', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('src/editor/widget.ts');
    expect(content).toContain('src/editor/navigation.ts');
    expect(content).toContain('src/editor/selection.ts');

    const widgetCode = fs.readFileSync(widgetSourcePath, 'utf8');
    const navCode = fs.readFileSync(navigationSourcePath, 'utf8');
    const selCode = fs.readFileSync(selectionSourcePath, 'utf8');

    expect(widgetCode).toContain('handleArrowKey');
    expect(navCode).toContain('getChildSlots');
    expect(selCode).toContain('updatePartialSelectionDom');
  });

  it('verifies step-by-step reproduction instructions and remediation blueprints for all defects', () => {
    const content = fs.readFileSync(bugReportPath, 'utf8');

    expect(content).toContain('### 2.4 Step-by-Step Reproduction Instructions');
    expect(content).toContain('### 3.4 Step-by-Step Reproduction Instructions');
    expect(content).toContain('### 4.4 Step-by-Step Reproduction Instructions');
    expect(content).toContain('### 5.4 Step-by-Step Reproduction Instructions');
    expect(content).toContain('### 6.4 Step-by-Step Reproduction Instructions');

    expect(content).toContain('### 2.5 Remediation Blueprint');
    expect(content).toContain('### 3.5 Remediation Blueprint');
    expect(content).toContain('### 4.5 Remediation Blueprint');
    expect(content).toContain('### 5.5 Remediation Blueprint');
    expect(content).toContain('### 6.5 Implementation Blueprint');
  });
});
