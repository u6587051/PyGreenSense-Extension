import { randomBytes } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getHistoryEntries,
  getLatestHistoryMetric,
  type HistoryMetric,
  type HistoryRead,
  type SmellBreakdownEntry,
} from '../python/history';
import type { RunResult } from '../python/pythonRunner';
import {
  parsePyGreenSenseReport,
  type ParsedIssue,
  type ParsedIssueGroup,
  type ParsedSeverity,
} from './reportParser';

export type PyGreenSenseResultsViewModel = {
  targetFile: string;
  workspaceRoot: string;
  history: HistoryRead;
  runResult: RunResult;
};

type SmellSummary = {
  rule: string;
  count: number;
  loc: number | null;
  severity: ParsedSeverity;
};

type MetricCard = {
  label: string;
  value: string;
  note: string;
  tone: ParsedSeverity;
};

type DetailRow = {
  label: string;
  value: string;
};

let resultsPanel: vscode.WebviewPanel | undefined;

export function showPyGreenSenseResultsPanel(data: PyGreenSenseResultsViewModel): void {
  const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (!resultsPanel) {
    resultsPanel = vscode.window.createWebviewPanel(
      'pygreensenseResults',
      `Carbon Cleaner: ${path.basename(data.targetFile)}`,
      {
        viewColumn: column,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    resultsPanel.onDidDispose(() => {
      resultsPanel = undefined;
    });
  } else {
    resultsPanel.title = `Carbon Cleaner: ${path.basename(data.targetFile)}`;
    resultsPanel.reveal(column, true);
  }

  resultsPanel.webview.html = getWebviewHtml(resultsPanel.webview, data);
}

function getWebviewHtml(webview: vscode.Webview, data: PyGreenSenseResultsViewModel): string {
  const nonce = getNonce();
  const parsedReport = parsePyGreenSenseReport(data.runResult.stdout);
  const historyEntries = getHistoryEntries(data.history.json);
  const latestMetric = getLatestHistoryMetric(data.history.json);
  const smellSummaries = buildSmellSummaries(latestMetric?.smell_breakdown, parsedReport.issueGroups);
  const issueGroups = parsedReport.issueGroups.length > 0 ? parsedReport.issueGroups : buildFallbackIssueGroups(smellSummaries);
  const issueCount = parsedReport.issueCount ?? smellSummaries.reduce((sum, smell) => sum + smell.count, 0);
  const targetPath = firstNonEmpty(parsedReport.targetFile, latestMetric?.target_file, data.targetFile) ?? data.targetFile;
  const targetLabel = formatPathForDisplay(targetPath, data.workspaceRoot);
  const workspaceLabel = path.basename(data.workspaceRoot) || data.workspaceRoot;
  const statusLabel =
    firstNonEmpty(latestMetric?.status, parsedReport.currentRunStatus, data.runResult.code === 0 ? 'Run complete' : 'Run failed') ??
    'Run complete';
  const statusTone = getStatusTone(statusLabel, data.runResult.code);
  const metrics = getMetricCards({
    latestMetric,
    parsedReport,
    historyRunCount: historyEntries.length,
    issueCount,
  });
  const detailRows = getDetailRows({
    data,
    latestMetric,
    parsedReport,
    historyEntries,
  });
  const programOutputLines = parsedReport.programOutput;
  const stdout = data.runResult.stdout.trim();
  const stderr = data.runResult.stderr.trim();
  const rawOutput = stdout || stderr;
  const historyJson = data.history.json ? JSON.stringify(data.history.json, null, 2) : '';
  const showIssueFilePaths = shouldShowIssueFilePaths(issueGroups);
  const runSummary = getRunSummaryText({
    issueCount,
    statusLabel,
    targetLabel,
    historyCount: historyEntries.length,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <title>Carbon Cleaner</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #f5f2ea;
        --paper-edge: #ece6d9;
        --panel: rgba(255, 255, 255, 0.82);
        --panel-strong: rgba(255, 255, 255, 0.95);
        --ink: #171611;
        --muted: #615d51;
        --line: rgba(23, 22, 17, 0.1);
        --sky-top: #5bc8ff;
        --sky-mid: #8bdfff;
        --sky-bottom: #c9f3ff;
        --grass: #7acb3c;
        --grass-dark: #35691b;
        --soil: #85631d;
        --soil-dark: #584112;
        --cloud: #413c50;
        --cloud-soft: #5b556d;
        --good: #1c7c4f;
        --good-soft: #ddf7e7;
        --warn: #9c6600;
        --warn-soft: #fff0d2;
        --danger: #bc4c57;
        --danger-soft: #ffe5e8;
        --neutral: #294768;
        --neutral-soft: #dbe8f5;
        --shadow: 0 24px 60px rgba(36, 31, 23, 0.14);
        --shadow-soft: 0 16px 30px rgba(36, 31, 23, 0.1);
        --radius-xl: 30px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: "Avenir Next", "Trebuchet MS", "Gill Sans", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(91, 200, 255, 0.22), transparent 28%),
          radial-gradient(circle at bottom right, rgba(122, 203, 60, 0.15), transparent 24%),
          linear-gradient(180deg, #faf8f2 0%, var(--paper) 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.3;
        background-image: linear-gradient(transparent 0, transparent 27px, rgba(23, 22, 17, 0.025) 28px);
        background-size: 100% 28px;
      }

      main {
        position: relative;
        z-index: 1;
        max-width: 1320px;
        margin: 0 auto;
        padding: 24px;
      }

      .cc-shell {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 32px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(245, 242, 234, 0.95));
        box-shadow: var(--shadow);
      }

      .cc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 18px 22px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.64);
      }

      .cc-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }

      .cc-brand-mark {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        padding: 10px 12px;
        border-radius: 999px;
        background: rgba(23, 22, 17, 0.06);
      }

      .cc-brand-cloud {
        position: relative;
        height: 12px;
        border-radius: 999px 999px 4px 4px;
        background: var(--cloud);
      }

      .cc-brand-cloud::before,
      .cc-brand-cloud::after {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: inherit;
      }

      .cc-brand-cloud::before {
        top: -6px;
        left: 3px;
        width: 11px;
        height: 11px;
      }

      .cc-brand-cloud::after {
        top: -4px;
        right: 2px;
        width: 8px;
        height: 8px;
      }

      .cc-brand-cloud.a {
        width: 16px;
        opacity: 0.45;
      }

      .cc-brand-cloud.b {
        width: 22px;
        opacity: 0.65;
      }

      .cc-brand-cloud.c {
        width: 28px;
        opacity: 0.9;
      }

      .cc-title {
        margin: 0;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .cc-subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--muted);
      }

      .cc-status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 132px;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .cc-status-badge.good {
        background: var(--good-soft);
        color: var(--good);
      }

      .cc-status-badge.medium {
        background: var(--warn-soft);
        color: var(--warn);
      }

      .cc-status-badge.low,
      .cc-status-badge.neutral {
        background: var(--neutral-soft);
        color: var(--neutral);
      }

      .cc-status-badge.danger {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .cc-hero {
        display: grid;
        grid-template-columns: minmax(320px, 0.92fr) minmax(340px, 1.08fr);
        gap: 22px;
        padding: 22px;
      }

      .hero-card {
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--panel);
        box-shadow: var(--shadow-soft);
      }

      .scene-card {
        padding: 18px;
      }

      .scene {
        position: relative;
        min-height: 360px;
        overflow: hidden;
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        background: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 58%, var(--sky-bottom) 100%);
      }

      .scene::before {
        content: "";
        position: absolute;
        inset: 0;
        opacity: 0.2;
        background-image:
          radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.85), transparent 10%),
          radial-gradient(circle at 82% 12%, rgba(255, 255, 255, 0.6), transparent 8%);
      }

      .scene-ground {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 40px;
        height: 92px;
        background:
          repeating-linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.9) 0,
            rgba(255, 255, 255, 0.9) 3px,
            transparent 3px,
            transparent 16px
          ),
          linear-gradient(180deg, #9ce35d 0%, var(--grass) 68%, #69ab35 100%);
      }

      .scene-ground::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent 18px,
            rgba(28, 84, 17, 0.5) 18px,
            rgba(28, 84, 17, 0.5) 21px,
            transparent 21px,
            transparent 38px
          );
        opacity: 0.65;
      }

      .scene-soil {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 40px;
        background:
          radial-gradient(circle at 10% 50%, rgba(0, 0, 0, 0.2), transparent 3px),
          radial-gradient(circle at 32% 74%, rgba(0, 0, 0, 0.24), transparent 3px),
          radial-gradient(circle at 58% 36%, rgba(0, 0, 0, 0.2), transparent 3px),
          radial-gradient(circle at 78% 64%, rgba(0, 0, 0, 0.2), transparent 3px),
          linear-gradient(180deg, var(--soil) 0%, var(--soil-dark) 100%);
      }

      .scene-tree {
        position: absolute;
        left: 48px;
        bottom: 88px;
        width: 20px;
        height: 118px;
        border-radius: 8px;
        background: #8f2e19;
        transform: skew(-7deg);
      }

      .scene-tree::before,
      .scene-tree::after {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: #87d43f;
        box-shadow:
          -42px 28px 0 0 #7dd03c,
          30px 34px 0 0 #92dd49,
          -12px 58px 0 0 #8ad243;
      }

      .scene-tree::before {
        top: -10px;
        left: -10px;
        width: 72px;
        height: 58px;
      }

      .scene-tree::after {
        top: 34px;
        left: -28px;
        width: 60px;
        height: 42px;
      }

      .scene-shrub {
        position: absolute;
        right: 54px;
        bottom: 94px;
        width: 54px;
        height: 74px;
        border-radius: 999px 999px 16px 16px;
        background: linear-gradient(180deg, #4f9b27 0%, #7fd240 100%);
      }

      .scene-shrub::before,
      .scene-shrub::after {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: inherit;
      }

      .scene-shrub::before {
        top: -16px;
        left: 10px;
        width: 28px;
        height: 28px;
      }

      .scene-shrub::after {
        top: 10px;
        right: -6px;
        width: 24px;
        height: 24px;
      }

      .scene-console {
        position: absolute;
        left: 50%;
        bottom: 104px;
        width: 132px;
        height: 116px;
        margin-left: -66px;
        border-radius: 26px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(213, 244, 229, 0.84));
        border: 5px solid rgba(255, 255, 255, 0.72);
        box-shadow: 0 18px 34px rgba(15, 62, 55, 0.25);
      }

      .scene-console-screen {
        position: absolute;
        inset: 18px;
        display: grid;
        place-items: center;
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(14, 40, 61, 0.98), rgba(18, 72, 61, 0.96));
        color: #effaf4;
        font-family: "SFMono-Regular", "Cascadia Mono", "Menlo", monospace;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .scene-chip {
        position: absolute;
        z-index: 2;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.9);
        color: #18344a;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .scene-chip.a {
        top: 16px;
        left: 16px;
      }

      .scene-chip.b {
        right: 16px;
        bottom: 54px;
      }

      .scene-cloud {
        position: absolute;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 118px;
        min-height: 54px;
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(65, 60, 80, 0.94);
        color: #fffaf5;
        box-shadow:
          inset 0 -8px 0 rgba(0, 0, 0, 0.18),
          0 18px 28px rgba(49, 46, 62, 0.28);
        transform: translate3d(0, 0, 0);
      }

      .scene-cloud::before,
      .scene-cloud::after {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: inherit;
      }

      .scene-cloud::before {
        top: -18px;
        left: 16px;
        width: 48px;
        height: 48px;
      }

      .scene-cloud::after {
        top: -12px;
        right: 18px;
        width: 34px;
        height: 34px;
      }

      .scene-cloud.good {
        background: rgba(42, 110, 78, 0.9);
      }

      .scene-cloud.medium {
        background: rgba(136, 96, 18, 0.92);
      }

      .scene-cloud.danger {
        background: rgba(101, 61, 77, 0.96);
      }

      .scene-cloud.low,
      .scene-cloud.neutral {
        background: rgba(77, 88, 107, 0.92);
      }

      .scene-cloud-label {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        text-align: center;
      }

      .scene-cloud-label strong {
        font-size: 16px;
        letter-spacing: -0.02em;
      }

      .scene-cloud-label span {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.85;
      }

      .scene-note {
        margin: 14px 2px 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .summary-card {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 24px;
      }

      .summary-kicker {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .summary-card h1 {
        margin: 8px 0 0;
        font-size: clamp(2.6rem, 4vw, 4.6rem);
        line-height: 0.96;
        letter-spacing: -0.06em;
      }

      .summary-copy {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.6;
        max-width: 56ch;
      }

      .summary-path {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .summary-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 16px;
        background: rgba(23, 22, 17, 0.05);
        color: var(--ink);
        font-size: 12px;
      }

      .summary-chip strong {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .metric-card {
        padding: 14px;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: var(--panel-strong);
      }

      .metric-card.good {
        background: linear-gradient(180deg, #f7fff9, #ecfff0);
      }

      .metric-card.medium {
        background: linear-gradient(180deg, #fffaf0, #fff1d8);
      }

      .metric-card.low,
      .metric-card.neutral {
        background: linear-gradient(180deg, #fbfcff, #eef4fb);
      }

      .metric-card.danger {
        background: linear-gradient(180deg, #fff8fa, #ffe8ec);
      }

      .metric-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .metric-value {
        margin-top: 8px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .metric-note {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      }

      .detail-tile {
        padding: 12px 14px;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.62);
      }

      .detail-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .detail-value {
        margin-top: 6px;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }

      .cc-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 22px 22px;
      }

      .cc-tab {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.78);
        color: var(--muted);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        padding: 11px 16px;
        text-transform: uppercase;
        transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
      }

      .cc-tab[aria-selected="true"] {
        background: #171611;
        border-color: #171611;
        color: #fff9f2;
      }

      .cc-panels {
        padding: 0 22px 22px;
      }

      .cc-panel {
        display: none;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: rgba(255, 255, 255, 0.66);
        box-shadow: var(--shadow-soft);
      }

      .cc-panel.active {
        display: block;
      }

      .section-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.12fr) minmax(260px, 0.88fr);
        gap: 20px;
      }

      .section-card {
        padding: 18px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.84);
      }

      .section-kicker {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .section-card h2 {
        margin: 8px 0 0;
        font-size: 30px;
        letter-spacing: -0.04em;
      }

      .section-subtitle {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }

      .smell-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }

      .smell-card {
        position: relative;
        overflow: hidden;
        padding: 18px 16px 14px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.95);
      }

      .smell-card::before,
      .smell-card::after {
        content: "";
        position: absolute;
        inset: auto auto 16px 16px;
        border-radius: 50%;
        background: rgba(65, 60, 80, 0.16);
      }

      .smell-card::before {
        width: 34px;
        height: 34px;
      }

      .smell-card::after {
        left: 34px;
        bottom: 26px;
        width: 24px;
        height: 24px;
      }

      .smell-card.good::before,
      .smell-card.good::after {
        background: rgba(28, 124, 79, 0.18);
      }

      .smell-card.medium::before,
      .smell-card.medium::after {
        background: rgba(156, 102, 0, 0.2);
      }

      .smell-card.danger::before,
      .smell-card.danger::after {
        background: rgba(188, 76, 87, 0.18);
      }

      .smell-card.low::before,
      .smell-card.low::after,
      .smell-card.neutral::before,
      .smell-card.neutral::after {
        background: rgba(41, 71, 104, 0.14);
      }

      .smell-rule {
        position: relative;
        z-index: 1;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .smell-count {
        position: relative;
        z-index: 1;
        margin-top: 12px;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .smell-meta {
        position: relative;
        z-index: 1;
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .detail-list {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }

      .detail-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        padding: 12px 14px;
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid var(--line);
      }

      .detail-row span:first-child {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .detail-row span:last-child {
        max-width: 65%;
        text-align: right;
        font-size: 13px;
        line-height: 1.45;
        word-break: break-word;
      }

      .issue-list {
        display: grid;
        gap: 14px;
      }

      .issue-group {
        padding: 16px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.84);
      }

      .issue-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--line);
      }

      .issue-group-title {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .issue-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .issue-dot.good {
        background: var(--good);
      }

      .issue-dot.medium {
        background: var(--warn);
      }

      .issue-dot.low,
      .issue-dot.neutral {
        background: var(--neutral);
      }

      .issue-dot.danger {
        background: var(--danger);
      }

      .issue-rule {
        font-size: 14px;
        font-weight: 800;
      }

      .issue-count {
        font-size: 12px;
        color: var(--muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .issue-items {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }

      .issue-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        padding: 12px 0;
        border-bottom: 1px solid rgba(23, 22, 17, 0.06);
      }

      .issue-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .issue-location {
        min-width: 78px;
        color: var(--muted);
        font-family: "SFMono-Regular", "Cascadia Mono", "Menlo", monospace;
        font-size: 12px;
        white-space: nowrap;
      }

      .issue-message {
        font-size: 13px;
        line-height: 1.55;
      }

      .history-landscape {
        position: relative;
        height: 42px;
        margin-bottom: 18px;
        overflow: hidden;
        border-radius: 18px;
        background: linear-gradient(180deg, #c2f1ff 0%, #e8fbff 100%);
      }

      .history-landscape::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 14px;
        background: #6fc43a;
      }

      .history-landscape::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 14px;
        height: 2px;
        background: rgba(255, 255, 255, 0.8);
      }

      .history-list {
        display: grid;
        gap: 12px;
      }

      .history-item {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 14px 16px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.84);
      }

      .history-index {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: rgba(23, 22, 17, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
      }

      .history-file {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.45;
        word-break: break-word;
      }

      .history-date {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
      }

      .history-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .history-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 10px;
        letter-spacing: 0.04em;
      }

      .history-right {
        text-align: right;
      }

      .history-emission {
        font-size: 14px;
        font-weight: 800;
      }

      .history-status {
        margin-top: 4px;
        font-size: 12px;
      }

      .history-status.good {
        color: var(--good);
      }

      .history-status.medium {
        color: var(--warn);
      }

      .history-status.low,
      .history-status.neutral {
        color: var(--neutral);
      }

      .history-status.danger {
        color: var(--danger);
      }

      .output-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.86fr) minmax(280px, 1.14fr);
        gap: 20px;
      }

      .output-list {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }

      .output-line {
        padding: 12px 14px;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.82);
        font-family: "SFMono-Regular", "Cascadia Mono", "Menlo", monospace;
        font-size: 12px;
        line-height: 1.55;
        word-break: break-word;
      }

      details {
        overflow: hidden;
        border-radius: var(--radius-lg);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.84);
      }

      details + details {
        margin-top: 12px;
      }

      summary {
        cursor: pointer;
        padding: 14px 16px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      pre {
        margin: 0;
        padding: 0 16px 16px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #edf7f2;
        font-family: "SFMono-Regular", "Cascadia Mono", "Menlo", monospace;
        font-size: 12px;
        line-height: 1.6;
        background: linear-gradient(180deg, #112432 0%, #17363c 100%);
      }

      .empty-state {
        padding: 18px;
        border-radius: var(--radius-lg);
        border: 1px dashed rgba(23, 22, 17, 0.14);
        background: rgba(255, 255, 255, 0.58);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      @media (max-width: 1160px) {
        .cc-hero,
        .section-grid,
        .output-grid {
          grid-template-columns: 1fr;
        }

        .summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        main {
          padding: 16px;
        }

        .cc-header,
        .cc-hero,
        .cc-tabs,
        .cc-panels {
          padding-left: 16px;
          padding-right: 16px;
        }

        .cc-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .summary-grid {
          grid-template-columns: 1fr;
        }

        .detail-grid {
          grid-template-columns: 1fr;
        }

        .history-item {
          grid-template-columns: 1fr;
        }

        .history-right {
          text-align: left;
        }

        .issue-item {
          grid-template-columns: 1fr;
        }

        .scene {
          min-height: 320px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="cc-shell">
        <header class="cc-header">
          <div class="cc-brand">
            <div class="cc-brand-mark" aria-hidden="true">
              <span class="cc-brand-cloud a"></span>
              <span class="cc-brand-cloud b"></span>
              <span class="cc-brand-cloud c"></span>
            </div>
            <div>
              <p class="cc-title">Carbon Cleaner</p>
              <p class="cc-subtitle">Retro carbon-cloud analysis for PyGreenSense output and history</p>
            </div>
          </div>
          <div class="cc-status-badge ${getToneClass(statusTone)}">${escapeHtml(statusLabel)}</div>
        </header>

        <section class="cc-hero">
          <article class="hero-card scene-card">
            <div class="scene" aria-label="Carbon clouds above the current code run">
              <div class="scene-chip a">Cloud map</div>
              <div class="scene-chip b">${escapeHtml(String(issueCount))} issues</div>
              ${renderSceneClouds(smellSummaries)}
              <div class="scene-tree" aria-hidden="true"></div>
              <div class="scene-shrub" aria-hidden="true"></div>
              <div class="scene-console" aria-hidden="true">
                <div class="scene-console-screen">&lt;/&gt;</div>
              </div>
              <div class="scene-ground" aria-hidden="true"></div>
              <div class="scene-soil" aria-hidden="true"></div>
            </div>
            <p class="scene-note">
              ${escapeHtml(runSummary)}
            </p>
          </article>

          <article class="hero-card summary-card">
            <div>
              <p class="summary-kicker">Current target</p>
              <h1>${escapeHtml(path.basename(targetPath))}</h1>
            </div>
            <p class="summary-copy">
              The panel follows the same structure as your sample files: detailed issue groups from the terminal-style report,
              a persistent run timeline from <code>history.json</code>, and a focused carbon-cloud scene inspired by your concept slide.
            </p>
            <div class="summary-path">
              <span class="summary-chip"><strong>File</strong>${escapeHtml(targetLabel)}</span>
              <span class="summary-chip"><strong>Workspace</strong>${escapeHtml(workspaceLabel)}</span>
              <span class="summary-chip"><strong>History</strong>${escapeHtml(data.history.foundPath ? 'Synced' : 'Missing')}</span>
            </div>
            <div class="summary-grid">
              ${metrics.map(renderMetricCard).join('')}
            </div>
            <div class="detail-grid">
              ${detailRows.map(renderDetailTile).join('')}
            </div>
          </article>
        </section>

        <nav class="cc-tabs" aria-label="Carbon Cleaner sections">
          <button class="cc-tab" data-tab-button="analysis" aria-selected="true">Analysis</button>
          <button class="cc-tab" data-tab-button="issues" aria-selected="false">Issues</button>
          <button class="cc-tab" data-tab-button="history" aria-selected="false">History</button>
          <button class="cc-tab" data-tab-button="output" aria-selected="false">Output</button>
        </nav>

        <section class="cc-panels">
          <div class="cc-panel active" data-tab-panel="analysis">
            <div class="section-grid">
              <article class="section-card">
                <p class="section-kicker">Carbon clouds</p>
                <h2>Issue types in the current sky</h2>
                <p class="section-subtitle">
                  Each cloud below is built from the latest run summary and backed by the smell breakdown saved in history when it exists.
                </p>
                ${
                  smellSummaries.length > 0
                    ? `<div class="smell-grid">${smellSummaries.map(renderSmellCard).join('')}</div>`
                    : renderEmptyState('No smell summary is available yet. Run PyGreenSense on a file to populate the cloud cards.')
                }
              </article>

              <article class="section-card">
                <p class="section-kicker">Run details</p>
                <h2>Live report metadata</h2>
                <p class="section-subtitle">
                  These values are blended from the latest CLI output and the newest history entry so the panel stays useful even when one source is missing.
                </p>
                <div class="detail-list">
                  ${getAnalysisDetailRows(data, latestMetric, parsedReport).map(renderDetailRow).join('')}
                </div>
              </article>
            </div>
          </div>

          <div class="cc-panel" data-tab-panel="issues">
            <article class="section-card">
              <p class="section-kicker">Detected issues</p>
              <h2>Line-by-line output list</h2>
              <p class="section-subtitle">
                This section follows the structure of the terminal report, grouping every detected issue by smell type and preserving line references.
              </p>
              ${
                issueGroups.length > 0
                  ? `<div class="issue-list">${issueGroups
                      .map(group => renderIssueGroup(group, showIssueFilePaths))
                      .join('')}</div>`
                  : renderEmptyState('No issue groups were parsed from the latest run output.')
              }
            </article>
          </div>

          <div class="cc-panel" data-tab-panel="history">
            <article class="section-card">
              <p class="section-kicker">Run history</p>
              <h2>Saved emissions timeline</h2>
              <p class="section-subtitle">
                The history list is built from <code>history.json</code> and shows the newest saved runs first, with status, emissions, and smell tags.
              </p>
              <div class="history-landscape" aria-hidden="true"></div>
              ${
                historyEntries.length > 0
                  ? `<div class="history-list">${historyEntries
                      .slice()
                      .reverse()
                      .map((entry, index) => renderHistoryItem(entry, index, data.workspaceRoot))
                      .join('')}</div>`
                  : renderEmptyState(
                      'No history entries were found. The extension can still show the latest terminal output, but the timeline will appear after a run writes history.json.'
                    )
              }
            </article>
          </div>

          <div class="cc-panel" data-tab-panel="output">
            <div class="output-grid">
              <article class="section-card">
                <p class="section-kicker">Program output</p>
                <h2>What the last run printed</h2>
                <p class="section-subtitle">
                  This list is taken from the "Program output" block in the CLI report, which keeps the panel aligned with the raw terminal text.
                </p>
                ${
                  programOutputLines.length > 0
                    ? `<div class="output-list">${programOutputLines.map(renderOutputLine).join('')}</div>`
                    : renderEmptyState('No dedicated program output block was detected in the latest run.')
                }
              </article>

              <article class="section-card">
                <p class="section-kicker">Raw capture</p>
                <h2>Full stdout, stderr, and history JSON</h2>
                <p class="section-subtitle">
                  Keep the structured list above for browsing, then expand the raw sections when you need the original report text.
                </p>
                ${
                  rawOutput
                    ? `<details open>
                        <summary>Latest stdout</summary>
                        <pre>${escapeHtml(stdout || 'No stdout captured.')}</pre>
                      </details>`
                    : renderEmptyState('No stdout was captured for the latest run.')
                }
                ${
                  stderr
                    ? `<details>
                        <summary>Latest stderr</summary>
                        <pre>${escapeHtml(stderr)}</pre>
                      </details>`
                    : ''
                }
                ${
                  historyJson
                    ? `<details>
                        <summary>Persisted history.json snapshot</summary>
                        <pre>${escapeHtml(historyJson)}</pre>
                      </details>`
                    : ''
                }
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>

    <script nonce="${nonce}">
      const tabButtons = Array.from(document.querySelectorAll('[data-tab-button]'));
      const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

      function activateTab(name) {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.tabButton === name;
          button.setAttribute('aria-selected', String(isActive));
        });

        tabPanels.forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.tabPanel === name);
        });
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          activateTab(button.dataset.tabButton);
        });
      });

      activateTab('analysis');
    </script>
  </body>
</html>`;
}

function getMetricCards({
  latestMetric,
  parsedReport,
  historyRunCount,
  issueCount,
}: {
  latestMetric: HistoryMetric | null;
  parsedReport: ReturnType<typeof parsePyGreenSenseReport>;
  historyRunCount: number;
  issueCount: number;
}): MetricCard[] {
  const emissionKg = firstDefinedNumber(
    parsedReport.emissionKg,
    normalizeHistoryEmissionKg(latestMetric)
  );
  const cfp = firstDefinedNumber(parsedReport.cfp, latestMetric?.cfp);
  const loc = firstDefinedNumber(parsedReport.loc, latestMetric?.lines_of_code);
  const runCountLabel = historyRunCount > 0 ? `${historyRunCount} saved run${historyRunCount === 1 ? '' : 's'}` : 'Waiting for history sync';

  return [
    {
      label: 'Carbon',
      value: formatScientificNumber(emissionKg, ' kg CO2'),
      note: latestMetric?.region ? `${latestMetric.region} grid` : 'From latest CLI report',
      tone: emissionKg !== null && emissionKg > 0 ? 'medium' : 'neutral',
    },
    {
      label: 'Issues',
      value: String(issueCount),
      note: parsedReport.issueFileCount ? `${parsedReport.issueFileCount} file(s) with detections` : 'Parsed from report output',
      tone: issueCount > 0 ? 'danger' : 'good',
    },
    {
      label: 'CFP',
      value: formatCompactNumber(cfp),
      note: cfp !== null ? 'COSMIC function points' : 'Not present in latest run',
      tone: cfp !== null ? 'neutral' : 'low',
    },
    {
      label: 'LOC',
      value: formatCompactNumber(loc),
      note: loc !== null ? runCountLabel : 'No LOC value captured',
      tone: loc !== null ? 'good' : 'neutral',
    },
  ];
}

function getDetailRows({
  data,
  latestMetric,
  parsedReport,
  historyEntries,
}: {
  data: PyGreenSenseResultsViewModel;
  latestMetric: HistoryMetric | null;
  parsedReport: ReturnType<typeof parsePyGreenSenseReport>;
  historyEntries: HistoryMetric[];
}): DetailRow[] {
  return [
    {
      label: 'History runs',
      value: String(historyEntries.length),
    },
    {
      label: 'Iterations',
      value: parsedReport.iterations !== null ? `${parsedReport.iterations} runs averaged` : 'Not reported',
    },
    {
      label: 'History path',
      value: data.history.foundPath ?? 'No history.json found',
    },
    {
      label: 'Exit code',
      value: String(data.runResult.code),
    },
    {
      label: 'Trend',
      value: formatTrend(latestMetric?.status, latestMetric?.improvement_percent),
    },
    {
      label: 'Country',
      value: firstNonEmpty(parsedReport.country, latestMetric?.country_name) ?? 'Not reported',
    },
  ];
}

function getAnalysisDetailRows(
  data: PyGreenSenseResultsViewModel,
  latestMetric: HistoryMetric | null,
  parsedReport: ReturnType<typeof parsePyGreenSenseReport>
): DetailRow[] {
  return [
    {
      label: 'Target file',
      value: firstNonEmpty(parsedReport.targetFile, latestMetric?.target_file, data.targetFile) ?? data.targetFile,
    },
    {
      label: 'Duration',
      value: formatDuration(firstDefinedNumber(parsedReport.durationSeconds, latestMetric?.duration_seconds)),
    },
    {
      label: 'Energy',
      value: formatScientificNumber(firstDefinedNumber(parsedReport.energyKWh, latestMetric?.energy_consumed_kWh), ' kWh'),
    },
    {
      label: 'Emission rate',
      value: formatScientificNumber(
        firstDefinedNumber(parsedReport.emissionsRate, latestMetric?.emissions_rate_gCO2eq_per_kWh),
        ' gCO2eq/kWh'
      ),
    },
    {
      label: 'Region',
      value: firstNonEmpty(parsedReport.region, latestMetric?.region) ?? 'Not reported',
    },
    {
      label: 'Country',
      value: firstNonEmpty(parsedReport.country, latestMetric?.country_name) ?? 'Not reported',
    },
    {
      label: 'Status',
      value: firstNonEmpty(latestMetric?.status, parsedReport.currentRunStatus) ?? 'Run complete',
    },
    {
      label: 'SCI / line',
      value: formatScientificNumber(latestMetric?.sci_gCO2eq_per_line ?? null, ' gCO2eq'),
    },
    {
      label: 'Improvement',
      value: formatPercent(latestMetric?.improvement_percent ?? null),
    },
    {
      label: 'History source',
      value: data.history.foundPath ?? 'Missing',
    },
  ];
}

function buildSmellSummaries(
  smellBreakdown: Record<string, SmellBreakdownEntry> | undefined,
  issueGroups: ParsedIssueGroup[]
): SmellSummary[] {
  const smellMap = new Map<string, SmellSummary>();
  const order: string[] = [];

  const upsert = (rule: string): SmellSummary => {
    let existing = smellMap.get(rule);
    if (!existing) {
      existing = {
        rule,
        count: 0,
        loc: null,
        severity: getRuleSeverity(rule, 0),
      };
      smellMap.set(rule, existing);
      order.push(rule);
    }

    return existing;
  };

  Object.entries(smellBreakdown ?? {}).forEach(([rule, entry]) => {
    const smell = upsert(rule);
    smell.count = Math.max(smell.count, entry.count ?? 0);
    smell.loc = entry.loc ?? smell.loc;
    smell.severity = getRuleSeverity(rule, smell.count);
  });

  issueGroups.forEach((group) => {
    const smell = upsert(group.rule);
    smell.count = Math.max(smell.count, group.count, group.issues.length);
    smell.severity = group.severity;
  });

  return order
    .map(rule => smellMap.get(rule))
    .filter((value): value is SmellSummary => Boolean(value))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.rule.localeCompare(right.rule);
    });
}

function buildFallbackIssueGroups(smells: SmellSummary[]): ParsedIssueGroup[] {
  return smells.map(smell => ({
    rule: smell.rule,
    count: smell.count,
    severity: smell.severity,
    issues: [],
  }));
}

function renderMetricCard(card: MetricCard): string {
  return `<div class="metric-card ${getToneClass(card.tone)}">
    <div class="metric-label">${escapeHtml(card.label)}</div>
    <div class="metric-value">${escapeHtml(card.value)}</div>
    <div class="metric-note">${escapeHtml(card.note)}</div>
  </div>`;
}

function renderDetailTile(row: DetailRow): string {
  return `<div class="detail-tile">
    <div class="detail-label">${escapeHtml(row.label)}</div>
    <div class="detail-value">${escapeHtml(row.value)}</div>
  </div>`;
}

function renderSmellCard(smell: SmellSummary): string {
  const locLabel = smell.loc !== null ? `${smell.loc} LOC affected` : 'LOC not provided';
  const issueLabel = `${smell.count} issue${smell.count === 1 ? '' : 's'}`;
  return `<div class="smell-card ${getToneClass(smell.severity)}">
    <div class="smell-rule">${escapeHtml(formatRuleLabel(smell.rule))}</div>
    <div class="smell-count">${escapeHtml(issueLabel)}</div>
    <div class="smell-meta">${escapeHtml(locLabel)}</div>
  </div>`;
}

function renderDetailRow(row: DetailRow): string {
  return `<div class="detail-row">
    <span>${escapeHtml(row.label)}</span>
    <span>${escapeHtml(row.value)}</span>
  </div>`;
}

function renderIssueGroup(group: ParsedIssueGroup, showIssueFilePaths: boolean): string {
  const issueMarkup =
    group.issues.length > 0
      ? `<div class="issue-items">${group.issues.map(issue => renderIssueItem(issue, showIssueFilePaths)).join('')}</div>`
      : `<div class="empty-state">Detailed line messages were not available for this smell in the latest output, but the count was still recovered from the saved metrics.</div>`;

  return `<div class="issue-group">
    <div class="issue-group-header">
      <div class="issue-group-title">
        <span class="issue-dot ${getToneClass(group.severity)}" aria-hidden="true"></span>
        <div>
          <div class="issue-rule">${escapeHtml(formatRuleLabel(group.rule))}</div>
          <div class="issue-count">${escapeHtml(String(group.count))} issue${group.count === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>
    ${issueMarkup}
  </div>`;
}

function renderIssueItem(issue: ParsedIssue, showIssueFilePaths: boolean): string {
  return `<div class="issue-item">
    <div class="issue-location">${escapeHtml(formatIssueLocation(issue, showIssueFilePaths))}</div>
    <div class="issue-message">${escapeHtml(issue.message)}</div>
  </div>`;
}

function renderHistoryItem(entry: HistoryMetric, index: number, workspaceRoot: string): string {
  const smellEntries = Object.entries(entry.smell_breakdown ?? {})
    .sort(([, left], [, right]) => (right.count ?? 0) - (left.count ?? 0));
  const visiblePills = smellEntries.slice(0, 3).map(([rule, smell]) => {
    const count = smell.count ?? 0;
    return `<span class="history-pill">${escapeHtml(`${formatRuleLabel(rule)}${count > 1 ? ` x${count}` : ''}`)}</span>`;
  });
  if (smellEntries.length > 3) {
    visiblePills.push(`<span class="history-pill">+${smellEntries.length - 3} more</span>`);
  }

  const tone = getStatusTone(entry.status ?? '', 0);
  return `<div class="history-item">
    <div class="history-index">${String(index + 1).padStart(2, '0')}</div>
    <div>
      <div class="history-file">${escapeHtml(formatPathForDisplay(entry.target_file ?? 'Unknown target', workspaceRoot))}</div>
      <div class="history-date">${escapeHtml(formatDate(entry.date_time ?? null))}</div>
      <div class="history-pills">${visiblePills.join('') || '<span class="history-pill">No smell breakdown</span>'}</div>
    </div>
    <div class="history-right">
      <div class="history-emission">${escapeHtml(formatScientificNumber(normalizeHistoryEmissionKg(entry), ' kg CO2'))}</div>
      <div class="history-status ${getToneClass(tone)}">${escapeHtml(formatTrend(entry.status, entry.improvement_percent))}</div>
    </div>
  </div>`;
}

function renderOutputLine(line: string): string {
  return `<div class="output-line">${escapeHtml(line)}</div>`;
}

function renderSceneClouds(smells: SmellSummary[]): string {
  const cloudSlots = [
    { left: '12%', top: '26%', size: 'large' },
    { left: '42%', top: '14%', size: 'medium' },
    { left: '66%', top: '40%', size: 'large' },
    { left: '28%', top: '50%', size: 'medium' },
  ];
  const cloudSource = smells.length > 0 ? smells.slice(0, cloudSlots.length) : [{ rule: 'CleanSky', count: 0, loc: null, severity: 'good' as const }];

  return cloudSource
    .map((smell, index) => {
      const slot = cloudSlots[index % cloudSlots.length];
      const ruleLabel = smell.rule === 'CleanSky' ? 'Clear sky' : formatRuleLabel(smell.rule);
      const countLabel = smell.rule === 'CleanSky' ? 'No issues' : `${smell.count} issue${smell.count === 1 ? '' : 's'}`;
      return `<div class="scene-cloud ${getToneClass(smell.severity)} ${slot.size}" style="left:${slot.left}; top:${slot.top};">
        <div class="scene-cloud-label">
          <strong>${escapeHtml(ruleLabel)}</strong>
          <span>${escapeHtml(countLabel)}</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderEmptyState(message: string): string {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function shouldShowIssueFilePaths(issueGroups: ParsedIssueGroup[]): boolean {
  const filePaths = new Set(
    issueGroups
      .flatMap(group => group.issues)
      .map(issue => issue.filePath)
      .filter((filePath): filePath is string => Boolean(filePath))
  );
  return filePaths.size > 1;
}

function getRuleSeverity(rule: string, count: number): ParsedSeverity {
  const normalized = rule.replace(/[\s_-]+/g, '').toLowerCase();

  if (normalized.includes('godclass') || normalized.includes('deadcode') || normalized.includes('leak')) {
    return 'danger';
  }

  if (normalized.includes('duplicated') || normalized.includes('longmethod') || normalized.includes('complex')) {
    return 'medium';
  }

  if (normalized.includes('mutabledefault') || normalized.includes('style') || normalized.includes('naming')) {
    return 'low';
  }

  if (count >= 4) {
    return 'danger';
  }

  if (count >= 2) {
    return 'medium';
  }

  return count === 0 ? 'good' : 'neutral';
}

function getStatusTone(status: string, runCode: number): ParsedSeverity {
  if (runCode !== 0) {
    return 'danger';
  }

  const normalized = status.toLowerCase();
  if (normalized.includes('cool') || normalized.includes('improv') || normalized.includes('better')) {
    return 'good';
  }

  if (normalized.includes('hot') || normalized.includes('worse')) {
    return 'danger';
  }

  if (normalized.includes('initial')) {
    return 'neutral';
  }

  return 'medium';
}

function getToneClass(tone: ParsedSeverity): string {
  return tone;
}

function getRunSummaryText({
  issueCount,
  statusLabel,
  targetLabel,
  historyCount,
}: {
  issueCount: number;
  statusLabel: string;
  targetLabel: string;
  historyCount: number;
}): string {
  const issueCopy =
    issueCount === 0 ? 'No carbon clouds were detected in this run.' : `${issueCount} carbon-cloud issue${issueCount === 1 ? '' : 's'} are hovering over ${targetLabel}.`;
  const historyCopy =
    historyCount > 0 ? `History already holds ${historyCount} saved run${historyCount === 1 ? '' : 's'}.` : 'History has not been saved yet.';
  return `${issueCopy} Current status: ${statusLabel}. ${historyCopy}`;
}

function formatIssueLocation(issue: ParsedIssue, showIssueFilePaths: boolean): string {
  const fileLabel = showIssueFilePaths && issue.filePath ? `${path.basename(issue.filePath)}:` : '';
  const lineLabel = issue.line !== null ? `L${issue.line}` : 'Line ?';
  return `${fileLabel}${lineLabel}`;
}

function formatPathForDisplay(targetPath: string, workspaceRoot: string): string {
  if (!targetPath) {
    return 'Unknown target';
  }

  const relative = path.relative(workspaceRoot, targetPath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative;
  }

  return targetPath;
}

function formatRuleLabel(rule: string): string {
  return rule.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Unknown time';
  }

  const compact = value.replace('T', ' ').slice(0, 16);
  return compact || value;
}

function formatTrend(status: string | undefined, improvement: number | null | undefined): string {
  const improvementLabel = formatPercent(improvement ?? null);

  if (!status) {
    return improvementLabel === 'N/A' ? 'No trend data' : improvementLabel;
  }

  if (improvementLabel === 'N/A') {
    return status;
  }

  return `${status} (${improvementLabel})`;
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatDuration(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'Not reported';
  }

  if (value === 0) {
    return '0.00 s';
  }

  if (value < 0.01) {
    return value.toExponential(2).replace('e+', 'e');
  }

  if (value < 60) {
    return `${value.toFixed(2)} s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toFixed(0)}s`;
}

function formatCompactNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  if (Number.isInteger(value)) {
    return value.toFixed(0);
  }

  return value.toFixed(2);
}

function formatScientificNumber(value: number | null, suffix: string): string {
  if (value === null || Number.isNaN(value)) {
    return `N/A${suffix}`;
  }

  if (value === 0) {
    return `0${suffix}`;
  }

  if (Math.abs(value) < 0.01 || Math.abs(value) >= 1000) {
    return `${value.toExponential(2).replace('e+', 'e')}${suffix}`;
  }

  const digits = Math.abs(value) < 10 ? 4 : 2;
  return `${value.toFixed(digits)}${suffix}`;
}

function normalizeHistoryEmissionKg(metric: HistoryMetric | null): number | null {
  if (!metric) {
    return null;
  }

  if (typeof metric.emission_kg === 'number') {
    return metric.emission_kg;
  }

  if (typeof metric.total_emissions_gCO2eq === 'number') {
    return metric.total_emissions_gCO2eq / 1000;
  }

  return null;
}

function firstDefinedNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
  }

  return null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce(): string {
  return randomBytes(16).toString('base64');
}
