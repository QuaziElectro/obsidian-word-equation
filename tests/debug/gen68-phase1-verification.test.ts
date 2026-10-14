import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Generation 68 Phase 1 Verification Suite', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const phase1StartTime = new Date('2026-10-13T17:16:40Z').getTime();

  it('verifies all 10 BUG_REPORT_*.md files exist at project root', () => {
    for (let i = 1; i <= 10; i++) {
      const reportPath = path.join(projectRoot, `BUG_REPORT_${i}.md`);
      expect(
        fs.existsSync(reportPath),
        `Expected BUG_REPORT_${i}.md to exist at project root`
      ).toBe(true);
    }
  });

  it('verifies each bug report contains comprehensive technical explanations and citations', () => {
    for (let i = 1; i <= 10; i++) {
      const reportPath = path.join(projectRoot, `BUG_REPORT_${i}.md`);
      const content = fs.readFileSync(reportPath, 'utf8');
      const stat = fs.statSync(reportPath);

      // Report must be substantive (not dummy or empty)
      expect(stat.size, `BUG_REPORT_${i}.md must be at least 5KB`).toBeGreaterThan(5000);

      // Required structural sections
      expect(content).toMatch(/Executive Summary/i);
      expect(content).toMatch(/Telemetry|Empirical Evidence|debug-log/i);
      expect(content).toMatch(/Code-Level|Code Analysis|Failure Mechanism|Mechanism|Technical Specification/i);
      expect(content).toMatch(/Reproduction\s+(?:Steps|Procedure|Instructions)|How to Reproduce/i);
      expect(content).toMatch(/Remediation|Blueprint/i);

      // Code-level analysis citations (must reference relevant src/ file)
      expect(content).toMatch(/src\/[a-zA-Z0-9_\-\/]+\.(?:ts|css)/);

      // Evidence citations: must cite telemetry (event IDs, timestamps, or log entries) or code mechanisms
      const hasEventId = /Event[s]?\s*(?:#|no\.)?\s*\d+/i.test(content);
      const hasTelemetryTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content);
      const hasCodeAnalysis = /line[s]?\s+\d+/i.test(content);

      expect(
        hasEventId || hasTelemetryTimestamp || hasCodeAnalysis,
        `BUG_REPORT_${i}.md must cite telemetry event IDs, timestamps, or code line numbers`
      ).toBe(true);
    }
  });

  it('verifies strictly 0 production files in src/ were modified during Phase 1', () => {
    const srcDir = path.join(projectRoot, 'src');
    const modifiedFilesInPhase1: string[] = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > phase1StartTime) {
            modifiedFilesInPhase1.push(
              `${path.relative(projectRoot, fullPath)} (mtime: ${stat.mtime.toISOString()})`
            );
          }
        }
      }
    }

    scanDir(srcDir);

    expect(
      modifiedFilesInPhase1,
      `Expected 0 files in src/ modified after Phase 1 start (${new Date(phase1StartTime).toISOString()}), found: ${modifiedFilesInPhase1.join(', ')}`
    ).toEqual([]);
  });
});
