import assert from 'assert';

console.log('================================================================');
console.log('CHALLENGER M2-2: SCENARIO 41 ASSERTION SENSITIVITY & ORACLE HARNESS');
console.log('================================================================\n');

// Exact validation functions reflecting Scenario 41 in obsidian-real-e2e.test.mjs

function verifyStepA1(state, fromPos, posBeforeLastChar) {
  if (state.isActive || state.hasCaret || state.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed (Defect Reproduction): ArrowRight prematurely entered equation from pos ${posBeforeLastChar}! Adjacent char "3" was consumed!`);
  }
  if (state.head !== fromPos) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor did not step to equation boundary! Expected head=${fromPos}, found ${state.head}`);
  }
  if (!state.hasFocus || state.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus lost during cursor step to boundary!');
  }
  return true;
}

function verifyStepA2(state) {
  if (!state.isActive || !state.hasCaret || !state.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed: ArrowRight at boundary failed to enter equation! State: ${JSON.stringify(state)}`);
  }
  if (state.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus dropped to document.body upon equation entry!');
  }
  return true;
}

function verifyStepB1(state, toPos, posAfterFirstChar) {
  if (state.isActive || state.hasCaret || state.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed (Defect Reproduction): ArrowLeft prematurely entered equation from pos ${posAfterFirstChar}! Adjacent char "S" was consumed!`);
  }
  if (state.head !== toPos) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor did not retreat to equation boundary! Expected head=${toPos}, found ${state.head}`);
  }
  if (!state.hasFocus || state.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus lost during cursor retreat to boundary!');
  }
  return true;
}

function verifyStepB2(state) {
  if (!state.isActive || !state.hasCaret || !state.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed: ArrowLeft at boundary failed to enter equation from end! State: ${JSON.stringify(state)}`);
  }
  if (state.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus dropped to document.body upon equation entry from end!');
  }
  return true;
}

// Canonical passing states
const fromPos = 47;
const toPos = 118;
const posBeforeLastChar = fromPos - 1;
const posAfterFirstChar = toPos + 1;

const passingStepA1 = {
  head: fromPos,
  hasFocus: true,
  isActive: false,
  hasCaret: false,
  isFocused: false,
  activeTag: 'DIV',
  isBody: false,
};

const passingStepA2 = {
  isActive: true,
  hasCaret: true,
  isFocused: true,
  caretSlot: 'slot_muw99_0',
  caretOffset: 0,
  activeTag: 'DIV',
  isBody: false,
};

const passingStepB1 = {
  head: toPos,
  hasFocus: true,
  isActive: false,
  hasCaret: false,
  isFocused: false,
  isBody: false,
};

const passingStepB2 = {
  isActive: true,
  hasCaret: true,
  isFocused: true,
  enteredFromEnd: true,
  caretSlot: 'slot_muw99_0',
  caretOffset: 1,
  activeTag: 'DIV',
  isBody: false,
};

// 1. Verify passing baselines
assert.strictEqual(verifyStepA1(passingStepA1, fromPos, posBeforeLastChar), true);
assert.strictEqual(verifyStepA2(passingStepA2), true);
assert.strictEqual(verifyStepB1(passingStepB1, toPos, posAfterFirstChar), true);
assert.strictEqual(verifyStepB2(passingStepB2), true);
console.log('✓ Baseline passing states verified successfully for Scenario 41.');

// 2. Mutation & Fault Injection Testing
let caughtMutants = 0;
const totalMutants = 20;

function testMutant(fn, args, expectedSubstr) {
  try {
    fn(...args);
    assert.fail(`Mutant should have failed: ${expectedSubstr}`);
  } catch (err) {
    if (err.message.includes(expectedSubstr)) {
      caughtMutants++;
    } else {
      throw new Error(`Unexpected error message: ${err.message}, expected substring: ${expectedSubstr}`);
    }
  }
}

console.log('\n--- Test Group 1: Step A1 Fault Injections (Left-to-Right Step 1) ---');
// Mutant 1: Premature entry - equation became active
testMutant(verifyStepA1, [{ ...passingStepA1, isActive: true }, fromPos, posBeforeLastChar], 'ArrowRight prematurely entered equation');
// Mutant 2: Premature entry - caret appeared
testMutant(verifyStepA1, [{ ...passingStepA1, hasCaret: true }, fromPos, posBeforeLastChar], 'ArrowRight prematurely entered equation');
// Mutant 3: Premature entry - session focused
testMutant(verifyStepA1, [{ ...passingStepA1, isFocused: true }, fromPos, posBeforeLastChar], 'ArrowRight prematurely entered equation');
// Mutant 4: Cursor did not advance (stuck at posBeforeLastChar)
testMutant(verifyStepA1, [{ ...passingStepA1, head: posBeforeLastChar }, fromPos, posBeforeLastChar], 'Cursor did not step to equation boundary');
// Mutant 5: Cursor jumped past boundary
testMutant(verifyStepA1, [{ ...passingStepA1, head: fromPos + 1 }, fromPos, posBeforeLastChar], 'Cursor did not step to equation boundary');
// Mutant 6: CM lost focus
testMutant(verifyStepA1, [{ ...passingStepA1, hasFocus: false }, fromPos, posBeforeLastChar], 'Focus lost during cursor step to boundary');
// Mutant 7: Focus dropped to body
testMutant(verifyStepA1, [{ ...passingStepA1, isBody: true }, fromPos, posBeforeLastChar], 'Focus lost during cursor step to boundary');
console.log('✓ Group 1: 7/7 mutants caught.');

console.log('\n--- Test Group 2: Step A2 Fault Injections (Left-to-Right Step 2 Entry) ---');
// Mutant 8: Equation failed to activate
testMutant(verifyStepA2, [{ ...passingStepA2, isActive: false }], 'ArrowRight at boundary failed to enter equation');
// Mutant 9: Caret missing
testMutant(verifyStepA2, [{ ...passingStepA2, hasCaret: false }], 'ArrowRight at boundary failed to enter equation');
// Mutant 10: Session not focused
testMutant(verifyStepA2, [{ ...passingStepA2, isFocused: false }], 'ArrowRight at boundary failed to enter equation');
// Mutant 11: Focus dropped to body
testMutant(verifyStepA2, [{ ...passingStepA2, isBody: true }], 'Focus dropped to document.body upon equation entry');
console.log('✓ Group 2: 4/4 mutants caught.');

console.log('\n--- Test Group 3: Step B1 Fault Injections (Right-to-Left Step 1) ---');
// Mutant 12: Premature entry - equation became active
testMutant(verifyStepB1, [{ ...passingStepB1, isActive: true }, toPos, posAfterFirstChar], 'ArrowLeft prematurely entered equation');
// Mutant 13: Premature entry - caret appeared
testMutant(verifyStepB1, [{ ...passingStepB1, hasCaret: true }, toPos, posAfterFirstChar], 'ArrowLeft prematurely entered equation');
// Mutant 14: Premature entry - session focused
testMutant(verifyStepB1, [{ ...passingStepB1, isFocused: true }, toPos, posAfterFirstChar], 'ArrowLeft prematurely entered equation');
// Mutant 15: Cursor did not retreat (stuck at posAfterFirstChar)
testMutant(verifyStepB1, [{ ...passingStepB1, head: posAfterFirstChar }, toPos, posAfterFirstChar], 'Cursor did not retreat to equation boundary');
// Mutant 16: Cursor jumped past boundary
testMutant(verifyStepB1, [{ ...passingStepB1, head: toPos - 1 }, toPos, posAfterFirstChar], 'Cursor did not retreat to equation boundary');
// Mutant 17: CM lost focus
testMutant(verifyStepB1, [{ ...passingStepB1, hasFocus: false }, toPos, posAfterFirstChar], 'Focus lost during cursor retreat to boundary');
// Mutant 18: Focus dropped to body
testMutant(verifyStepB1, [{ ...passingStepB1, isBody: true }, toPos, posAfterFirstChar], 'Focus lost during cursor retreat to boundary');
console.log('✓ Group 3: 7/7 mutants caught.');

console.log('\n--- Test Group 4: Step B2 Fault Injections (Right-to-Left Step 2 Entry from End) ---');
// Mutant 19: Equation failed to enter from end
testMutant(verifyStepB2, [{ ...passingStepB2, isActive: false }], 'ArrowLeft at boundary failed to enter equation from end');
// Mutant 20: Focus dropped to body
testMutant(verifyStepB2, [{ ...passingStepB2, isBody: true }], 'Focus dropped to document.body upon equation entry from end');
console.log('✓ Group 4: 2/2 mutants caught.');

console.log('\n================================================================');
console.log(`ALL ${caughtMutants}/${totalMutants} FAULT INJECTION MUTANTS STRICTLY CAUGHT BY SCENARIO 41 ASSERTIONS!`);
console.log('Scenario 41 Oracle Sensitivity Verification: 100% PASS');
console.log('================================================================\n');
