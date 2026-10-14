/**
 * Gallery Creation Modal Dialogs
 * Provides native Obsidian Modal dialogs for creating custom tabs and sections.
 */

import { Modal } from 'obsidian';
import type { App } from 'obsidian';

/**
 * Obsidian Modal prompt for gathering a name when adding a Tab or Section.
 */
export class GalleryPromptModal extends Modal {
  private title: string;
  private placeholder: string;
  private defaultValue: string;
  private onSubmit: (result: string) => void;
  private value: string = '';

  constructor(
    app: App,
    title: string,
    placeholder: string,
    defaultValue: string,
    onSubmit: (result: string) => void
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.defaultValue = defaultValue;
    this.value = defaultValue;
    this.onSubmit = onSubmit;
  }

  public onOpen(): void {
    const { contentEl } = this;
    if (typeof (contentEl as any).empty === 'function') {
      (contentEl as any).empty();
    } else {
      contentEl.innerHTML = '';
    }

    if (typeof (contentEl as any).addClass === 'function') {
      (contentEl as any).addClass('weq-gallery-prompt-modal');
    } else {
      contentEl.classList.add('weq-gallery-prompt-modal');
    }

    const titleEl = contentEl.createEl
      ? contentEl.createEl('h3', { text: this.title })
      : document.createElement('h3');
    if (!contentEl.createEl) {
      titleEl.textContent = this.title;
      contentEl.appendChild(titleEl);
    }

    // Input container
    const inputContainer = contentEl.createDiv
      ? contentEl.createDiv({ cls: 'weq-gallery-modal-input-row' })
      : document.createElement('div');
    if (!contentEl.createDiv) {
      inputContainer.className = 'weq-gallery-modal-input-row';
      contentEl.appendChild(inputContainer);
    }

    const input = inputContainer.createEl
      ? inputContainer.createEl('input', {
          type: 'text',
          cls: 'weq-gallery-modal-input',
          value: this.defaultValue,
        })
      : document.createElement('input');
    if (!inputContainer.createEl) {
      input.type = 'text';
      input.className = 'weq-gallery-modal-input';
      input.value = this.defaultValue;
      inputContainer.appendChild(input);
    }
    input.placeholder = this.placeholder;

    input.addEventListener('input', () => {
      this.value = input.value;
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    // Buttons
    const btnRow = contentEl.createDiv
      ? contentEl.createDiv({ cls: 'weq-gallery-modal-btn-row' })
      : document.createElement('div');
    if (!contentEl.createDiv) {
      btnRow.className = 'weq-gallery-modal-btn-row';
      contentEl.appendChild(btnRow);
    }

    const createBtn = btnRow.createEl
      ? btnRow.createEl('button', {
          text: 'Create',
          cls: 'mod-cta weq-gallery-modal-submit-btn',
          attr: { type: 'button' },
        })
      : document.createElement('button');
    if (!btnRow.createEl) {
      createBtn.textContent = 'Create';
      createBtn.className = 'mod-cta weq-gallery-modal-submit-btn';
      createBtn.type = 'button';
      btnRow.appendChild(createBtn);
    }
    createBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      this.submit();
    });

    const cancelBtn = btnRow.createEl
      ? btnRow.createEl('button', {
          text: 'Cancel',
          cls: 'weq-gallery-modal-cancel-btn',
          attr: { type: 'button' },
        })
      : document.createElement('button');
    if (!btnRow.createEl) {
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'weq-gallery-modal-cancel-btn';
      cancelBtn.type = 'button';
      btnRow.appendChild(cancelBtn);
    }
    cancelBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      this.close();
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 20);
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed) {
      this.onSubmit(trimmed);
    }
    this.close();
  }

  public onClose(): void {
    if (typeof (this.contentEl as any).empty === 'function') {
      (this.contentEl as any).empty();
    } else {
      this.contentEl.innerHTML = '';
    }
  }
}

/**
 * Helper to prompt user for a name asynchronously via Modal dialog.
 */
export function promptGalleryName(
  app: App,
  title: string,
  placeholder: string,
  defaultValue: string = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const modal = new GalleryPromptModal(app, title, placeholder, defaultValue, (res) => {
      resolved = true;
      resolve(res);
    });

    const origClose = modal.close.bind(modal);
    modal.close = () => {
      origClose();
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    };

    modal.open();
  });
}
