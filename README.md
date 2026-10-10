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

## 📦 Installation

### Method 1: Via BRAT *(Recommended for auto-updates)*
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian-42-brat) in Obsidian.
2. In Obsidian Settings &rarr; **BRAT** &rarr; click **Add Beta plugin**.
3. Enter `QuaziElectro/obsidian-word-equation` and click **Add Plugin**.
4. Enable **Word Equation** under **Community plugins**.

### Method 2: Manual Installation (ZIP Archive)
1. Go to the [Latest Releases](https://github.com/QuaziElectro/obsidian-word-equation/releases/latest).
2. Download **`word-equation.zip`**.
3. Extract the ZIP archive directly into your vault's plugins directory:
   `<VaultFolder>/.obsidian/plugins/`
   *(The archive already contains the `word-equation` folder with `main.js`, `manifest.json`, and `styles.css`).*
4. In Obsidian, go to **Settings** &rarr; **Community plugins**, click **Reload plugins**, and toggle on **Word Equation**.

### Method 3: Manual Installation (Individual Files)
1. Go to the [Latest Releases](https://github.com/QuaziElectro/obsidian-word-equation/releases/latest).
2. Download `main.js`, `manifest.json`, and `styles.css`.
3. Create a folder named `word-equation` inside:
   `<VaultFolder>/.obsidian/plugins/`
4. Place the 3 downloaded files inside `<VaultFolder>/.obsidian/plugins/word-equation/`.
5. In Obsidian, go to **Settings** &rarr; **Community plugins**, reload, and enable **Word Equation**.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
