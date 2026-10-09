# Word Equation for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/QuaziElectro/obsidian-word-equation?include_prereleases&style=flat-square)](https://github.com/QuaziElectro/obsidian-word-equation/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Word Equation** brings Microsoft Word-like visual equation editing and native MathML rendering directly into [Obsidian](https://obsidian.md).

Edit mathematical formulas naturally with in-place visual slots, auto-expanding shortcuts, flashing carets, structural keyboard navigation, and full multi-format clipboard support.

---

## ✨ Features

- **Live Visual Editing**: Edit mathematical expressions in-place with a flashing caret and instant MathML visual updates.
- **Auto-Expanding Word-Style Shortcuts**: Type familiar shortcuts (such as `\frac`, `\sqrt`, `^`, `_`, `\sum`) and press <kbd>Space</kbd> or <kbd>Enter</kbd> to instantly expand them into mathematical templates.
- **Structural Keyboard Navigation**: Arrow keys navigate smoothly between nested slots (numerators, denominators, radical indices, exponents) and into surrounding Markdown text.
- **Rich Selection Support**:
  - <kbd>Shift</kbd> + <kbd>Arrow</kbd> expands and collapses selections structurally across math elements.
  - Double-click to select individual tokens or placeholders; triple-click to select the entire math block.
  - Natural mouse drag selection with boundary clamping.
- **Multi-Format Clipboard**: Copy and paste across MathML (`application/mathml+xml`), LaTeX, and plaintext formats. Fully compatible with Microsoft Word, MathType, and web editors.
- **Interactive Settings Sandbox**: Customize, add, and test your own shortcut triggers and MathML templates in an interactive settings panel.
- **Block & Inline Equations**: Works seamlessly with inline equations (`$ ... $`) and stacked multi-line block equations (`$$ ... $$`).

---

## ⌨️ Common Shortcuts Reference

| Syntax / Shortcut | Expanded Structure | Action |
|:---|:---|:---|
| `\frac` + <kbd>Space</kbd> or `/` | Fraction $\frac{a}{b}$ | Inserts fraction with numerator and denominator |
| `\sqrt` + <kbd>Space</kbd> | Square Root $\sqrt{x}$ | Inserts radical structure |
| `\root` + <kbd>Space</kbd> | N-th Root $\sqrt[n]{x}$ | Inserts radical with custom root index |
| `^` | Superscript $x^2$ | Creates exponent slot |
| `_` | Subscript $x_i$ | Creates index slot |
| `\int` + <kbd>Space</kbd> | Integral $\int$ | Inserts integral symbol |
| `\sum` + <kbd>Space</kbd> | Summation $\sum$ | Inserts sigma summation |
| `\alpha`, `\beta`, `\theta` | Greek Symbols ($\alpha, \beta, \theta$) | Replaces with Greek character |
| `\pm`, `\times`, `\leq`, `\geq` | Math Operators ($\pm, \times, \leq, \geq$) | Replaces with mathematical operator |

*(All shortcuts can be viewed and customized in Obsidian Settings &rarr; Word Equation)*

---

## 📦 Installation

### From Obsidian Community Plugins *(Recommended)*
1. In Obsidian, open **Settings** &rarr; **Community plugins**.
2. Turn on Community plugins.
3. Click **Browse** and search for **Word Equation**.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Go to the [Latest Releases](https://github.com/QuaziElectro/obsidian-word-equation/releases).
2. Download `main.js`, `manifest.json`, and `styles.css`.
3. Create a folder named `obsidian-word-equation` in your vault's plugin directory:
   `<VaultFolder>/.obsidian/plugins/obsidian-word-equation/`
4. Copy the downloaded files into that folder.
5. In Obsidian, reload plugins and enable **Word Equation**.

### Via BRAT
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian-42-brat) in Obsidian.
2. In BRAT settings, choose **Add Beta plugin**.
3. Enter `QuaziElectro/obsidian-word-equation`.

---

## 🛠️ Development & Testing

This plugin is written in TypeScript and built with [esbuild](https://esbuild.github.io/).

```bash
# Install dependencies
npm install

# Run type check
npm run typecheck

# Run test suite
npm test

# Build production bundle
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
