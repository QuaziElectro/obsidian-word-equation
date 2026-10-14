import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createSlot,
  createFraction,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { handleArrowKey } from '../../src/editor/navigation';

describe('Empirical Challenger Invariant & Alternative Hypothesis Suite', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const fixturePath = path.join(projectRoot, 'tests/fixtures/debug-log-gen43.json');
  const telemetryPath = fs.existsSync(fixturePath)
    ? fixturePath
    : path.join(
        projectRoot,
        'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
      );

  const rawData = fs.readFileSync(telemetryPath, 'utf8');
  const events = JSON.parse(rawData);

  // =========================================================================
  // 1. Telemetry Invariant Verification Across All 135 Events
  // =========================================================================
  describe('1. Telemetry Invariants & Correlation (All 135 Events)', () => {
    it('verifies dataset integrity and exact event breakdown', () => {
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(135);

      const typeCounts: Record<string, number> = {};
      for (const e of events) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
      }

      expect(typeCounts['keydown']).toBe(95);
      expect(typeCounts['boundary']).toBe(23);
      expect(typeCounts['navigation']).toBe(7);
      expect(typeCounts['focus']).toBe(4);
      expect(typeCounts['selection']).toBe(4);
      expect(typeCounts['caret']).toBe(2);
      expect(typeCounts['placeholder'] || 0).toBe(0);
    });

    it('verifies all 95 keydown events and correlation with activeElement and targets', () => {
      const keydowns = events
        .map((e: any, idx: number) => ({ ...e, eventIndex: idx }))
        .filter((e: any) => e.type === 'keydown');

      expect(keydowns.length).toBe(95);

      const targetCounts: Record<string, number> = {};
      const activeCounts: Record<string, number> = {};
      let preventedCount = 0;

      for (const k of keydowns) {
        const target = k.details?.targetTag || 'unknown';
        const active = k.details?.activeElementTag || 'unknown';
        targetCounts[target] = (targetCounts[target] || 0) + 1;
        activeCounts[active] = (activeCounts[active] || 0) + 1;
        if (k.details?.defaultPrevented) {
          preventedCount++;
        }
      }

      expect(targetCounts['body']).toBe(88);
      expect(targetCounts['div']).toBe(4);
      expect(targetCounts['contentDOM']).toBe(3);

      expect(activeCounts['body']).toBe(89);
      expect(activeCounts['div'] + activeCounts['DIV']).toBe(6);

      // Exactly 1 keydown had defaultPrevented: true (in-flight entry bubble)
      expect(preventedCount).toBe(1);
    });

    it('verifies Invariant 1: whenever focus is delivered to AST engine, navigation succeeds', () => {
      resetIdCounter();
      // Equation 0: <math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>
      const numSlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', []);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret at root offset 0 (identical to enterFromStart caret position)
      const caret = { slotId: root.id, offset: 0 };

      // Execute handleArrowKey('ArrowRight')
      const result = handleArrowKey(root, caret, 'ArrowRight');
      expect(result.handled).toBe(true);
      expect(result.caret.slotId).toBe(numSlot.id);
      expect(result.caret.offset).toBe(0);

      // Subsequent ArrowRight moves from numerator to denominator
      const result2 = handleArrowKey(root, result.caret, 'ArrowRight');
      expect(result2.handled).toBe(true);
      expect(result2.caret.slotId).toBe(denSlot.id);
      expect(result2.caret.offset).toBe(0);

      // Subsequent ArrowRight exits to root offset 1
      const result3 = handleArrowKey(root, result2.caret, 'ArrowRight');
      expect(result3.handled).toBe(true);
      expect(result3.caret.slotId).toBe(root.id);
      expect(result3.caret.offset).toBe(1);

      // Subsequent ArrowRight at root offset 1 exits equation forward
      const result4 = handleArrowKey(root, result3.caret, 'ArrowRight');
      expect(result4.handled).toBe(false);
      expect(result4.exitDirection).toBe('after');
    });

    it('verifies Invariant 2: whenever focus drops to body, 100% of keydowns fail to reach the widget', () => {
      // Phase C front entry -> Event #34 enterFromStart -> Event #44 focusout to body
      expect(events[34].details.transition).toBe('enterFromStart');
      expect(events[44].details.eventType).toBe('focusout');
      expect(events[44].details.activeElementTag).toBe('body');

      // Phase D (Bug 2: Events #47-#54): 4 forward ArrowRight presses (8 keydowns) on body
      const epDKeydowns = events.slice(47, 55).filter((e: any) => e.type === 'keydown');
      expect(epDKeydowns.length).toBe(8);
      for (const k of epDKeydowns) {
        expect(k.details.targetTag).toBe('body');
        expect(k.details.activeElementTag).toBe('body');
        expect(k.details.defaultPrevented).toBe(false);
      }
      const epDPlaceholders = events.slice(47, 55).filter((e: any) => e.type === 'placeholder');
      expect(epDPlaceholders.length).toBe(0); // 0 candidate evaluations! 100% starved!

      // Phase E (Bug 1: Events #55-#134): 40 trapped exit ArrowLeft presses (80 keydowns) on body
      const epEKeydowns = events.slice(55, 135).filter((e: any) => e.type === 'keydown');
      expect(epEKeydowns.length).toBe(80);
      for (const k of epEKeydowns) {
        expect(k.details.targetTag).toBe('body');
        expect(k.details.activeElementTag).toBe('body');
        expect(k.details.defaultPrevented).toBe(false);
      }
      const epEPlaceholders = events.slice(55, 135).filter((e: any) => e.type === 'placeholder');
      expect(epEPlaceholders.length).toBe(0); // 0 exit evaluations! Caret completely trapped!
    });
  });

  // =========================================================================
  // 2. Alternative Hypothesis 1 Challenge: AST Tree Corruption in navigateRight
  // =========================================================================
  describe('2. Alternative Hypothesis 1: AST Tree Corruption in navigateRight', () => {
    it('empirically tests navigateRight on the exact Equation 0 AST structure', () => {
      resetIdCounter();
      const numSlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', []);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const caret = { slotId: root.id, offset: 0 };
      const result = handleArrowKey(root, caret, 'ArrowRight');

      // The AST engine MUST successfully descend into the numerator placeholder
      expect(result.handled).toBe(true);
      expect(result.caret.slotId).toBe(numSlot.id);
      expect(result.caret.offset).toBe(0);
    });

    it('proves from telemetry that AST corruption hypothesis is falsified', () => {
      // If AST corruption were the cause of Bug 2, handleArrowKey would have been
      // invoked and logged candidate evaluation events.
      // In reality, exactly 0 candidate evaluations were logged across the entire 135-event session.
      const allCandidateEvals = events.filter((e: any) =>
        e.type === 'placeholder' && e.details?.action === 'candidate_evaluation'
      );
      expect(allCandidateEvals.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. Alternative Hypothesis 2 Challenge: CodeMirror Boundary Mapping Errors
  // =========================================================================
  describe('3. Alternative Hypothesis 2: CodeMirror Boundary Mapping Errors (98 vs 97)', () => {
    it('empirically tests navigateLeft exit behavior from root offset 0', () => {
      resetIdCounter();
      const numSlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', []);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // At root offset 0, pressing ArrowLeft
      const caret = { slotId: root.id, offset: 0 };
      const result = handleArrowKey(root, caret, 'ArrowLeft');

      // The AST engine MUST return exitDirection: 'before'
      expect(result.handled).toBe(false);
      expect(result.exitDirection).toBe('before');
    });

    it('proves from telemetry that boundary mapping error hypothesis is falsified', () => {
      // In Phase E (Bug 1), user pressed ArrowLeft 40 times (Events #55-#134, 80 keydown events).
      // If boundary mapping error (e.g. 98 vs 97) were the cause:
      // 1. handleArrowNavigation would have executed.
      // 2. candidate_evaluation ('at_root_boundary_exit_before') would have been logged.
      // 3. exitToEditor would have attempted dispatch and failed or thrown.
      // But in reality:
      const epESlice = events.slice(55, 135);
      const epECandidateEvals = epESlice.filter((e: any) => e.type === 'placeholder');
      const epEBoundaryExits = epESlice.filter((e: any) =>
        e.type === 'boundary' && e.details?.transition === 'exitToEditor'
      );
      const epENavExits = epESlice.filter((e: any) =>
        e.type === 'navigation' && e.details?.navType === 'exit_equation'
      );

      expect(epECandidateEvals.length).toBe(0);
      expect(epEBoundaryExits.length).toBe(0);
      expect(epENavExits.length).toBe(0);

      // All 80 keydowns in Phase E trapped exit attempts were delivered to document.body
      const epEKeydowns = epESlice.filter((e: any) => e.type === 'keydown');
      expect(epEKeydowns.length).toBe(80);
      for (const k of epEKeydowns) {
        expect(k.details.targetTag).toBe('body');
        expect(k.details.activeElementTag).toBe('body');
      }
    });
  });

  // =========================================================================
  // 4. Overall Root Cause Synthesis: Asymmetric RAF Assertion
  // =========================================================================
  describe('4. Single Root Cause Synthesis & Telemetry Oracle Verdict', () => {
    it('verifies that Bug 1 and Bug 2 are twin symptoms of the asymmetric focus drop', () => {
      // EnterFromStart occurrence at Event #34
      const entryEvent = events[34];
      expect(entryEvent.details.transition).toBe('enterFromStart');

      // Involuntary blur exactly 8ms later at Event #44
      const blurEvent = events[44];
      expect(blurEvent.type).toBe('focus');
      expect(blurEvent.details.eventType).toBe('focusout');
      expect(blurEvent.details.activeElementTag).toBe('body');

      const blurDelay = new Date(blurEvent.timestamp).getTime() - new Date(entryEvent.timestamp).getTime();
      expect(blurDelay).toBe(8); // Exactly 8 milliseconds!
    });
  });
});
