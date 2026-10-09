import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertCurrentNote,
  convertEntireVault,
  registerConversionCommands,
  BACKUP_WARNING_MESSAGE,
} from '../../src/conversion/commands';
import { App, Plugin, Notice, MarkdownView, WorkspaceLeaf, TFile } from '../mocks/obsidian';

describe('Conversion Commands & Backup Warning Notice', () => {
  let app: any;
  let plugin: any;

  beforeEach(() => {
    Notice.notices = [];
    app = new App();
    plugin = new Plugin(app, { id: 'obsidian-word-equation', name: 'Word Equation' });
    plugin.settings = { defaultDelimiter: 'math-word' };
  });

  it('registers all 4 conversion commands on plugin', () => {
    registerConversionCommands(plugin);
    expect(plugin._commands.length).toBe(4);

    const commandIds = plugin._commands.map((c: any) => c.id);
    expect(commandIds).toContain('convert-latex-to-mathml-note');
    expect(commandIds).toContain('convert-mathml-to-latex-note');
    expect(commandIds).toContain('convert-latex-to-mathml-vault');
    expect(commandIds).toContain('convert-mathml-to-latex-vault');

    const commandNames = plugin._commands.map((c: any) => c.name);
    expect(commandNames).toContain('Convert LaTeX to MathML (Current Note)');
    expect(commandNames).toContain('Convert MathML to LaTeX (Current Note)');
    expect(commandNames).toContain('Convert LaTeX to MathML (Entire Vault)');
    expect(commandNames).toContain('Convert MathML to LaTeX (Entire Vault)');
  });

  describe('Current Note Conversion', () => {
    it('always issues backup warning Notice before proceeding', async () => {
      await convertCurrentNote(plugin, 'latex-to-mathml');
      expect(Notice.notices.length).toBeGreaterThanOrEqual(1);
      expect(Notice.notices[0].message).toBe(BACKUP_WARNING_MESSAGE);
    });

    it('converts LaTeX to MathML in active note and updates vault & editor', async () => {
      const file = new TFile('notes/math.md');
      const originalText = '# Note\n$$\\frac{1}{2}$$\nInline: $x + 1$';
      app.vault.files.set('notes/math.md', originalText);

      const leaf = new WorkspaceLeaf(app);
      const view = new MarkdownView(leaf);
      view.file = file;
      view.editor.setValue(originalText);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = view;

      const summary = await convertCurrentNote(plugin, 'latex-to-mathml');
      expect(summary.convertedCount).toBe(2);

      const updatedVault = await app.vault.read(file);
      expect(updatedVault).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"');
      expect(updatedVault).toContain('/weq_inline <math');

      // Check that editor was also updated
      expect(view.editor.getValue()).toBe(updatedVault);

      // Verify notices were sent
      const messages = Notice.notices.map((n) => n.message);
      expect(messages).toContain(BACKUP_WARNING_MESSAGE);
      expect(messages.some((m) => m.includes('Converted 2 equation(s)'))).toBe(true);
    });

    it('converts MathML to LaTeX in active note', async () => {
      const file = new TFile('notes/mathml.md');
      const mathmlText = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n```\nAnd /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> /weq_inline';
      app.vault.files.set('notes/mathml.md', mathmlText);

      const leaf = new WorkspaceLeaf(app);
      const view = new MarkdownView(leaf);
      view.file = file;
      view.editor.setValue(mathmlText);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = view;

      const summary = await convertCurrentNote(plugin, 'mathml-to-latex');
      expect(summary.convertedCount).toBe(2);

      const updatedVault = await app.vault.read(file);
      expect(updatedVault).toContain('$$\n\\frac{1}{2}\n$$');
      expect(updatedVault).toContain('$x$');
      expect(view.editor.getValue()).toBe(updatedVault);
    });

    it('handles note with no equations gracefully', async () => {
      const file = new TFile('notes/plain.md');
      app.vault.files.set('notes/plain.md', '# Just plain text\nNo equations here.');

      const leaf = new WorkspaceLeaf(app);
      const view = new MarkdownView(leaf);
      view.file = file;
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = view;

      const summary = await convertCurrentNote(plugin, 'latex-to-mathml');
      expect(summary.convertedCount).toBe(0);

      const messages = Notice.notices.map((n) => n.message);
      expect(messages).toContain('No equations found to convert in current note.');
    });

    it('handles no active file gracefully', async () => {
      app.workspace.activeLeaf = null;
      app.workspace.activeView = null;

      const summary = await convertCurrentNote(plugin, 'latex-to-mathml');
      expect(summary.convertedCount).toBe(0);

      const messages = Notice.notices.map((n) => n.message);
      expect(messages).toContain('No active note to convert.');
    });
  });

  describe('Entire Vault Conversion', () => {
    it('always issues backup warning Notice before proceeding across vault', async () => {
      await convertEntireVault(plugin, 'latex-to-mathml');
      expect(Notice.notices.length).toBeGreaterThanOrEqual(1);
      expect(Notice.notices[0].message).toBe(BACKUP_WARNING_MESSAGE);
    });

    it('converts equations across multiple files in vault', async () => {
      app.vault.files.set('note1.md', '# Note 1\n$$\\frac{a}{b}$$');
      app.vault.files.set('note2.md', '# Note 2\nInline $y = mx + b$');
      app.vault.files.set('note3.md', '# Note 3\nNo math here.');

      const summary = await convertEntireVault(plugin, 'latex-to-mathml');
      expect(summary.filesModified).toBe(2);
      expect(summary.equationsConverted).toBe(2);

      expect(await app.vault.read('note1.md')).toContain('```math-word');
      expect(await app.vault.read('note2.md')).toContain('/weq_inline');
      expect(await app.vault.read('note3.md')).toBe('# Note 3\nNo math here.');

      const messages = Notice.notices.map((n) => n.message);
      expect(messages).toContain(BACKUP_WARNING_MESSAGE);
      expect(messages.some((m) => m.includes('Vault conversion complete: 2 equation(s)'))).toBe(true);
    });

    it('converts MathML back to LaTeX across entire vault', async () => {
      app.vault.files.set(
        'note1.md',
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n```'
      );
      app.vault.files.set('note2.md', 'Inline /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math> /weq_inline');

      const summary = await convertEntireVault(plugin, 'mathml-to-latex');
      expect(summary.filesModified).toBe(2);
      expect(summary.equationsConverted).toBe(2);

      expect(await app.vault.read('note1.md')).toContain('$$\n\\frac{a}{b}\n$$');
      expect(await app.vault.read('note2.md')).toContain('Inline $k$');
    });
  });
});
