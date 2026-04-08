import * as path from 'path';
import * as vscode from 'vscode';
import {
  getHistoryEntries,
  getLatestHistoryMetric,
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
  const smellRows = renderSmellBreakdown(latestMetric?.smell_breakdown);
  const historySummary = latestMetric
    ? `
      <section class="panel">
        <div class="section-head">
          <p class="eyebrow">History Summary</p>
          <h2>Latest metrics</h2>
        </div>
        <div class="card-grid">
          ${renderCard('Green Status', latestMetric.status ?? 'Unknown', latestMetric.date_time ?? 'No timestamp')}
          ${renderCard('Total CO2', formatNumber(latestMetric.total_emissions_gCO2eq, ' gCO2eq'), historyEntries.length > 0 ? `${historyEntries.length} saved run(s)` : 'No saved runs')}
          ${renderCard('SCI / Line', formatNumber(latestMetric.sci_gCO2eq_per_line, ' gCO2eq'), formatNumber(latestMetric.lines_of_code, ' LOC'))}
          ${renderCard('Duration', formatNumber(latestMetric.duration_seconds, ' s'), formatPercent(latestMetric.improvement_percent))}
        </div>
        <div class="meta-grid">
          ${renderMetaRow('History file', data.history.foundPath ?? 'Not found')}
          ${renderMetaRow('Target tracked by history', String(latestMetric.target_file ?? data.targetFile))}
          ${renderMetaRow('Region', latestMetric.region ?? 'Unknown')}
          ${renderMetaRow('Country', latestMetric.country_name ?? 'Unknown')}
        </div>
      </section>
    `
    : `
      <section class="panel">
        <div class="section-head">
          <p class="eyebrow">History Summary</p>
          <h2>No history payload found</h2>
        </div>
        <p class="muted">
          PyGreenSense finished, but the extension could not read a persisted <code>history.json</code>.
        </p>
        <div class="meta-grid">
          ${renderMetaRow('Checked paths', data.history.pathChecked.join('\n'))}
        </div>
      </section>
    `;

  const latestMetricJson = latestMetric ? escapeHtml(JSON.stringify(latestMetric, null, 2)) : '';
  const stdout = data.runResult.stdout.trim();
  const stderr = data.runResult.stderr.trim();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PyGreenSense Results</title>
    <style>
      :root {
        --bg: #0f1720;
        --panel: rgba(14, 29, 35, 0.78);
        --panel-strong: rgba(16, 35, 42, 0.92);
        --border: rgba(138, 201, 177, 0.18);
        --text: #ecf6f1;
        --muted: #9fb9ad;
        --accent: #62d6a0;
        --accent-soft: rgba(98, 214, 160, 0.16);
        --warning: #ffd58b;
        --danger: #ff8f8f;
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(98, 214, 160, 0.16), transparent 32%),
          radial-gradient(circle at top right, rgba(255, 213, 139, 0.12), transparent 28%),
          linear-gradient(180deg, #081015 0%, #0f1720 100%);
      }

      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }

      .hero {
        margin-bottom: 24px;
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: linear-gradient(135deg, rgba(98, 214, 160, 0.14), rgba(13, 28, 34, 0.94));
        box-shadow: var(--shadow);
      }

      .hero h1 {
        margin: 8px 0 12px;
        font-size: 30px;
        line-height: 1.1;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
      }

      .hero-meta {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }

      .eyebrow {
        margin: 0;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        background: var(--accent-soft);
        color: var(--accent);
      }

      .status-chip.failure {
        background: rgba(255, 143, 143, 0.14);
        color: var(--danger);
      }

      .layout {
        display: grid;
        gap: 20px;
      }

      .panel {
        padding: 22px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(8px);
      }

      .section-head {
        margin-bottom: 18px;
      }

      .section-head h2 {
        margin: 6px 0 0;
        font-size: 22px;
      }

      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }

      .card {
        padding: 16px;
        border-radius: 18px;
        background: var(--panel-strong);
        border: 1px solid rgba(138, 201, 177, 0.14);
      }

      .card-label {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .card-value {
        margin: 10px 0 6px;
        font-size: 24px;
        font-weight: 700;
      }

      .card-detail {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
      }

      .meta-grid {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .meta-row {
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(138, 201, 177, 0.08);
      }

      .meta-row dt {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta-row dd {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 16px;
      }

      th,
      td {
        padding: 12px 14px;
        text-align: left;
      }

      thead {
        background: rgba(98, 214, 160, 0.08);
      }

      tbody tr:nth-child(odd) {
        background: rgba(255, 255, 255, 0.02);
      }

      tbody tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.04);
      }

      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .muted {
        color: var(--muted);
      }

      details {
        margin-top: 16px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid rgba(138, 201, 177, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }

      summary {
        cursor: pointer;
        padding: 14px 16px;
        font-weight: 700;
      }

      pre {
        margin: 0;
        padding: 16px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #d8f4e8;
        font-size: 13px;
        line-height: 1.55;
        font-family: "JetBrains Mono", "SFMono-Regular", monospace;
        background: rgba(5, 10, 14, 0.58);
      }

      code {
        font-family: "JetBrains Mono", "SFMono-Regular", monospace;
      }

      .two-col {
        display: grid;
        gap: 20px;
        grid-template-columns: 1.2fr 0.8fr;
      }

      .empty {
        padding: 20px;
        border-radius: 18px;
        border: 1px dashed rgba(138, 201, 177, 0.18);
        color: var(--muted);
      }

      @media (max-width: 900px) {
        .two-col {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">PyGreenSense WebView</p>
        <h1>${escapeHtml(path.basename(data.targetFile))}</h1>
        <p>${escapeHtml(data.targetFile)}</p>
        <div class="hero-meta">
          <span class="status-chip ${data.runResult.code === 0 ? '' : 'failure'}">
            ${data.runResult.code === 0 ? 'Run complete' : 'Run failed'}
            <span>Exit code ${data.runResult.code}</span>
          </span>
          <p>Workspace: <code>${escapeHtml(data.workspaceRoot)}</code></p>
        </div>
      </section>

      <div class="layout">
        ${historySummary}

        <div class="two-col">
          <section class="panel">
            <div class="section-head">
              <p class="eyebrow">Smell Breakdown</p>
              <h2>Rules affected in the latest history entry</h2>
            </div>
            ${smellRows}
          </section>

          <section class="panel">
            <div class="section-head">
              <p class="eyebrow">Terminal Output</p>
              <h2>PyGreenSense library stdout and stderr</h2>
            </div>
            ${stdout ? `<details open><summary>stdout</summary><pre>${escapeHtml(stdout)}</pre></details>` : '<div class="empty">No stdout was captured for this run.</div>'}
            ${stderr ? `<details ${stdout ? '' : 'open'}><summary>stderr</summary><pre>${escapeHtml(stderr)}</pre></details>` : '<p class="muted">stderr was empty.</p>'}
          </section>
        </div>

        ${latestMetric ? `
          <section class="panel">
            <div class="section-head">
              <p class="eyebrow">Raw History</p>
              <h2>Latest history.json entry</h2>
            </div>
            <pre>${latestMetricJson}</pre>
          </section>
        ` : ''}
      </div>
    </main>
  </body>
</html>`;
}

function renderSmellBreakdown(smellBreakdown: Record<string, SmellBreakdownEntry> | undefined): string {
  const rows = Object.entries(smellBreakdown ?? {}).sort(([, left], [, right]) => {
    return (right.count ?? 0) - (left.count ?? 0);
  });

  if (rows.length === 0) {
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
        ${rows.map(([rule, entry]) => `
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

function renderCard(label: string, value: string, detail: string): string {
  return `
    <article class="card">
      <p class="card-label">${escapeHtml(label)}</p>
      <p class="card-value">${escapeHtml(value)}</p>
      <p class="card-detail">${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderMetaRow(label: string, value: string): string {
  return `
    <dl class="meta-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </dl>
  `;
}

function formatNumber(value: unknown, suffix = ''): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `N/A${suffix}`;
  }

  const formatted = Math.abs(value) >= 100
    ? value.toFixed(2)
    : value.toPrecision(4).replace(/\.?0+$/, '');

  return `${formatted}${suffix}`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No previous baseline';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}% vs previous`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
