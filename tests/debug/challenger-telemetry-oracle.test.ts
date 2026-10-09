import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Challenger Empirical Telemetry Oracle & Exactness Suite', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const bugReportPath = path.join(projectRoot, 'BUG_REPORT.md');
  const fixturePath = path.join(projectRoot, 'tests/fixtures/debug-log-gen43.json');
  const telemetryPath = fs.existsSync(fixturePath)
    ? fixturePath
    : path.join(
        projectRoot,
        'test-vault/.obsidian/plugins/obsidian-word-equation/debug-log.json'
      );

  const rawData = fs.readFileSync(telemetryPath, 'utf8');
  const events = JSON.parse(rawData);
  const bugReportContent = fs.readFileSync(bugReportPath, 'utf8');

  it('verifies telemetry existence, integrity, and event count', () => {
    expect(fs.existsSync(telemetryPath)).toBe(true);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(135);
    expect(events[0].timestamp).toBe('2026-10-02T06:45:35.367Z');
    expect(events[134].timestamp).toBe('2026-10-02T06:45:45.520Z');
  });

  it('empirically verifies event type taxonomy breakdown', () => {
    const keydowns = events.filter((e: any) => e.type === 'keydown');
    const boundaries = events.filter((e: any) => e.type === 'boundary');
    const navigations = events.filter((e: any) => e.type === 'navigation');
    const focuses = events.filter((e: any) => e.type === 'focus');
    const placeholders = events.filter((e: any) => e.type === 'placeholder');
    const selections = events.filter((e: any) => e.type === 'selection');
    const carets = events.filter((e: any) => e.type === 'caret');
    const initializations = events.filter((e: any) => e.type === 'initialization');

    expect(keydowns.length).toBe(95);
    expect(boundaries.length).toBe(23);
    expect(navigations.length).toBe(7);
    expect(focuses.length).toBe(4);
    expect(placeholders.length).toBe(0);
    expect(selections.length).toBe(4);
    expect(carets.length).toBe(2);
    expect(initializations.length).toBe(0);

    expect(keydowns.filter((e: any) => e.details?.key === 'ArrowRight').length).toBe(15);
    expect(keydowns.filter((e: any) => e.details?.key === 'ArrowLeft').length).toBe(80);
    expect(keydowns.filter((e: any) => e.details?.key === 'ArrowUp').length).toBe(0);
    expect(keydowns.filter((e: any) => e.details?.key === 'ArrowDown').length).toBe(0);
    expect(keydowns.filter((e: any) => e.details?.phase === 'capture').length).toBe(47);
    expect(keydowns.filter((e: any) => e.details?.phase === 'bubble').length).toBe(45);
    expect(keydowns.filter((e: any) => e.details?.targetTag === 'contentDOM').length).toBe(3);
    expect(keydowns.filter((e: any) => e.details?.targetTag === 'body').length).toBe(88);
    expect(keydowns.filter((e: any) => e.details?.targetTag === 'div').length).toBe(4);
  });

  it('checks timestamps of critical events cited in BUG_REPORT.md', () => {
    const citedEvents: { id: number; citedTimestamp: string; eventType: string }[] = [
      { id: 0, citedTimestamp: '2026-10-02T06:45:35.367Z', eventType: 'boundary' },
      { id: 5, citedTimestamp: '2026-10-02T06:45:35.371Z', eventType: 'focus' },
      { id: 6, citedTimestamp: '2026-10-02T06:45:35.372Z', eventType: 'navigation' },
      { id: 7, citedTimestamp: '2026-10-02T06:45:35.374Z', eventType: 'selection' },
      { id: 15, citedTimestamp: '2026-10-02T06:45:36.640Z', eventType: 'keydown' },
      { id: 18, citedTimestamp: '2026-10-02T06:45:36.643Z', eventType: 'selection' },
      { id: 21, citedTimestamp: '2026-10-02T06:45:36.997Z', eventType: 'keydown' },
      { id: 24, citedTimestamp: '2026-10-02T06:45:36.999Z', eventType: 'selection' },
      { id: 27, citedTimestamp: '2026-10-02T06:45:37.373Z', eventType: 'keydown' },
      { id: 28, citedTimestamp: '2026-10-02T06:45:37.373Z', eventType: 'keydown' },
      { id: 29, citedTimestamp: '2026-10-02T06:45:37.376Z', eventType: 'caret' },
      { id: 31, citedTimestamp: '2026-10-02T06:45:37.378Z', eventType: 'focus' },
      { id: 32, citedTimestamp: '2026-10-02T06:45:37.379Z', eventType: 'focus' },
      { id: 33, citedTimestamp: '2026-10-02T06:45:37.379Z', eventType: 'navigation' },
      { id: 34, citedTimestamp: '2026-10-02T06:45:37.379Z', eventType: 'boundary' },
      { id: 44, citedTimestamp: '2026-10-02T06:45:37.387Z', eventType: 'focus' },
      { id: 45, citedTimestamp: '2026-10-02T06:45:37.400Z', eventType: 'keydown' },
      { id: 46, citedTimestamp: '2026-10-02T06:45:37.419Z', eventType: 'navigation' },
      { id: 47, citedTimestamp: '2026-10-02T06:45:38.326Z', eventType: 'keydown' },
      { id: 48, citedTimestamp: '2026-10-02T06:45:38.326Z', eventType: 'keydown' },
      { id: 49, citedTimestamp: '2026-10-02T06:45:38.564Z', eventType: 'keydown' },
      { id: 50, citedTimestamp: '2026-10-02T06:45:38.564Z', eventType: 'keydown' },
      { id: 51, citedTimestamp: '2026-10-02T06:45:38.765Z', eventType: 'keydown' },
      { id: 52, citedTimestamp: '2026-10-02T06:45:38.765Z', eventType: 'keydown' },
      { id: 53, citedTimestamp: '2026-10-02T06:45:38.933Z', eventType: 'keydown' },
      { id: 54, citedTimestamp: '2026-10-02T06:45:38.933Z', eventType: 'keydown' },
      { id: 55, citedTimestamp: '2026-10-02T06:45:40.140Z', eventType: 'keydown' },
      { id: 56, citedTimestamp: '2026-10-02T06:45:40.140Z', eventType: 'keydown' },
      { id: 74, citedTimestamp: '2026-10-02T06:45:42.069Z', eventType: 'keydown' },
      { id: 94, citedTimestamp: '2026-10-02T06:45:43.087Z', eventType: 'keydown' },
      { id: 114, citedTimestamp: '2026-10-02T06:45:44.520Z', eventType: 'keydown' },
      { id: 133, citedTimestamp: '2026-10-02T06:45:45.520Z', eventType: 'keydown' },
      { id: 134, citedTimestamp: '2026-10-02T06:45:45.520Z', eventType: 'keydown' },
    ];

    const discrepancies: any[] = [];
    for (const c of citedEvents) {
      const actual = events[c.id];
      if (!actual) {
        discrepancies.push({ id: c.id, error: 'Event does not exist' });
      } else {
        if (actual.timestamp !== c.citedTimestamp || actual.type !== c.eventType) {
          discrepancies.push({
            id: c.id,
            cited: c.citedTimestamp,
            actual: actual.timestamp,
            citedType: c.eventType,
            actualType: actual.type,
            diffMs: Math.abs(new Date(actual.timestamp).getTime() - new Date(c.citedTimestamp).getTime())
          });
        }
      }
    }

    expect(discrepancies).toEqual([]);
  });
});
