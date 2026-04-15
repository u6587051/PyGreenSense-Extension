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
  type ParsedReport,
  type ParsedSeverity,
} from './reportParser';

export type PyGreenSenseResultsViewModel = {
  extensionUri: vscode.Uri;
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
  tone?: ParsedSeverity;
};

type PromptMessage = {
  type: 'copyPrompt';
  prompt: string;
};

let resultsPanel: vscode.WebviewPanel | undefined;
let resultsPanelDisposables: vscode.Disposable[] = [];

export function showPyGreenSenseResultsPanel(data: PyGreenSenseResultsViewModel): void {
  const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
  const title = `PyGreenSense Report: ${path.basename(data.targetFile)}`;

  if (!resultsPanel) {
    resultsPanel = vscode.window.createWebviewPanel(
      'pygreensenseResults',
      title,
      {
        viewColumn: column,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(data.extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    resultsPanelDisposables.push(
      resultsPanel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!isPromptMessage(message)) {
          return;
        }

        await vscode.env.clipboard.writeText(message.prompt);
        void vscode.window.showInformationMessage('PyGreenSense fix prompt copied to the clipboard.');
      })
    );

    resultsPanel.onDidDispose(() => {
      resultsPanelDisposables.forEach(disposable => disposable.dispose());
      resultsPanelDisposables = [];
      resultsPanel = undefined;
    });
  } else {
    resultsPanel.title = title;
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
  const issueTypeCount = countIssueTypes(latestMetric, parsedReport);
  const targetPath = firstNonEmpty(parsedReport.targetFile, latestMetric?.target_file, data.targetFile) ?? data.targetFile;
  const targetLabel = formatPathForDisplay(targetPath, data.workspaceRoot);
  const workspaceLabel = path.basename(data.workspaceRoot) || data.workspaceRoot;
  const statusLabel =
    firstNonEmpty(latestMetric?.status, parsedReport.currentRunStatus, data.runResult.code === 0 ? 'Run complete' : 'Run failed') ??
    'Run complete';
  const metrics = getMetricCards({
    latestMetric,
    parsedReport,
    historyRunCount: historyEntries.length,
    issueCount,
    issueTypeCount,
  });
  const detailRows = getDetailRows(data, latestMetric, parsedReport);
  const programOutputLines = parsedReport.programOutput;
  const stdout = data.runResult.stdout.trim();
  const stderr = data.runResult.stderr.trim();
  const rawOutput = stdout || stderr;
  const statusTone = getStatusTone(statusLabel, data.runResult.code);
  const summaryPrompt = buildSummaryPrompt(targetLabel, issueCount, smellSummaries);
  const cloudImageUri = webview.asWebviewUri(vscode.Uri.joinPath(data.extensionUri, 'media', 'simple-cloud.png'));

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <title>PyGreenSense VS Code panel</title>
    <style>
      :root {
        color-scheme: light dark;
        --font-mono: var(--vscode-editor-font-family, "SFMono-Regular", "Cascadia Mono", "Menlo", monospace);
        --font-ui: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        --cloud-image: url("${cloudImageUri}");
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        min-height: 100vh;
        padding: 0 6px 48px;
        background: #ffffff;
        color: #111111;
        font-family: Georgia, "Times New Roman", serif;
      }

      .panel-title {
        margin: 8px 0 4px;
        font-size: 24px;
        line-height: 1.1;
        font-weight: 700;
      }

      .vsc {
        background: #1e1e1e;
        font-family: var(--font-mono);
        color: #cccccc;
        font-size: 12px;
        border-radius: 8px;
        overflow: hidden;
      }

      .vsc-bar {
        background: #3c3c3c;
        height: 34px;
        display: flex;
        align-items: stretch;
        border-bottom: 1px solid #252526;
      }

      .vsc-bartab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 18px;
        font-size: 12px;
        color: #cccccc;
        border-right: 1px solid #252526;
        border-top: 2px solid #0078d4;
        background: #1e1e1e;
      }

      .vsc-barspace {
        flex: 1;
      }

      .vsc-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 10px;
      }

      .vsc-btn {
        width: 24px;
        height: 24px;
        background: #333333;
        border: 1px solid #444444;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #aaaaaa;
        font-size: 11px;
      }

      .vsc-btn:hover,
      .vsc-btn:focus-visible {
        border-color: #0078d4;
        color: #ffffff;
        outline: none;
      }

      .sky {
        background: #0d1117;
        position: relative;
        height: 268px;
        overflow: hidden;
        border-bottom: 1px solid #161b22;
      }

      @keyframes f1 {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-7px); }
      }

      @keyframes f2 {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }

      @keyframes f3 {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-9px); }
      }

      .cld {
        position: absolute;
        cursor: pointer;
        border: 0;
        background: transparent;
        padding: 0;
        color: inherit;
      }

      .cld:nth-child(1) {
        animation: f1 4.2s ease-in-out infinite;
      }

      .cld:nth-child(2) {
        animation: f2 5.5s ease-in-out infinite 0.8s;
      }

      .cld:nth-child(3) {
        animation: f1 6s ease-in-out infinite 1.6s;
      }

      .cld:nth-child(4) {
        animation: f3 4.8s ease-in-out infinite 0.4s;
      }

      .cld:nth-child(5) {
        animation: f2 5.2s ease-in-out infinite 1.2s;
      }

      .cld:hover svg,
      .cld:focus-visible svg,
      .cld:hover .cloud-shape,
      .cld:focus-visible .cloud-shape {
        opacity: 0.8;
      }

      .cld:focus-visible {
        outline: 1px solid #0078d4;
        outline-offset: 4px;
      }

      .sky-hint {
        position: absolute;
        bottom: 6px;
        left: 12px;
        font-size: 10px;
        color: #30363d;
        letter-spacing: 0.06em;
        font-family: var(--font-mono);
      }

      .cloud-png {
        position: relative;
        display: block;
        width: var(--cloud-width);
        height: var(--cloud-height);
      }

      .cloud-shape {
        position: absolute;
        inset: 0;
        background: #3d4451;
        -webkit-mask: var(--cloud-image) center / contain no-repeat;
        mask: var(--cloud-image) center / contain no-repeat;
        transition: opacity 140ms ease;
      }

      .cloud-text {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding-top: var(--cloud-text-shift);
        pointer-events: none;
        text-align: center;
        font-family: monospace;
      }

      .cloud-rule {
        color: #8b9cb3;
        font-size: var(--cloud-rule-size);
        letter-spacing: var(--cloud-letter-spacing);
        line-height: 1.1;
        text-transform: uppercase;
      }

      .cloud-count {
        margin-top: 3px;
        color: var(--cloud-accent);
        font-size: var(--cloud-count-size);
        font-weight: 500;
        line-height: 1;
      }

      .cloud-meta {
        margin-top: 5px;
        color: #8b9cb3;
        font-size: var(--cloud-meta-size);
        line-height: 1;
      }

      .tabs {
        display: flex;
        background: #252526;
        border-bottom: 1px solid #3e3e3e;
        padding: 0 12px;
        overflow-x: auto;
      }

      .tab {
        padding: 7px 14px;
        font-size: 11px;
        color: #858585;
        cursor: pointer;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .tab:hover,
      .tab:focus-visible {
        color: #cccccc;
        outline: none;
      }

      .tab.on {
        color: #cccccc;
        border-bottom-color: #0078d4;
      }

      .body {
        padding: 14px;
      }

      .sec {
        display: none;
      }

      .sec.on {
        display: block;
      }

      .file-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid #2d2d2d;
        min-width: 0;
      }

      .file-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        color: #4ec9b0;
      }

      .file-tag {
        flex: 0 0 auto;
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 3px;
        letter-spacing: 0.04em;
      }

      .tag-good {
        background: #1b2a1b;
        color: #4caf50;
        border: 1px solid #2d5a2d;
      }

      .tag-warn {
        background: #2a2000;
        color: #fbbf24;
        border: 1px solid #5a4200;
      }

      .tag-bad {
        background: #2a1b1b;
        color: #e57373;
        border: 1px solid #5a2d2d;
      }

      .mgrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }

      .mc {
        background: #252526;
        border: 1px solid #2d2d2d;
        border-left: 2px solid;
        padding: 10px 12px;
        border-radius: 4px;
        min-width: 0;
      }

      .mc-lbl {
        font-size: 9px;
        color: #858585;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
      }

      .mc-val {
        font-size: 15px;
        font-weight: 500;
        overflow-wrap: anywhere;
      }

      .mc-sub {
        font-size: 9px;
        color: #5a5a5a;
        margin-top: 2px;
      }

      .sec-hd {
        font-size: 9px;
        color: #858585;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        margin-bottom: 8px;
      }

      .kv-block {
        background: #252526;
        border: 1px solid #2d2d2d;
        border-radius: 4px;
        padding: 10px 12px;
      }

      .kv {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding: 4px 0;
        border-bottom: 0.5px solid #2a2a2a;
        font-size: 11px;
      }

      .kv:last-child {
        border-bottom: none;
      }

      .kk {
        color: #858585;
        flex: 0 0 auto;
      }

      .kv-val {
        color: #cccccc;
        text-align: right;
        max-width: 65%;
        overflow: hidden;
        text-overflow: ellipsis;
        overflow-wrap: anywhere;
      }

      .status-good {
        color: #4ec9b0;
      }

      .status-medium {
        color: #fbbf24;
      }

      .status-low {
        color: #fb923c;
      }

      .status-danger {
        color: #f87171;
      }

      .status-neutral {
        color: #cccccc;
      }

      .itbl {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .itbl th {
        font-size: 9px;
        color: #858585;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 6px 8px;
        text-align: left;
        border-bottom: 1px solid #2d2d2d;
        font-weight: 400;
      }

      .itbl td {
        font-size: 11px;
        color: #b0b0b0;
        padding: 7px 8px;
        border-bottom: 0.5px solid #222222;
        vertical-align: top;
        word-break: break-word;
      }

      .itbl tr:hover td {
        background: #252526;
      }

      .bdg {
        display: inline-block;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 500;
        white-space: nowrap;
      }

      .bdg.danger {
        background: #3d1a00;
        color: #f97316;
        border: 1px solid #7c2d12;
      }

      .bdg.medium {
        background: #2a2000;
        color: #fbbf24;
        border: 1px solid #5a4200;
      }

      .bdg.low {
        background: #3d1a00;
        color: #fb923c;
        border: 1px solid #7c3a00;
      }

      .bdg.neutral,
      .bdg.good {
        background: #172333;
        color: #569cd6;
        border: 1px solid #254664;
      }

      .line-muted {
        color: #5a5a5a;
      }

      .empty-row {
        color: #858585;
        text-align: center;
      }

      .hi {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
        padding: 10px 0;
        border-bottom: 0.5px solid #222222;
      }

      .hi:last-child {
        border-bottom: none;
      }

      .hn {
        width: 20px;
        height: 20px;
        background: #2a2a2a;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        color: #858585;
      }

      .hf {
        font-size: 11px;
        color: #4ec9b0;
        margin-bottom: 2px;
        overflow-wrap: anywhere;
      }

      .hd {
        font-size: 9px;
        color: #5a5a5a;
        margin-bottom: 4px;
      }

      .hps {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
      }

      .hp {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 2px;
        background: #2a2a2a;
        color: #858585;
        border: 0.5px solid #333333;
      }

      .hr-val {
        font-size: 10px;
        color: #cccccc;
        font-family: var(--font-mono);
        text-align: right;
        white-space: nowrap;
      }

      .hr-st {
        font-size: 9px;
        text-align: right;
        margin-top: 2px;
      }

      .out-block {
        background: #161616;
        border: 1px solid #2d2d2d;
        border-radius: 4px;
        padding: 12px;
        font-size: 10px;
        line-height: 1.9;
        color: #9ca3af;
        font-family: var(--font-mono);
        overflow-x: auto;
      }

      .out-line {
        min-height: 19px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .out-command {
        color: #6e6e6e;
      }

      .out-ok {
        color: #4ec9b0;
      }

      .out-text {
        color: #cccccc;
      }

      .raw-details {
        margin-top: 12px;
        color: #858585;
      }

      .raw-details summary {
        cursor: pointer;
        margin-bottom: 8px;
      }

      .raw-details pre {
        max-height: 340px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #9ca3af;
        font-family: var(--font-mono);
        font-size: 10px;
        line-height: 1.6;
      }

      @media (max-width: 720px) {
        body {
          padding: 0 0 32px;
        }

        .panel-title {
          padding: 0 8px;
          font-size: 19px;
        }

        .sky {
          height: 330px;
        }

        .mgrid {
          grid-template-columns: 1fr;
        }

        .file-row {
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .kv {
          display: grid;
          gap: 2px;
        }

        .kv-val {
          max-width: none;
          text-align: left;
        }

        .hi {
          grid-template-columns: 22px minmax(0, 1fr);
        }

        .hi > :last-child {
          grid-column: 2;
        }

        .hr-val,
        .hr-st {
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <h1 class="panel-title">PyGreenSense VS Code panel &mdash; carbon cloud visualization with code smell sizes, issues table, and run history</h1>
    <div class="vsc">
      <div class="vsc-bar">
        <div class="vsc-bartab">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="#4ec9b0" stroke-width="1.5"/>
            <path d="M8 5v4l2 2" stroke="#4ec9b0" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          PyGreenSense Report
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left:4px;opacity:0.5;" aria-hidden="true">
            <line x1="2" y1="2" x2="10" y2="10" stroke="#ccc" stroke-width="1.5"/>
            <line x1="10" y1="2" x2="2" y2="10" stroke="#ccc" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="vsc-barspace"></div>
        <div class="vsc-actions">
          <button class="vsc-btn" type="button" title="Copy summary prompt" data-prompt="${escapeHtml(summaryPrompt)}">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1"/>
              <line x1="5" y1="3" x2="5" y2="7" stroke="currentColor" stroke-width="1"/>
              <line x1="3" y1="5" x2="7" y2="5" stroke="currentColor" stroke-width="1"/>
            </svg>
          </button>
          <button class="vsc-btn" type="button" title="Show output" data-tab-jump="output">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="sky">
        ${renderCloudMap(smellSummaries, issueGroups)}
        <div class="sky-hint">cloud size reflects issue count &middot; click a cloud to copy a fix prompt</div>
      </div>

      <div class="tabs" role="tablist" aria-label="PyGreenSense report sections">
        <button class="tab on" type="button" role="tab" aria-selected="true" data-tab-button="analysis">Analysis</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-tab-button="issues">Issues (${escapeHtml(String(issueCount))})</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-tab-button="history">History</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-tab-button="output">Output</button>
      </div>

      <div class="body">
        <section id="s-analysis" class="sec on" role="tabpanel" data-tab-panel="analysis">
          <div class="file-row">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="2" y="1" width="9" height="12" rx="1" stroke="#4ec9b0" stroke-width="1"/>
              <line x1="4" y1="5" x2="9" y2="5" stroke="#4ec9b0" stroke-width="1"/>
              <line x1="4" y1="7.5" x2="9" y2="7.5" stroke="#4ec9b0" stroke-width="1"/>
              <line x1="4" y1="10" x2="7" y2="10" stroke="#4ec9b0" stroke-width="1"/>
            </svg>
            <span class="file-name" title="${escapeHtml(targetPath)}">${escapeHtml(path.basename(targetPath))}</span>
            <span class="file-tag tag-good">${escapeHtml(workspaceLabel)}</span>
            <span class="file-tag ${statusTone === 'danger' ? 'tag-bad' : statusTone === 'medium' ? 'tag-warn' : 'tag-good'}">${escapeHtml(statusLabel)}</span>
            <span class="file-tag tag-bad">${escapeHtml(String(issueCount))} smells</span>
          </div>
          <div class="mgrid">
            ${metrics.map(renderMetricCard).join('')}
          </div>
          <div class="sec-hd">Execution details</div>
          <div class="kv-block">
            ${detailRows.map(renderDetailRow).join('')}
          </div>
        </section>

        <section id="s-issues" class="sec" role="tabpanel" data-tab-panel="issues">
          <div style="overflow-x:auto;">
            <table class="itbl">
              <colgroup><col style="width:124px"/><col style="width:64px"/><col/></colgroup>
              <thead>
                <tr><th>Rule</th><th>Line</th><th>Message</th></tr>
              </thead>
              <tbody>
                ${renderIssueTableRows(issueGroups, shouldShowIssueFilePaths(issueGroups))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="s-history" class="sec" role="tabpanel" data-tab-panel="history">
          ${renderHistoryList(historyEntries, data.workspaceRoot)}
        </section>

        <section id="s-output" class="sec" role="tabpanel" data-tab-panel="output">
          <div class="sec-hd">Program output (last run)</div>
          <div class="out-block">
            ${renderProgramOutput(programOutputLines, data.runResult.code)}
          </div>
          ${
            rawOutput
              ? `<details class="raw-details">
                  <summary>Raw capture</summary>
                  <pre>${escapeHtml(stdout || stderr)}</pre>
                </details>`
              : ''
          }
        </section>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const tabButtons = Array.from(document.querySelectorAll('[data-tab-button]'));
      const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

      function activateTab(name) {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.tabButton === name;
          button.classList.toggle('on', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });

        tabPanels.forEach((panel) => {
          panel.classList.toggle('on', panel.dataset.tabPanel === name);
        });
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => activateTab(button.dataset.tabButton));
      });

      document.querySelectorAll('[data-tab-jump]').forEach((button) => {
        button.addEventListener('click', () => activateTab(button.dataset.tabJump));
      });

      document.querySelectorAll('[data-prompt]').forEach((element) => {
        element.addEventListener('click', () => {
          vscode.postMessage({
            type: 'copyPrompt',
            prompt: element.dataset.prompt || ''
          });
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
  issueTypeCount,
}: {
  latestMetric: HistoryMetric | null;
  parsedReport: ParsedReport;
  historyRunCount: number;
  issueCount: number;
  issueTypeCount: number;
}): MetricCard[] {
  const emissionKg = firstDefinedNumber(parsedReport.emissionKg, normalizeHistoryEmissionKg(latestMetric));
  const cfp = firstDefinedNumber(parsedReport.cfp, latestMetric?.cfp);
  const loc = firstDefinedNumber(parsedReport.loc, latestMetric?.lines_of_code);
  const issueFileCount = parsedReport.issueFileCount ?? 1;

  return [
    {
      label: 'Carbon emission',
      value: formatScientificNumber(emissionKg, ''),
      note: `kg CO2 - ${firstNonEmpty(parsedReport.region, latestMetric?.region) ?? 'latest'} grid`,
      tone: 'danger',
    },
    {
      label: 'Issues',
      value: String(issueCount),
      note: `in ${issueFileCount} file${issueFileCount === 1 ? '' : 's'} - ${issueTypeCount} type${issueTypeCount === 1 ? '' : 's'}`,
      tone: 'medium',
    },
    {
      label: 'CFP',
      value: formatCompactNumber(cfp),
      note: 'COSMIC function pts',
      tone: 'neutral',
    },
    {
      label: 'LOC',
      value: formatCompactNumber(loc),
      note: historyRunCount > 0 ? `${historyRunCount} saved run${historyRunCount === 1 ? '' : 's'}` : '5 iterations avg',
      tone: 'good',
    },
  ];
}

function getDetailRows(
  data: PyGreenSenseResultsViewModel,
  latestMetric: HistoryMetric | null,
  parsedReport: ParsedReport
): DetailRow[] {
  const statusLabel = firstNonEmpty(latestMetric?.status, parsedReport.currentRunStatus) ?? (data.runResult.code === 0 ? 'Run complete' : 'Run failed');
  const statusTone = getStatusTone(statusLabel, data.runResult.code);

  return [
    {
      label: 'Status',
      value: statusLabel,
      tone: statusTone,
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
      value: formatRegion(firstNonEmpty(parsedReport.region, latestMetric?.region), firstNonEmpty(parsedReport.country, latestMetric?.country_name)),
    },
    {
      label: 'SCI / line',
      value: formatScientificNumber(latestMetric?.sci_gCO2eq_per_line ?? null, ' gCO2eq'),
    },
    {
      label: 'SCI / CFP',
      value: formatScientificNumber(latestMetric?.sci_per_cfp ?? null, ' gCO2eq/CFP'),
    },
    {
      label: 'Iterations',
      value: parsedReport.iterations !== null ? `${parsedReport.iterations} runs` : 'Not reported',
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
  const color = getToneAccent(card.tone);
  return `<div class="mc" style="border-left-color:${color};">
    <div class="mc-lbl">${escapeHtml(card.label)}</div>
    <div class="mc-val" style="color:${color};">${escapeHtml(card.value)}</div>
    <div class="mc-sub">${escapeHtml(card.note)}</div>
  </div>`;
}

function renderDetailRow(row: DetailRow): string {
  const statusClass = row.tone ? ` status-${getToneClass(row.tone)}` : '';
  return `<div class="kv"><span class="kk">${escapeHtml(row.label)}</span><span class="kv-val${statusClass}" title="${escapeHtml(row.value)}">${escapeHtml(row.value)}</span></div>`;
}

function renderIssueTableRows(issueGroups: ParsedIssueGroup[], showIssueFilePaths: boolean): string {
  const rows = issueGroups.flatMap(group => {
    if (group.issues.length === 0) {
      return [renderIssueRow(group, null, showIssueFilePaths)];
    }

    return group.issues.map(issue => renderIssueRow(group, issue, showIssueFilePaths));
  });

  if (rows.length === 0) {
    return '<tr><td class="empty-row" colspan="3">No issues were parsed from the latest run.</td></tr>';
  }

  return rows.join('');
}

function renderIssueRow(group: ParsedIssueGroup, issue: ParsedIssue | null, showIssueFilePaths: boolean): string {
  const line = issue ? formatIssueLocation(issue, showIssueFilePaths) : '-';
  const message = issue?.message ?? `${group.count} issue${group.count === 1 ? '' : 's'} detected. Line details were not available in the latest output.`;

  return `<tr>
    <td><span class="bdg ${getToneClass(group.severity)}">${escapeHtml(formatRuleLabel(group.rule))}</span></td>
    <td class="line-muted">${escapeHtml(line)}</td>
    <td>${escapeHtml(message)}</td>
  </tr>`;
}

function renderHistoryList(historyEntries: HistoryMetric[], workspaceRoot: string): string {
  if (historyEntries.length === 0) {
    return '<div class="out-block">No history entries were found yet.</div>';
  }

  return `<div>${historyEntries
    .slice()
    .reverse()
    .map((entry, index) => renderHistoryItem(entry, index, historyEntries.length, workspaceRoot))
    .join('')}</div>`;
}

function renderHistoryItem(entry: HistoryMetric, reverseIndex: number, total: number, workspaceRoot: string): string {
  const tone = getStatusTone(entry.status ?? '', 0);
  const indexLabel = String(entry.id ?? total - reverseIndex);
  const pills = renderHistoryPills(entry.smell_breakdown);

  return `<div class="hi">
    <div class="hn">${escapeHtml(indexLabel)}</div>
    <div>
      <div class="hf">${escapeHtml(formatPathForDisplay(entry.target_file ?? 'Unknown target', workspaceRoot))}</div>
      <div class="hd">${escapeHtml(formatDate(entry.date_time ?? null))}</div>
      <div class="hps">${pills}</div>
    </div>
    <div>
      <div class="hr-val">${escapeHtml(formatScientificNumber(normalizeHistoryEmissionKg(entry), ' kg'))}</div>
      <div class="hr-st status-${getToneClass(tone)}">${escapeHtml(formatTrend(entry.status, entry.improvement_percent))}</div>
    </div>
  </div>`;
}

function renderHistoryPills(smellBreakdown: Record<string, SmellBreakdownEntry> | undefined): string {
  const smellEntries = Object.entries(smellBreakdown ?? {}).sort(([, left], [, right]) => (right.count ?? 0) - (left.count ?? 0));

  if (smellEntries.length === 0) {
    return '<span class="hp">No smell breakdown</span>';
  }

  return smellEntries
    .map(([rule, smell]) => {
      const count = smell.count ?? 0;
      return `<span class="hp">${escapeHtml(`${formatRuleCompactLabel(rule)}${count > 1 ? ` x${count}` : ''}`)}</span>`;
    })
    .join('');
}

function renderProgramOutput(lines: string[], exitCode: number): string {
  const renderedLines =
    lines.length > 0
      ? lines.map((line, index) => `<div class="out-line ${index < 3 ? 'out-ok' : 'out-text'}">${escapeHtml(line)}</div>`).join('')
      : '<div class="out-line">No dedicated program output block was detected in the latest run.</div>';

  return `<div class="out-line out-command">$ pygreensense</div>${renderedLines}<div class="out-line out-command">Exit code: ${escapeHtml(String(exitCode))}</div>`;
}

function renderCloudMap(smells: SmellSummary[], issueGroups: ParsedIssueGroup[]): string {
  const cloudSlots = [
    { position: 'left:6%;top:22px;', width: 200, height: 110, variant: 'large' as const },
    { position: 'right:4%;top:8px;', width: 158, height: 90, variant: 'medium' as const },
    { position: 'left:28%;bottom:48px;', width: 158, height: 90, variant: 'medium' as const },
    { position: 'left:50%;top:10px;', width: 114, height: 70, variant: 'small' as const },
    { position: 'right:24%;bottom:44px;', width: 114, height: 70, variant: 'small' as const },
  ];
  const cloudSource =
    smells.length > 0
      ? smells.slice(0, cloudSlots.length)
      : [{ rule: 'CleanSky', count: 0, loc: null, severity: 'good' as const }];

  return cloudSource
    .map((smell, index) => {
      const slot = cloudSlots[index] ?? cloudSlots[cloudSlots.length - 1];
      const matchingGroup = issueGroups.find(group => group.rule === smell.rule);
      const prompt = buildSmellPrompt(smell, matchingGroup);
      return `<button class="cld" type="button" style="${slot.position}" title="Copy fix prompt for ${escapeHtml(formatRuleLabel(smell.rule))}" data-prompt="${escapeHtml(prompt)}">
        ${renderCloudPng(smell, slot.width, slot.height, slot.variant)}
      </button>`;
    })
    .join('');
}

function renderCloudPng(smell: SmellSummary, width: number, height: number, variant: 'large' | 'medium' | 'small'): string {
  const label = formatCloudRuleLabel(smell.rule);
  const countLabel = smell.rule === 'CleanSky' ? 'OK' : String(smell.count);
  const issueLabel = `${smell.count} issue${smell.count === 1 ? '' : 's'}`;
  const locLabel = smell.loc !== null ? `${smell.loc} LOC` : issueLabel;
  const largeMetaLabel = smell.loc !== null ? `${issueLabel} - ${locLabel}` : issueLabel;
  const accent = getRuleAccent(smell.rule, smell.severity);
  const dimensions = getCloudTextDimensions(variant);

  return `<span
    class="cloud-png"
    style="--cloud-width:${width}px;--cloud-height:${height}px;--cloud-accent:${accent};--cloud-rule-size:${dimensions.ruleSize}px;--cloud-count-size:${dimensions.countSize}px;--cloud-meta-size:${dimensions.metaSize}px;--cloud-letter-spacing:${dimensions.letterSpacing}px;--cloud-text-shift:${dimensions.textShift}px;"
    aria-hidden="true"
  >
    <span class="cloud-shape"></span>
    <span class="cloud-text">
      <span class="cloud-rule">${escapeHtml(label)}</span>
      <span class="cloud-count">${escapeHtml(countLabel)}</span>
      <span class="cloud-meta">${escapeHtml(variant === 'large' ? largeMetaLabel : locLabel)}</span>
    </span>
  </span>`;
}

function getCloudTextDimensions(variant: 'large' | 'medium' | 'small'): {
  ruleSize: number;
  countSize: number;
  metaSize: number;
  letterSpacing: number;
  textShift: number;
} {
  if (variant === 'large') {
    return { ruleSize: 10, countSize: 26, metaSize: 9, letterSpacing: 1.5, textShift: 10 };
  }

  if (variant === 'medium') {
    return { ruleSize: 8.5, countSize: 22, metaSize: 9, letterSpacing: 0.8, textShift: 8 };
  }

  return { ruleSize: 7.5, countSize: 18, metaSize: 8, letterSpacing: 0.5, textShift: 6 };
}

function buildSummaryPrompt(targetLabel: string, issueCount: number, smells: SmellSummary[]): string {
  const smellText =
    smells.length > 0
      ? smells.map(smell => `${formatRuleLabel(smell.rule)}: ${smell.count} issue${smell.count === 1 ? '' : 's'}`).join(', ')
      : 'no code smell issues';

  return `Help me prioritize PyGreenSense fixes for ${targetLabel}. It reported ${issueCount} issue${issueCount === 1 ? '' : 's'}: ${smellText}.`;
}

function buildSmellPrompt(smell: SmellSummary, group: ParsedIssueGroup | undefined): string {
  if (smell.rule === 'CleanSky') {
    return 'PyGreenSense found no code smells. Suggest a short checklist for keeping this Python file energy-efficient and maintainable.';
  }

  const issueDetails = group?.issues
    .slice(0, 3)
    .map(issue => `${formatIssueLocation(issue, false)}: ${issue.message}`)
    .join(' ');
  const locText = smell.loc !== null ? ` affecting about ${smell.loc} LOC` : '';
  const detailText = issueDetails ? ` Examples: ${issueDetails}` : '';

  return `How do I fix ${smell.count} ${formatRuleLabel(smell.rule)} issue${smell.count === 1 ? '' : 's'} in Python${locText}?${detailText}`;
}

function countIssueTypes(latestMetric: HistoryMetric | null, parsedReport: ParsedReport): number {
  const historyTypes = Object.keys(latestMetric?.smell_breakdown ?? {}).length;
  return historyTypes > 0 ? historyTypes : parsedReport.issueGroups.length;
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

function isPromptMessage(message: unknown): message is PromptMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<PromptMessage>;
  return candidate.type === 'copyPrompt' && typeof candidate.prompt === 'string';
}

function getRuleSeverity(rule: string, count: number): ParsedSeverity {
  const normalized = normalizeRule(rule);

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

function getToneAccent(tone: ParsedSeverity): string {
  switch (tone) {
    case 'good':
      return '#4ec9b0';
    case 'medium':
      return '#fbbf24';
    case 'low':
      return '#fb923c';
    case 'danger':
      return '#f87171';
    case 'neutral':
    default:
      return '#569cd6';
  }
}

function getRuleAccent(rule: string, tone: ParsedSeverity): string {
  const normalized = normalizeRule(rule);
  if (normalized.includes('godclass')) {
    return '#a78bfa';
  }

  if (normalized.includes('longmethod')) {
    return '#38bdf8';
  }

  if (normalized.includes('duplicated') || normalized.includes('mutabledefault')) {
    return '#fbbf24';
  }

  return getToneAccent(tone);
}

function formatIssueLocation(issue: ParsedIssue, showIssueFilePaths: boolean): string {
  const fileLabel = showIssueFilePaths && issue.filePath ? `${path.basename(issue.filePath)}:` : '';
  const lineLabel = issue.line !== null ? String(issue.line) : '-';
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

function formatRuleCompactLabel(rule: string): string {
  const compact = rule.replace(/\s+/g, '');
  return compact.length > 22 ? `${compact.slice(0, 19)}...` : compact;
}

function formatCloudRuleLabel(rule: string): string {
  const normalized = normalizeRule(rule);
  const labels: Record<string, string> = {
    cleansky: 'CLEAR SKY',
    deadcode: 'DEAD CODE',
    duplicatedcode: 'DUPLICATED',
    godclass: 'GOD CLASS',
    longmethod: 'LONG METHOD',
    mutabledefaultarguments: 'MUTABLE ARGS',
  };

  return labels[normalized] ?? truncateCloudLabel(formatRuleLabel(rule).toUpperCase());
}

function truncateCloudLabel(label: string): string {
  return label.length > 14 ? `${label.slice(0, 11)}...` : label;
}

function normalizeRule(rule: string): string {
  return rule.replace(/[\s_-]+/g, '').toLowerCase();
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

  if (Math.abs(value) < 0.01) {
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
    return `${value.toExponential(3).replace('e+', 'e')}${suffix}`;
  }

  const digits = Math.abs(value) < 10 ? 4 : 2;
  return `${value.toFixed(digits)}${suffix}`;
}

function formatRegion(region: string | null, country: string | null): string {
  if (region && country) {
    return `${capitalize(region)}, ${country}`;
  }

  return region ?? country ?? 'Not reported';
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
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
