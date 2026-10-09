/**
 * Mock implementation of 'obsidian' module for Vitest headless tests.
 */

import { StateField } from '@codemirror/state';

// Extend HTMLElement prototype with Obsidian DOM helper methods if running in JSDOM
if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.createEl) {
    HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: { text?: string; cls?: string; attr?: Record<string, string>; type?: string; placeholder?: string; value?: string }
    ): HTMLElementTagNameMap[K] {
      const el = document.createElement(tag);
      if (o?.text) el.textContent = o.text;
      if (o?.cls) el.className = o.cls;
      if (o?.type && 'type' in el) (el as any).type = o.type;
      if (o?.placeholder && 'placeholder' in el) (el as any).placeholder = o.placeholder;
      if (o?.value && 'value' in el) (el as any).value = o.value;
      if (o?.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          el.setAttribute(k, v);
        }
      }
      this.appendChild(el);
      return el;
    };
  }

  if (!HTMLElement.prototype.createDiv) {
    HTMLElement.prototype.createDiv = function (o?: any): HTMLDivElement {
      return (this as HTMLElement).createEl('div', o);
    };
  }

  if (!HTMLElement.prototype.createSpan) {
    HTMLElement.prototype.createSpan = function (o?: any): HTMLSpanElement {
      return (this as HTMLElement).createEl('span', o);
    };
  }

  if (!HTMLElement.prototype.empty) {
    HTMLElement.prototype.empty = function (): void {
      this.innerHTML = '';
    };
  }

  if (!(HTMLElement.prototype as any).addClass) {
    (HTMLElement.prototype as any).addClass = function (...classes: string[]): void {
      for (const c of classes) {
        if (c) {
          const parts = c.split(/\s+/);
          for (const p of parts) {
            if (p) this.classList.add(p);
          }
        }
      }
    };
  }

  if (!(HTMLElement.prototype as any).removeClass) {
    (HTMLElement.prototype as any).removeClass = function (...classes: string[]): void {
      for (const c of classes) {
        if (c) {
          const parts = c.split(/\s+/);
          for (const p of parts) {
            if (p) this.classList.remove(p);
          }
        }
      }
    };
  }
}

/**
 * Obsidian Live Preview detection state field.
 * true = Live Preview, false = Source Mode.
 */
export const editorLivePreviewField = StateField.define<boolean>({
  create() {
    return true;
  },
  update(val, tr) {
    for (const eff of tr.effects) {
      if (eff.is(setLivePreviewEffect)) {
        return eff.value;
      }
    }
    return val;
  },
});

import { StateEffect } from '@codemirror/state';
export const setLivePreviewEffect = StateEffect.define<boolean>();

export class Plugin {
  public app: any;
  public manifest: any;
  public _commands: any[] = [];
  public _views: Map<string, (leaf: any) => any> = new Map();
  public _cleanups: (() => void)[] = [];

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  public registerView(type: string, viewCreator: (leaf: any) => any): void {
    this._views.set(type, viewCreator);
  }

  public registerEditorExtension(ext: any): void {}
  public registerMarkdownCodeBlockProcessor(type: string, handler: any): void {}
  public registerMarkdownPostProcessor(handler: any): void {}
  public addCommand(cmd: any): void {
    this._commands.push(cmd);
    if (this.app?.commands?.commands) {
      if (this.app.commands.commands instanceof Map) {
        this.app.commands.commands.set(cmd.id, cmd);
        this.app.commands.commands.set(`obsidian-word-equation:${cmd.id}`, cmd);
      } else {
        this.app.commands.commands[cmd.id] = cmd;
        try {
          Object.defineProperty(this.app.commands.commands, `obsidian-word-equation:${cmd.id}`, {
            value: cmd,
            enumerable: false,
            configurable: true,
            writable: true,
          });
        } catch {
          this.app.commands.commands[`obsidian-word-equation:${cmd.id}`] = cmd;
        }
      }
    }
  }
  public addSettingTab(tab: any): void {}
  public register(cleanup: any): void {
    if (typeof cleanup === 'function') {
      this._cleanups.push(cleanup);
    }
  }
  public _data: any = {};
  public async loadData(): Promise<any> {
    return this._data || {};
  }
  public async saveData(data: any): Promise<void> {
    this._data = Object.assign({}, data);
  }
  public onunload(): void {
    for (const fn of this._cleanups) {
      try {
        fn();
      } catch {}
    }
    this._cleanups = [];
  }
}

export class PluginSettingTab {
  public app: any;
  public plugin: any;
  public containerEl: HTMLElement;

  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  public display(): void {}
  public hide(): void {}
}

export class Setting {
  public settingEl: HTMLElement;
  public infoEl: HTMLElement;
  public nameEl: HTMLElement;
  public descEl: HTMLElement;
  public controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv ? containerEl.createDiv({ cls: 'setting-item' }) : document.createElement('div');
    if (!containerEl.createDiv) containerEl.appendChild(this.settingEl);
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    this.settingEl.appendChild(this.infoEl);
    this.infoEl.appendChild(this.nameEl);
    this.infoEl.appendChild(this.descEl);
    this.settingEl.appendChild(this.controlEl);
  }

  public setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  public setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  public addToggle(cb: (toggle: any) => any): this {
    const toggle = {
      setValue: (val: boolean) => toggle,
      onChange: (fn: (val: boolean) => any) => toggle,
    };
    cb(toggle);
    return this;
  }

  public addDropdown(cb: (dropdown: any) => any): this {
    const dropdown = {
      addOption: (val: string, display: string) => dropdown,
      setValue: (val: string) => dropdown,
      onChange: (fn: (val: any) => any) => dropdown,
    };
    cb(dropdown);
    return this;
  }

  public addButton(cb: (btn: any) => any): this {
    const buttonEl = document.createElement('button');
    this.controlEl.appendChild(buttonEl);
    const btn = {
      setButtonText: (txt: string) => {
        buttonEl.textContent = txt;
        return btn;
      },
      setCta: () => {
        buttonEl.classList.add('mod-cta');
        return btn;
      },
      setWarning: () => {
        buttonEl.classList.add('mod-warning');
        return btn;
      },
      onClick: (fn: () => any) => {
        buttonEl.addEventListener('click', fn);
        return btn;
      },
    };
    cb(btn);
    return this;
  }
}

export class WorkspaceLeaf {
  public view: any = null;
  public app: any;
  public containerEl: HTMLElement;
  private _viewState: any = { type: 'empty' };

  constructor(app?: any) {
    this.app = app;
    this.containerEl = document.createElement('div');
  }

  public async openFile(file: any, state?: any): Promise<void> {
    return Promise.resolve();
  }

  public async setViewState(state: any): Promise<void> {
    this._viewState = state;
    return Promise.resolve();
  }

  public getViewState(): any {
    return this._viewState;
  }

  public detach(): void {
    if (this.app?.workspace?.removeLeaf) {
      this.app.workspace.removeLeaf(this);
    }
  }
}

export class View {
  public app: any;
  public leaf: WorkspaceLeaf;
  public containerEl: HTMLElement;
  public file: any = null;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = document.createElement('div');
    if (leaf) {
      leaf.view = this;
    }
  }

  public async onOpen(): Promise<void> {}
  public async onClose(): Promise<void> {}
}

export class ItemView extends View {
  public contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = document.createElement('div');
    this.containerEl.appendChild(this.contentEl);
  }

  public getViewType(): string {
    return 'item-view';
  }

  public getDisplayText(): string {
    return 'Item View';
  }

  public getIcon(): string {
    return 'document';
  }
}

export class Editor {
  private _content: string = '';

  public replaceSelection(text: string): void {
    this._content += text;
  }

  public getValue(): string {
    return this._content;
  }

  public setValue(text: string): void {
    this._content = text;
  }

  public getSelection(): string {
    return '';
  }
}

export class MarkdownView extends View {
  public editor: Editor;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.editor = new Editor();
  }
}

export class Workspace {
  public leaves: WorkspaceLeaf[] = [];
  public activeLeaf: WorkspaceLeaf | null = null;
  public activeView: any = null;

  public getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.getViewState()?.type === type);
  }

  public getRightLeaf(split?: boolean): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf({ workspace: this });
    this.leaves.push(leaf);
    return leaf;
  }

  public revealLeaf(leaf: WorkspaceLeaf): void {
    this.activeLeaf = leaf;
  }

  public getActiveViewOfType<T>(type: any): T | null {
    if (this.activeView instanceof type) {
      return this.activeView as T;
    }
    if (this.activeLeaf?.view instanceof type) {
      return this.activeLeaf.view as T;
    }
    return null;
  }

  public getActiveFile(): TFile | null {
    if (this.activeLeaf?.view?.file) return this.activeLeaf.view.file;
    if (this.activeView?.file) return this.activeView.file;
    return null;
  }

  public removeLeaf(leaf: WorkspaceLeaf): void {
    const idx = this.leaves.indexOf(leaf);
    if (idx !== -1) {
      this.leaves.splice(idx, 1);
    }
  }

  public onLayoutReady(cb: () => any): void {
    cb();
  }

  public on(event: string, cb: any): void {}
}

export class Notice {
  public message: string;
  public duration?: number;
  public static notices: Notice[] = [];
  constructor(message: string, duration?: number) {
    this.message = message;
    this.duration = duration;
    Notice.notices.push(this);
  }
}

export class TFile {
  public path: string;
  public basename: string;
  public extension: string;
  constructor(path: string = 'test.md') {
    this.path = path;
    this.basename = path.replace(/\.[^/.]+$/, '');
    this.extension = path.split('.').pop() || 'md';
  }
}

export class MockDataAdapter {
  public files: Map<string, string> = new Map();

  public async read(normalizedPath: string): Promise<string> {
    const content = this.files.get(normalizedPath);
    if (content === undefined) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    return content;
  }

  public async write(normalizedPath: string, data: string): Promise<void> {
    this.files.set(normalizedPath, data);
  }

  public async exists(normalizedPath: string): Promise<boolean> {
    return this.files.has(normalizedPath);
  }

  public async append(normalizedPath: string, data: string): Promise<void> {
    const prev = this.files.get(normalizedPath) ?? '';
    this.files.set(normalizedPath, prev + data);
  }

  public async remove(normalizedPath: string): Promise<void> {
    this.files.delete(normalizedPath);
  }
}

export class Vault {
  public files: Map<string, string> = new Map();
  public configDir: string = '.obsidian';
  public adapter: MockDataAdapter = new MockDataAdapter();

  public async read(file: TFile | any): Promise<string> {
    const p = typeof file === 'string' ? file : file?.path ?? '';
    return this.files.get(p) ?? '';
  }
  public async modify(file: TFile | any, data: string): Promise<void> {
    const p = typeof file === 'string' ? file : file?.path ?? '';
    this.files.set(p, data);
  }
  public getMarkdownFiles(): TFile[] {
    const arr: TFile[] = [];
    for (const k of this.files.keys()) {
      if (k.endsWith('.md')) {
        arr.push(new TFile(k));
      }
    }
    return arr;
  }
}

export class App {
  public vault: Vault = new Vault();
  public workspace: Workspace = new Workspace();
  public commands: any = {
    commands: new Map<string, any>(),
    listCommands: () => {
      const cmds = this.commands.commands;
      if (cmds instanceof Map) {
        return Array.from(cmds.values());
      }
      return Object.values(cmds);
    },
    executeCommandById: (id: string) => {
      const cmd = this.commands.commands.get(id);
      if (cmd?.callback) return cmd.callback();
      if (cmd?.editorCallback) {
        const view = this.workspace.getActiveViewOfType(MarkdownView);
        if (view) return cmd.editorCallback((view as any).editor);
      }
    },
  };
}

export type MarkdownPostProcessorContext = any;
