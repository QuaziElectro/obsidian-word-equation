/**
 * Word Math Autocorrect Symbol Catalog
 * Greek letters, mathematical operators, arrows, delimiters, and large operators.
 */

import { ShortcutEntry } from '../core/types';

export const SHORTCUT_CATALOG: ShortcutEntry[] = [
  // Greek Lowercase
  { trigger: '\\alpha', replacement: 'α', category: 'greek' },
  { trigger: '\\beta', replacement: 'β', category: 'greek' },
  { trigger: '\\gamma', replacement: 'γ', category: 'greek' },
  { trigger: '\\delta', replacement: 'δ', category: 'greek' },
  { trigger: '\\epsilon', replacement: 'ε', category: 'greek' },
  { trigger: '\\varepsilon', replacement: 'ϵ', category: 'greek' },
  { trigger: '\\zeta', replacement: 'ζ', category: 'greek' },
  { trigger: '\\eta', replacement: 'η', category: 'greek' },
  { trigger: '\\theta', replacement: 'θ', category: 'greek' },
  { trigger: '\\vartheta', replacement: 'ϑ', category: 'greek' },
  { trigger: '\\iota', replacement: 'ι', category: 'greek' },
  { trigger: '\\kappa', replacement: 'κ', category: 'greek' },
  { trigger: '\\lambda', replacement: 'λ', category: 'greek' },
  { trigger: '\\mu', replacement: 'μ', category: 'greek' },
  { trigger: '\\nu', replacement: 'ν', category: 'greek' },
  { trigger: '\\xi', replacement: 'ξ', category: 'greek' },
  { trigger: '\\pi', replacement: 'π', category: 'greek' },
  { trigger: '\\varpi', replacement: 'ϖ', category: 'greek' },
  { trigger: '\\rho', replacement: 'ρ', category: 'greek' },
  { trigger: '\\varrho', replacement: 'ϱ', category: 'greek' },
  { trigger: '\\sigma', replacement: 'σ', category: 'greek' },
  { trigger: '\\varsigma', replacement: 'ς', category: 'greek' },
  { trigger: '\\tau', replacement: 'τ', category: 'greek' },
  { trigger: '\\upsilon', replacement: 'υ', category: 'greek' },
  { trigger: '\\phi', replacement: 'ϕ', category: 'greek' },
  { trigger: '\\varphi', replacement: 'φ', category: 'greek' },
  { trigger: '\\chi', replacement: 'χ', category: 'greek' },
  { trigger: '\\psi', replacement: 'ψ', category: 'greek' },
  { trigger: '\\omega', replacement: 'ω', category: 'greek' },

  // Greek Uppercase
  { trigger: '\\Gamma', replacement: 'Γ', category: 'greek' },
  { trigger: '\\Delta', replacement: 'Δ', category: 'greek' },
  { trigger: '\\Theta', replacement: 'Θ', category: 'greek' },
  { trigger: '\\Lambda', replacement: 'Λ', category: 'greek' },
  { trigger: '\\Xi', replacement: 'Ξ', category: 'greek' },
  { trigger: '\\Pi', replacement: 'Π', category: 'greek' },
  { trigger: '\\Sigma', replacement: 'Σ', category: 'greek' },
  { trigger: '\\Upsilon', replacement: 'Υ', category: 'greek' },
  { trigger: '\\Phi', replacement: 'Φ', category: 'greek' },
  { trigger: '\\Psi', replacement: 'Ψ', category: 'greek' },
  { trigger: '\\Omega', replacement: 'Ω', category: 'greek' },

  // Arithmetic & Binary Operators
  { trigger: '\\pm', replacement: '±', category: 'operator' },
  { trigger: '\\mp', replacement: '∓', category: 'operator' },
  { trigger: '\\times', replacement: '×', category: 'operator' },
  { trigger: '\\div', replacement: '÷', category: 'operator' },
  { trigger: '\\cdot', replacement: '·', category: 'operator' },
  { trigger: '\\ast', replacement: '∗', category: 'operator' },
  { trigger: '\\bullet', replacement: '•', category: 'operator' },
  { trigger: '\\circ', replacement: '∘', category: 'operator' },
  { trigger: '\\star', replacement: '⋆', category: 'operator' },

  // Relations
  { trigger: '\\leq', replacement: '≤', category: 'operator' },
  { trigger: '\\le', replacement: '≤', category: 'operator' },
  { trigger: '\\geq', replacement: '≥', category: 'operator' },
  { trigger: '\\ge', replacement: '≥', category: 'operator' },
  { trigger: '\\neq', replacement: '≠', category: 'operator' },
  { trigger: '\\ne', replacement: '≠', category: 'operator' },
  { trigger: '\\approx', replacement: '≈', category: 'operator' },
  { trigger: '\\sim', replacement: '∼', category: 'operator' },
  { trigger: '\\simeq', replacement: '≃', category: 'operator' },
  { trigger: '\\cong', replacement: '≅', category: 'operator' },
  { trigger: '\\equiv', replacement: '≡', category: 'operator' },
  { trigger: '\\propto', replacement: '∝', category: 'operator' },
  { trigger: '\\ll', replacement: '≪', category: 'operator' },
  { trigger: '\\gg', replacement: '≫', category: 'operator' },

  // Constants & Special Symbols
  { trigger: '\\infty', replacement: '∞', category: 'symbol' },
  { trigger: '\\partial', replacement: '∂', category: 'symbol' },
  { trigger: '\\nabla', replacement: '∇', category: 'symbol' },
  { trigger: '\\hbar', replacement: 'ℏ', category: 'symbol' },
  { trigger: '\\ell', replacement: 'ℓ', category: 'symbol' },
  { trigger: '\\Re', replacement: 'ℜ', category: 'symbol' },
  { trigger: '\\Im', replacement: 'ℑ', category: 'symbol' },
  { trigger: '\\aleph', replacement: 'ℵ', category: 'symbol' },

  // Set Theory & Logic
  { trigger: '\\in', replacement: '∈', category: 'symbol' },
  { trigger: '\\notin', replacement: '∉', category: 'symbol' },
  { trigger: '\\ni', replacement: '∋', category: 'symbol' },
  { trigger: '\\subset', replacement: '⊂', category: 'symbol' },
  { trigger: '\\subseteq', replacement: '⊆', category: 'symbol' },
  { trigger: '\\supset', replacement: '⊃', category: 'symbol' },
  { trigger: '\\supseteq', replacement: '⊇', category: 'symbol' },
  { trigger: '\\cup', replacement: '∪', category: 'operator' },
  { trigger: '\\cap', replacement: '∩', category: 'operator' },
  { trigger: '\\setminus', replacement: '∖', category: 'operator' },
  { trigger: '\\emptyset', replacement: '∅', category: 'symbol' },
  { trigger: '\\forall', replacement: '∀', category: 'symbol' },
  { trigger: '\\exists', replacement: '∃', category: 'symbol' },
  { trigger: '\\nexists', replacement: '∄', category: 'symbol' },
  { trigger: '\\neg', replacement: '¬', category: 'symbol' },
  { trigger: '\\lor', replacement: '∨', category: 'operator' },
  { trigger: '\\land', replacement: '∧', category: 'operator' },

  // Arrows
  { trigger: '\\to', replacement: '→', category: 'arrow' },
  { trigger: '\\rightarrow', replacement: '→', category: 'arrow' },
  { trigger: '\\leftarrow', replacement: '←', category: 'arrow' },
  { trigger: '\\uparrow', replacement: '↑', category: 'arrow' },
  { trigger: '\\downarrow', replacement: '↓', category: 'arrow' },
  { trigger: '\\Rightarrow', replacement: '⇒', category: 'arrow' },
  { trigger: '\\Leftarrow', replacement: '⇐', category: 'arrow' },
  { trigger: '\\Leftrightarrow', replacement: '⇔', category: 'arrow' },
  { trigger: '\\iff', replacement: '⇔', category: 'arrow' },
  { trigger: '\\implies', replacement: '⇒', category: 'arrow' },
  { trigger: '\\mapsto', replacement: '↦', category: 'arrow' },
  { trigger: '\\leftrightarrow', replacement: '↔', category: 'arrow' },

  // Large Operators
  { trigger: '\\sum', replacement: '∑', category: 'operator' },
  { trigger: '\\prod', replacement: '∏', category: 'operator' },
  { trigger: '\\coprod', replacement: '∐', category: 'operator' },
  { trigger: '\\int', replacement: '∫', category: 'operator' },
  { trigger: '\\iint', replacement: '∬', category: 'operator' },
  { trigger: '\\iiint', replacement: '∭', category: 'operator' },
  { trigger: '\\oint', replacement: '∮', category: 'operator' },

  // Accents (Combined Diacritics)
  { trigger: '\\bar', replacement: '\u0304', category: 'accent' },
  { trigger: '\\hat', replacement: '\u0302', category: 'accent' },
  { trigger: '\\vec', replacement: '\u20D7', category: 'accent' },
  { trigger: '\\dot', replacement: '\u0307', category: 'accent' },
  { trigger: '\\ddot', replacement: '\u0308', category: 'accent' },
  { trigger: '\\tilde', replacement: '\u0303', category: 'accent' },
];

export const SHORTCUT_MAP = new Map<string, ShortcutEntry>();
for (const entry of SHORTCUT_CATALOG) {
  SHORTCUT_MAP.set(entry.trigger, entry);
}

export type ExpansionScope = 'inline' | 'block';

export interface CustomShortcut {
  trigger: string;
  expansion: string;
  scope?: ExpansionScope;
}

let customShortcuts: CustomShortcut[] = [];

export function setCustomShortcuts(shortcuts: CustomShortcut[]): void {
  const list = Array.isArray(shortcuts) ? shortcuts : [];
  customShortcuts = list
    .filter(
      (s): s is CustomShortcut =>
        Boolean(s && s.trigger && typeof s.trigger === 'string' && s.trigger.trim().length > 0)
    )
    .map((s) => ({
      trigger: s.trigger,
      expansion: typeof s.expansion === 'string' ? s.expansion : String(s.expansion ?? ''),
      scope: s.scope === 'block' ? 'block' : 'inline',
    }));
}

export function getCustomShortcuts(): CustomShortcut[] {
  return customShortcuts;
}

export interface ResolvedShortcut {
  trigger: string;
  expansion: string;
  isMathML: boolean;
  scope?: ExpansionScope;
}

export function lookupCustomOrCatalog(trigger: string): ResolvedShortcut | null {
  const norm = (t: string) => (t.startsWith('\\') ? t.slice(1) : t);
  const normTrigger = norm(trigger);

  // 1. Custom shortcuts take precedence (allows overriding built-ins)
  const custom = customShortcuts.find(
    (s) => s.trigger === trigger || norm(s.trigger) === normTrigger
  );
  if (custom) {
    const isMathML = /<math|<m[a-z]+/i.test(custom.expansion);
    return {
      trigger: custom.trigger,
      expansion: custom.expansion,
      isMathML,
      scope: custom.scope || 'inline',
    };
  }

  // 2. Built-in catalog lookup
  const entry = getShortcut(trigger.startsWith('\\') ? trigger : `\\${trigger}`);
  if (entry) {
    return { trigger: entry.trigger, expansion: entry.replacement, isMathML: false };
  }

  return null;
}

export function getShortcut(trigger: string): ShortcutEntry | undefined {
  return SHORTCUT_MAP.get(trigger);
}

export function lookupSymbol(name: string): string | undefined {
  const resolved = lookupCustomOrCatalog(name);
  if (resolved && !resolved.isMathML) {
    return resolved.expansion;
  }
  const entry = getShortcut(name.startsWith('\\') ? name : `\\${name}`);
  return entry ? entry.replacement : undefined;
}

export const KNOWN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'ln',
  'exp',
  'lim',
  'max',
  'min',
  'det',
  'gcd',
  'deg',
  'dim',
  'hom',
  'ker',
  'arg',
  'sup',
  'inf',
]);

