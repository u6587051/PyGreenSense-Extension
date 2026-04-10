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

export type PyGreenSenseResultsViewModel = {
  targetFile: string;
  workspaceRoot: string;
  history: HistoryRead;
  runResult: RunResult;
};

type MeterData = {
  activeUnits: number;
  maxUnits: number;
  label: string;
  detail: string;
  fillPercent: number;
  tone: 'good' | 'warn' | 'danger' | 'neutral';
};

let resultsPanel: vscode.WebviewPanel | undefined;

export function showPyGreenSenseResultsPanel(data: PyGreenSenseResultsViewModel): void {
  const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (!resultsPanel) {
    resultsPanel = vscode.window.createWebviewPanel(
      'pygreensenseResults',
      `PyGreenSense: ${path.basename(data.targetFile)}`,
      {
        viewColumn: column,
        preserveFocus: true,
      },
      {
        enableScripts: false,
      }
    );

    resultsPanel.onDidDispose(() => {
      resultsPanel = undefined;
    });
  } else {
    resultsPanel.title = `PyGreenSense: ${path.basename(data.targetFile)}`;
    resultsPanel.reveal(column, true);
  }

  resultsPanel.webview.html = getWebviewHtml(data);
}

function getWebviewHtml(data: PyGreenSenseResultsViewModel): string {
  const latestMetric = getLatestHistoryMetric(data.history.json);
  const historyEntries = getHistoryEntries(data.history.json);
  const smellEntries = getSmellEntries(latestMetric?.smell_breakdown);
  const totalSmells = smellEntries.reduce((sum, [, entry]) => sum + (entry.count ?? 0), 0);
  const totalSmellLoc = smellEntries.reduce((sum, [, entry]) => sum + (entry.loc ?? 0), 0);
  const spotlight = getSpotlightCopy(data.runResult.code, latestMetric, totalSmells);
  const statusTone = getStatusTone(data.runResult.code, latestMetric?.status);
  const statusText = latestMetric?.status ?? (data.runResult.code === 0 ? 'Run complete' : 'Run failed');
  const energyMeter = getEnergyMeter(latestMetric?.energy_consumed_kWh);
  const speedMeter = getSpeedMeter(latestMetric?.duration_seconds);
  const healthMeter = getHealthMeter({
    latestMetric,
    runCode: data.runResult.code,
    totalSmells,
  });
  const targetName = path.basename(data.targetFile);
  const workspaceName = path.basename(data.workspaceRoot) || data.workspaceRoot;
  const fileBadge = getFileBadge(targetName);
  const stdout = data.runResult.stdout.trim();
  const stderr = data.runResult.stderr.trim();
  const latestMetricJson = latestMetric ? escapeHtml(JSON.stringify(latestMetric, null, 2)) : '';

  const snapshotCards = latestMetric
    ? [
        renderSnapshotCard(
          'Total CO2',
          formatNumber(latestMetric.total_emissions_gCO2eq, ' gCO2eq'),
          latestMetric.date_time ?? 'Latest recorded run',
          'good'
        ),
        renderSnapshotCard(
          'SCI / Line',
          formatNumber(latestMetric.sci_gCO2eq_per_line, ' gCO2eq'),
          formatNumber(latestMetric.lines_of_code, ' LOC'),
          'warn'
        ),
        renderSnapshotCard(
          'Saved Runs',
          String(historyEntries.length || 0).padStart(2, '0'),
          data.history.foundPath ? 'History synced' : 'History missing',
          'neutral'
        ),
        renderSnapshotCard(
          'Improvement',
          formatPercent(latestMetric.improvement_percent),
          latestMetric.region ?? 'No region data',
          'danger'
        ),
      ].join('')
    : [
        renderSnapshotCard('Exit Code', String(data.runResult.code), 'Latest extension run', data.runResult.code === 0 ? 'good' : 'danger'),
        renderSnapshotCard('History', 'Missing', 'No persisted history.json yet', 'danger'),
        renderSnapshotCard('Stdout', stdout ? `${countLines(stdout)} lines` : 'Empty', 'Captured from PyGreenSense', 'neutral'),
        renderSnapshotCard('Stderr', stderr ? `${countLines(stderr)} lines` : 'Empty', 'Captured from PyGreenSense', stderr ? 'warn' : 'good'),
      ].join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PyGreenSense Results</title>
    <style>
      :root {
        --paper: #f6f0e3;
        --paper-deep: #efe4cf;
        --card: rgba(255, 251, 244, 0.94);
        --ink: #111111;
        --muted: #5f5a53;
        --line: rgba(17, 17, 17, 0.08);
        --teal: #0d8a74;
        --teal-soft: #d9f2eb;
        --amber: #f6b348;
        --amber-soft: #fff0d3;
        --rose: #ef5ca2;
        --rose-soft: #ffe1ee;
        --navy: #142c46;
        --navy-soft: #d9e7ff;
        --forest: #2f7d4b;
        --forest-soft: #dcf4e3;
        --danger: #c85050;
        --danger-soft: #ffe1e1;
        --shadow: 0 28px 64px rgba(34, 26, 19, 0.12);
        --shadow-soft: 0 16px 32px rgba(34, 26, 19, 0.08);
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
          radial-gradient(circle at top right, rgba(13, 138, 116, 0.14), transparent 28%),
          radial-gradient(circle at bottom left, rgba(246, 179, 72, 0.15), transparent 26%),
          linear-gradient(180deg, var(--paper) 0%, #f9f4eb 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.25;
        background-image: linear-gradient(transparent 0, transparent 23px, rgba(17, 17, 17, 0.025) 24px);
        background-size: 100% 24px;
      }

      main {
        max-width: 1360px;
        margin: 0 auto;
        padding: 36px 28px 56px;
      }

      .poster {
        position: relative;
        padding: 30px;
        border-radius: 34px;
        border: 1px solid rgba(17, 17, 17, 0.07);
        background: linear-gradient(180deg, rgba(255, 252, 247, 0.95), rgba(247, 240, 227, 0.9));
        box-shadow: var(--shadow);
        overflow: hidden;
        animation: rise 520ms ease;
      }

      .poster::after {
        content: "";
        position: absolute;
        inset: 20px;
        border: 1px dashed rgba(17, 17, 17, 0.08);
        border-radius: 26px;
        pointer-events: none;
      }

      .poster-top {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
      }

      .poster-kicker {
        margin: 0;
        font-size: clamp(2.4rem, 5vw, 4.7rem);
        line-height: 0.94;
        letter-spacing: -0.05em;
      }

      .poster-caption {
        margin: 10px 0 0;
        max-width: 620px;
        color: var(--muted);
        font-size: 15px;
      }

      .brand-tag {
        align-self: flex-start;
        padding: 12px 18px;
        border-radius: 999px;
        border: 1px solid rgba(17, 17, 17, 0.08);
        background: rgba(255, 255, 255, 0.72);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .poster-grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(280px, 0.94fr) minmax(320px, 1.05fr) minmax(260px, 0.78fr);
        gap: 24px;
        align-items: stretch;
      }

      .panel-card {
        padding: 22px;
        border-radius: 28px;
        border: 1px solid var(--line);
        background: var(--card);
        box-shadow: var(--shadow-soft);
      }

      .profile-card {
        display: flex;
        flex-direction: column;
        gap: 18px;
        background: linear-gradient(180deg, rgba(20, 44, 70, 0.98), rgba(15, 71, 62, 0.96));
        color: #f6f2ea;
      }

      .portrait {
        position: relative;
        min-height: 360px;
        padding: 22px;
        border-radius: 24px;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.24), transparent 22%),
          linear-gradient(180deg, #8ad9ff 0%, #4fb8ef 58%, #70bf63 58%, #70bf63 76%, #7a5b25 76%, #7a5b25 100%);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }

      .portrait::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 24% 26%, rgba(255, 255, 255, 0.16), transparent 16%),
          radial-gradient(circle at 72% 18%, rgba(52, 56, 74, 0.88), transparent 12%),
          radial-gradient(circle at 77% 28%, rgba(52, 56, 74, 0.9), transparent 13%),
          radial-gradient(circle at 34% 22%, rgba(52, 56, 74, 0.82), transparent 11%),
          radial-gradient(circle at 42% 30%, rgba(52, 56, 74, 0.86), transparent 12%),
          linear-gradient(transparent 0%, transparent 65%, rgba(255, 255, 255, 0.12) 65%, rgba(255, 255, 255, 0.12) 66%, transparent 66%);
        animation: floatClouds 12s linear infinite alternate;
      }

      .portrait::after {
        content: "";
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 16px;
        height: 18px;
        border-radius: 10px;
        background: repeating-linear-gradient(
          90deg,
          rgba(10, 63, 39, 0.32) 0,
          rgba(10, 63, 39, 0.32) 6px,
          transparent 6px,
          transparent 14px
        );
      }

      .tree {
        position: absolute;
        left: 34px;
        bottom: 66px;
        width: 18px;
        height: 110px;
        border-radius: 8px;
        background: #8c3b17;
        transform: skew(-7deg);
      }

      .tree::before,
      .tree::after {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: #8fd63f;
        box-shadow:
          -44px 28px 0 0 #8fd63f,
          30px 36px 0 0 #8fd63f,
          -14px 54px 0 0 #8fd63f;
      }

      .tree::before {
        top: -6px;
        left: -12px;
        width: 72px;
        height: 58px;
      }

      .tree::after {
        top: 34px;
        left: -24px;
        width: 58px;
        height: 40px;
      }

      .avatar {
        position: absolute;
        left: 50%;
        bottom: 72px;
        display: grid;
        place-items: center;
        width: 136px;
        height: 136px;
        margin-left: -68px;
        border-radius: 28px;
        background:
          radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.9), transparent 16%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(218, 247, 232, 0.78));
        border: 5px solid rgba(255, 255, 255, 0.65);
        box-shadow: 0 18px 38px rgba(16, 52, 47, 0.28);
      }

      .avatar-core {
        display: grid;
        place-items: center;
        width: 86px;
        height: 86px;
        border-radius: 24px;
        background: linear-gradient(135deg, var(--teal) 0%, #69d0af 100%);
        color: #ffffff;
        font-size: 32px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }

      .portrait-hud {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .retro-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.9);
        color: #10243a;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .portrait-footer {
        position: absolute;
        left: 18px;
        right: 18px;
        bottom: 18px;
        z-index: 1;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        color: rgba(255, 255, 255, 0.98);
      }

      .portrait-footer h2 {
        margin: 0 0 6px;
        font-size: 28px;
        line-height: 1;
      }

      .portrait-footer p {
        margin: 0;
        color: rgba(255, 255, 255, 0.82);
        font-size: 13px;
      }

      .portrait-mini {
        max-width: 102px;
        text-align: right;
        font-size: 11px;
        line-height: 1.35;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .stat-sheet {
        display: grid;
        gap: 14px;
      }

      .stat-line {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .stat-line-label {
        font-family: "Courier New", monospace;
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      .stat-track {
        position: relative;
        height: 20px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .stat-fill {
        position: absolute;
        top: 2px;
        left: 2px;
        bottom: 2px;
        border-radius: inherit;
        background: linear-gradient(90deg, #73f3b7, #bff7de);
      }

      .stat-fill.energy {
        background: linear-gradient(90deg, #7dd9ea, #b8f0f6);
      }

      .stat-fill.co2 {
        background: linear-gradient(90deg, #ffd470, #fff0c6);
      }

      .stat-fill.runs {
        background: linear-gradient(90deg, #f48cc3, #ffd2e7);
      }

      .stat-line-value {
        font-family: "Courier New", monospace;
        font-size: 13px;
        white-space: nowrap;
      }

      .stats-card {
        display: grid;
        gap: 18px;
      }

      .stats-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--line);
      }

      .section-kicker {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .stats-header h3,
      .headline-card h1,
      .detail-card h2 {
        margin: 6px 0 0;
      }

      .stats-header h3 {
        font-size: 28px;
        letter-spacing: -0.03em;
      }

      .metric-block {
        display: grid;
        gap: 10px;
      }

      .metric-block h4 {
        margin: 0;
        font-size: 17px;
        letter-spacing: -0.02em;
      }

      .metric-inline {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
      }

      .metric-inline strong {
        font-size: 18px;
      }

      .metric-note {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .smell-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .smell-chip {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 10px 12px;
        border-radius: 16px;
        background: #171717;
        color: #faf6ee;
        font-size: 13px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      }

      .smell-chip strong {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #9fd3ff;
      }

      .meter-row {
        display: grid;
        gap: 10px;
      }

      .pips {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }

      .pip {
        height: 28px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: rgba(17, 17, 17, 0.06);
      }

      .pip.active.good {
        background: linear-gradient(180deg, #89e7bc, #46b778);
      }

      .pip.active.warn {
        background: linear-gradient(180deg, #ffd67c, #f2b043);
      }

      .pip.active.danger {
        background: linear-gradient(180deg, #ffa9c8, #ef5ca2);
      }

      .pip.active.neutral {
        background: linear-gradient(180deg, #c8d4e9, #7e93b6);
      }

      .meter-scale {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .health-track {
        position: relative;
        height: 28px;
        overflow: hidden;
        border-radius: 999px;
        border: 1px solid rgba(20, 44, 70, 0.12);
        background: #1a2b6c;
      }

      .health-fill {
        position: absolute;
        top: 4px;
        left: 4px;
        bottom: 4px;
        border-radius: inherit;
        background: linear-gradient(90deg, #ff72af, #ffc6de);
        box-shadow: 0 0 16px rgba(255, 114, 175, 0.35);
      }

      .headline-card {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 18px;
        background: linear-gradient(180deg, rgba(255, 251, 244, 0.88), rgba(255, 248, 238, 0.94));
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        padding: 9px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-pill.good {
        background: var(--forest-soft);
        color: var(--forest);
      }

      .status-pill.warn {
        background: var(--amber-soft);
        color: #9d5d00;
      }

      .status-pill.danger {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .status-pill.neutral {
        background: var(--navy-soft);
        color: var(--navy);
      }

      .headline-card h1 {
        font-size: clamp(3.2rem, 5vw, 5.3rem);
        line-height: 0.95;
        letter-spacing: -0.06em;
      }

      .headline-card p {
        margin: 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.55;
      }

      .headline-stack {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .headline-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: 14px;
        background: rgba(17, 17, 17, 0.05);
        font-size: 12px;
      }

      .headline-chip strong {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .mission-list {
        display: grid;
        gap: 12px;
        padding-top: 8px;
      }

      .mission-row {
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .mission-row strong {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .mission-row span {
        display: block;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }

      .snapshot-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 18px;
        margin-top: 24px;
      }

      .snapshot-card {
        padding: 18px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.78);
        box-shadow: var(--shadow-soft);
      }

      .snapshot-card.good {
        background: linear-gradient(180deg, #f6fff7, #ebfff0);
      }

      .snapshot-card.warn {
        background: linear-gradient(180deg, #fffaf0, #fff2d8);
      }

      .snapshot-card.danger {
        background: linear-gradient(180deg, #fff7fa, #ffe5ef);
      }

      .snapshot-card.neutral {
        background: linear-gradient(180deg, #fbfbfb, #f2f1ef);
      }

      .snapshot-card p {
        margin: 0;
      }

      .snapshot-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .snapshot-value {
        margin-top: 10px;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .snapshot-detail {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
      }

      .details-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
        gap: 20px;
        margin-top: 24px;
      }

      .detail-card {
        padding: 24px;
        border-radius: 28px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.78);
        box-shadow: var(--shadow-soft);
      }

      .detail-card h2 {
        font-size: 28px;
        letter-spacing: -0.04em;
      }

      .detail-subtitle {
        margin: 8px 0 18px;
        color: var(--muted);
        font-size: 14px;
      }

      .empty {
        padding: 18px;
        border-radius: 18px;
        border: 1px dashed rgba(17, 17, 17, 0.14);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.5);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.7);
      }

      th,
      td {
        padding: 14px 16px;
        text-align: left;
      }

      thead {
        background: rgba(13, 138, 116, 0.08);
      }

      tbody tr:nth-child(odd) {
        background: rgba(17, 17, 17, 0.02);
      }

      tbody tr:nth-child(even) {
        background: rgba(17, 17, 17, 0.045);
      }

      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .mini-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .mini-meta .mission-row {
        background: rgba(255, 255, 255, 0.62);
      }

      details {
        margin-top: 14px;
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.7);
      }

      summary {
        cursor: pointer;
        padding: 14px 16px;
        font-weight: 800;
      }

      pre {
        margin: 0;
        padding: 16px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #eff8f5;
        font-size: 13px;
        line-height: 1.55;
        font-family: "SFMono-Regular", "Courier New", monospace;
        background: #13242e;
      }

      code {
        font-family: "SFMono-Regular", "Courier New", monospace;
      }

      .muted {
        color: var(--muted);
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes floatClouds {
        from {
          transform: translateX(-8px);
        }
        to {
          transform: translateX(10px);
        }
      }

      @media (max-width: 1180px) {
        .poster-grid,
        .snapshot-grid,
        .details-grid {
          grid-template-columns: 1fr;
        }

        .headline-card h1 {
          font-size: clamp(2.8rem, 8vw, 4.6rem);
        }
      }

      @media (max-width: 720px) {
        main {
          padding: 20px 16px 40px;
        }

        .poster {
          padding: 18px;
          border-radius: 24px;
        }

        .poster::after {
          inset: 10px;
          border-radius: 18px;
        }

        .poster-top {
          flex-direction: column;
        }

        .poster-kicker {
          font-size: 2.3rem;
        }

        .panel-card,
        .detail-card {
          padding: 18px;
          border-radius: 22px;
        }

        .portrait {
          min-height: 310px;
        }

        .portrait-footer {
          flex-direction: column;
          align-items: flex-start;
        }

        .metric-inline {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="poster">
        <div class="poster-top">
          <div>
            <h1 class="poster-kicker">Visualization<br />(infographic)</h1>
            <p class="poster-caption">
              PyGreenSense results are now framed like a presentation slide, so the latest run reads more like a quick report than a raw dashboard.
            </p>
          </div>
          <div class="brand-tag">PyGreenSense extension</div>
        </div>

        <div class="poster-grid">
          <section class="panel-card profile-card">
            <div class="portrait">
              <div class="portrait-hud">
                <span class="retro-chip">Run ${escapeHtml(String(Math.max(historyEntries.length, 1)).padStart(2, '0'))}</span>
                <span class="retro-chip">${escapeHtml(workspaceName)}</span>
              </div>
              <div class="tree"></div>
              <div class="avatar">
                <div class="avatar-core">${escapeHtml(fileBadge)}</div>
              </div>
              <div class="portrait-footer">
                <div>
                  <h2>${escapeHtml(targetName)}</h2>
                  <p>${escapeHtml(getTargetModeLabel(data.targetFile, data.workspaceRoot))}</p>
                </div>
                <div class="portrait-mini">
                  eco scan<br />
                  ${escapeHtml(latestMetric?.date_time ?? 'latest run')}
                </div>
              </div>
            </div>

            <div class="stat-sheet">
              ${renderProfileStat('HP', `${healthMeter.label}`, healthMeter.fillPercent, 'health')}
              ${renderProfileStat('EP', energyMeter.label, invertPercent(energyMeter.fillPercent), 'energy')}
              ${renderProfileStat('CO2', formatNumber(latestMetric?.total_emissions_gCO2eq, ' g'), invertPercent(getEmissionPercent(latestMetric?.total_emissions_gCO2eq)), 'co2')}
              ${renderProfileStat('LVL', String(historyEntries.length || 0).padStart(2, '0'), getRunCountPercent(historyEntries.length), 'runs')}
            </div>
          </section>

          <section class="panel-card stats-card">
            <div class="stats-header">
              <div>
                <p class="section-kicker">Infographic Stats</p>
                <h3>Character-style summary</h3>
              </div>
              <span class="status-pill ${statusTone}">${escapeHtml(statusText)}</span>
            </div>

            <div class="metric-block">
              <div class="metric-inline">
                <div>
                  <h4>Debuff (code smells)</h4>
                  <p class="metric-note">
                    ${smellEntries.length > 0
                      ? `${totalSmells} finding(s) across ${smellEntries.length} rule(s), touching ${formatNumber(totalSmellLoc, ' LOC')}.`
                      : 'No smell breakdown was recorded in the latest entry.'}
                  </p>
                </div>
                <strong>${smellEntries.length > 0 ? `${totalSmells} total` : 'Clear'}</strong>
              </div>
              ${renderSmellChips(smellEntries)}
            </div>

            <div class="metric-block">
              <div class="metric-inline">
                <div>
                  <h4>Energy usage</h4>
                  <p class="metric-note">${escapeHtml(energyMeter.detail)}</p>
                </div>
                <strong>${escapeHtml(energyMeter.label)}</strong>
              </div>
              ${renderPipMeter(energyMeter, 'Low', 'High')}
            </div>

            <div class="metric-block">
              <div class="metric-inline">
                <div>
                  <h4>Speed (runtime)</h4>
                  <p class="metric-note">${escapeHtml(speedMeter.detail)}</p>
                </div>
                <strong>${escapeHtml(speedMeter.label)}</strong>
              </div>
              ${renderPipMeter(speedMeter, 'Slow', 'Fast')}
            </div>

            <div class="metric-block">
              <div class="metric-inline">
                <div>
                  <h4>Health (overall)</h4>
                  <p class="metric-note">${escapeHtml(healthMeter.detail)}</p>
                </div>
                <strong>${escapeHtml(healthMeter.label)}</strong>
              </div>
              <div class="health-track">
                <div class="health-fill" style="width: ${healthMeter.fillPercent}%"></div>
              </div>
            </div>
          </section>

          <aside class="panel-card headline-card">
            <span class="status-pill ${statusTone}">${escapeHtml(data.runResult.code === 0 ? 'Ready to share' : 'Needs attention')}</span>
            <h1>${escapeHtml(spotlight.title)}</h1>
            <p>${escapeHtml(spotlight.subtitle)}</p>
            <div class="headline-stack">
              ${renderHeadlineChip('Target', targetName)}
              ${renderHeadlineChip('Workspace', workspaceName)}
              ${renderHeadlineChip('History', data.history.foundPath ? 'Synced' : 'Missing')}
            </div>
            <div class="mission-list">
              ${renderMissionRow('File path', data.targetFile)}
              ${renderMissionRow('Workspace root', data.workspaceRoot)}
              ${renderMissionRow('History file', data.history.foundPath ?? 'Not found')}
              ${renderMissionRow('Region / country', getRegionLabel(latestMetric))}
            </div>
          </aside>
        </div>
      </section>

      <section class="snapshot-grid">
        ${snapshotCards}
      </section>

      <div class="details-grid">
        <section class="detail-card">
          <p class="section-kicker">Breakdown</p>
          <h2>Smell ledger</h2>
          <p class="detail-subtitle">The full rule table stays available underneath the infographic for detailed inspection.</p>
          ${renderSmellBreakdownTable(smellEntries)}
          <div class="mini-meta">
            ${renderMissionRow('Tracked target', String(latestMetric?.target_file ?? data.targetFile))}
            ${renderMissionRow('Duration', formatNumber(latestMetric?.duration_seconds, ' s'))}
            ${renderMissionRow('Country', latestMetric?.country_name ?? 'Unknown')}
            ${renderMissionRow('Status', statusText)}
          </div>
        </section>

        <section class="detail-card">
          <p class="section-kicker">Logs</p>
          <h2>Terminal output</h2>
          <p class="detail-subtitle">Raw stdout and stderr are still here when you need debugging context.</p>
          ${stdout ? `<details open><summary>stdout</summary><pre>${escapeHtml(stdout)}</pre></details>` : '<div class="empty">No stdout was captured for this run.</div>'}
          ${stderr ? `<details ${stdout ? '' : 'open'}><summary>stderr</summary><pre>${escapeHtml(stderr)}</pre></details>` : '<p class="muted">stderr was empty.</p>'}
          ${latestMetric ? `<details><summary>Latest history.json entry</summary><pre>${latestMetricJson}</pre></details>` : '<div class="empty">No persisted history entry was available for a raw JSON preview.</div>'}
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function renderProfileStat(label: string, value: string, fillPercent: number, variant: 'health' | 'energy' | 'co2' | 'runs'): string {
  return `
    <div class="stat-line">
      <span class="stat-line-label">${escapeHtml(label)}</span>
      <div class="stat-track">
        <div class="stat-fill ${variant}" style="width: ${Math.max(0, Math.min(fillPercent, 100))}%"></div>
      </div>
      <span class="stat-line-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderSmellChips(smellEntries: Array<[string, SmellBreakdownEntry]>): string {
  if (smellEntries.length === 0) {
    return '<div class="empty">No smell categories were available to turn into debuffs.</div>';
  }

  return `
    <div class="smell-list">
      ${smellEntries.slice(0, 6).map(([rule, entry]) => `
        <span class="smell-chip">
          <strong>${escapeHtml(trimRuleLabel(rule))}</strong>
          <span>${entry.count ?? 0} hit(s)</span>
        </span>
      `).join('')}
    </div>
  `;
}

function renderPipMeter(meter: MeterData, startLabel: string, endLabel: string): string {
  return `
    <div class="meter-row">
      <div class="pips">
        ${Array.from({ length: meter.maxUnits }, (_, index) => {
          const active = index < meter.activeUnits;
          return `<span class="pip ${active ? `active ${meter.tone}` : ''}"></span>`;
        }).join('')}
      </div>
      <div class="meter-scale">
        <span>${escapeHtml(startLabel)}</span>
        <span>${escapeHtml(endLabel)}</span>
      </div>
    </div>
  `;
}

function renderHeadlineChip(label: string, value: string): string {
  return `
    <span class="headline-chip">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </span>
  `;
}

function renderMissionRow(label: string, value: string): string {
  return `
    <div class="mission-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

function renderSnapshotCard(
  label: string,
  value: string,
  detail: string,
  tone: 'good' | 'warn' | 'danger' | 'neutral'
): string {
  return `
    <article class="snapshot-card ${tone}">
      <p class="snapshot-label">${escapeHtml(label)}</p>
      <p class="snapshot-value">${escapeHtml(value)}</p>
      <p class="snapshot-detail">${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderSmellBreakdownTable(smellEntries: Array<[string, SmellBreakdownEntry]>): string {
  if (smellEntries.length === 0) {
    return '<div class="empty">No smell breakdown data was found in the latest history entry.</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Rule</th>
          <th class="num">Count</th>
          <th class="num">LOC</th>
        </tr>
      </thead>
      <tbody>
        ${smellEntries.map(([rule, entry]) => `
          <tr>
            <td>${escapeHtml(rule)}</td>
            <td class="num">${entry.count ?? 0}</td>
            <td class="num">${entry.loc ?? 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function getSmellEntries(smellBreakdown: Record<string, SmellBreakdownEntry> | undefined): Array<[string, SmellBreakdownEntry]> {
  return Object.entries(smellBreakdown ?? {}).sort(([, left], [, right]) => {
    return (right.count ?? 0) - (left.count ?? 0);
  });
}

function getSpotlightCopy(
  runCode: number,
  latestMetric: HistoryMetric | null,
  totalSmells: number
): { title: string; subtitle: string } {
  if (runCode !== 0) {
    return {
      title: 'Recovery Mode',
      subtitle: 'The latest run did not finish cleanly, so this infographic keeps the focus on debugging signals and rerun readiness.',
    };
  }

  if (!latestMetric) {
    return {
      title: 'Insight Pending',
      subtitle: 'PyGreenSense finished, but the panel is still waiting for a persisted history entry to fill in the richer eco metrics.',
    };
  }

  if (totalSmells === 0) {
    return {
      title: 'Carbon Cleaner',
      subtitle: 'This run looks tidy enough to present: no recorded smell debuffs and a clean eco snapshot ready for quick review.',
    };
  }

  if (totalSmells <= 5) {
    return {
      title: 'Eco Scout',
      subtitle: 'A few smell debuffs showed up, but the run still reads like a manageable refactor quest with clear action points.',
    };
  }

  return {
    title: 'Refactor Quest',
    subtitle: 'The latest scan found enough smell pressure that the infographic shifts into a repair-oriented summary instead of a victory card.',
  };
}

function getStatusTone(runCode: number, status: string | undefined): MeterData['tone'] {
  if (runCode !== 0) {
    return 'danger';
  }

  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'neutral';
  }

  if (normalized.includes('green') || normalized.includes('good') || normalized.includes('pass')) {
    return 'good';
  }

  if (normalized.includes('yellow') || normalized.includes('warn') || normalized.includes('medium')) {
    return 'warn';
  }

  if (normalized.includes('red') || normalized.includes('bad') || normalized.includes('fail')) {
    return 'danger';
  }

  return 'neutral';
}

function getEnergyMeter(value: unknown): MeterData {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      activeUnits: 0,
      maxUnits: 5,
      label: 'N/A',
      detail: 'Energy consumption was not recorded for this run.',
      fillPercent: 0,
      tone: 'neutral',
    };
  }

  const activeUnits = 1 + [0.00005, 0.0002, 0.001, 0.005].filter((threshold) => value > threshold).length;
  const tone: MeterData['tone'] = activeUnits >= 4 ? 'danger' : activeUnits === 3 ? 'warn' : 'good';

  return {
    activeUnits,
    maxUnits: 5,
    label: formatNumber(value, ' kWh'),
    detail: activeUnits <= 2 ? 'Light draw for the latest run.' : activeUnits === 3 ? 'Moderate draw for the latest run.' : 'Higher energy draw for the latest run.',
    fillPercent: (activeUnits / 5) * 100,
    tone,
  };
}

function getSpeedMeter(value: unknown): MeterData {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      activeUnits: 0,
      maxUnits: 5,
      label: 'N/A',
      detail: 'Runtime data was not available for this run.',
      fillPercent: 0,
      tone: 'neutral',
    };
  }

  let activeUnits = 1;
  if (value <= 1) {
    activeUnits = 5;
  } else if (value <= 3) {
    activeUnits = 4;
  } else if (value <= 8) {
    activeUnits = 3;
  } else if (value <= 15) {
    activeUnits = 2;
  }

  const tone: MeterData['tone'] = activeUnits >= 4 ? 'good' : activeUnits === 3 ? 'warn' : 'danger';

  return {
    activeUnits,
    maxUnits: 5,
    label: formatNumber(value, ' s'),
    detail: activeUnits >= 4 ? 'Quick analysis pacing.' : activeUnits === 3 ? 'Balanced runtime for a deeper scan.' : 'Longer runtime than a quick scan.',
    fillPercent: (activeUnits / 5) * 100,
    tone,
  };
}

function getHealthMeter({
  latestMetric,
  runCode,
  totalSmells,
}: {
  latestMetric: HistoryMetric | null;
  runCode: number;
  totalSmells: number;
}): MeterData {
  let score = runCode === 0 ? 88 : 42;

  if (latestMetric) {
    const statusTone = getStatusTone(runCode, latestMetric.status);
    if (statusTone === 'warn') {
      score -= 10;
    } else if (statusTone === 'danger') {
      score -= 18;
    }

    if (typeof latestMetric.total_emissions_gCO2eq === 'number' && !Number.isNaN(latestMetric.total_emissions_gCO2eq)) {
      score -= Math.min(latestMetric.total_emissions_gCO2eq / 3, 20);
    }

    if (typeof latestMetric.duration_seconds === 'number' && !Number.isNaN(latestMetric.duration_seconds)) {
      score -= Math.min(latestMetric.duration_seconds * 1.2, 14);
    }
  } else {
    score -= 12;
  }

  score -= Math.min(totalSmells * 3, 24);
  score = clamp(Math.round(score), 10, 100);

  return {
    activeUnits: Math.max(1, Math.ceil(score / 20)),
    maxUnits: 5,
    label: `${score}/100`,
    detail: 'Derived visual score from run success, emissions, runtime, and smell pressure.',
    fillPercent: score,
    tone: score >= 70 ? 'good' : score >= 45 ? 'warn' : 'danger',
  };
}

function getRegionLabel(metric: HistoryMetric | null): string {
  const region = metric?.region ?? 'Unknown region';
  const country = metric?.country_name ?? 'Unknown country';
  return `${region} / ${country}`;
}

function getTargetModeLabel(targetFile: string, workspaceRoot: string): string {
  return targetFile === workspaceRoot ? 'Project-wide analysis' : 'Single file analysis';
}

function getFileBadge(targetName: string): string {
  const extension = path.extname(targetName).replace('.', '').trim().toUpperCase();
  return (extension || 'PY').slice(0, 3);
}

function trimRuleLabel(rule: string): string {
  return rule.length > 18 ? `${rule.slice(0, 18)}…` : rule;
}

function getEmissionPercent(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return clamp((value / 60) * 100, 8, 100);
}

function getRunCountPercent(runCount: number): number {
  return clamp(runCount * 16, 12, 100);
}

function invertPercent(value: number): number {
  if (value <= 0) {
    return 18;
  }

  return clamp(100 - value + 18, 18, 100);
}

function countLines(value: string): number {
  return value.split(/\r?\n/).filter(Boolean).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: unknown, suffix = ''): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `N/A${suffix}`;
  }

  const absolute = Math.abs(value);
  let formatted: string;

  if (absolute === 0) {
    formatted = '0';
  } else if (absolute >= 100) {
    formatted = value.toFixed(2);
  } else if (absolute >= 1) {
    formatted = value.toPrecision(4).replace(/\.?0+$/, '');
  } else {
    formatted = value.toPrecision(3).replace(/\.?0+$/, '');
  }

  return `${formatted}${suffix}`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No baseline';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
