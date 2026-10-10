/**
 * Obsidian ItemView: Word-style Equation Gallery Sidebar
 * Displays categorized mathematical elements that can be inserted into an active equation or markdown note.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type WordEquationPlugin from '../main';

export const VIEW_TYPE_EQUATION_GALLERY = 'word-equation-gallery-view';
export const EQUATION_GALLERY_VIEW_TYPE = VIEW_TYPE_EQUATION_GALLERY;

export interface GalleryItem {
  id: string;
  name: string;
  mathml: string;
  previewText?: string;
}

export interface GalleryCategory {
  id: string;
  title: string;
  items: GalleryItem[];
}

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  {
    id: 'fractions',
    title: 'Fractions',
    items: [
      {
        id: 'fraction',
        name: 'Stacked Fraction',
        mathml: '<mfrac><mrow></mrow><mrow></mrow></mfrac>',
        previewText: '⬚/⬚',
      },
      {
        id: 'linear-fraction',
        name: 'Linear Fraction',
        mathml: '<mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac>',
        previewText: 'a/b',
      },
      {
        id: 'derivative',
        name: 'Derivative (dy/dx)',
        mathml: '<mfrac><mrow><mi>d</mi><mi>y</mi></mrow><mrow><mi>d</mi><mi>x</mi></mrow></mfrac>',
        previewText: 'dy/dx',
      },
      {
        id: 'partial-derivative',
        name: 'Partial Derivative (∂y/∂x)',
        mathml: '<mfrac><mrow><mo>∂</mo><mi>y</mi></mrow><mrow><mo>∂</mo><mi>x</mi></mrow></mfrac>',
        previewText: '∂y/∂x',
      },
      {
        id: 'half',
        name: '1/2 Fraction',
        mathml: '<mfrac><mn>1</mn><mn>2</mn></mfrac>',
        previewText: '½',
      },
    ],
  },
  {
    id: 'radicals',
    title: 'Radicals & Roots',
    items: [
      {
        id: 'sqrt',
        name: 'Square Root',
        mathml: '<msqrt><mrow></mrow></msqrt>',
        previewText: '√⬚',
      },
      {
        id: 'root',
        name: 'N-th Root',
        mathml: '<mroot><mrow></mrow><mrow></mrow></mroot>',
        previewText: 'ⁿ√⬚',
      },
      {
        id: 'cube-root',
        name: 'Cube Root',
        mathml: '<mroot><mrow></mrow><mrow><mn>3</mn></mrow></mroot>',
        previewText: '∛⬚',
      },
    ],
  },
  {
    id: 'scripts',
    title: 'Scripts',
    items: [
      {
        id: 'superscript',
        name: 'Superscript',
        mathml: '<msup><mrow><mi>x</mi></mrow><mrow></mrow></msup>',
        previewText: 'x^{⬚}',
      },
      {
        id: 'subscript',
        name: 'Subscript',
        mathml: '<msub><mrow><mi>x</mi></mrow><mrow></mrow></msub>',
        previewText: 'x_{⬚}',
      },
      {
        id: 'subsup',
        name: 'Sub-Superscript',
        mathml: '<msubsup><mrow><mi>x</mi></mrow><mrow></mrow><mrow></mrow></msubsup>',
        previewText: 'x_{⬚}^{⬚}',
      },
      {
        id: 'empty-sup',
        name: 'Superscript Base',
        mathml: '<msup><mrow></mrow><mrow></mrow></msup>',
        previewText: '⬚^{⬚}',
      },
      {
        id: 'empty-sub',
        name: 'Subscript Base',
        mathml: '<msub><mrow></mrow><mrow></mrow></msub>',
        previewText: '⬚_{⬚}',
      },
    ],
  },
  {
    id: 'operators',
    title: 'Basic Math & Operators',
    items: [
      { id: 'pm', name: 'Plus-Minus', mathml: '<mo>±</mo>', previewText: '±' },
      { id: 'times', name: 'Times', mathml: '<mo>×</mo>', previewText: '×' },
      { id: 'div', name: 'Divide', mathml: '<mo>÷</mo>', previewText: '÷' },
      { id: 'ne', name: 'Not Equal', mathml: '<mo>≠</mo>', previewText: '≠' },
      { id: 'le', name: 'Less or Equal', mathml: '<mo>≤</mo>', previewText: '≤' },
      { id: 'ge', name: 'Greater or Equal', mathml: '<mo>≥</mo>', previewText: '≥' },
      { id: 'infty', name: 'Infinity', mathml: '<mi>∞</mi>', previewText: '∞' },
      { id: 'sum', name: 'Summation', mathml: '<mo>∑</mo>', previewText: '∑' },
      { id: 'int', name: 'Integral', mathml: '<mo>∫</mo>', previewText: '∫' },
      { id: 'plus', name: 'Plus', mathml: '<mo>+</mo>', previewText: '+' },
      { id: 'minus', name: 'Minus', mathml: '<mo>−</mo>', previewText: '−' },
      { id: 'cdot', name: 'Center Dot', mathml: '<mo>·</mo>', previewText: '·' },
      { id: 'eq', name: 'Equals', mathml: '<mo>=</mo>', previewText: '=' },
      { id: 'approx', name: 'Approx', mathml: '<mo>≈</mo>', previewText: '≈' },
      { id: 'partial', name: 'Partial', mathml: '<mo>∂</mo>', previewText: '∂' },
      { id: 'nabla', name: 'Nabla', mathml: '<mo>∇</mo>', previewText: '∇' },
      { id: 'prod', name: 'Product', mathml: '<mo>∏</mo>', previewText: '∏' },
    ],
  },
  {
    id: 'greek',
    title: 'Greek Letters',
    items: [
      { id: 'alpha', name: 'alpha', mathml: '<mi>α</mi>', previewText: 'α' },
      { id: 'beta', name: 'beta', mathml: '<mi>β</mi>', previewText: 'β' },
      { id: 'gamma', name: 'gamma', mathml: '<mi>γ</mi>', previewText: 'γ' },
      { id: 'delta', name: 'delta', mathml: '<mi>δ</mi>', previewText: 'δ' },
      { id: 'theta', name: 'theta', mathml: '<mi>θ</mi>', previewText: 'θ' },
      { id: 'lambda', name: 'lambda', mathml: '<mi>λ</mi>', previewText: 'λ' },
      { id: 'mu', name: 'mu', mathml: '<mi>μ</mi>', previewText: 'μ' },
      { id: 'pi', name: 'pi', mathml: '<mi>π</mi>', previewText: 'π' },
      { id: 'sigma', name: 'sigma', mathml: '<mi>σ</mi>', previewText: 'σ' },
      { id: 'omega', name: 'omega', mathml: '<mi>ω</mi>', previewText: 'ω' },
      { id: 'Delta', name: 'Delta', mathml: '<mi>Δ</mi>', previewText: 'Δ' },
      { id: 'Sigma', name: 'Sigma', mathml: '<mi>Σ</mi>', previewText: 'Σ' },
      { id: 'Omega', name: 'Omega', mathml: '<mi>Ω</mi>', previewText: 'Ω' },
      { id: 'Theta', name: 'Theta', mathml: '<mi>Θ</mi>', previewText: 'Θ' },
      { id: 'Gamma', name: 'Gamma', mathml: '<mi>Γ</mi>', previewText: 'Γ' },
    ],
  },
  {
    id: 'matrices',
    title: 'Matrices & Parentheses',
    items: [
      {
        id: 'parens',
        name: 'Parentheses (⬚)',
        mathml: '<mfenced open="(" close=")"><mrow></mrow></mfenced>',
        previewText: '( ⬚ )',
      },
      {
        id: 'brackets',
        name: 'Brackets [⬚]',
        mathml: '<mfenced open="[" close="]"><mrow></mrow></mfenced>',
        previewText: '[ ⬚ ]',
      },
      {
        id: 'braces',
        name: 'Braces {⬚}',
        mathml: '<mfenced open="{" close="}"><mrow></mrow></mfenced>',
        previewText: '{ ⬚ }',
      },
      {
        id: 'abs',
        name: 'Absolute Value |⬚|',
        mathml: '<mfenced open="|" close="|"><mrow></mrow></mfenced>',
        previewText: '| ⬚ |',
      },
      {
        id: 'matrix2x2',
        name: '2x2 Matrix',
        mathml: '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>',
        previewText: '[ 2×2 ]',
      },
      {
        id: 'matrix1x2',
        name: '1x2 Row Matrix',
        mathml: '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>',
        previewText: '[ 1×2 ]',
      },
      {
        id: 'matrix2x1',
        name: '2x1 Col Matrix',
        mathml: '<mtable><mtr><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd></mtr></mtable>',
        previewText: '[ 2×1 ]',
      },
      {
        id: 'matrix3x3',
        name: '3x3 Matrix',
        mathml: '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>',
        previewText: '[ 3×3 ]',
      },
    ],
  },
];

export class EquationGalleryView extends ItemView {
  public plugin: WordEquationPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: WordEquationPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  public getViewType(): string {
    return VIEW_TYPE_EQUATION_GALLERY;
  }

  public getDisplayText(): string {
    return 'Equation Gallery';
  }

  public getIcon(): string {
    return 'sigma';
  }

  public async onOpen(): Promise<void> {
    const container = this.contentEl;
    if (typeof (container as any).empty === 'function') {
      (container as any).empty();
    } else {
      container.innerHTML = '';
    }

    if (typeof (container as any).addClass === 'function') {
      (container as any).addClass('equation-gallery-container');
    } else {
      container.classList.add('equation-gallery-container');
    }

    container.createEl('h4', {
      text: 'Equation Gallery',
      cls: 'equation-gallery-title weq-gallery-title',
    });

    for (const cat of GALLERY_CATEGORIES) {
      const catSection = container.createDiv({
        cls: 'equation-gallery-category weq-gallery-section',
      });
      catSection.setAttribute('data-category', cat.id);

      catSection.createDiv({
        text: cat.title,
        cls: 'equation-gallery-category-title weq-gallery-section-title',
      });

      const grid = catSection.createDiv({
        cls: 'equation-gallery-grid weq-gallery-grid',
      });

      for (const item of cat.items) {
        const btn = grid.createEl('button', {
          cls: `equation-gallery-btn weq-gallery-item weq-gallery-${item.id}`,
          text: item.previewText || item.name,
          attr: {
            'data-item': item.id,
            'data-category': cat.id,
            'title': item.name,
            'type': 'button',
          },
        });

        // Crucial: Prevent editor/widget blur on mousedown/pointerdown
        const preventBlur = (e: Event) => {
          e.preventDefault();
        };
        btn.addEventListener('pointerdown', preventBlur);
        btn.addEventListener('mousedown', preventBlur);

        btn.addEventListener('click', (e: MouseEvent) => {
          e.preventDefault();
          this.insertItem(item);
        });
      }
    }
  }

  public insertItem(item: GalleryItem): void {
    if (this.plugin?.insertMathFromGallery) {
      this.plugin.insertMathFromGallery(item.mathml);
    }
  }

  public async onClose(): Promise<void> {}
}
