# Word Equation for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/QuaziElectro/obsidian-word-equation?include_prereleases&style=flat-square)](https://github.com/QuaziElectro/obsidian-word-equation/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.7.2+-purple.svg?style=flat-square)](https://obsidian.md)

**Word Equation** brings Microsoft Word-like visual equation editing and native MathML rendering directly into [Obsidian](https://obsidian.md).

Edit mathematical formulas naturally with in-place visual slots, auto-expanding shortcuts, flashing carets, structural keyboard navigation, equation galleries, bi-directional LaTeX conversion, and full multi-format clipboard support.

---

## ✨ Features

- **Live In-Place Visual Editing**: Edit mathematical expressions directly within Live Preview. Visual slots, placeholder boxes, and flashing carets give you the immediate feedback of Microsoft Word's Equation Editor.
- **Auto-Expanding Word Math Shortcuts**: Type standard linear math shortcuts (such as `\frac`, `\sqrt`, `^`, `_`, `\sum`, `\int`, `\alpha`, `\le`) and press <kbd>Space</kbd> or <kbd>Enter</kbd> to automatically expand them into interactive mathematical templates.
- **Equation Gallery & Preset Palette**: Built-in visual palette featuring standard structures (fractions, radicals, integrals, large operators, matrices, brackets, functions, accents, limits) as well as common pre-built formulas (Quadratic Formula, Pythagorean Theorem, Taylor Series, Fourier Transform, etc.). Easily create and save custom presets.
- **Bi-directional LaTeX & MathML Conversion**:
  - Convert any existing note's LaTeX equations (`$ ... $` and `$$ ... $$`) into visual Word equations with a single command.
  - Export Word MathML equations back to standard LaTeX anytime.
  - Seamlessly convert highlighted linear text selections into formatted equations.
- **Table Equation Support**: Robust support for inline and block equations inside Markdown tables (`| ... |`). Delimiters and pipes are protected so table formatting remains pristine.
- **Structural Keyboard Navigation**:
  - Arrow keys navigate naturally between nested slots (numerators, denominators, radical indices, exponents, matrix cells).
  - <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> jumps between equation slots.
  - Seamless entry and exit into surrounding Markdown document text.
- **Rich Selection & Manipulation**:
  - <kbd>Shift</kbd> + <kbd>Arrow</kbd> expands and collapses selections structurally across math elements.
  - Double-click to select individual tokens or placeholders; triple-click to select the entire equation.
  - Smooth mouse drag selection with boundary clamping.
- **Multi-Format Clipboard**: Copy and paste formulas across MathML (`application/mathml+xml`), LaTeX, and plaintext formats. Fully compatible with Microsoft Word, MathType, LibreOffice, and web editors.
- **Interactive Settings Sandbox**: Test shortcuts and configure custom trigger expansions inside a live interactive equation sandbox in the settings tab.

---

## ⌨️ Common Shortcuts & Linear Syntax

When editing inside an equation, type a shortcut and press <kbd>Space</kbd> to expand it:

| Shortcut | Description | Resulting Template |
| :--- | :--- | :--- |
| `a/b` or `\frac` + <kbd>Space</kbd> | Fraction | $\frac{a}{b}$ |
| `x^2` + <kbd>Space</kbd> | Superscript (Power) | $x^2$ |
| `x_i` + <kbd>Space</kbd> | Subscript (Index) | $x_i$ |
| `\sqrt` + <kbd>Space</kbd> | Square Root | $\sqrt{\Box}$ |
| `\cbrt` + <kbd>Space</kbd> | Cube Root | $\sqrt[3]{\Box}$ |
| `\int` + <kbd>Space</kbd> | Integral | $\int$ |
| `\sum` + <kbd>Space</kbd> | Summation | $\sum$ |
| `\prod` + <kbd>Space</kbd> | Product | $\prod$ |
| `\matrix` + <kbd>Space</kbd> | 2×2 Matrix | $\begin{matrix} \Box & \Box \\ \Box & \Box \end{matrix}$ |
| `\pm` / `\mp` | Plus-minus / Minus-plus | $\pm$ / $\mp$ |
| `\times` / `\div` / `\cdot` | Operators | $\times$ / $\div$ / $\cdot$ |
| `\leq` / `\geq` / `\neq` / `\approx` | Relations | $\le$ / $\ge$ / $\neq$ / $\approx$ |
| `\infty` / `\partial` / `\nabla` | Symbols | $\infty$ / $\partial$ / $\nabla$ |
| `\to` / `\implies` / `\iff` | Arrows | $\to$ / $\implies$ / $\iff$ |
| `\alpha` ... `\omega` | Greek Lowercase | $\alpha, \beta, \gamma, \dots, \omega$ |
| `\Gamma` ... `\Omega` | Greek Uppercase | $\Gamma, \Delta, \Theta, \dots, \Omega$ |

> [!TIP]
> Custom shortcuts and MathML triggers can be configured in **Settings &rarr; Word Equation**.

---

## 🚀 Commands

| Command | Hotkey | Description |
| :--- | :--- | :--- |
| **Insert block equation** | <kbd>Alt</kbd> + <kbd>=</kbd> | Inserts a new centered block equation at the cursor. |
| **Insert inline equation** | — | Inserts an inline equation slot at the cursor. |
| **Insert full-page math block** | — | Inserts a full-width equation canvas. |
| **Toggle equation gallery** | — | Opens or hides the Equation Gallery in the sidebar. |
| **Convert Linear Selection to Equation** | — | Parses selected text (e.g. `(a+b)/c`) into a formatted equation. |
| **Convert all LaTeX to Word equations in note** | — | Converts all `$ ... $` and `$$ ... $$` math in active note to Word equations. |
| **Convert all Word equations to LaTeX in note** | — | Converts all Word equations in active note to standard LaTeX. |

---

## 📦 Installation

### Method 1: Via BRAT *(Recommended for Auto-Updates)*

1. Install the [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian-42-brat) plugin from Community Plugins.
2. Open Obsidian **Settings** &rarr; **BRAT** &rarr; click **Add Beta plugin**.
3. Enter `QuaziElectro/obsidian-word-equation` and click **Add Plugin**.
4. Navigate to **Community plugins** and enable **Word Equation**.

### Method 2: Manual Installation (GitHub Release)

1. Download `word-equation.zip` (or `main.js`, `manifest.json`, and `styles.css`) from the [Latest Releases](https://github.com/QuaziElectro/obsidian-word-equation/releases/latest).
2. Open your Obsidian vault directory in your file explorer.
3. Extract or place the files into `<VaultFolder>/.obsidian/plugins/word-equation/`.
4. In Obsidian, open **Settings** &rarr; **Community plugins**, click **Reload plugins**, and toggle on **Word Equation**.

---

## 🛠️ Development & Building

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- `npm`

### Setup

```bash
# Clone repository
git clone https://github.com/QuaziElectro/obsidian-word-equation.git
cd obsidian-word-equation

# Install dependencies
npm install --legacy-peer-deps
```

### Build Scripts

```bash
# Development build with live rebuild on changes
npm run dev

# Production build (outputs bundled and minified main.js)
npm run build

# TypeScript validation
npm run typecheck
```

### Running Tests

The test suite includes extensive unit tests, AST parsers/serializers, shortcut engine tests, adversarial stress tests, and Obsidian integration checks:

```bash
# Run unit & integration test suite
npm test

# Run tests in watch mode
npm run test:watch

# Run real Obsidian E2E tests (requires Obsidian desktop installed)
npm run test:e2e-obsidian
```

---

## 📁 Repository Structure

```text
obsidian-word-equation/
├── src/
│   ├── core/               # Math AST definitions, linear & MathML parsers and serializers
│   ├── editor/             # CodeMirror 6 extensions, widgets, caret hit-testing & navigation
│   ├── conversion/         # Bi-directional LaTeX <-> MathML document converters
│   ├── gallery/            # Equation gallery views, presets modal, and preset structures
│   ├── settings/           # Obsidian settings tab and interactive equation sandbox
│   ├── shortcuts/          # Autocorrect symbol catalog and linear shortcut engine
│   ├── post-processor/     # Reading View & Markdown table post-processors
│   ├── debug/              # Telemetry hooks and debug logger
│   └── main.ts             # Obsidian plugin lifecycle & command registrations
├── tests/                  # Over 100 test suites covering AST, DOM rendering, navigation, etc.
├── esbuild.config.mjs      # Esbuild bundling configuration
├── manifest.json           # Obsidian plugin manifest
├── styles.css              # Plugin styling, equation slot layout, and gallery styles
├── tsconfig.json           # TypeScript configuration
└── vitest.config.ts        # Vitest testing configuration
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
