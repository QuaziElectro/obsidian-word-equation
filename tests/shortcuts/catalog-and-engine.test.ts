import { describe, it, expect, beforeEach } from 'vitest';
import {
  SHORTCUT_CATALOG,
  SHORTCUT_MAP,
  getShortcut,
  lookupSymbol,
  KNOWN_FUNCTIONS,
} from '../../src/shortcuts/catalog';
import {
  expandShortcutInMarkdown,
  expandShortcutInSlot,
} from '../../src/shortcuts/engine';
import {
  createSlot,
  createToken,
  resetIdCounter,
} from '../../src/core/ast';

describe('Shortcuts Catalog & Expansion Engine Test Suite', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('Shortcut Catalog & Symbol Dictionary', () => {
    it('contains comprehensive Greek alphabet (lowercase & uppercase)', () => {
      // Lowercase
      expect(lookupSymbol('\\alpha')).toBe('α');
      expect(lookupSymbol('\\beta')).toBe('β');
      expect(lookupSymbol('\\gamma')).toBe('γ');
      expect(lookupSymbol('\\delta')).toBe('δ');
      expect(lookupSymbol('\\epsilon')).toBe('ε');
      expect(lookupSymbol('\\theta')).toBe('θ');
      expect(lookupSymbol('\\lambda')).toBe('λ');
      expect(lookupSymbol('\\mu')).toBe('μ');
      expect(lookupSymbol('\\pi')).toBe('π');
      expect(lookupSymbol('\\sigma')).toBe('σ');
      expect(lookupSymbol('\\omega')).toBe('ω');

      // Uppercase
      expect(lookupSymbol('\\Gamma')).toBe('Γ');
      expect(lookupSymbol('\\Delta')).toBe('Δ');
      expect(lookupSymbol('\\Theta')).toBe('Θ');
      expect(lookupSymbol('\\Lambda')).toBe('Λ');
      expect(lookupSymbol('\\Sigma')).toBe('Σ');
      expect(lookupSymbol('\\Phi')).toBe('Φ');
      expect(lookupSymbol('\\Omega')).toBe('Ω');
    });

    it('contains mathematical operators and relations', () => {
      expect(lookupSymbol('\\pm')).toBe('±');
      expect(lookupSymbol('\\times')).toBe('×');
      expect(lookupSymbol('\\div')).toBe('÷');
      expect(lookupSymbol('\\cdot')).toBe('·');
      expect(lookupSymbol('\\leq')).toBe('≤');
      expect(lookupSymbol('\\le')).toBe('≤');
      expect(lookupSymbol('\\geq')).toBe('≥');
      expect(lookupSymbol('\\ge')).toBe('≥');
      expect(lookupSymbol('\\neq')).toBe('≠');
      expect(lookupSymbol('\\ne')).toBe('≠');
      expect(lookupSymbol('\\approx')).toBe('≈');
      expect(lookupSymbol('\\equiv')).toBe('≡');
    });

    it('contains arrows and logic symbols', () => {
      expect(lookupSymbol('\\to')).toBe('→');
      expect(lookupSymbol('\\leftarrow')).toBe('←');
      expect(lookupSymbol('\\Rightarrow')).toBe('⇒');
      expect(lookupSymbol('\\iff')).toBe('⇔');
      expect(lookupSymbol('\\implies')).toBe('⇒');
      expect(lookupSymbol('\\infty')).toBe('∞');
      expect(lookupSymbol('\\partial')).toBe('∂');
      expect(lookupSymbol('\\nabla')).toBe('∇');
      expect(lookupSymbol('\\in')).toBe('∈');
      expect(lookupSymbol('\\forall')).toBe('∀');
      expect(lookupSymbol('\\exists')).toBe('∃');
    });

    it('contains large operators and accents', () => {
      expect(lookupSymbol('\\sum')).toBe('∑');
      expect(lookupSymbol('\\prod')).toBe('∏');
      expect(lookupSymbol('\\int')).toBe('∫');
      expect(lookupSymbol('\\iint')).toBe('∬');
      expect(lookupSymbol('\\oint')).toBe('∮');

      expect(lookupSymbol('\\vec')).toBe('\u20D7');
      expect(lookupSymbol('\\bar')).toBe('\u0304');
      expect(lookupSymbol('\\hat')).toBe('\u0302');
      expect(lookupSymbol('\\dot')).toBe('\u0307');
      expect(lookupSymbol('\\ddot')).toBe('\u0308');
    });

    it('identifies standard math function names', () => {
      expect(KNOWN_FUNCTIONS.has('sin')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('cos')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('tan')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('log')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('ln')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('lim')).toBe(true);
      expect(KNOWN_FUNCTIONS.has('foo')).toBe(false);
    });
  });

  describe('Markdown Shortcut Expansion (expandShortcutInMarkdown)', () => {
    it('expands symbol shortcuts at end of markdown text before space', () => {
      const rAlpha = expandShortcutInMarkdown('Let \\alpha');
      expect(rAlpha).not.toBeNull();
      expect(rAlpha?.matched).toBe(true);
      expect(rAlpha?.replacement).toBe('α');
      expect(rAlpha?.triggerLength).toBe(6);

      const rSum = expandShortcutInMarkdown('Summation \\sum');
      expect(rSum?.replacement).toBe('∑');

      const rInt = expandShortcutInMarkdown('Compute \\int');
      expect(rInt?.replacement).toBe('∫');

      const rPm = expandShortcutInMarkdown('Result is \\pm');
      expect(rPm?.replacement).toBe('±');
    });

    it('expands block triggers ($$$ and /weq) into Word equation fenced code blocks', () => {
      const rTrigger1 = expandShortcutInMarkdown('Here is equation $$$');
      expect(rTrigger1).not.toBeNull();
      expect(rTrigger1?.matched).toBe(true);
      expect(rTrigger1?.replacement).toContain('```math-word');
      expect(rTrigger1?.triggerLength).toBe(3);

      const rTrigger2 = expandShortcutInMarkdown('/weq');
      expect(rTrigger2).not.toBeNull();
      expect(rTrigger2?.matched).toBe(true);
      expect(rTrigger2?.replacement).toContain('```math-word');
      expect(rTrigger2?.triggerLength).toBe(4);
    });

    it('returns null for non-shortcut text', () => {
      expect(expandShortcutInMarkdown('Normal text')).toBeNull();
      expect(expandShortcutInMarkdown('path\\to\\file')).toBeNull();
      expect(expandShortcutInMarkdown('$$')).toBeNull();
    });
  });

  describe('In-Slot Shortcut Expansion (expandShortcutInSlot)', () => {
    it('expands symbol buffer inside slot when Space is pressed', () => {
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('p', 'mi'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
      ]);

      const res = expandShortcutInSlot(slot, 6, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children.length).toBe(1);
      expect(res.newSlot?.children[0].type).toBe('token');
      expect((res.newSlot?.children[0] as any).text).toBe('α');
      expect((res.newSlot?.children[0] as any).tokenKind).toBe('mi');
    });

    it('expands operator symbol \\pm into mo token', () => {
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('p', 'mi'),
        createToken('m', 'mi'),
      ]);

      const res = expandShortcutInSlot(slot, 3, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children[0].type).toBe('token');
      expect((res.newSlot?.children[0] as any).text).toBe('±');
      expect((res.newSlot?.children[0] as any).tokenKind).toBe('mo');
    });

    it('expands fraction structure a/b on Space', () => {
      const slot = createSlot('root', [
        createToken('a', 'mi'),
        createToken('/', 'mo'),
        createToken('b', 'mi'),
      ]);

      const res = expandShortcutInSlot(slot, 3, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children.length).toBe(1);
      expect(res.newSlot?.children[0].type).toBe('fraction');
      const frac = res.newSlot?.children[0] as any;
      expect(frac.numerator.children[0].text).toBe('a');
      expect(frac.denominator.children[0].text).toBe('b');
    });

    it('expands grouped fraction (x+1)/(y-1) on Space', () => {
      const slot = createSlot('root', [
        createToken('(', 'mo'),
        createToken('x', 'mi'),
        createToken('+', 'mo'),
        createToken('1', 'mn'),
        createToken(')', 'mo'),
        createToken('/', 'mo'),
        createToken('(', 'mo'),
        createToken('y', 'mi'),
        createToken('-', 'mo'),
        createToken('1', 'mn'),
        createToken(')', 'mo'),
      ]);

      const res = expandShortcutInSlot(slot, 11, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children[0].type).toBe('fraction');
    });

    it('expands powers and subscripts: x^2 and x_i on Space', () => {
      const slotPow = createSlot('root', [
        createToken('x', 'mi'),
        createToken('^', 'mo'),
        createToken('2', 'mn'),
      ]);

      const resPow = expandShortcutInSlot(slotPow, 3, ' ');
      expect(resPow.expanded).toBe(true);
      expect(resPow.newSlot?.children[0].type).toBe('superscript');

      const slotSub = createSlot('root', [
        createToken('x', 'mi'),
        createToken('_', 'mo'),
        createToken('i', 'mi'),
      ]);

      const resSub = expandShortcutInSlot(slotSub, 3, ' ');
      expect(resSub.expanded).toBe(true);
      expect(resSub.newSlot?.children[0].type).toBe('subscript');
    });

    it('expands chained shortcut: \\alpha_1^2 on Space', () => {
      const slot = createSlot('root', [
        createToken('α', 'mi'),
        createToken('_', 'mo'),
        createToken('1', 'mn'),
        createToken('^', 'mo'),
        createToken('2', 'mn'),
      ]);

      const res = expandShortcutInSlot(slot, 5, ' ');
      expect(res.expanded).toBe(true);
      expect(res.newSlot?.children[0].type).toBe('subsup');
    });

    it('does not expand when trigger key is not Space or Enter', () => {
      const slot = createSlot('root', [createToken('a', 'mi')]);
      const res = expandShortcutInSlot(slot, 1, 'x');
      expect(res.expanded).toBe(false);
    });
  });
});
