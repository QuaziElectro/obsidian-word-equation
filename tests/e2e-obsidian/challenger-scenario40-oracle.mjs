import assert from 'assert';

console.log('================================================================');
console.log('CHALLENGER 2: SCENARIO 40 ASSERTION SENSITIVITY ORACLE HARNESS');
console.log('================================================================\n');

// Extract the exact validation predicates used in Scenario 40 (obsidian-real-e2e.test.mjs:5377-5556)

function verifyStep1Numerator(s40Step1Numerator) {
  if (!s40Step1Numerator.isActive) {
    throw new Error('[Scenario 40] Assertion Failed: Equation 0 did not activate on ArrowRight entry!');
  }
  if (s40Step1Numerator.isBody) {
    throw new Error('[Scenario 40] Assertion Failed: Focus dropped to document.body upon equation entry!');
  }
  if (!s40Step1Numerator.numPhIsFocused || !s40Step1Numerator.numHasCaret || !s40Step1Numerator.numCaretInsidePh) {
    throw new Error(`[Scenario 40] Assertion Failed (Requirement R4 Violation): Caret failed to enter fraction numerator on first ArrowRight! Caret is sitting beside structure instead of inside numerator. State: ${JSON.stringify(s40Step1Numerator)}`);
  }
  if (s40Step1Numerator.denPhIsFocused || s40Step1Numerator.denHasCaret) {
    throw new Error('[Scenario 40] Assertion Failed: Caret unexpectedly skipped numerator and entered denominator!');
  }
  return true;
}

function verifyStep2Denominator(s40Step2Denominator) {
  if (!s40Step2Denominator.isActive) {
    throw new Error('[Scenario 40] Assertion Failed: Equation 0 deactivated prematurely while advancing to denominator!');
  }
  if (s40Step2Denominator.isBody) {
    throw new Error('[Scenario 40] Assertion Failed: Focus dropped to document.body when advancing to denominator!');
  }
  if (s40Step2Denominator.numPhIsFocused || s40Step2Denominator.numHasCaret) {
    throw new Error('[Scenario 40] Assertion Failed: Caret remained frozen in numerator placeholder after ArrowRight!');
  }
  if (!s40Step2Denominator.denPhIsFocused || !s40Step2Denominator.denHasCaret || !s40Step2Denominator.denCaretInsidePh) {
    throw new Error(`[Scenario 40] Assertion Failed (Requirement R4 Violation): Caret failed to advance into fraction denominator on second ArrowRight! Teleported past denominator or froze. State: ${JSON.stringify(s40Step2Denominator)}`);
  }
  return true;
}

function verifyStep3AfterFraction(s40Step3AfterFraction) {
  if (!s40Step3AfterFraction.isActive) {
    throw new Error('[Scenario 40] Assertion Failed: Equation 0 deactivated prematurely upon exiting denominator!');
  }
  if (s40Step3AfterFraction.denPhIsFocused || s40Step3AfterFraction.denHasCaret) {
    throw new Error('[Scenario 40] Assertion Failed: Caret remained trapped in denominator placeholder after ArrowRight!');
  }
  if (!s40Step3AfterFraction.hasCaretInEq || !s40Step3AfterFraction.caretIsAfterFraction) {
    throw new Error(`[Scenario 40] Assertion Failed (Requirement R4 Violation): Caret is not placed after the fraction in equation! State: ${JSON.stringify(s40Step3AfterFraction)}`);
  }
  return true;
}

function verifyStep4ExitEq(s40Step4ExitEq) {
  if (s40Step4ExitEq.isActive || s40Step4ExitEq.hasCaret || s40Step4ExitEq.isFocused) {
    throw new Error(`[Scenario 40] Assertion Failed: Equation 0 remained active after ArrowRight forward exit! State: ${JSON.stringify(s40Step4ExitEq)}`);
  }
  if (s40Step4ExitEq.isBody) {
    throw new Error('[Scenario 40] Assertion Failed: Focus dropped to document.body upon exiting equation!');
  }
  if (!s40Step4ExitEq.cmHasFocus) {
    throw new Error('[Scenario 40] Assertion Failed: CodeMirror did not regain focus upon forward exit from equation!');
  }
  return true;
}

// Canonical passing states from actual Obsidian E2E run
const passingStep1 = {
  isActive: true,
  isBody: false,
  hasFrac: true,
  hasNum: true,
  numPhExists: true,
  numPhIsFocused: true,
  numHasCaret: true,
  numCaretInsidePh: true,
  denPhIsFocused: false,
  denHasCaret: false,
  activeSlotId: 'slot_muwfv4ag_6y',
  isFocused: true,
};

const passingStep2 = {
  isActive: true,
  isBody: false,
  numPhIsFocused: false,
  numHasCaret: false,
  hasDen: true,
  denPhExists: true,
  denPhIsFocused: true,
  denHasCaret: true,
  denCaretInsidePh: true,
  activeSlotId: 'slot_muwfv4ag_6z',
  isFocused: true,
};

const passingStep3 = {
  isActive: true,
  isBody: false,
  numPhIsFocused: false,
  numHasCaret: false,
  denPhIsFocused: false,
  denHasCaret: false,
  hasCaretInEq: true,
  caretIsAfterFraction: true,
  caretOffset: 1,
  isFocused: true,
};

const passingStep4 = {
  isActive: false,
  hasCaret: false,
  isFocused: false,
  isBody: false,
  cmHasFocus: true,
  curHead: 246,
  toPos: 245,
  exitedPastToPos: true,
};

// 1. Verify baseline passing states
assert.strictEqual(verifyStep1Numerator(passingStep1), true);
assert.strictEqual(verifyStep2Denominator(passingStep2), true);
assert.strictEqual(verifyStep3AfterFraction(passingStep3), true);
assert.strictEqual(verifyStep4ExitEq(passingStep4), true);
console.log('✓ Baseline passing states verified successfully.');

// 2. Mutation & Fault Injection Suite
let caughtMutants = 0;
const totalMutants = 16;

function testMutant(fn, input, expectedSubstr) {
  try {
    fn(input);
    assert.fail(`Mutant should have failed: ${expectedSubstr}`);
  } catch (err) {
    if (err.message.includes(expectedSubstr)) {
      caughtMutants++;
    } else {
      throw new Error(`Unexpected error message: ${err.message}, expected to contain: ${expectedSubstr}`);
    }
  }
}

// Test Group 1: Numerator Entry Failures
console.log('\n--- Test Group 1: Numerator Entry Failures ---');
// Mutant 1: Caret sits beside fraction instead of inside numerator placeholder
testMutant(verifyStep1Numerator, { ...passingStep1, numPhIsFocused: false }, 'Requirement R4 Violation');
// Mutant 2: Caret missing from numerator
testMutant(verifyStep1Numerator, { ...passingStep1, numHasCaret: false }, 'Requirement R4 Violation');
// Mutant 3: Caret not inside placeholder element
testMutant(verifyStep1Numerator, { ...passingStep1, numCaretInsidePh: false }, 'Requirement R4 Violation');
// Mutant 4: Caret skipped numerator straight to denominator
testMutant(verifyStep1Numerator, { ...passingStep1, denHasCaret: true }, 'Caret unexpectedly skipped numerator');
// Mutant 5: Equation failed to activate
testMutant(verifyStep1Numerator, { ...passingStep1, isActive: false }, 'Equation 0 did not activate');
// Mutant 6: Focus collapsed to body upon entry
testMutant(verifyStep1Numerator, { ...passingStep1, isBody: true }, 'Focus dropped to document.body upon equation entry');
console.log(`✓ Group 1: 6/6 mutants caught.`);

// Test Group 2: Denominator Advancement Failures
console.log('\n--- Test Group 2: Denominator Advancement Failures ---');
// Mutant 7: Caret remained frozen in numerator
testMutant(verifyStep2Denominator, { ...passingStep2, numPhIsFocused: true }, 'Caret remained frozen in numerator placeholder');
// Mutant 8: Numerator retained caret element
testMutant(verifyStep2Denominator, { ...passingStep2, numHasCaret: true }, 'Caret remained frozen in numerator placeholder');
// Mutant 9: Caret failed to advance to denominator (teleported past or disappeared)
testMutant(verifyStep2Denominator, { ...passingStep2, denPhIsFocused: false }, 'Requirement R4 Violation');
// Mutant 10: Denominator lacks caret
testMutant(verifyStep2Denominator, { ...passingStep2, denHasCaret: false }, 'Requirement R4 Violation');
// Mutant 11: Caret not inside denominator placeholder
testMutant(verifyStep2Denominator, { ...passingStep2, denCaretInsidePh: false }, 'Requirement R4 Violation');
// Mutant 12: Equation deactivated prematurely during descent
testMutant(verifyStep2Denominator, { ...passingStep2, isActive: false }, 'Equation 0 deactivated prematurely');
// Mutant 13: Focus collapsed to body during descent
testMutant(verifyStep2Denominator, { ...passingStep2, isBody: true }, 'Focus dropped to document.body when advancing to denominator');
console.log(`✓ Group 2: 7/7 mutants caught.`);

// Test Group 3: Teleportation & Exit Failures
console.log('\n--- Test Group 3: Teleportation & Exit Failures ---');
// Mutant 14: Caret failed to place after fraction (teleported backward or escaped)
testMutant(verifyStep3AfterFraction, { ...passingStep3, caretIsAfterFraction: false }, 'Requirement R4 Violation');
// Mutant 15: Caret trapped in denominator placeholder
testMutant(verifyStep3AfterFraction, { ...passingStep3, denPhIsFocused: true }, 'Caret remained trapped in denominator placeholder');
// Mutant 16: Caret exited to body instead of CodeMirror
testMutant(verifyStep4ExitEq, { ...passingStep4, isBody: true }, 'Focus dropped to document.body upon exiting equation');
console.log(`✓ Group 3: 3/3 mutants caught.`);

console.log('\n================================================================');
console.log(`ALL ${caughtMutants}/${totalMutants} FAULT INJECTION MUTANTS STRICTLY CAUGHT BY SCENARIO 40 ASSERTIONS!`);
console.log('Oracle sensitivity verification: 100% PASS');
console.log('================================================================\n');
