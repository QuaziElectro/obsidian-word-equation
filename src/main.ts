/**
 * Obsidian Word-like Equation Plugin Entry Point
 */

import {
  Plugin,
  Editor,
  MarkdownView,
} from 'obsidian';
import { EditorView } from '@codemirror/view';
import { wordEquationStateField, wordEquationCollapsedGapField } from './editor/state-field';
import { createEquationNavigationExtension, getActiveWidget } from './editor/navigation-extension';
import { createMarkdownShortcutExtension } from './shortcuts/markdown-filter';
import { createReadingViewProcessor } from './post-processor/reading-view';
import { parseLinearEquation } from './core/linear-parser';
import { serializeMathML } from './core/mathml-serializer';
import { setCustomShortcuts, CustomShortcut } from './shortcuts/catalog';
import { WordEquationSettingTab } from './settings/settings-tab';
import {
  EquationGalleryView,
  VIEW_TYPE_EQUATION_GALLERY,
  EQUATION_GALLERY_VIEW_TYPE,
} from './gallery/gallery-view';
export { VIEW_TYPE_EQUATION_GALLERY, EQUATION_GALLERY_VIEW_TYPE };
import {
  getActiveEquationState,
  getActiveEquationWidget,
  onActiveEquationChange,
} from './editor/active-session';
import { WordEquationWidget } from './editor/widget';
import { MATHML_NAMESPACE } from './core/types';
import { registerConversionCommands } from './conversion';
import { isEquationEmpty } from './core/ast';
import { getDebugLogger, isDebugEnabled, logDebugEvent } from './debug/debug-logger';

export interface WordEquationPluginSettings {
  autoExpandShortcuts: boolean;
  defaultDelimiter: 'math-word' | 'weq';
  autoShowGallery: boolean;
  customShortcuts: CustomShortcut[];
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: WordEquationPluginSettings = {
  autoExpandShortcuts: true,
  defaultDelimiter: 'math-word',
  autoShowGallery: false,
  customShortcuts: [
    { trigger: '\\tensor', expansion: '⊗' },
    { trigger: '\\approxeq', expansion: '≊' },
  ],
  debugMode: false,
};

let activeFirstInteractionCleanup: (() => void) | null = null;

export default class WordEquationPlugin extends Plugin {
  public settings: WordEquationPluginSettings = Object.assign({}, DEFAULT_SETTINGS);
  private firstInteractionCleanup: (() => void) | null = null;

  public async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize Debug Logger Subsystem
    getDebugLogger().init(this.app, this.manifest.id, this.settings.debugMode);

    // 1. Register CodeMirror 6 Editor Extensions
    this.registerEditorExtension([
      wordEquationStateField,
      wordEquationCollapsedGapField,
      createMarkdownShortcutExtension(),
      createEquationNavigationExtension(),
    ]);

    // 2. Register Reading View Codeblock Processors
    const readingViewProcessor = createReadingViewProcessor();
    this.registerMarkdownCodeBlockProcessor('math-word', readingViewProcessor);
    this.registerMarkdownCodeBlockProcessor('weq', readingViewProcessor);

    // 3. Register Equation Gallery Sidebar View
    this.registerView(
      VIEW_TYPE_EQUATION_GALLERY,
      (leaf) => new EquationGalleryView(leaf, this)
    );

    // 4. Register Commands
    const insertBlockEquation = (editor: Editor) => {
      const delimiter = this.settings.defaultDelimiter || 'math-word';
      const initialXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>`;
      const template = `\`\`\`${delimiter}\n${initialXml}\n\`\`\`\n`;
      editor.replaceSelection(template);
    };

    const insertInlineEquation = (editor: Editor) => {
      const initialXml = `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>`;
      const template = `/weq_inline ${initialXml} /weq_inline`;
      editor.replaceSelection(template);
    };

    // Primary R4 command: "Insert block equation" (Alt+=)
    this.addCommand({
      id: 'insert-block-equation',
      name: 'Insert block equation',
      hotkeys: [{ modifiers: ['Alt'], key: '=' }],
      editorCallback: insertBlockEquation,
    });

    // Primary R4 command: "Insert inline equation"
    this.addCommand({
      id: 'insert-inline-equation',
      name: 'Insert inline equation',
      editorCallback: insertInlineEquation,
    });

    // Primary R4 command: "Toggle equation gallery"
    this.addCommand({
      id: 'toggle-equation-gallery',
      name: 'Toggle equation gallery',
      callback: () => this.toggleGalleryView(),
    });

    this.addCommand({
      id: 'convert-selection-to-word-equation',
      name: 'Convert Linear Selection to Equation',
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection().trim();
        if (!selection) return;

        const startTime = performance.now();
        try {
          const ast = parseLinearEquation(selection);
          const xml = serializeMathML(ast, { pretty: true });
          const delimiter = this.settings.defaultDelimiter;
          const template = `\`\`\`${delimiter}\n${xml}\n\`\`\`\n`;
          editor.replaceSelection(template);

          const durationMs = Math.round(performance.now() - startTime);
          logDebugEvent('conversion', () => ({
            scope: 'selection',
            direction: 'linear-to-mathml',
            equationCount: 1,
            durationMs,
            status: 'success',
            inputSnippet: selection.slice(0, 100),
            outputSnippet: xml.slice(0, 100),
          }));
        } catch (err: any) {
          const durationMs = Math.round(performance.now() - startTime);
          logDebugEvent('conversion', () => ({
            scope: 'selection',
            direction: 'linear-to-mathml',
            equationCount: 0,
            durationMs,
            status: 'error',
            inputSnippet: selection.slice(0, 100),
            error: String(err?.message || err),
          }));
          throw err;
        }
      },
    });

    // Programmatically alias legacy command IDs for backward compatibility without duplicating Command Palette items
    if ((this.app as any)?.commands?.commands) {
      const cmds = (this.app as any).commands.commands;
      const getCmd = (id: string) => {
        if (typeof cmds.get === 'function') {
          return cmds.get(`obsidian-word-equation:${id}`) || cmds.get(id);
        }
        return cmds[`obsidian-word-equation:${id}`] || cmds[id];
      };

      const blockCmd = getCmd('insert-block-equation');
      const inlineCmd = getCmd('insert-inline-equation');

      if (typeof (cmds as any).set === 'function') {
        // Map-based commands store (e.g., test mocks)
        if (blockCmd) {
          (cmds as any).set('insert-word-equation', blockCmd);
        }
        if (inlineCmd) {
          (cmds as any).set('insert-word-equation-inline', inlineCmd);
        }
      } else if (typeof cmds === 'object' && cmds !== null) {
        // Plain object-based commands store (Obsidian desktop)
        // Use non-enumerable properties so Object.values(cmds) does not duplicate Command Palette items
        if (blockCmd) {
          Object.defineProperty(cmds, 'insert-word-equation', {
            value: blockCmd,
            enumerable: false,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(cmds, 'obsidian-word-equation:insert-word-equation', {
            value: blockCmd,
            enumerable: false,
            configurable: true,
            writable: true,
          });
        }
        if (inlineCmd) {
          Object.defineProperty(cmds, 'insert-word-equation-inline', {
            value: inlineCmd,
            enumerable: false,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(cmds, 'obsidian-word-equation:insert-word-equation-inline', {
            value: inlineCmd,
            enumerable: false,
            configurable: true,
            writable: true,
          });
        }
      }

      // Safe fallback: intercept executeCommandById for legacy alias execution
      if (typeof (this.app as any)?.commands?.executeCommandById === 'function') {
        const origExecute = (this.app as any).commands.executeCommandById.bind((this.app as any).commands);
        (this.app as any).commands.executeCommandById = (id: string, ...args: any[]) => {
          if (id === 'insert-word-equation' || id === 'obsidian-word-equation:insert-word-equation') {
            return origExecute('obsidian-word-equation:insert-block-equation', ...args);
          }
          if (id === 'insert-word-equation-inline' || id === 'obsidian-word-equation:insert-word-equation-inline') {
            return origExecute('obsidian-word-equation:insert-inline-equation', ...args);
          }
          return origExecute(id, ...args);
        };
      }

      // Safe fallback: deduplicate listCommands if present
      if (typeof (this.app as any)?.commands?.listCommands === 'function') {
        const origList = (this.app as any).commands.listCommands.bind((this.app as any).commands);
        (this.app as any).commands.listCommands = () => {
          const list: any[] = origList();
          const seen = new Set<string>();
          return list.filter((cmd) => {
            if (!cmd) return false;
            const key = cmd.id || cmd.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        };
      }
    }

    // 5. Register LaTeX <-> MathML Conversion Commands
    registerConversionCommands(this);

    // 6. Active equation focus hook: Auto-show / Auto-hide Equation Gallery
    let hideGalleryTimeout: ReturnType<typeof setTimeout> | null = null;
    this.register(
      onActiveEquationChange((active) => {
        if (!this.settings.autoShowGallery) return;
        if (active) {
          if (hideGalleryTimeout) {
            clearTimeout(hideGalleryTimeout);
            hideGalleryTimeout = null;
          }
          this.activateGalleryView();
        } else {
          if (hideGalleryTimeout) {
            clearTimeout(hideGalleryTimeout);
          }
          hideGalleryTimeout = setTimeout(() => {
            hideGalleryTimeout = null;
            const currentState = getActiveEquationState();
            if (!currentState || !currentState.isFocused) {
              this.hideGalleryView();
            }
          }, 50);
        }
      })
    );
    this.register(() => {
      if (hideGalleryTimeout) {
        clearTimeout(hideGalleryTimeout);
        hideGalleryTimeout = null;
      }
    });

    // 7. Register Setting Tab
    this.addSettingTab(new WordEquationSettingTab(this.app, this));

    // 8. Capture Startup Initialization State & Register First Interaction Listener (R3)
    if (this.app?.workspace?.onLayoutReady) {
      this.app.workspace.onLayoutReady(() => {
        this.captureStartupInitializationState();
      });
    } else {
      this.captureStartupInitializationState();
    }
  }

  public captureStartupInitializationState(): void {
    const captureState = () => {
      const workspace = this.app?.workspace;
      const activeView = workspace?.getActiveViewOfType?.(MarkdownView);
      const activeFile = workspace?.getActiveFile?.() || (activeView as any)?.file || null;
      const activeFilePath = activeFile?.path || null;
      const activeViewType = activeView?.getViewType?.() || (workspace?.activeLeaf?.view as any)?.getViewType?.() || null;
      const editor = activeView?.editor;
      const cm = (editor as any)?.cm;
      const docLength = cm?.state?.doc?.length ?? (editor?.getValue?.()?.length ?? 0);
      const cmSelection = cm?.state?.selection?.main
        ? {
            from: cm.state.selection.main.from,
            to: cm.state.selection.main.to,
            head: cm.state.selection.main.head,
            anchor: cm.state.selection.main.anchor,
          }
        : { from: 0, to: 0, head: 0, anchor: 0 };

      const equationWidgets = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('.word-equation-block, .word-equation-inline'))
        : [];

      const equations = equationWidgets.map((el) => {
        const w = (el as any).__widget;
        const fromAttr = el.getAttribute('data-equation-from');
        const toAttr = el.getAttribute('data-equation-to');
        const from = w ? w.from : (fromAttr ? Number(fromAttr) : 0);
        const to = w ? w.to : (toAttr ? Number(toAttr) : 0);
        const isInline = w ? Boolean(w.isInline) : el.classList.contains('word-equation-inline');
        const isEmpty = w ? isEquationEmpty(w.ast) : Boolean(el.querySelector('.eq-placeholder'));
        return { from, to, isInline, isEmpty };
      });

      const activeElementTag = typeof document !== 'undefined' && document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const activeElementClass = typeof document !== 'undefined' && document.activeElement ? document.activeElement.className : '';
      const activeSessionState = getActiveEquationState();

      return {
        activeFilePath,
        activeViewType,
        docLength,
        cmSelection,
        detectedEquationCount: equations.length > 0 ? equations.length : (typeof document !== 'undefined' ? document.querySelectorAll('.word-equation-math').length : 0),
        equations,
        activeElementTag,
        activeElementClass,
        hasActiveEquationSession: Boolean(activeSessionState?.isFocused),
      };
    };

    logDebugEvent('initialization', () => ({
      stage: 'vault_layout_ready',
      startupState: captureState(),
    }));

    if (activeFirstInteractionCleanup) {
      activeFirstInteractionCleanup();
      activeFirstInteractionCleanup = null;
    }
    this.firstInteractionCleanup = null;

    let firstInteractionCaptured = false;
    const cleanupListeners = () => {
      if (firstInteractionCaptured) return;
      firstInteractionCaptured = true;
      activeFirstInteractionCleanup = null;
      this.firstInteractionCleanup = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', handleFirstInteraction as any, true);
        document.removeEventListener('mousedown', handleFirstInteraction as any, true);
        document.removeEventListener('keydown', handleFirstInteraction as any, true);
      }
    };
    activeFirstInteractionCleanup = cleanupListeners;
    this.firstInteractionCleanup = cleanupListeners;

    const handleFirstInteraction = (e: MouseEvent | PointerEvent | KeyboardEvent) => {
      if (firstInteractionCaptured) return;
      cleanupListeners();

      const eventType = e.type;
      const key = 'key' in e ? (e as KeyboardEvent).key : undefined;
      const clientX = 'clientX' in e ? (e as MouseEvent).clientX : undefined;
      const clientY = 'clientY' in e ? (e as MouseEvent).clientY : undefined;
      const target = e.target as HTMLElement | null;
      const targetTag = target ? target.tagName.toLowerCase() : '';
      const targetClass = target ? target.className : '';
      const targetSlotId = target ? (target.getAttribute('data-slot-id') || target.closest('[data-slot-id]')?.getAttribute('data-slot-id') || null) : null;
      const targetPlaceholderFor = target ? (target.getAttribute('data-placeholder-for') || target.closest('[data-placeholder-for]')?.getAttribute('data-placeholder-for') || null) : null;

      const recordFirstInteraction = () => {
        const activeSession = getActiveEquationState();
        const activeWidget = getActiveEquationWidget();
        const resultingCaret = activeSession?.caret || activeWidget?.caret || null;
        const equationActivated = Boolean(activeSession?.isFocused || activeWidget?.isFocused);

        logDebugEvent('initialization', () => ({
          stage: 'first_caret_interaction',
          startupState: captureState(),
          firstInteraction: {
            eventType,
            key,
            clientX,
            clientY,
            targetTag,
            targetClass,
            targetSlotId,
            targetPlaceholderFor,
            resultingCaret: resultingCaret ? { slotId: resultingCaret.slotId, offset: resultingCaret.offset } : null,
            equationActivated,
          },
        }));
      };

      setTimeout(recordFirstInteraction, 0);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', handleFirstInteraction as any, true);
      document.addEventListener('mousedown', handleFirstInteraction as any, true);
      document.addEventListener('keydown', handleFirstInteraction as any, true);

      this.register(() => {
        cleanupListeners();
        this.firstInteractionCleanup = null;
      });
    }
  }

  public async onunload(): Promise<void> {
    if (this.firstInteractionCleanup) {
      this.firstInteractionCleanup();
      this.firstInteractionCleanup = null;
    }
    await getDebugLogger().flush();
    getDebugLogger().destroy();
    super.onunload?.();
  }

  public async activateGalleryView(): Promise<void> {
    const workspace = this.app?.workspace;
    if (!workspace) return;
    let leaf = workspace.getLeavesOfType ? workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY)[0] : null;
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf ? workspace.getRightLeaf(false) : null;
      if (rightLeaf) {
        if (rightLeaf.setViewState) {
          await rightLeaf.setViewState({
            type: VIEW_TYPE_EQUATION_GALLERY,
            active: true,
          });
        }
        leaf = rightLeaf;
      }
    }
    if (leaf && workspace.revealLeaf) {
      workspace.revealLeaf(leaf);
    }
  }

  public async hideGalleryView(): Promise<void> {
    const workspace = this.app?.workspace;
    if (!workspace) return;
    const leaves = workspace.getLeavesOfType ? workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY) : [];
    if (leaves && leaves.length > 0) {
      for (const leaf of leaves) {
        if (leaf.detach) {
          leaf.detach();
        }
      }
    }
    if (workspace.rightSplit && typeof (workspace.rightSplit as any).collapse === 'function') {
      try {
        const remaining = workspace.getLeavesOfType ? workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY) : [];
        if (remaining.length === 0) {
          (workspace.rightSplit as any).collapse();
        }
      } catch (e) {}
    }
  }

  public async toggleGalleryView(): Promise<void> {
    const workspace = this.app?.workspace;
    if (!workspace) return;
    const leaves = workspace.getLeavesOfType ? workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY) : [];
    if (leaves && leaves.length > 0) {
      for (const leaf of leaves) {
        if (leaf.detach) {
          leaf.detach();
        }
      }
    } else {
      await this.activateGalleryView();
    }
  }

  public insertMathFromGallery(snippet: string): void {
    const activeState = getActiveEquationState();
    const activeWidget = getActiveEquationWidget();
    let activeLeaf = this.app.workspace?.getActiveViewOfType?.(MarkdownView);
    if (!activeLeaf) {
      const mdLeaves = this.app.workspace?.getLeavesOfType?.('markdown') || [];
      activeLeaf = (mdLeaves[0]?.view as MarkdownView) || (this.app.workspace as any)?.getMostRecentLeaf?.()?.view;
    }
    const cmView = (activeLeaf as any)?.editor?.cm as EditorView | undefined;

    let targetWidget: WordEquationWidget | null = null;
    if (cmView) {
      targetWidget = getActiveWidget(cmView);
    }
    if (!targetWidget && activeWidget && activeWidget.isFocused) {
      targetWidget = activeWidget;
    }
    if (!targetWidget && typeof document !== 'undefined') {
      const activeEl = document.querySelector('.word-equation-math.eq-active')?.closest('[data-equation-from]') as any;
      if (activeEl?.__widget) {
        targetWidget = activeEl.__widget;
      }
    }

    if (targetWidget && (targetWidget.isFocused || (activeState && activeState.isFocused))) {
      targetWidget.insertMathSnippet(snippet, cmView);
      return;
    }

    // If no equation is active, insert a new equation block at editor cursor
    const editor =
      (activeLeaf as any)?.editor ||
      (this.app.workspace as any)?.activeLeaf?.view?.editor;
    if (editor && typeof editor.replaceSelection === 'function') {
      const delimiter = this.settings.defaultDelimiter || 'math-word';
      let xml = (snippet || '').trim();
      if (!xml.startsWith('<math') && !xml.startsWith('<?xml')) {
        xml = `<math xmlns="${MATHML_NAMESPACE}" display="block">\n  ${xml}\n</math>`;
      }
      const template = `\`\`\`${delimiter}\n${xml}\n\`\`\`\n`;
      editor.replaceSelection(template);
    }
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    setCustomShortcuts(this.settings.customShortcuts);
    getDebugLogger().setEnabled(this.settings.debugMode);
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    setCustomShortcuts(this.settings.customShortcuts);
    getDebugLogger().setEnabled(this.settings.debugMode);
  }
}

