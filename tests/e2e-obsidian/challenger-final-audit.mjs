import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const DEBUG_LOG_PATH = path.join(WORKSPACE_ROOT, 'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json');

console.log('================================================================');
console.log('CHALLENGER FINAL TELEMETRY AUDIT & INTEGRITY INSPECTION');
console.log('Path:', DEBUG_LOG_PATH);
console.log('================================================================\n');

if (!fs.existsSync(DEBUG_LOG_PATH)) {
  console.error('ERROR: debug-log.json does not exist!');
  process.exit(1);
}

const raw = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
const events = JSON.parse(raw);
console.log(`Total events parsed: ${events.length}`);

// Category 1: Capture-phase keydown tracking with target and activeElement
const captureKeydowns = events.filter((e) => e.type === 'keydown' && e.details?.phase === 'capture');
console.log(`\n--- 1. Capture-phase keydowns: count = ${captureKeydowns.length} ---`);
if (captureKeydowns.length === 0) {
  console.error('FAIL: No capture-phase keydown events!');
  process.exit(1);
}
for (const [idx, ev] of captureKeydowns.entries()) {
  const d = ev.details;
  if (!d.key || !d.phase || !d.targetTag || !d.activeElementTag) {
    console.error(`FAIL: Capture keydown at idx ${idx} lacks required fields!`, d);
    process.exit(1);
  }
}
console.log('Sample Capture Keydown event verified:');
console.log(JSON.stringify(captureKeydowns[0], null, 2));

// Category 2: CodeMirror selections (cmSelectionBefore / cmSelectionAfter / codeMirrorSelection)
const cmSelections = events.filter((e) =>
  e.details?.cmSelectionBefore ||
  e.details?.cmSelectionAfter ||
  e.details?.codeMirrorSelection ||
  e.details?.selectionType === 'cm_selection_update'
);
console.log(`\n--- 2. CodeMirror selection tracking: count = ${cmSelections.length} ---`);
if (cmSelections.length === 0) {
  console.error('FAIL: No CodeMirror selection events!');
  process.exit(1);
}
const cmBeforeEvents = events.filter((e) => e.details?.cmSelectionBefore);
console.log(`cmSelectionBefore occurrences: ${cmBeforeEvents.length}`);
console.log('Sample CM Selection event verified:');
console.log(JSON.stringify(cmSelections[0], null, 2));

// Category 3: Focus transitions (fromTag, toTag, transitionType / focusShiftType)
const focusTransitions = events.filter((e) => e.type === 'focus');
console.log(`\n--- 3. Focus transitions: count = ${focusTransitions.length} ---`);
if (focusTransitions.length === 0) {
  console.error('FAIL: No focus transition events!');
  process.exit(1);
}
const withFocusShift = focusTransitions.filter((e) => e.details?.focusShiftType);
console.log(`Events with focusShiftType: ${withFocusShift.length}`);
if (withFocusShift.length === 0) {
  console.error('FAIL: No events with focusShiftType!');
  process.exit(1);
}
console.log('Sample Focus Transition event verified:');
console.log(JSON.stringify(withFocusShift[0], null, 2));

// Category 4: Candidate evaluation placeholder events
const placeholderCandidates = events.filter((e) =>
  e.type === 'placeholder' &&
  (e.details?.action === 'candidate_evaluation_summary' || e.details?.action === 'candidate_evaluation')
);
console.log(`\n--- 4. Candidate evaluation placeholder events: count = ${placeholderCandidates.length} ---`);
if (placeholderCandidates.length === 0) {
  console.error('FAIL: No candidate evaluation placeholder events!');
  process.exit(1);
}
for (const [idx, ev] of placeholderCandidates.entries()) {
  const d = ev.details;
  if (!d.action || !d.direction) {
    console.error(`FAIL: Candidate evaluation event at idx ${idx} missing action or direction!`, d);
    process.exit(1);
  }
  if (d.action === 'candidate_evaluation_summary') {
    if (!d.fromSlotId || d.isPlaceholder === undefined) {
      console.error(`FAIL: Summary event missing fromSlotId or isPlaceholder!`, d);
      process.exit(1);
    }
  } else if (d.action === 'candidate_evaluation') {
    if (!d.currentSlotId || !d.decision || !d.rationale) {
      console.error(`FAIL: Detailed candidate event missing fields!`, d);
      process.exit(1);
    }
  }
}
console.log('Sample Candidate Evaluation event verified:');
console.log(JSON.stringify(placeholderCandidates[0], null, 2));

// Category 5: Dynamic placeholder evaluation (isPlaceholder boolean)
const dynamicPlaceholders = events.filter((e) => e.details?.isPlaceholder === true || e.details?.isPlaceholder === false);
console.log(`\n--- 5. Dynamic placeholder events: count = ${dynamicPlaceholders.length} ---`);
const hasTrue = dynamicPlaceholders.some((e) => e.details.isPlaceholder === true);
const hasFalse = dynamicPlaceholders.some((e) => e.details.isPlaceholder === false);
console.log(`Contains isPlaceholder=true: ${hasTrue}, contains isPlaceholder=false: ${hasFalse}`);
if (!hasTrue) {
  console.error('FAIL: Never logged isPlaceholder === true!');
  process.exit(1);
}

console.log('\n================================================================');
console.log('ALL 4 TELEMETRY HOOK DATA CATEGORIES PASSED EMPIRICAL AUDIT!');
console.log('================================================================\n');
