/**
 * Word-Style Linear Equation Parser
 * Parses compact linear equations (e.g. (a+b)/(c+d), x^2, \sqrt(x), \alpha_1^2)
 * into a structured Math AST.
 */

import {
  MathNode,
  SlotNode,
  TokenKind,
} from './types';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
  createRoot,
  createMatrix,
  createFenced,
  createUnderOver,
  updateParentPointers,
} from './ast';
import { lookupSymbol, KNOWN_FUNCTIONS } from '../shortcuts/catalog';

interface LinearToken {
  type:
    | 'number'
    | 'identifier'
    | 'command'
    | 'operator'
    | 'lparen'
    | 'rparen'
    | 'lbrack'
    | 'rbrack'
    | 'lbrace'
    | 'rbrace'
    | 'caret'
    | 'underscore'
    | 'slash'
    | 'ampersand'
    | 'semicolon'
    | 'at'
    | 'eof';
  value: string;
}

function tokenize(input: string): LinearToken[] {
  const tokens: LinearToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '\\') {
      let j = i + 1;
      while (j < len && /[a-zA-Z]/.test(input[j])) {
        j++;
      }
      if (j === i + 1 && j < len) {
        // Single non-alpha char command like \_ or \,
        j++;
      }
      tokens.push({ type: 'command', value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(input[i + 1]))) {
      let j = i;
      let hasDot = false;
      while (j < len && (/[0-9]/.test(input[j]) || (!hasDot && input[j] === '.'))) {
        if (input[j] === '.') hasDot = true;
        j++;
      }
      tokens.push({ type: 'number', value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < len && /[a-zA-Z]/.test(input[j])) {
        j++;
      }
      const word = input.slice(i, j);
      if (KNOWN_FUNCTIONS.has(word)) {
        tokens.push({ type: 'identifier', value: word });
      } else {
        for (const char of word) {
          tokens.push({ type: 'identifier', value: char });
        }
      }
      i = j;
      continue;
    }

    if (ch === '(') tokens.push({ type: 'lparen', value: '(' });
    else if (ch === ')') tokens.push({ type: 'rparen', value: ')' });
    else if (ch === '[') tokens.push({ type: 'lbrack', value: '[' });
    else if (ch === ']') tokens.push({ type: 'rbrack', value: ']' });
    else if (ch === '{') tokens.push({ type: 'lbrace', value: '{' });
    else if (ch === '}') tokens.push({ type: 'rbrace', value: '}' });
    else if (ch === '^') tokens.push({ type: 'caret', value: '^' });
    else if (ch === '_') tokens.push({ type: 'underscore', value: '_' });
    else if (ch === '/') tokens.push({ type: 'slash', value: '/' });
    else if (ch === '&') tokens.push({ type: 'ampersand', value: '&' });
    else if (ch === ';') tokens.push({ type: 'semicolon', value: ';' });
    else if (ch === '@') tokens.push({ type: 'at', value: '@' });
    else {
      tokens.push({ type: 'operator', value: ch });
    }
    i++;
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

export class LinearParser {
  private tokens: LinearToken[] = [];
  private pos = 0;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  private peek(): LinearToken {
    return this.tokens[this.pos];
  }

  private next(): LinearToken {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return tok;
  }

  private match(type: LinearToken['type'], val?: string): boolean {
    const cur = this.peek();
    if (cur.type === type && (val === undefined || cur.value === val)) {
      this.next();
      return true;
    }
    return false;
  }

  public parse(): SlotNode {
    const root = createSlot('root', []);
    const nodes = this.parseExpressionList();
    for (const node of nodes) {
      root.children.push(node);
    }
    updateParentPointers(root);
    return root;
  }

  private parseExpressionList(stopTokens: LinearToken['type'][] = ['eof']): MathNode[] {
    const nodes: MathNode[] = [];
    while (!stopTokens.includes(this.peek().type) && this.peek().type !== 'eof') {
      const item = this.parseFractionOrTerm();
      if (item) {
        nodes.push(item);
      } else {
        break;
      }
    }
    return nodes;
  }

  private parseFractionOrTerm(): MathNode | null {
    let left = this.parseScriptedTerm();
    if (!left) return null;

    if (this.match('slash')) {
      const right = this.parseScriptedTerm();
      const numSlot = this.nodeToSlot(left, 'numerator');
      const denSlot = right
        ? this.nodeToSlot(right, 'denominator')
        : createSlot('denominator', []);
      left = createFraction(numSlot, denSlot);
    }

    return left;
  }

  private parseScriptedTerm(): MathNode | null {
    let base = this.parseAtom();
    if (!base) return null;

    while (this.peek().type === 'caret' || this.peek().type === 'underscore') {
      if (this.match('underscore')) {
        const subNode = this.parseScriptArgument();
        const subSlot = subNode
          ? this.nodeToSlot(subNode, 'sub')
          : createSlot('sub', []);

        if (this.match('caret')) {
          const supNode = this.parseScriptArgument();
          const supSlot = supNode
            ? this.nodeToSlot(supNode, 'sup')
            : createSlot('sup', []);
          base = this.createSubSupNode(base, subSlot, supSlot);
        } else {
          base = this.createSubscriptNode(base, subSlot);
        }
      } else if (this.match('caret')) {
        const supNode = this.parseScriptArgument();
        const supSlot = supNode
          ? this.nodeToSlot(supNode, 'sup')
          : createSlot('sup', []);

        if (this.match('underscore')) {
          const subNode = this.parseScriptArgument();
          const subSlot = subNode
            ? this.nodeToSlot(subNode, 'sub')
            : createSlot('sub', []);
          base = this.createSubSupNode(base, subSlot, supSlot);
        } else {
          base = this.createSuperscriptNode(base, supSlot);
        }
      }
    }

    return base;
  }

  private createSubscriptNode(base: MathNode, subSlot: SlotNode): MathNode {
    const isBigOp =
      base.type === 'token' &&
      ['∑', '∏', '∫', '∬', '∭', '∮', 'lim'].includes(base.text);
    if (isBigOp) {
      return createUnderOver(this.nodeToSlot(base, 'base'), subSlot, undefined);
    }
    return createSubscript(this.nodeToSlot(base, 'base'), subSlot);
  }

  private createSuperscriptNode(base: MathNode, supSlot: SlotNode): MathNode {
    const isBigOp =
      base.type === 'token' &&
      ['∑', '∏', '∫', '∬', '∭', '∮'].includes(base.text);
    if (isBigOp) {
      return createUnderOver(this.nodeToSlot(base, 'base'), undefined, supSlot);
    }
    return createSuperscript(this.nodeToSlot(base, 'base'), supSlot);
  }

  private createSubSupNode(
    base: MathNode,
    subSlot: SlotNode,
    supSlot: SlotNode
  ): MathNode {
    const isBigOp =
      base.type === 'token' &&
      ['∑', '∏', '∫', '∬', '∭', '∮'].includes(base.text);
    if (isBigOp) {
      return createUnderOver(this.nodeToSlot(base, 'base'), subSlot, supSlot);
    }
    return createSubSup(this.nodeToSlot(base, 'base'), subSlot, supSlot);
  }

  private parseScriptArgument(): MathNode | null {
    const cur = this.peek();
    if (cur.type === 'lbrace') {
      this.next();
      const nodes = this.parseExpressionList(['rbrace']);
      this.match('rbrace');
      return this.nodesToSingleNodeOrFenced(nodes, false);
    }
    if (cur.type === 'lparen') {
      this.next();
      const nodes = this.parseExpressionList(['rparen']);
      this.match('rparen');
      return this.nodesToSingleNodeOrFenced(nodes, false);
    }
    return this.parseAtom();
  }

  private parseAtom(): MathNode | null {
    const tok = this.peek();

    if (tok.type === 'number') {
      this.next();
      return createToken(tok.value, 'mn');
    }

    if (tok.type === 'identifier') {
      this.next();
      if (KNOWN_FUNCTIONS.has(tok.value)) {
        return createToken(tok.value, 'mo');
      }
      return createToken(tok.value, 'mi');
    }

    if (tok.type === 'command') {
      this.next();
      return this.parseCommand(tok.value);
    }

    if (tok.type === 'lparen') {
      this.next();
      const content = this.parseExpressionList(['rparen']);
      this.match('rparen');
      return createFenced(createSlot('fenced', content), '(', ')');
    }

    if (tok.type === 'lbrack') {
      this.next();
      // Check if this is a matrix definition e.g. [a & b ; c & d]
      const nodes = this.parseMatrixOrBrackets('rbrack', '[', ']');
      return nodes;
    }

    if (tok.type === 'lbrace') {
      this.next();
      const content = this.parseExpressionList(['rbrace']);
      this.match('rbrace');
      return createFenced(createSlot('fenced', content), '{', '}');
    }

    if (tok.type === 'operator') {
      this.next();
      return createToken(tok.value, 'mo');
    }

    return null;
  }

  private parseCommand(cmd: string): MathNode {
    // 1. Fractions \frac{a}{b}
    if (cmd === '\\frac') {
      const numNode = this.parseScriptArgument();
      const denNode = this.parseScriptArgument();
      return createFraction(
        numNode ? this.nodeToSlot(numNode, 'numerator') : createSlot('numerator', []),
        denNode ? this.nodeToSlot(denNode, 'denominator') : createSlot('denominator', [])
      );
    }

    // 2. Radicals \sqrt
    if (cmd === '\\sqrt') {
      if (this.match('lbrack')) {
        const idxNodes = this.parseExpressionList(['rbrack']);
        this.match('rbrack');
        const radicandNode = this.parseScriptArgument();
        const radSlot = radicandNode
          ? this.nodeToSlot(radicandNode, 'radicand')
          : createSlot('radicand', []);
        const idxSlot = createSlot('index', idxNodes);
        return createRoot(radSlot, idxSlot);
      }
      const arg = this.parseScriptArgument();
      return createRadical(
        arg ? this.nodeToSlot(arg, 'radicand') : createSlot('radicand', [])
      );
    }

    // 3. Matrix \matrix
    if (cmd === '\\matrix' || cmd === '\\pmatrix' || cmd === '\\bmatrix') {
      const open = cmd === '\\bmatrix' ? '[' : '(';
      const close = cmd === '\\bmatrix' ? ']' : ')';
      if (this.match('lparen') || this.match('lbrace')) {
        return this.parseMatrixBody(open, close);
      }
      return createMatrix([[createSlot('cell', [])]], open, close);
    }

    // 4. Accents \vec, \bar, \hat, \dot, \ddot
    if (['\\vec', '\\bar', '\\hat', '\\dot', '\\ddot', '\\tilde'].includes(cmd)) {
      const baseNode = this.parseScriptArgument();
      const accentMap: Record<string, string> = {
        '\\vec': '→',
        '\\bar': '¯',
        '\\hat': '^',
        '\\dot': '˙',
        '\\ddot': '¨',
        '\\tilde': '~',
      };
      const accentOver = createToken(accentMap[cmd] || '^', 'mo');
      return createUnderOver(
        baseNode ? this.nodeToSlot(baseNode, 'base') : createSlot('base', []),
        undefined,
        createSlot('over', [accentOver]),
        true
      );
    }

    // 5. Symbol lookup
    const sym = lookupSymbol(cmd);
    if (sym) {
      const isOp = ['+', '-', '±', '×', '÷', '≤', '≥', '≠', '≈', '∈', '∑', '∏', '∫', '→', '⇒', '⇔'].includes(sym);
      return createToken(sym, isOp ? 'mo' : 'mi');
    }

    // Fallback: stripped command as identifier
    return createToken(cmd.replace(/^\\/, ''), 'mi');
  }

  private parseMatrixOrBrackets(
    closeToken: LinearToken['type'],
    openChar: string,
    closeChar: string
  ): MathNode {
    // Check if inner content contains & or ; or @
    const savedPos = this.pos;
    let isMatrix = false;
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === 'lbrack' || t.type === 'lparen' || t.type === 'lbrace') depth++;
      else if (t.type === 'rbrack' || t.type === 'rparen' || t.type === 'rbrace') {
        if (depth === 0 && t.type === closeToken) break;
        depth--;
      } else if (depth === 0 && (t.type === 'ampersand' || t.type === 'semicolon' || t.type === 'at')) {
        isMatrix = true;
        break;
      }
    }

    if (isMatrix) {
      return this.parseMatrixBody(openChar, closeChar);
    }

    // Normal bracketed expression
    const content = this.parseExpressionList([closeToken]);
    this.match(closeToken);
    return createFenced(createSlot('fenced', content), openChar, closeChar);
  }

  private parseMatrixBody(openChar: string, closeChar: string): MathNode {
    const rows: SlotNode[][] = [];
    let currentRow: SlotNode[] = [];
    let currentCellNodes: MathNode[] = [];

    const flushCell = () => {
      currentRow.push(createSlot('cell', currentCellNodes));
      currentCellNodes = [];
    };

    const flushRow = () => {
      flushCell();
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [];
    };

    while (
      this.peek().type !== 'rparen' &&
      this.peek().type !== 'rbrack' &&
      this.peek().type !== 'rbrace' &&
      this.peek().type !== 'eof'
    ) {
      if (this.match('ampersand')) {
        flushCell();
      } else if (this.match('semicolon') || this.match('at')) {
        flushRow();
      } else {
        const item = this.parseFractionOrTerm();
        if (item) {
          currentCellNodes.push(item);
        } else {
          break;
        }
      }
    }

    flushRow();
    this.next(); // Consume closing bracket

    if (rows.length === 0) {
      rows.push([createSlot('cell', [])]);
    }

    return createMatrix(rows, openChar, closeChar);
  }

  private nodeToSlot(node: MathNode, role: SlotNode['role']): SlotNode {
    if (
      node.type === 'fenced' &&
      (node.open === '' || (node.open === '(' && (role === 'numerator' || role === 'denominator' || role === 'radicand'))) &&
      (node.close === '' || (node.close === ')' && (role === 'numerator' || role === 'denominator' || role === 'radicand')))
    ) {
      node.content.role = role;
      return node.content;
    }
    return createSlot(role, [node]);
  }

  private nodesToSingleNodeOrFenced(
    nodes: MathNode[],
    includeParen: boolean
  ): MathNode {
    if (nodes.length === 1 && !includeParen) {
      return nodes[0];
    }
    return createFenced(
      createSlot('fenced', nodes),
      includeParen ? '(' : '',
      includeParen ? ')' : ''
    );
  }
}

export function parseLinearEquation(input: string): SlotNode {
  const parser = new LinearParser(input);
  return parser.parse();
}
