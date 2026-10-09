/**
 * Obsidian Settings Tab for Word-like Equation Plugin
 * Features a 2-column table for defining custom shortcuts (Trigger & MathML / Expansion Result).
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type WordEquationPlugin from '../main';
import { setCustomShortcuts, CustomShortcut } from '../shortcuts/catalog';
import { DomRenderer } from '../editor/dom-renderer';
import { parseMathML } from '../core/mathml-parser';
import { parseLinearEquation } from '../core/linear-parser';
import { SlotNode, MATHML_NAMESPACE } from '../core/types';
import { InteractiveEquationBox } from './interactive-box';
import { getDebugLogger } from '../debug/debug-logger';

export function renderExpansionPreview(expansion: string, container: HTMLElement): void {
  if (typeof (container as any).empty === 'function') {
    (container as any).empty();
  } else {
    container.innerHTML = '';
  }

  const trimmed = (expansion || '').trim();
  if (!trimmed) {
    const placeholder = container.createSpan
      ? container.createSpan({ cls: 'weq-preview-empty', text: '⬚' })
      : document.createElement('span');
    if (!container.createSpan) {
      placeholder.className = 'weq-preview-empty';
      placeholder.textContent = '⬚';
      container.appendChild(placeholder);
    }
    placeholder.style.color = 'var(--text-muted)';
    return;
  }

  try {
    let ast: SlotNode;
    if (trimmed.startsWith('<math') || trimmed.includes('</math>') || trimmed.startsWith('<m')) {
      ast = parseMathML(trimmed);
    } else {
      ast = parseLinearEquation(trimmed);
    }

    const renderer = new DomRenderer();
    const rendered = renderer.render(ast, {
      readOnly: true,
      inline: true,
      isFocused: false,
    });
    container.appendChild(rendered);

    // Also include native MathML element if MathML string was provided
    if (trimmed.includes('<math') || trimmed.includes('<m')) {
      try {
        let cleanXml = trimmed;
        if (!cleanXml.startsWith('<math') && !cleanXml.startsWith('<?xml')) {
          cleanXml = `<math xmlns="${MATHML_NAMESPACE}">${cleanXml}</math>`;
        }
        const parser = new DOMParser();
        let doc = parser.parseFromString(cleanXml, 'text/html');
        let mathNode: Element | null = doc.querySelector('math');
        if (!mathNode) {
          doc = parser.parseFromString(cleanXml, 'application/xml');
          mathNode =
            doc.querySelector('math') ||
            (doc.documentElement && doc.documentElement.localName?.toLowerCase() === 'math' ? doc.documentElement : null) ||
            doc.getElementsByTagName('math')[0] ||
            doc.getElementsByTagNameNS('*', 'math')[0] ||
            null;
        }
        if (mathNode) {
          const imported = (document.importNode ? document.importNode(mathNode, true) : mathNode.cloneNode(true)) as HTMLElement;
          imported.classList.add('weq-native-mathml');
          if (imported.style) {
            imported.style.display = 'none';
          } else {
            imported.setAttribute('style', 'display: none;');
          }
          container.appendChild(imported);
        }
      } catch {}
    }
  } catch {
    const errSpan = container.createSpan
      ? container.createSpan({ text: trimmed })
      : document.createElement('span');
    if (!container.createSpan) {
      errSpan.textContent = trimmed;
      container.appendChild(errSpan);
    }
    errSpan.style.color = 'var(--text-muted)';
  }
}

export class WordEquationSettingTab extends PluginSettingTab {
  public plugin: WordEquationPlugin;
  public id: string;

  constructor(app: App, plugin: WordEquationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.id = 'obsidian-word-equation';
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Word-like Equation Settings' });

    new Setting(containerEl)
      .setName('Auto-expand shortcuts in Markdown')
      .setDesc('Automatically expand shortcuts when typing trigger followed by Space')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoExpandShortcuts)
          .onChange(async (val) => {
            this.plugin.settings.autoExpandShortcuts = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default codeblock fence identifier')
      .setDesc('Preferred identifier for inserted equation blocks (math-word or weq)')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('math-word', 'math-word')
          .addOption('weq', 'weq')
          .setValue(this.plugin.settings.defaultDelimiter)
          .onChange(async (value: 'math-word' | 'weq') => {
            this.plugin.settings.defaultDelimiter = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto show gallery')
      .setDesc('Automatically open the Equation Gallery sidebar when an equation becomes active')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoShowGallery)
          .onChange(async (val) => {
            this.plugin.settings.autoShowGallery = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable Debug Mode')
      .setDesc('Record detailed state information (caret, selection, clipboard, navigation) to debug-log.json')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (val) => {
            this.plugin.settings.debugMode = val;
            await this.plugin.saveSettings();
            getDebugLogger().setEnabled(val);
          })
      );

    new Setting(containerEl)
      .setName('Clear Debug Log')
      .setDesc('Clear recorded debug events and reset debug-log.json')
      .addButton((btn) =>
        btn
          .setButtonText('Clear Log')
          .setWarning()
          .onClick(async () => {
            await getDebugLogger().clear();
            new Notice('Debug log cleared.');
          })
      );

    containerEl.createEl('h3', { text: 'Custom Math Shortcuts' });
    containerEl.createEl('p', {
      text: 'Define custom shortcuts. Column 1 is the trigger shortcut. Column 2 is the MathML equivalent or expansion result. Works in Markdown and inside equation blocks.',
      cls: 'setting-item-description',
    });

    const tableWrapper = containerEl.createDiv({ cls: 'weq-shortcuts-table-wrapper' });
    const table = tableWrapper.createEl('table', { cls: 'weq-shortcuts-table' });
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    // Header row with 2 main columns: Trigger Shortcut and MathML / Expansion Result
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');

    const thTrigger = headerRow.createEl('th', { text: 'Trigger Shortcut' });
    thTrigger.style.textAlign = 'left';
    thTrigger.style.width = '35%';
    thTrigger.style.padding = '8px';

    const thExpansion = headerRow.createEl('th', { text: 'MathML / Expansion Result' });
    thExpansion.style.textAlign = 'left';
    thExpansion.style.width = '50%';
    thExpansion.style.padding = '8px';

    const thActions = headerRow.createEl('th', { text: 'Actions' });
    thActions.style.textAlign = 'center';
    thActions.style.width = '15%';
    thActions.style.padding = '8px';

    const tbody = table.createEl('tbody');
    const shortcuts = this.plugin.settings.customShortcuts;

    for (let i = 0; i < shortcuts.length; i++) {
      const item = shortcuts[i];
      const row = tbody.createEl('tr');
      row.style.borderBottom = '1px solid var(--background-modifier-border)';

      // Column 1: Trigger Shortcut
      const tdTrigger = row.createEl('td', { cls: 'weq-col-trigger' });
      tdTrigger.style.padding = '6px';
      const inputTrigger = tdTrigger.createEl('input', {
        type: 'text',
        value: item.trigger,
        cls: 'weq-input-trigger',
      });
      inputTrigger.style.width = '100%';
      inputTrigger.placeholder = '\\trigger';
      inputTrigger.addEventListener('input', async () => {
        item.trigger = inputTrigger.value;
        await this.plugin.saveSettings();
        setCustomShortcuts(this.plugin.settings.customShortcuts);
      });

      // Column 2: MathML / Expansion Result (Single Fully Editable Visual Equation Box)
      const tdExp = row.createEl('td', { cls: 'weq-col-expansion' });
      tdExp.style.padding = '6px';

      const previewEl = tdExp.createDiv({ cls: 'weq-expansion-preview' });

      // Keep hidden input for programmatic test and backward compatibility
      const inputExp = tdExp.createEl('input', {
        type: 'text',
        value: item.expansion,
        cls: 'weq-input-expansion',
      });
      inputExp.style.display = 'none';

      const interactiveBox = new InteractiveEquationBox({
        container: previewEl,
        initialContent: item.expansion,
        onChange: async (newXml: string) => {
          item.expansion = newXml;
          inputExp.value = newXml;
          await this.plugin.saveSettings();
          setCustomShortcuts(this.plugin.settings.customShortcuts);
        },
      });

      inputExp.addEventListener('input', async () => {
        item.expansion = inputExp.value;
        interactiveBox.setContent(item.expansion);
        await this.plugin.saveSettings();
        setCustomShortcuts(this.plugin.settings.customShortcuts);
      });

      previewEl.addEventListener('click', () => {
        if (typeof inputExp.focus === 'function') {
          inputExp.focus();
        }
        interactiveBox.dom.focus({ preventScroll: true });
      });

      // Column 3: Actions (Delete)
      const tdAct = row.createEl('td', { cls: 'weq-col-action' });
      tdAct.style.padding = '6px';
      tdAct.style.textAlign = 'center';
      const delBtn = tdAct.createEl('button', {
        text: 'Delete',
        cls: 'mod-warning weq-btn-delete',
      });
      delBtn.addEventListener('click', async () => {
        this.plugin.settings.customShortcuts.splice(i, 1);
        await this.plugin.saveSettings();
        setCustomShortcuts(this.plugin.settings.customShortcuts);
        this.display();
      });
    }

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText('Add Shortcut')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.customShortcuts.push({
              trigger: '\\',
              expansion: '',
            });
            await this.plugin.saveSettings();
            setCustomShortcuts(this.plugin.settings.customShortcuts);
            this.display();
          })
      );
  }
}
