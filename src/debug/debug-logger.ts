/**
 * Debug Logger Subsystem for Obsidian Word-like Equation Plugin
 * Provides zero-overhead fast-branching event recording and debounced persistence
 * to .obsidian/plugins/obsidian-word-equation/debug-log.json.
 */

import { App } from 'obsidian';

export type DebugEventType =
  | 'initialization'
  | 'caret'
  | 'selection'
  | 'clipboard'
  | 'navigation'
  | 'conversion'
  | 'keydown'
  | 'boundary'
  | 'navigation_unhandled'
  | 'placeholder'
  | 'focus'
  | 'mutation'
  | 'transaction'
  | 'pointer'
  | 'mouse';

export interface DebugEvent {
  timestamp: string;
  type: DebugEventType;
  details: Record<string, any>;
  data?: Record<string, any>;
}

export const POINTER_MOUSE_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'mousedown',
  'mousemove',
  'mouseup',
] as const;

let _registeredPointerMouseListeners: Array<{
  type: string;
  phase: 'capture' | 'bubble';
  listener: (e: any) => void;
  useCapture: boolean;
}> = [];

// Module-level primitive boolean for sub-nanosecond fast-branch check
let _isDebugModeEnabled = false;
let _globalTelemetryAttached = false;
let _onKeyDownCapture: ((e: KeyboardEvent) => void) | null = null;
let _onKeyDownBubble: ((e: KeyboardEvent) => void) | null = null;
let _onFocusInCapture: ((e: FocusEvent) => void) | null = null;
let _onFocusOutCapture: ((e: FocusEvent) => void) | null = null;
let _onBeforeUnload: (() => void) | null = null;
let _onVisibilityChange: (() => void) | null = null;
const _activeMutationObservers: Set<MutationObserver> = new Set();

export function getActiveMutationObserversCount(): number {
  return _activeMutationObservers.size;
}

export function getActivePointerMouseListenersCount(): number {
  return _registeredPointerMouseListeners.length;
}

export function isGlobalTelemetryAttached(): boolean {
  return _globalTelemetryAttached;
}

function createPointerMouseHandler(eventName: string, phase: 'capture' | 'bubble') {
  return (e: Event) => {
    if (!_isDebugModeEnabled) return;
    const me = e as MouseEvent | PointerEvent;
    const target = me.target as HTMLElement | null;
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const activeState = typeof window !== 'undefined' ? (window as any).__eqActiveState : undefined;
    const isFocused = Boolean(activeState?.isFocused);
    const isTargetEquation = Boolean(
      target?.closest?.('.word-equation-math, .word-equation-block, .word-equation-inline, .cm-word-equation-widget')
    );
    const hasActiveSelection = Boolean(activeState?.selection);
    const activeWidget = typeof window !== 'undefined' ? (window as any).__eqActiveWidget : undefined;
    const isSelectionRetained = Boolean(activeWidget?.selection);

    const type: DebugEventType = eventName.startsWith('pointer') ? 'pointer' : 'mouse';
    logDebugEvent(type, () => ({
      eventType: eventName,
      phase,
      clientX: me.clientX,
      clientY: me.clientY,
      buttons: me.buttons,
      button: me.button,
      defaultPrevented: me.defaultPrevented,
      cancelBubble: me.cancelBubble,
      isPropagationStopped: Boolean(me.cancelBubble || (me as any).defaultPrevented),
      targetTag: target?.tagName?.toLowerCase(),
      targetClass: target?.className,
      isTargetEquation,
      activeElementTag: activeEl?.tagName?.toLowerCase(),
      activeElementClass: activeEl?.className,
      isFocused,
      hasActiveSelection,
      isSelectionRetained,
    }));
  };
}

export function attachEquationMutationObserver(container: HTMLElement): MutationObserver | null {
  if (!_isDebugModeEnabled) return null;
  if (typeof MutationObserver === 'undefined' || !container) return null;

  try {
    const observer = new MutationObserver((mutations: MutationRecord[]) => {
      if (!_isDebugModeEnabled) {
        observer.disconnect();
        _activeMutationObservers.delete(observer);
        return;
      }
      try {
        for (const mutation of mutations) {
          const targetEl = mutation.target as HTMLElement | null;
          logDebugEvent('boundary', () => ({
            eventCategory: 'dom_mutation',
            mutationType: mutation.type,
            targetTag: targetEl?.tagName?.toLowerCase?.(),
            targetClass: targetEl?.className,
            addedNodes: Array.from(mutation.addedNodes).map((n) => (n as HTMLElement).className || n.nodeName),
            removedNodes: Array.from(mutation.removedNodes).map((n) => (n as HTMLElement).className || n.nodeName),
            attributeName: mutation.attributeName || undefined,
            hasVisualCaret: Boolean(container.querySelector?.('.eq-caret')),
            hasActiveMath: Boolean(container.querySelector?.('.word-equation-math.eq-active')),
          }));
        }
      } catch (err) {
        console.error('[WordEquation] Telemetry error:', err);
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-slot-id', 'tabindex'],
    });

    _activeMutationObservers.add(observer);
    return observer;
  } catch (err) {
    console.error('[WordEquation] Failed to create MutationObserver:', err);
    return null;
  }
}

export function disconnectEquationMutationObserver(observer: MutationObserver | null): void {
  if (!observer) return;
  try {
    observer.disconnect();
  } catch {}
  _activeMutationObservers.delete(observer);
}

function setupGlobalTelemetry(): void {
  if (typeof window === 'undefined' || _globalTelemetryAttached) return;
  _globalTelemetryAttached = true;

  // 1. Capture-phase keydown tracking (Requirement 1 & Requirement 5)
  _onKeyDownCapture = (e: KeyboardEvent) => {
    if (!_isDebugModeEnabled) return;
    const target = e.target as HTMLElement | null;
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const activeState = typeof window !== 'undefined' ? (window as any).__eqActiveState : undefined;
    const isFocused = Boolean(activeState?.isFocused);
    logDebugEvent('keydown', () => ({
      phase: 'capture',
      key: e.key,
      code: e.code,
      defaultPrevented: e.defaultPrevented,
      cancelBubble: e.cancelBubble,
      isPropagationStopped: Boolean(e.cancelBubble || (e as any).defaultPrevented),
      targetTag: target?.tagName?.toLowerCase(),
      targetClass: target?.className,
      activeElementTag: activeEl?.tagName?.toLowerCase(),
      activeElementClass: activeEl?.className,
      isFocused,
      isComposing: e.isComposing,
    }));
  };
  window.addEventListener('keydown', _onKeyDownCapture, true);

  // 2. Bubble-phase keydown tracking
  _onKeyDownBubble = (e: KeyboardEvent) => {
    if (!_isDebugModeEnabled) return;
    const activeState = typeof window !== 'undefined' ? (window as any).__eqActiveState : undefined;
    const isFocused = Boolean(activeState?.isFocused);
    if (!isFocused) return;
    const target = e.target as HTMLElement | null;
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    logDebugEvent('keydown', () => ({
      phase: 'bubble',
      key: e.key,
      code: e.code,
      defaultPrevented: e.defaultPrevented,
      cancelBubble: e.cancelBubble,
      isPropagationStopped: Boolean(e.cancelBubble),
      targetTag: target?.tagName?.toLowerCase(),
      targetClass: target?.className,
      activeElementTag: activeEl?.tagName?.toLowerCase(),
      activeElementClass: activeEl?.className,
      isFocused,
      isComposing: e.isComposing,
    }));
  };
  window.addEventListener('keydown', _onKeyDownBubble, false);

  // 3. DOM Focus shift tracking (Requirement 3 & Requirement 5)
  const handleFocusTransition = (e: FocusEvent) => {
    if (!_isDebugModeEnabled) return;
    const target = e.target as HTMLElement | null;
    const related = e.relatedTarget as HTMLElement | null;

    const targetTag = target?.tagName?.toLowerCase();
    const targetClass = target?.className;
    const relatedTag = related?.tagName?.toLowerCase();
    const relatedClass = related?.className;

    const fromTag = e.type === 'focusout' ? targetTag : relatedTag;
    const fromClass = e.type === 'focusout' ? targetClass : relatedClass;
    const toTag = e.type === 'focusin' ? targetTag : relatedTag;
    const toClass = e.type === 'focusin' ? targetClass : relatedClass;

    const isTargetEq = Boolean(target?.closest?.('.word-equation-math, .word-equation-block, .word-equation-inline, .cm-word-equation-widget'));
    const isRelatedEq = Boolean(related?.closest?.('.word-equation-math, .word-equation-block, .word-equation-inline, .cm-word-equation-widget'));
    const isTargetCm = Boolean(target?.closest?.('.cm-content, .cm-editor'));
    const isRelatedCm = Boolean(related?.closest?.('.cm-content, .cm-editor'));

    if (!isTargetEq && !isRelatedEq && !isTargetCm && !isRelatedCm) {
      return;
    }

    let focusShiftType = 'other';
    if (isRelatedCm && isTargetEq) {
      focusShiftType = 'cm_to_equation';
    } else if (isRelatedEq && isTargetCm) {
      focusShiftType = 'equation_to_cm';
    } else if (isTargetEq && isRelatedEq) {
      focusShiftType = 'equation_internal';
    } else if (isTargetCm && !isRelatedCm && !isRelatedEq) {
      focusShiftType = 'external_to_cm';
    } else if (isRelatedCm && !isTargetCm && !isTargetEq) {
      focusShiftType = 'cm_to_external';
    } else if (isRelatedEq && !isTargetCm && !isTargetEq) {
      focusShiftType = 'equation_to_external';
    }

    const visualCarets = typeof document !== 'undefined' ? document.querySelectorAll('.eq-caret') : [];
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    const hasCmFocus = Boolean(activeElement?.closest('.cm-content, .cm-editor'));
    const isDualCaretAnomaly = visualCarets.length > 0 && hasCmFocus;

    logDebugEvent('focus', () => ({
      eventType: e.type,
      focusShiftType,
      fromTag,
      fromClass,
      toTag,
      toClass,
      targetTag,
      targetClass,
      relatedTargetTag: relatedTag,
      relatedTargetClass: relatedClass,
      activeElementTag: typeof document !== 'undefined' ? document.activeElement?.tagName?.toLowerCase() : undefined,
      visualCaretCount: visualCarets.length,
      isDualCaretAnomaly,
    }));
  };

  _onFocusInCapture = handleFocusTransition;
  _onFocusOutCapture = handleFocusTransition;
  window.addEventListener('focusin', _onFocusInCapture, true);
  window.addEventListener('focusout', _onFocusOutCapture, true);

  // 4. Reliable flush triggers
  _onBeforeUnload = () => {
    if (!_isDebugModeEnabled) return;
    void DebugLogger.getInstance().flush();
  };
  window.addEventListener('beforeunload', _onBeforeUnload);

  if (typeof document !== 'undefined') {
    _onVisibilityChange = () => {
      if (!_isDebugModeEnabled) return;
      if (document.visibilityState === 'hidden') {
        void DebugLogger.getInstance().flush();
      }
    };
    document.addEventListener('visibilitychange', _onVisibilityChange);
  }

  // 5. Global pointer & mouse event tracking (capture & bubble phases)
  for (const evtName of POINTER_MOUSE_EVENTS) {
    const captureHandler = createPointerMouseHandler(evtName, 'capture');
    window.addEventListener(evtName, captureHandler, true);
    _registeredPointerMouseListeners.push({
      type: evtName,
      phase: 'capture',
      listener: captureHandler,
      useCapture: true,
    });

    const bubbleHandler = createPointerMouseHandler(evtName, 'bubble');
    window.addEventListener(evtName, bubbleHandler, false);
    _registeredPointerMouseListeners.push({
      type: evtName,
      phase: 'bubble',
      listener: bubbleHandler,
      useCapture: false,
    });
  }
}

export function teardownGlobalTelemetry(): void {
  if (typeof window !== 'undefined') {
    if (_onKeyDownCapture) window.removeEventListener('keydown', _onKeyDownCapture, true);
    if (_onKeyDownBubble) window.removeEventListener('keydown', _onKeyDownBubble, false);
    if (_onFocusInCapture) window.removeEventListener('focusin', _onFocusInCapture, true);
    if (_onFocusOutCapture) window.removeEventListener('focusout', _onFocusOutCapture, true);
    if (_onBeforeUnload) window.removeEventListener('beforeunload', _onBeforeUnload);

    for (const item of _registeredPointerMouseListeners) {
      try {
        window.removeEventListener(item.type, item.listener, item.useCapture);
      } catch {}
    }
  }
  if (typeof document !== 'undefined') {
    if (_onVisibilityChange) document.removeEventListener('visibilitychange', _onVisibilityChange);
  }
  _registeredPointerMouseListeners = [];
  _onKeyDownCapture = null;
  _onKeyDownBubble = null;
  _onFocusInCapture = null;
  _onFocusOutCapture = null;
  _onBeforeUnload = null;
  _onVisibilityChange = null;
  _globalTelemetryAttached = false;

  for (const observer of _activeMutationObservers) {
    try {
      observer.disconnect();
    } catch {}
  }
  _activeMutationObservers.clear();
}

export class DebugLogger {
  private static instance: DebugLogger | null = null;
  private enabled: boolean = false;
  private app: App | null = null;
  private manifestId: string = 'obsidian-word-equation';
  private events: DebugEvent[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private isWriting: boolean = false;
  private pendingFlush: boolean = false;

  private constructor() {
    this.syncWindowBridge();
  }

  public static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  public init(app: App, manifestId: string, enabled: boolean): void {
    this.app = app;
    this.manifestId = manifestId || 'obsidian-word-equation';
    this.setEnabled(enabled);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    _isDebugModeEnabled = enabled;
    if (enabled) {
      setupGlobalTelemetry();
    } else {
      teardownGlobalTelemetry();
    }
    this.syncWindowBridge();
  }

  public setDebugMode(enabled: boolean): void {
    this.setEnabled(enabled);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getEvents(): DebugEvent[] {
    return this.events;
  }

  public record(type: DebugEventType, details: Record<string, any>, immediate: boolean = false): void {
    if (!this.enabled) return;

    const event: DebugEvent = {
      timestamp: new Date().toISOString(),
      type,
      details,
      data: details,
    };
    this.events.push(event);

    if (typeof window !== 'undefined') {
      (window as any).__eqDebugEvents = this.events;
    }

    if (immediate) {
      this.scheduleFlush(true);
    } else {
      this.scheduleFlush(false);
    }
  }

  public scheduleFlush(immediate: boolean = false): void {
    if (immediate) {
      if (this.flushTimeout !== null) {
        clearTimeout(this.flushTimeout);
        this.flushTimeout = null;
      }
      void this.flush();
      return;
    }
    if (this.flushTimeout !== null) return;
    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      void this.flush();
    }, 50);
  }

  public async flush(): Promise<void> {
    if (!this.enabled && this.events.length === 0) return;

    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    const app = this.app || (typeof window !== 'undefined' ? (window as any).app : null);
    if (!app?.vault?.adapter) {
      return;
    }

    if (this.isWriting) {
      this.pendingFlush = true;
      return;
    }

    this.isWriting = true;
    try {
      const configDir = (app.vault as any).configDir || '.obsidian';
      const logPath = `${configDir}/plugins/${this.manifestId}/debug-log.json`;
      const json = JSON.stringify(this.events, null, 2);
      await app.vault.adapter.write(logPath, json);
    } catch (err) {
      console.error('[WordEquation DebugLogger] Error persisting debug log:', err);
    } finally {
      this.isWriting = false;
      if (this.pendingFlush) {
        this.pendingFlush = false;
        await this.flush();
      }
    }
  }

  public async clear(): Promise<void> {
    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    this.events = [];
    if (typeof window !== 'undefined') {
      (window as any).__eqDebugEvents = [];
    }

    const app = this.app || (typeof window !== 'undefined' ? (window as any).app : null);
    if (app?.vault?.adapter) {
      const configDir = (app.vault as any).configDir || '.obsidian';
      const logPath = `${configDir}/plugins/${this.manifestId}/debug-log.json`;
      try {
        await app.vault.adapter.write(logPath, '[]');
      } catch (err) {
        console.error('[WordEquation DebugLogger] Error clearing debug log file:', err);
      }
    }
  }

  private syncWindowBridge(): void {
    if (typeof window !== 'undefined') {
      (window as any).__wordEquationDebugLogger = this;
      (window as any).__wordEquationDebugEnabled = this.enabled;
      (window as any).__eqDebugEvents = this.events;
    }
  }

  public resetForTesting(): void {
    teardownGlobalTelemetry();
    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    this.events = [];
    this.enabled = false;
    _isDebugModeEnabled = false;
    this.app = null;
    this.manifestId = 'obsidian-word-equation';
    this.isWriting = false;
    this.pendingFlush = false;
    this.syncWindowBridge();
  }

  public destroy(): void {
    this.resetForTesting();
    teardownGlobalTelemetry();
  }
}

/**
 * Top-level fast-branch check (< 1ns primitive variable read).
 */
export function isDebugEnabled(): boolean {
  return _isDebugModeEnabled;
}

/**
 * Top-level event logger with lazy payload evaluation support.
 * If debug mode is disabled, payloadOrFactory is never evaluated.
 */
export function logDebugEvent(
  type: DebugEventType,
  payloadOrFactory: Record<string, any> | (() => Record<string, any>),
  immediate?: boolean
): void {
  if (!_isDebugModeEnabled) return;
  try {
    const details = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    getDebugLogger().record(type, details, immediate);
  } catch (err) {
    console.error('[WordEquation] Telemetry error:', err);
  }
}

/**
 * Access the singleton DebugLogger instance.
 */
export function getDebugLogger(): DebugLogger {
  return DebugLogger.getInstance();
}
