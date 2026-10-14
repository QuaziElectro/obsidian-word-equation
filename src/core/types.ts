/**
 * Core AST Types, Token Types, and Interface Contracts
 * for Word-like MathML Equation Plugin
 */

export type MathNodeType =
  | 'token'
  | 'fraction'
  | 'superscript'
  | 'subscript'
  | 'subsup'
  | 'radical'
  | 'root'
  | 'matrix'
  | 'fenced'
  | 'underover'
  | 'placeholder'
  | 'enclosed'
  | 'phantom'
  | 'space'
  | 'multiscripts';

export type TokenKind = 'mi' | 'mn' | 'mo' | 'mtext';

export type SlotRole =
  | 'root'
  | 'numerator'
  | 'denominator'
  | 'base'
  | 'sup'
  | 'sub'
  | 'radicand'
  | 'index'
  | 'cell'
  | 'fenced'
  | 'under'
  | 'over'
  | 'enclosed'
  | 'phantom'
  | 'presub'
  | 'presup';

export interface BaseMathNode {
  id: string;
  type: MathNodeType;
  parentSlotId: string | null;
}

export interface TokenNode extends BaseMathNode {
  type: 'token';
  text: string;
  tokenKind: TokenKind;
  attributes?: Record<string, string>;
}

export interface FractionNode extends BaseMathNode {
  type: 'fraction';
  numerator: SlotNode;
  denominator: SlotNode;
  linethickness?: string;
}

export interface SuperscriptNode extends BaseMathNode {
  type: 'superscript';
  base: SlotNode;
  sup: SlotNode;
}

export interface SubscriptNode extends BaseMathNode {
  type: 'subscript';
  base: SlotNode;
  sub: SlotNode;
}

export interface SubSupNode extends BaseMathNode {
  type: 'subsup';
  base: SlotNode;
  sub: SlotNode;
  sup: SlotNode;
}

export interface RadicalNode extends BaseMathNode {
  type: 'radical';
  radicand: SlotNode;
}

export interface RootNode extends BaseMathNode {
  type: 'root';
  radicand: SlotNode;
  index: SlotNode;
}

export interface MatrixNode extends BaseMathNode {
  type: 'matrix';
  rows: SlotNode[][];
  openBracket?: string;
  closeBracket?: string;
}

export interface FencedNode extends BaseMathNode {
  type: 'fenced';
  content: SlotNode;
  open: string;
  close: string;
}

export interface UnderOverNode extends BaseMathNode {
  type: 'underover';
  base: SlotNode;
  under?: SlotNode;
  over?: SlotNode;
  accent?: boolean;
}

export interface PlaceholderNode extends BaseMathNode {
  type: 'placeholder';
}

export interface EnclosedNode extends BaseMathNode {
  type: 'enclosed';
  notation: string;
  content: SlotNode;
}

export interface PhantomNode extends BaseMathNode {
  type: 'phantom';
  content: SlotNode;
}

export interface SpaceNode extends BaseMathNode {
  type: 'space';
  width: string;
}

export interface MultiscriptsNode extends BaseMathNode {
  type: 'multiscripts';
  base: SlotNode;
  postSub?: SlotNode;
  postSup?: SlotNode;
  preSub?: SlotNode;
  preSup?: SlotNode;
}

export type MathNode =
  | TokenNode
  | FractionNode
  | SuperscriptNode
  | SubscriptNode
  | SubSupNode
  | RadicalNode
  | RootNode
  | MatrixNode
  | FencedNode
  | UnderOverNode
  | PlaceholderNode
  | EnclosedNode
  | PhantomNode
  | SpaceNode
  | MultiscriptsNode;

export interface SlotNode {
  id: string;
  role: SlotRole;
  parentNodeId: string | null;
  children: MathNode[];
}

/**
 * Caret & Selection Types
 */
export interface CaretPosition {
  slotId: string;
  offset: number;
}

export interface SelectionRange {
  anchor: CaretPosition;
  head: CaretPosition;
}

export interface NavigationResult {
  caret: CaretPosition;
  handled: boolean;
  exitDirection?: 'before' | 'after' | 'up' | 'down';
}

/**
 * Autocorrect & Shortcuts Types
 */
export type ShortcutCategory =
  | 'greek'
  | 'symbol'
  | 'operator'
  | 'arrow'
  | 'accent'
  | 'structure';

export interface ShortcutEntry {
  trigger: string;
  replacement: string;
  category: ShortcutCategory;
  description?: string;
  latex?: string;
}

export interface MarkdownExpansionResult {
  matched: boolean;
  replacement: string;
  triggerLength: number;
}

export interface ShortcutExpansionResult {
  expanded: boolean;
  newSlot?: SlotNode;
  newCaret?: CaretPosition;
  replacementText?: string;
}

/**
 * Delimiter Configurations
 */
export type EquationDisplayMode = 'inline' | 'block' | 'full-page';

export const BLOCK_DELIMITERS = [
  { open: '```math-word', close: '```' },
  { open: '```weq', close: '```' },
];

export const FULL_PAGE_DELIMITERS = [
  { open: '```math-page', close: '```' },
  { open: '```weq-page', close: '```' },
];

export const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

