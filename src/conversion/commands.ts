/**
 * Obsidian Commands for LaTeX <-> MathML In-Place Conversion
 * Scope: Current Note and Entire Vault
 * Displays mandatory Obsidian backup warning notices before modifying files.
 */

import { Notice, Plugin, MarkdownView, TFile } from 'obsidian';
import { convertMarkdownContent } from './markdown-scanner';
import { logDebugEvent } from '../debug/debug-logger';

export const BACKUP_WARNING_MESSAGE =
  'Warning: Please back up your vault before proceeding! Converting equations in-place...';
export const BACKUP_WARNING_DURATION_MS = 7000;

export interface NoteConversionSummary {
  convertedCount: number;
}

export interface VaultConversionSummary {
  filesModified: number;
  equationsConverted: number;
}

/**
 * Converts equations in the currently active note in-place.
 */
export async function convertCurrentNote(
  plugin: Plugin,
  direction: 'latex-to-mathml' | 'mathml-to-latex'
): Promise<NoteConversionSummary> {
  // 1. Mandatory backup warning notice
  new Notice(BACKUP_WARNING_MESSAGE, BACKUP_WARNING_DURATION_MS);

  const app = plugin.app;
  if (!app) {
    return { convertedCount: 0 };
  }

  // 2. Identify active markdown file and view
  const activeView = app.workspace?.getActiveViewOfType?.(MarkdownView);
  let activeFile: TFile | null =
    app.workspace?.getActiveFile?.() ||
    activeView?.file ||
    (activeView as any)?.file ||
    null;

  if (!activeFile) {
    const leaf = app.workspace?.getLeaf?.(false);
    const leafView = leaf?.view as any;
    if (leafView?.file) {
      activeFile = leafView.file;
    }
  }

  if (!activeFile) {
    new Notice('No active note to convert.');
    return { convertedCount: 0 };
  }

  const startTime = performance.now();
  try {
    // 3. Read content
    const originalContent = await app.vault.read(activeFile);
    const delimiter = (plugin as any).settings?.defaultDelimiter || 'math-word';

    // 4. Perform conversion
    const result = convertMarkdownContent(originalContent, direction, delimiter);

    // 5. Apply modifications in place
    if (result.count > 0 && result.converted !== originalContent) {
      await app.vault.modify(activeFile, result.converted);

      // If active editor is open on this note, update editor value directly for immediate UI update
      if (activeView && activeView.editor) {
        try {
          activeView.editor.setValue(result.converted);
        } catch {
          // If editor setValue failed or not supported in this view state
        }
      }

      const targetFormat = direction === 'latex-to-mathml' ? 'MathML' : 'LaTeX';
      new Notice(`Converted ${result.count} equation(s) to ${targetFormat} in current note.`);
    } else {
      new Notice('No equations found to convert in current note.');
    }

    const durationMs = Math.round(performance.now() - startTime);
    logDebugEvent('conversion', () => ({
      scope: 'note',
      direction,
      filePath: activeFile?.path,
      equationCount: result.count,
      durationMs,
      status: 'success',
      inputSnippet: originalContent.slice(0, 100),
      outputSnippet: result.converted.slice(0, 100),
    }));

    return { convertedCount: result.count };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logDebugEvent('conversion', () => ({
      scope: 'note',
      direction,
      filePath: activeFile?.path,
      equationCount: 0,
      durationMs,
      status: 'error',
      inputSnippet: '',
      error: String(err?.message || err),
    }));
    new Notice(`Conversion failed: ${err?.message || err}`);
    return { convertedCount: 0 };
  }
}

/**
 * Converts equations across all Markdown files in the entire vault in-place.
 */
export async function convertEntireVault(
  plugin: Plugin,
  direction: 'latex-to-mathml' | 'mathml-to-latex'
): Promise<VaultConversionSummary> {
  // 1. Mandatory backup warning notice
  new Notice(BACKUP_WARNING_MESSAGE, BACKUP_WARNING_DURATION_MS);

  const app = plugin.app;
  if (!app) {
    return { filesModified: 0, equationsConverted: 0 };
  }

  const startTime = performance.now();
  const files = app.vault?.getMarkdownFiles?.() || [];
  const delimiter = (plugin as any).settings?.defaultDelimiter || 'math-word';

  let filesModified = 0;
  let equationsConverted = 0;

  const activeView = app.workspace?.getActiveViewOfType?.(MarkdownView);
  const activeFile = app.workspace?.getActiveFile?.();

  for (const file of files) {
    try {
      const originalContent = await app.vault.read(file);
      const result = convertMarkdownContent(originalContent, direction, delimiter);

      if (result.count > 0 && result.converted !== originalContent) {
        await app.vault.modify(file, result.converted);

        // Update active editor if currently displaying this file
        if (
          activeView &&
          activeView.editor &&
          (activeFile?.path === file.path || activeView.file?.path === file.path)
        ) {
          try {
            activeView.editor.setValue(result.converted);
          } catch {
            /* Ignore editor update error if view is detached */
          }
        }

        filesModified++;
        equationsConverted += result.count;
      }
    } catch (err) {
      console.error(`[ObsidianWorldEquation] Error converting file ${file.path}:`, err);
    }
  }

  const targetFormat = direction === 'latex-to-mathml' ? 'MathML' : 'LaTeX';
  new Notice(
    `Vault conversion complete: ${equationsConverted} equation(s) converted across ${filesModified} file(s) to ${targetFormat}.`
  );

  const durationMs = Math.round(performance.now() - startTime);
  logDebugEvent('conversion', () => ({
    scope: 'vault',
    direction,
    equationCount: equationsConverted,
    filesModified,
    durationMs,
    status: 'success',
    inputSnippet: `Vault with ${files.length} markdown file(s)`,
  }));

  return { filesModified, equationsConverted };
}

/**
 * Registers all 4 LaTeX <-> MathML conversion commands on the plugin.
 */
export function registerConversionCommands(plugin: Plugin): void {
  // 1. Current Note: LaTeX -> MathML
  plugin.addCommand({
    id: 'convert-latex-to-mathml-note',
    name: 'Convert LaTeX to MathML (Current Note)',
    callback: () => {
      void convertCurrentNote(plugin, 'latex-to-mathml');
    },
  });

  // 2. Current Note: MathML -> LaTeX
  plugin.addCommand({
    id: 'convert-mathml-to-latex-note',
    name: 'Convert MathML to LaTeX (Current Note)',
    callback: () => {
      void convertCurrentNote(plugin, 'mathml-to-latex');
    },
  });

  // 3. Entire Vault: LaTeX -> MathML
  plugin.addCommand({
    id: 'convert-latex-to-mathml-vault',
    name: 'Convert LaTeX to MathML (Entire Vault)',
    callback: () => {
      void convertEntireVault(plugin, 'latex-to-mathml');
    },
  });

  // 4. Entire Vault: MathML -> LaTeX
  plugin.addCommand({
    id: 'convert-mathml-to-latex-vault',
    name: 'Convert MathML to LaTeX (Entire Vault)',
    callback: () => {
      void convertEntireVault(plugin, 'mathml-to-latex');
    },
  });
}
