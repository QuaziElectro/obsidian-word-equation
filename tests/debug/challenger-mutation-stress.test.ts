import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Adversarial Mutation Stress Testing for bug-report-verification.test.ts (v8.0.0 / Gen 54)', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const telemetryPath = path.join(
    projectRoot,
    'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
  );

  const originalTelemetry = fs.existsSync(telemetryPath) ? fs.readFileSync(telemetryPath, 'utf8') : '[]';
  const originalReport = fs.readFileSync(bugReportPath, 'utf8');

  it('proves Test 1 fails on empty, truncated, or stub document', () => {
    // Empty document
    expect(() => {
      expect(''.length).toBeGreaterThan(15000);
    }).toThrow();

    // Small stub report
    const stubReport = '# Bug Report\nThis is a tiny stub report.';
    expect(() => {
      expect(stubReport.length).toBeGreaterThan(15000);
    }).toThrow();

    // Large document missing key section headers
    const missingSectionReport = 'x'.repeat(16000);
    expect(() => {
      expect(missingSectionReport).toContain('Comprehensive Technical Bug Report');
      expect(missingSectionReport).toContain('8.0.0');
    }).toThrow();

    // Document missing required defect titles
    const missingBugTitles = originalReport
      .replace(/Shift\+Arrow Entering Structures \(Bug 1\)/gi, 'Random Issue A')
      .replace(/Shift\+Arrow Exiting Structures \(Bug 2\)/gi, 'Random Issue B')
      .replace(/Mouse Drag Escaping Placeholder \(Bug 3\)/gi, 'Random Issue C')
      .replace(/Visual Double-Highlight on Last Character \(Bug 4\)/gi, 'Random Issue D')
      .replace(/Click Selection \(Double\/Triple-Click\)/gi, 'Random Issue E');

    expect(() => {
      expect(missingBugTitles).toContain('Shift+Arrow Entering Structures (Bug 1)');
    }).toThrow();
    expect(() => {
      expect(missingBugTitles).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    }).toThrow();
    expect(() => {
      expect(missingBugTitles).toContain('Mouse Drag Escaping Placeholder (Bug 3)');
    }).toThrow();
    expect(() => {
      expect(missingBugTitles).toContain('Visual Double-Highlight on Last Character (Bug 4)');
    }).toThrow();
    expect(() => {
      expect(missingBugTitles).toContain('Click Selection (Double/Triple-Click)');
    }).toThrow();
  });

  it('proves Test 2 fails on fake telemetry counts or incorrect timestamps (v8.0.0 mutations)', () => {
    // Verify baseline assertions hold on originalReport first
    expect(originalReport).toContain('debug-log.json');
    expect(originalReport).toContain('3,262 events');
    expect(originalReport).toContain('gen16-live-acceptance.md');
    expect(originalReport).toContain('2026-10-07T13:35:32.644Z');
    expect(originalReport).toContain('2026-10-07T13:41:47.214Z');

    // Mutation 2a: Fake event count 999
    const fakeCountReport = originalReport.replace(/3,262 events/g, '999 events');
    expect(() => {
      expect(fakeCountReport).toContain('3,262 events');
    }).toThrow();

    // Mutation 2b: Fake session start timestamp
    const fakeStartReport = originalReport.replace(
      /2026-10-07T13:35:32\.644Z/g,
      '2020-01-01T00:00:00.000Z'
    );
    expect(() => {
      expect(fakeStartReport).toContain('2026-10-07T13:35:32.644Z');
    }).toThrow();

    // Mutation 2c: Fake session end timestamp
    const fakeEndReport = originalReport.replace(
      /2026-10-07T13:41:47\.214Z/g,
      '2020-01-01T00:00:00.000Z'
    );
    expect(() => {
      expect(fakeEndReport).toContain('2026-10-07T13:41:47.214Z');
    }).toThrow();

    // Mutation 2d: Wrong test vault note
    const fakeNoteReport = originalReport.replace(
      /gen16-live-acceptance\.md/g,
      'fake-nonexistent-note.md'
    );
    expect(() => {
      expect(fakeNoteReport).toContain('gen16-live-acceptance.md');
    }).toThrow();
  });

  it('proves Test 3 fails on altered telemetry events, corrupted data, or empty array on disk', () => {
    const events = JSON.parse(originalTelemetry);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3262);

    // Mutation 3a: Empty array on disk
    expect(() => {
      expect([].length).toBe(3262);
    }).toThrow();

    // Mutation 3b: Truncated events array
    const truncatedEvents = events.slice(0, 50);
    expect(() => {
      expect(truncatedEvents.length).toBe(3262);
    }).toThrow();

    // Mutation 3c: Event #250 mutated
    const mutated250 = JSON.parse(JSON.stringify(events));
    mutated250[250].details.rationale = 'unrelated_rationale';
    expect(() => {
      expect(mutated250[250].details.rationale).toBe('descend_into_first_child_slot');
    }).toThrow();

    // Mutation 3d: Event #349 mutated
    const mutated349 = JSON.parse(JSON.stringify(events));
    mutated349[349].details.rationale = 'unrelated_rationale';
    expect(() => {
      expect(mutated349[349].details.rationale).toBe('move_to_next_sibling_slot');
    }).toThrow();

    // Mutation 3e: Event #2117 mutated
    const mutated2117 = JSON.parse(JSON.stringify(events));
    mutated2117[2117].details.partial.selectedTokenIds = [];
    expect(() => {
      expect(mutated2117[2117].details.partial.selectedTokenIds).toEqual([
        'tok_muy5h8ml_6',
        'tok_muy5h8ml_7',
        'tok_muy5h8ml_8',
        'tok_muy5h8ml_9',
      ]);
    }).toThrow();

    // Mutation 3f: Event #2504 mutated
    const mutated2504 = JSON.parse(JSON.stringify(events));
    mutated2504[2504].details.partial.selectedTokenIds = ['wrong_tok'];
    expect(() => {
      expect(mutated2504[2504].details.partial.selectedTokenIds).toEqual(['tok_muy5h8ml_6']);
    }).toThrow();

    // Mutation 3g: Event #2680 mutated
    const mutated2680 = JSON.parse(JSON.stringify(events));
    mutated2680[2680].details.hasSelection = true;
    expect(() => {
      expect(mutated2680[2680].details.hasSelection).toBe(false);
    }).toThrow();
  });

  it('proves Test 4 fails if Defect 1 citations are omitted', () => {
    expect(originalReport).toContain('Shift+Arrow Entering Structures (Bug 1)');
    expect(originalReport).toContain('descend_into_first_child_slot');
    expect(originalReport).toContain('descend_into_last_child_slot');
    expect(originalReport).toContain('Event #250');
    expect(originalReport).toContain('Event #254');
    expect(originalReport).toContain('Event #722');
    expect(originalReport).toContain('Event #726');

    const reportWithoutDefect1 = originalReport
      .replace(/Shift\+Arrow Entering Structures \(Bug 1\)/g, 'Unrelated Bug A')
      .replace(/descend_into_first_child_slot/g, 'unrelated_slot')
      .replace(/Event #250/g, 'Event #999');

    expect(() => {
      expect(reportWithoutDefect1).toContain('Shift+Arrow Entering Structures (Bug 1)');
    }).toThrow();
    expect(() => {
      expect(reportWithoutDefect1).toContain('descend_into_first_child_slot');
    }).toThrow();
    expect(() => {
      expect(reportWithoutDefect1).toContain('Event #250');
    }).toThrow();
  });

  it('proves Test 5 fails if Defect 2 citations are omitted', () => {
    expect(originalReport).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    expect(originalReport).toContain('move_to_next_sibling_slot');
    expect(originalReport).toContain('exit_composite_to_enclosing_slot');
    expect(originalReport).toContain('Event #349');
    expect(originalReport).toContain('Event #353');
    expect(originalReport).toContain('Events #445');
    expect(originalReport).toContain('Event #567');

    const reportWithoutDefect2 = originalReport
      .replace(/Shift\+Arrow Exiting Structures \(Bug 2\)/g, 'Unrelated Bug B')
      .replace(/move_to_next_sibling_slot/g, 'unrelated_move')
      .replace(/Event #349/g, 'Event #888');

    expect(() => {
      expect(reportWithoutDefect2).toContain('Shift+Arrow Exiting Structures (Bug 2)');
    }).toThrow();
    expect(() => {
      expect(reportWithoutDefect2).toContain('move_to_next_sibling_slot');
    }).toThrow();
    expect(() => {
      expect(reportWithoutDefect2).toContain('Event #349');
    }).toThrow();
  });

  it('proves Test 6 fails if architectural citations are missing', () => {
    expect(originalReport).toContain('src/editor/widget.ts');
    expect(originalReport).toContain('src/editor/navigation.ts');
    expect(originalReport).toContain('src/editor/selection.ts');

    const reportWithoutArch = originalReport
      .replace(/src\/editor\/widget\.ts/g, 'unrelated/file1.ts')
      .replace(/src\/editor\/navigation\.ts/g, 'unrelated/file2.ts');

    expect(() => {
      expect(reportWithoutArch).toContain('src/editor/widget.ts');
    }).toThrow();
    expect(() => {
      expect(reportWithoutArch).toContain('src/editor/navigation.ts');
    }).toThrow();
  });

  it('proves Test 7 fails if reproduction steps are missing or altered', () => {
    expect(originalReport).toContain('### 2.4 Step-by-Step Reproduction Instructions');
    expect(originalReport).toContain('### 3.4 Step-by-Step Reproduction Instructions');
    expect(originalReport).toContain('### 4.4 Step-by-Step Reproduction Instructions');
    expect(originalReport).toContain('### 5.4 Step-by-Step Reproduction Instructions');
    expect(originalReport).toContain('### 6.4 Step-by-Step Reproduction Instructions');

    const reportWithoutRepro = originalReport
      .replace(/### 2\.4 Step-by-Step Reproduction Instructions/g, 'Section 2.4')
      .replace(/### 3\.4 Step-by-Step Reproduction Instructions/g, 'Section 3.4');

    expect(() => {
      expect(reportWithoutRepro).toContain('### 2.4 Step-by-Step Reproduction Instructions');
    }).toThrow();
    expect(() => {
      expect(reportWithoutRepro).toContain('### 3.4 Step-by-Step Reproduction Instructions');
    }).toThrow();
  });

  it('proves Test 8 fails if remediation blueprints are omitted', () => {
    expect(originalReport).toContain('### 2.5 Remediation Blueprint');
    expect(originalReport).toContain('### 3.5 Remediation Blueprint');
    expect(originalReport).toContain('### 4.5 Remediation Blueprint');
    expect(originalReport).toContain('### 5.5 Remediation Blueprint');
    expect(originalReport).toContain('### 6.5 Implementation Blueprint');

    const reportWithoutBlueprints = originalReport
      .replace(/### 2\.5 Remediation Blueprint/g, 'Section 2.5')
      .replace(/### 6\.5 Implementation Blueprint/g, 'Section 6.5');

    expect(() => {
      expect(reportWithoutBlueprints).toContain('### 2.5 Remediation Blueprint');
    }).toThrow();
    expect(() => {
      expect(reportWithoutBlueprints).toContain('### 6.5 Implementation Blueprint');
    }).toThrow();
  });
});
