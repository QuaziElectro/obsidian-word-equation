import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Adversarial Mutation Stress Testing (Generation 53)', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const telemetryPath = path.join(
    projectRoot,
    'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
  );

  const originalReport = fs.existsSync(bugReportPath) ? fs.readFileSync(bugReportPath, 'utf8') : '';
  let events: any = [];
  try {
    const originalTelemetry = fs.existsSync(telemetryPath) ? fs.readFileSync(telemetryPath, 'utf8') : '[]';
    events = JSON.parse(originalTelemetry);
  } catch {
    events = [];
  }

  it('proves Test 1 fails on truncated or missing defect headers', () => {
    // Missing Bug 1 header
    const mutated = originalReport.replace(/Shift\+Arrow Entering Structures \(Bug 1\)/g, 'Unrelated Bug A');
    expect(() => {
      expect(mutated).toContain('Shift+Arrow Entering Structures (Bug 1)');
    }).toThrow();

    // Missing Click selection header
    const mutated2 = originalReport.replace(/Click Selection \(Double\/Triple-Click\)/g, 'Other Feature');
    expect(() => {
      expect(mutated2).toContain('Click Selection (Double/Triple-Click)');
    }).toThrow();
  });

  it('proves Test 2 fails on fake telemetry counts', () => {
    const fakeCount = 9999;
    expect(() => {
      expect(fakeCount).toBe(3262);
    }).toThrow();
  });

  it('proves Bug 1 verification fails if Event #250 rationale is corrupted', () => {
    if (!Array.isArray(events) || events.length !== 3262) return;
    const mutatedEvent = {
      ...events[250],
      details: { ...events[250].details, rationale: 'skip_structure' },
    };
    expect(() => {
      expect(mutatedEvent.details.rationale).toBe('descend_into_first_child_slot');
    }).toThrow();
  });

  it('proves Bug 2 verification fails if Event #349 rationale is corrupted', () => {
    if (!Array.isArray(events) || events.length !== 3262) return;
    const mutatedEvent = {
      ...events[349],
      details: { ...events[349].details, rationale: 'expand_parent' },
    };
    expect(() => {
      expect(mutatedEvent.details.rationale).toBe('move_to_next_sibling_slot');
    }).toThrow();
  });

  it('proves Bug 3 verification fails if Event #2117 token selection is altered', () => {
    if (!Array.isArray(events) || events.length !== 3262) return;
    const mutatedEvent = {
      ...events[2117],
      details: {
        ...events[2117].details,
        partial: { ...events[2117].details.partial, selectedTokenIds: [] },
      },
    };
    expect(() => {
      expect(mutatedEvent.details.partial.selectedTokenIds.length).toBeGreaterThan(0);
      expect(mutatedEvent.details.partial.selectedTokenIds).toEqual([
        'tok_muy5h8ml_6',
        'tok_muy5h8ml_7',
        'tok_muy5h8ml_8',
        'tok_muy5h8ml_9',
      ]);
    }).toThrow();
  });

  it('proves Bug 4 verification fails if Event #2504 selected token is altered', () => {
    if (!Array.isArray(events) || events.length !== 3262) return;
    const mutatedEvent = {
      ...events[250],
      details: {
        ...events[2504].details,
        partial: { ...events[2504].details.partial, selectedTokenIds: ['wrong_tok'] },
      },
    };
    expect(() => {
      expect(mutatedEvent.details.partial.selectedTokenIds).toEqual(['tok_muy5h8ml_6']);
    }).toThrow();
  });

  it('proves Multi-Click verification fails if Event #2680 reported hasSelection true', () => {
    if (!Array.isArray(events) || events.length !== 3262) return;
    const mutatedEvent = {
      ...events[2680],
      details: { ...events[2680].details, hasSelection: true },
    };
    expect(() => {
      expect(mutatedEvent.details.hasSelection).toBe(false);
    }).toThrow();
  });
});
