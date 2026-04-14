import * as path from 'path';
import * as vscode from 'vscode';
import {
  getHistoryEntries,
  type HistoryMetric,
  type HistoryRead,
} from '../python/history';
import type { RunResult } from '../python/pythonRunner';
import { parseTerminalReport, type ParsedTerminalReport } from './reportParser';

export type PyGreenSenseResultsViewModel = {
  targetFile: string;
  workspaceRoot: string;
  history: HistoryRead;
  runResult: RunResult;
};

type ImprovementState = 'initial' | 'hotter' | 'cooler';

type SmellUiMeta = {
  icon: string;
  label: string;
  className: string;
  pillLabel: string;
};

type SmellUiItem = {
  key: string;
  icon: string;
  label: string;
  className: string;
  pillLabel: string;
  count: number;
  loc: number;
};

type IssueUiItem = {
  line: number | null;
  message: string;
};

type ReportSectionUi = {
  title: string;
  rows: string[];
};

type WebviewRun = {
  id: string;
  selectorLabel: string;
  targetFile: string;
  targetName: string;
  dateTime: string;
  durationSeconds: number | null;
  emissionKg: number | null;
  energyConsumedKWh: number | null;
  totalEmissionsGCO2eq: number | null;
  linesOfCode: number | null;
  cfp: number | null;
  sciPerCfp: number | null;
  sciPerLine: number | null;
  region: string;
  countryName: string;
  status: string;
  improvementPercent: number | null;
  smellBreakdown: SmellUiItem[];
  issuesBySmell: Record<string, IssueUiItem[]>;
  reportSections: ReportSectionUi[];
  healthPercent: number;
  hpPoints: number;
  epPercent: number;
  epPoints: number;
  xpPercent: number;
  xpPoints: number;
  bolts: number;
  isFast: boolean;
  level: number;
  attack: number;
  defense: number;
  sprite: string;
  improvementState: ImprovementState;
  improvementStatusLabel: string;
  improvementValueLabel: string;
  statusMark: string;
  energyDisplay: string;
  rawHistoryJson: string;
};

const SMELL_META: Record<string, SmellUiMeta> = {
  DeadCode: {
    icon: '💀',
    label: 'Dead\nCode',
    className: '',
    pillLabel: 'DeadCode',
  },
  DuplicatedCode: {
    icon: '📋',
    label: 'Duplicate',
    className: 'duplicate',
    pillLabel: 'Duplicate',
  },
  GodClass: {
    icon: '🧠',
    label: 'God\nClass',
    className: 'complex',
    pillLabel: 'GodClass',
  },
  LongMethod: {
    icon: '📏',
    label: 'Long\nMethod',
    className: 'complex',
    pillLabel: 'LongMethod',
  },
  MutableDefaultArguments: {
    icon: '⚠️',
    label: 'Mutable\nArgs',
    className: 'mutable',
    pillLabel: 'MutableArgs',
  },
};

let resultsPanel: vscode.WebviewPanel | undefined;

export function showPyGreenSenseResultsPanel(data: PyGreenSenseResultsViewModel): void {
  const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (!resultsPanel) {
    resultsPanel = vscode.window.createWebviewPanel(
      'pygreensenseResults',
      `PyGreenSense: ${path.basename(data.targetFile)}`,
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    resultsPanel.onDidDispose(() => {
      resultsPanel = undefined;
    });
  } else {
    resultsPanel.title = `PyGreenSense: ${path.basename(data.targetFile)}`;
    resultsPanel.reveal(column, true);
  }

  resultsPanel.webview.html = getWebviewHtml(resultsPanel.webview, data);
}

function getWebviewHtml(webview: vscode.Webview, data: PyGreenSenseResultsViewModel): string {
  const parsedReport = parseTerminalReport(data.runResult.stdout);
  const runs = buildRuns(data, parsedReport);
  const initialRunId = runs[0]?.id ?? 'run-0';
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; img-src data: ${webview.cspSource}; script-src 'nonce-${nonce}';"
>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GreenCode Panel</title>
<style>
  :root {
    --bg: #1e1e2e;
    --panel: #181825;
    --surface: #252537;
    --border: #313145;
    --border-bright: #45455f;
    --green: #a6e3a1;
    --green-dark: #2d5a2a;
    --green-glow: #a6e3a122;
    --teal: #94e2d5;
    --blue: #89b4fa;
    --pink: #f38ba8;
    --yellow: #f9e2af;
    --orange: #fab387;
    --purple: #cba6f7;
    --red: #f38ba8;
    --text: #cdd6f4;
    --text-dim: #6c7086;
    --text-mid: #a6adc8;
    --pixel: "Courier New", monospace;
    --mono: "Consolas", "SFMono-Regular", "Courier New", monospace;
    --hp-color: #4ade80;
    --ep-color: #38bdf8;
    --xp-color: #a78bfa;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    min-height: 100vh;
    padding: 12px;
    overflow-x: hidden;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px);
    pointer-events: none;
    z-index: 9999;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-top: 2px solid var(--green);
    position: relative;
  }

  .top-bar-title {
    font-family: var(--pixel);
    font-size: 7px;
    color: var(--green);
    letter-spacing: 1px;
    flex: 1;
  }

  .run-selector-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 2;
  }

  .run-selector-label {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-dim);
    white-space: nowrap;
  }

  .run-selector {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border-bright);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    padding: 5px 8px;
    cursor: pointer;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236c7086'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
    transition: border-color .2s;
  }

  .run-selector:hover { border-color: var(--green); }
  .run-selector option { background: var(--panel); }

  .main-grid {
    display: grid;
    grid-template-columns: 210px 1fr 180px;
    gap: 10px;
    margin-bottom: 10px;
  }

  .char-card {
    background: var(--panel);
    border: 2px solid var(--border-bright);
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    overflow: hidden;
    image-rendering: pixelated;
  }

  .char-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center 30%, #2d5a2a33 0%, transparent 70%);
    pointer-events: none;
  }

  .char-bg {
    width: 100%;
    height: 120px;
    background:
      radial-gradient(ellipse 60% 50% at 50% 60%, #2d5a2a55 0%, transparent 70%),
      linear-gradient(180deg, #1a2a1a 0%, #141424 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 64px;
    position: relative;
  }

  .char-sprite {
    font-size: 60px;
    animation: float 3s ease-in-out infinite;
    filter: drop-shadow(0 4px 12px #a6e3a155);
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }

  .char-stats {
    width: 100%;
    padding: 10px 12px;
    background: rgba(0,0,0,0.4);
  }

  .char-name {
    font-family: var(--pixel);
    font-size: 8px;
    color: var(--green);
    margin-bottom: 8px;
    text-shadow: 0 0 8px var(--green);
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
  }

  .stat-label {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-dim);
    width: 28px;
  }

  .stat-values {
    font-family: var(--pixel);
    font-size: 7px;
    color: var(--text-mid);
    width: 40px;
  }

  .stat-bar-wrap {
    flex: 1;
    height: 8px;
    background: #111;
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .stat-bar {
    height: 100%;
    transition: width .6s cubic-bezier(.4,0,.2,1);
    position: relative;
  }

  .stat-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255,255,255,0.25);
  }

  .stat-bar.hp { background: linear-gradient(90deg, #16a34a, #4ade80); }
  .stat-bar.ep { background: linear-gradient(90deg, #0369a1, #38bdf8); }
  .stat-bar.xp { background: linear-gradient(90deg, #7c3aed, #a78bfa); }

  .char-lvl {
    font-family: var(--pixel);
    font-size: 7px;
    color: var(--yellow);
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .middle-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-box {
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 10px 12px;
  }

  .panel-title {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .panel-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .debuff-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .debuff-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: all .2s;
    position: relative;
    overflow: hidden;
  }

  .debuff-card.active { border-color: var(--pink); animation: glowPulse 2s ease-in-out infinite; }
  .debuff-card.active::before {
    content: '';
    position: absolute;
    inset: 0;
    background: #f38ba811;
  }

  .debuff-card.active.duplicate {
    border-color: var(--blue);
    animation: none;
    box-shadow: 0 0 8px 1px #89b4fa22;
  }

  .debuff-card.active.duplicate::before { background: #89b4fa11; }

  .debuff-card.active.complex {
    border-color: var(--purple);
    animation: none;
    box-shadow: 0 0 8px 1px #cba6f722;
  }

  .debuff-card.active.complex::before { background: #cba6f711; }
  .debuff-card.active.mutable { border-color: var(--orange); }
  .debuff-card.active.mutable::before { background: #fab38711; }

  .debuff-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px #00000055; }

  .debuff-icon { font-size: 18px; }

  .debuff-name {
    font-family: var(--pixel);
    font-size: 5px;
    color: var(--text-mid);
    text-align: center;
    line-height: 1.4;
  }

  .debuff-count {
    font-family: var(--pixel);
    font-size: 10px;
    color: var(--pink);
  }

  .debuff-card.duplicate .debuff-count { color: var(--blue); }
  .debuff-card.complex .debuff-count { color: var(--purple); }
  .debuff-card.mutable .debuff-count { color: var(--orange); }

  .debuff-none {
    font-family: var(--pixel);
    font-size: 6px;
    color: #2d5a2a;
    margin-top: 2px;
  }

  .issue-list {
    margin-top: 8px;
    max-height: 100px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .issue-list::-webkit-scrollbar { width: 3px; }
  .issue-list::-webkit-scrollbar-track { background: var(--surface); }
  .issue-list::-webkit-scrollbar-thumb { background: var(--border-bright); }

  .issue-item {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-mid);
    padding: 3px 6px;
    background: var(--surface);
    border-left: 2px solid var(--border-bright);
    display: flex;
    gap: 8px;
  }

  .issue-line {
    color: var(--yellow);
    white-space: nowrap;
    font-family: var(--pixel);
    font-size: 8px;
  }

  .issue-msg {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .health-wrap { margin-top: 2px; }

  .health-bar-outer {
    height: 24px;
    background: #111;
    border: 1px solid var(--border);
    position: relative;
    overflow: hidden;
  }

  .health-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #dc2626, #f43f5e, #fb7185);
    transition: width .8s cubic-bezier(.4,0,.2,1);
    position: relative;
    display: flex;
    align-items: center;
    padding-left: 8px;
  }

  .health-bar-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 8px;
    background: rgba(255,255,255,0.15);
  }

  .health-heart {
    font-size: 14px;
    animation: heartbeat 1.2s ease-in-out infinite;
    filter: drop-shadow(0 0 6px #f43f5e);
  }

  @keyframes heartbeat {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); }
  }

  .health-label {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-dim);
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .health-value {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-mid);
    margin-top: 4px;
    text-align: right;
  }

  .right-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .energy-display {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bolts-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .bolt {
    font-size: 16px;
    filter: grayscale(1) opacity(0.25);
    transition: filter .3s;
  }

  .bolt.active {
    animation: zap .8s ease-in-out infinite alternate;
    filter: drop-shadow(0 0 4px #fbbf24);
  }

  @keyframes zap {
    from { opacity: .8; transform: scale(1); }
    to { opacity: 1; transform: scale(1.1); }
  }

  .energy-value {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--yellow);
    line-height: 1.7;
  }

  .speed-toggle {
    display: flex;
    gap: 6px;
  }

  .speed-btn {
    flex: 1;
    padding: 6px 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-dim);
    font-family: var(--pixel);
    font-size: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all .2s;
  }

  .speed-btn.active-slow {
    border-color: var(--green);
    color: var(--green);
    background: var(--green-glow);
  }

  .speed-btn.active-fast {
    border-color: var(--orange);
    color: var(--orange);
    background: #fab38711;
  }

  .speed-value {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--text-dim);
    margin-top: 4px;
    line-height: 1.7;
  }

  .details-area {
    display: grid;
    grid-template-columns: 1fr 1.5fr 1fr;
    gap: 10px;
  }

  .detail-section {
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 10px 12px;
  }

  .detail-section-title {
    font-family: var(--pixel);
    font-size: 6px;
    color: var(--green);
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 5px;
    gap: 8px;
  }

  .detail-key {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-dim);
    flex: 1;
  }

  .detail-val {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text);
    text-align: right;
    max-width: 120px;
    word-break: break-all;
  }

  .improvement-block {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .improvement-icon {
    font-size: 36px;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: .85; }
  }

  .improvement-status {
    font-family: var(--pixel);
    font-size: 7px;
    padding: 3px 8px;
    border-radius: 0;
  }

  .status-initial { color: var(--green); border: 1px solid var(--green); }
  .status-hotter { color: var(--pink); border: 1px solid var(--pink); }
  .status-cooler { color: var(--teal); border: 1px solid var(--teal); }

  .improvement-pct {
    font-family: var(--pixel);
    font-size: 12px;
    line-height: 1.4;
  }

  .improvement-pct.negative { color: var(--pink); }
  .improvement-pct.positive { color: var(--green); }
  .improvement-pct.none { color: var(--text-dim); }

  .report-content {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-dim);
    line-height: 1.7;
  }

  .report-section { margin-bottom: 8px; }

  .report-section-head {
    color: var(--blue);
    font-family: var(--pixel);
    font-size: 5.5px;
    margin-bottom: 4px;
  }

  .report-row {
    display: flex;
    gap: 8px;
    margin-bottom: 2px;
    padding-left: 8px;
  }

  .report-bullet {
    color: var(--green);
    flex-shrink: 0;
  }

  .summary-pills {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .pill {
    font-family: var(--pixel);
    font-size: 5px;
    padding: 3px 6px;
    border: 1px solid var(--border-bright);
    color: var(--text-mid);
    background: var(--surface);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pill-count { color: var(--yellow); }

  .file-path {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text-dim);
    word-break: break-all;
    background: var(--surface);
    padding: 4px 6px;
    border-left: 2px solid var(--green);
    margin-bottom: 6px;
  }

  .subtle-note {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text-dim);
    line-height: 1.6;
    margin-top: 8px;
  }

  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 8px 2px #f38ba833; }
  }

  @media (max-width: 1100px) {
    .main-grid,
    .details-area {
      grid-template-columns: 1fr;
    }
  }
</style>
</head>
<body>
<div class="top-bar">
  <div class="top-bar-title">🌱 GreenCode Inspector</div>
  <div class="run-selector-wrap">
    <span class="run-selector-label">RUN ▸</span>
    <select class="run-selector" id="runSelector">
      ${runs.map((run) => `<option value="${escapeHtml(run.id)}">${escapeHtml(run.selectorLabel)}</option>`).join('')}
    </select>
  </div>
</div>

<div class="main-grid">
  <div class="char-card">
    <div class="char-bg">
      <div class="char-sprite" id="charSprite">🐱</div>
    </div>
    <div class="char-stats">
      <div class="char-name" id="charName">Bam</div>

      <div class="stat-row">
        <span class="stat-label">HP</span>
        <span class="stat-values" id="hpVal">10/10</span>
        <div class="stat-bar-wrap">
          <div class="stat-bar hp" id="hpBar" style="width:100%"></div>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">EP</span>
        <span class="stat-values" id="epVal">10/10</span>
        <div class="stat-bar-wrap">
          <div class="stat-bar ep" id="epBar" style="width:50%"></div>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">XP</span>
        <span class="stat-values" id="xpVal">0/10</span>
        <div class="stat-bar-wrap">
          <div class="stat-bar xp" id="xpBar" style="width:0%"></div>
        </div>
      </div>

      <div class="char-lvl">
        <span>LVL <span id="charLvl">1</span></span>
        <span>ATK <span id="charAtk">1</span> DEF <span id="charDef">1</span></span>
      </div>
    </div>
  </div>

  <div class="middle-col">
    <div class="panel-box">
      <div class="panel-title">💀 Debuff — Code Smells Found</div>
      <div class="debuff-grid" id="debuffGrid"></div>
      <div class="issue-list" id="issueList"></div>
    </div>

    <div class="panel-box health-wrap">
      <div class="panel-title">❤️ Health — Overall Quality Metric</div>
      <div class="health-label">
        <span>Inversely mapped from emissions</span>
        <span id="healthPct">100%</span>
      </div>
      <div class="health-bar-outer">
        <div class="health-bar-fill" id="healthFill" style="width:100%">
          <span class="health-heart">♥</span>
        </div>
      </div>
      <div class="health-value" id="healthVal">total_emissions: —</div>
    </div>
  </div>

  <div class="right-col">
    <div class="panel-box">
      <div class="panel-title">⚡ Energy Usage (kWh)</div>
      <div class="energy-display">
        <div class="bolts-row" id="boltsRow"></div>
        <div class="energy-value" id="energyVal">—</div>
      </div>
    </div>

    <div class="panel-box">
      <div class="panel-title">🏃 Speed — Runtime</div>
      <div class="speed-toggle">
        <div class="speed-btn" id="btnSlow">🐌 Slow</div>
        <div class="speed-btn" id="btnFast">🏃 Fast</div>
      </div>
      <div class="speed-value" id="speedVal">Duration: —</div>
    </div>

    <div class="panel-box">
      <div class="panel-title">📊 Smell Summary</div>
      <div class="summary-pills" id="summaryPills"></div>
    </div>
  </div>
</div>

<div class="details-area">
  <div class="detail-section">
    <div class="detail-section-title">📋 Execution Info</div>
    <div class="file-path" id="detailFile">/path/to/file.py</div>
    <div class="detail-row">
      <span class="detail-key">Lines of code</span>
      <span class="detail-val" id="detailLoc">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">CFP</span>
      <span class="detail-val" id="detailCfp">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Region</span>
      <span class="detail-val" id="detailRegion">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Country</span>
      <span class="detail-val" id="detailCountry">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">SCI/CFP</span>
      <span class="detail-val" id="detailSci">—</span>
    </div>
    <div class="subtle-note" id="detailNote"></div>
  </div>

  <div class="detail-section">
    <div class="detail-section-title">🌍 Detailed Green Code Report</div>
    <div class="report-content" id="reportContent"></div>
  </div>

  <div class="detail-section">
    <div class="detail-section-title">📈 Improvement Tracker</div>
    <div class="improvement-block">
      <div class="improvement-icon" id="improvementIcon">💚</div>
      <div class="improvement-status" id="improvementStatus">—</div>
      <div class="improvement-pct none" id="improvementPct">—</div>
    </div>
  </div>
</div>

<script type="application/json" id="runs-data">${escapeForScript(JSON.stringify(runs))}</script>
<script nonce="${nonce}">
  (function () {
    const runsData = JSON.parse(document.getElementById('runs-data').textContent || '[]');
    const runSelector = document.getElementById('runSelector');
    let currentRunId = ${JSON.stringify(initialRunId)};
    let currentSmellKey = '';

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function getCurrentRun() {
      return runsData.find((run) => run.id === currentRunId) || runsData[0];
    }

    function renderDebuffs(run, activeKey) {
      const debuffGrid = document.getElementById('debuffGrid');
      debuffGrid.innerHTML = '';

      run.smellBreakdown.forEach((smell) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'debuff-card ' + smell.className + (smell.key === activeKey ? ' active' : '');
        card.innerHTML = [
          '<span class="debuff-icon">' + escapeHtml(smell.icon) + '</span>',
          '<span class="debuff-name">' + escapeHtml(smell.label).replaceAll('\\n', '<br>') + '</span>',
          '<span class="debuff-count">' + smell.count + '</span>',
          '<span style="font-family:var(--pixel);font-size:5px;color:var(--text-dim)">' + smell.loc + ' LOC</span>',
        ].join('');
        card.addEventListener('click', function () {
          showIssues(smell.key);
        });
        debuffGrid.appendChild(card);
      });

      Array.from({ length: Math.max(0, 3 - run.smellBreakdown.length) }).forEach(() => {
        const card = document.createElement('div');
        card.className = 'debuff-card';
        card.innerHTML = '<span class="debuff-icon">✨</span><span class="debuff-none">None</span>';
        debuffGrid.appendChild(card);
      });
    }

    function showIssues(smellKey) {
      const run = getCurrentRun();
      const issueList = document.getElementById('issueList');
      currentSmellKey = smellKey;
      renderDebuffs(run, smellKey);
      issueList.innerHTML = '';

      const issues = (run.issuesBySmell && run.issuesBySmell[smellKey]) || [];
      if (!issues.length) {
        const item = document.createElement('div');
        item.className = 'issue-item';
        item.innerHTML = '<span class="issue-line">INFO</span><span class="issue-msg">No detailed issue list was captured for this run.</span>';
        issueList.appendChild(item);
        return;
      }

      issues.forEach((issue) => {
        const item = document.createElement('div');
        item.className = 'issue-item';
        const lineLabel = issue.line === null ? 'INFO' : 'L' + issue.line;
        item.innerHTML = '<span class="issue-line">' + escapeHtml(lineLabel) + '</span><span class="issue-msg">' + escapeHtml(issue.message) + '</span>';
        issueList.appendChild(item);
      });
    }

    function renderReport(run) {
      const reportContent = document.getElementById('reportContent');
      reportContent.innerHTML = run.reportSections.map((section) => {
        const rows = section.rows.map((row) => {
          return '<div class="report-row"><span class="report-bullet">·</span>' + escapeHtml(row) + '</div>';
        }).join('');

        return [
          '<div class="report-section">',
          '<div class="report-section-head">● ' + escapeHtml(section.title) + '</div>',
          rows,
          '</div>',
        ].join('');
      }).join('');
    }

    function renderSummaryPills(run) {
      const pills = document.getElementById('summaryPills');
      pills.innerHTML = '';

      run.smellBreakdown.forEach((smell) => {
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.innerHTML = escapeHtml(smell.icon + ' ' + smell.pillLabel + ' ') + '<span class="pill-count">' + smell.count + '</span>';
        pills.appendChild(pill);
      });

      if (!run.smellBreakdown.length) {
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.textContent = '✨ Clean run';
        pills.appendChild(pill);
      }
    }

    function renderEnergy(run) {
      const boltsRow = document.getElementById('boltsRow');
      boltsRow.innerHTML = '';
      for (let index = 0; index < 6; index += 1) {
        const bolt = document.createElement('span');
        bolt.className = 'bolt' + (index < run.bolts ? ' active' : '');
        bolt.textContent = '⚡';
        boltsRow.appendChild(bolt);
      }

      document.getElementById('energyVal').textContent =
        run.energyConsumedKWh === null
          ? 'No energy measurement saved'
          : run.energyDisplay;
    }

    function renderSpeed(run) {
      const slow = document.getElementById('btnSlow');
      const fast = document.getElementById('btnFast');
      slow.className = 'speed-btn' + (!run.isFast ? ' active-slow' : '');
      fast.className = 'speed-btn' + (run.isFast ? ' active-fast' : '');
      document.getElementById('speedVal').textContent =
        run.durationSeconds === null
          ? 'Duration: —'
          : 'Duration: ' + run.durationSeconds.toExponential(2) + ' s';
    }

    function renderCharacter(run) {
      document.getElementById('charSprite').textContent = run.sprite;
      document.getElementById('charName').textContent = run.targetName;
      document.getElementById('charLvl').textContent = String(run.level);
      document.getElementById('charAtk').textContent = String(run.attack);
      document.getElementById('charDef').textContent = String(run.defense);
      document.getElementById('hpVal').textContent = run.hpPoints + '/10';
      document.getElementById('hpBar').style.width = run.healthPercent + '%';
      document.getElementById('epVal').textContent = run.epPoints + '/10';
      document.getElementById('epBar').style.width = run.epPercent + '%';
      document.getElementById('xpVal').textContent = run.xpPoints + '/10';
      document.getElementById('xpBar').style.width = run.xpPercent + '%';
    }

    function renderHealth(run) {
      document.getElementById('healthPct').textContent = run.healthPercent + '%';
      document.getElementById('healthFill').style.width = run.healthPercent + '%';
      document.getElementById('healthVal').textContent =
        run.totalEmissionsGCO2eq === null
          ? 'total_emissions: —'
          : 'total_emissions: ' + run.totalEmissionsGCO2eq.toExponential(2) + ' gCO2eq';
    }

    function renderExecutionInfo(run) {
      document.getElementById('detailFile').textContent = run.targetFile;
      document.getElementById('detailLoc').textContent = run.linesOfCode === null ? '—' : run.linesOfCode + ' LOC';
      document.getElementById('detailCfp').textContent = run.cfp === null ? '—' : run.cfp + ' CFP';
      document.getElementById('detailRegion').textContent = run.region || '—';
      document.getElementById('detailCountry').textContent = run.countryName || '—';
      document.getElementById('detailSci').textContent =
        run.sciPerCfp === null ? '—' : run.sciPerCfp.toExponential(2);
      document.getElementById('detailNote').textContent =
        'Recorded at ' + run.dateTime + ' • status: ' + run.status;
    }

    function renderImprovement(run) {
      const icon = document.getElementById('improvementIcon');
      const status = document.getElementById('improvementStatus');
      const pct = document.getElementById('improvementPct');

      if (run.improvementState === 'hotter') {
        icon.textContent = '💔';
        status.className = 'improvement-status status-hotter';
        pct.className = 'improvement-pct negative';
      } else if (run.improvementState === 'cooler') {
        icon.textContent = '💚';
        status.className = 'improvement-status status-cooler';
        pct.className = 'improvement-pct positive';
      } else {
        icon.textContent = '💚';
        status.className = 'improvement-status status-initial';
        pct.className = 'improvement-pct none';
      }

      status.textContent = run.improvementStatusLabel;
      pct.textContent = run.improvementValueLabel;
    }

    function selectRun(runId) {
      currentRunId = runId;
      const run = getCurrentRun();
      runSelector.value = run.id;
      renderCharacter(run);
      renderHealth(run);
      renderEnergy(run);
      renderSpeed(run);
      renderSummaryPills(run);
      renderExecutionInfo(run);
      renderReport(run);
      renderImprovement(run);
      const firstSmell = run.smellBreakdown[0] ? run.smellBreakdown[0].key : '';
      showIssues(currentSmellKey && run.issuesBySmell[currentSmellKey] ? currentSmellKey : firstSmell);
    }

    runSelector.addEventListener('change', function (event) {
      selectRun(event.target.value);
    });

    selectRun(currentRunId);
  }());
</script>
</body>
</html>`;
}

function buildRuns(data: PyGreenSenseResultsViewModel, parsedReport: ParsedTerminalReport | null): WebviewRun[] {
  const historyEntries = sortHistoryEntries(getHistoryEntries(data.history.json));
  const metrics = historyEntries.length > 0 ? historyEntries : [createSyntheticMetric(data, parsedReport)];
  const maxEmission = getMaxNumeric(metrics.map((metric) => metric.total_emissions_gCO2eq));
  const maxEnergy = getMaxNumeric(metrics.map((metric) => metric.energy_consumed_kWh));

  return metrics.map((metric, index) => {
    const isLatestRun = index === 0;
    const smellBreakdown = getSmellBreakdown(metric, isLatestRun ? parsedReport : null);
    const issuesBySmell = isLatestRun ? buildIssuesBySmell(parsedReport) : {};
    const totalSmells = smellBreakdown.reduce((sum, smell) => sum + smell.count, 0);
    const healthPercent = getHealthPercent(metric.total_emissions_gCO2eq, maxEmission);
    const bolts = getEnergyBolts(metric.energy_consumed_kWh, maxEnergy);
    const epPercent = Math.max(5, Math.round((1 - bolts / 6) * 100));
    const improvementPercent = typeof metric.improvement_percent === 'number' ? metric.improvement_percent : null;
    const xpPercent = improvementPercent === null
      ? 0
      : Math.min(100, Math.round((Math.abs(improvementPercent) / 2000) * 100));
    const status = String(metric.status ?? (data.runResult.code === 0 ? 'Initial' : 'Failed'));
    const improvementState = getImprovementState(status, improvementPercent);
    const targetFile = String(metric.target_file ?? data.targetFile);
    const targetName = path.basename(targetFile) || path.basename(data.targetFile);

    return {
      id: `run-${metric.id ?? index}`,
      selectorLabel: buildSelectorLabel(metric, targetName, status),
      targetFile,
      targetName,
      dateTime: formatHistoryDate(metric.date_time),
      durationSeconds: toNullableNumber(metric.duration_seconds),
      emissionKg: toNullableNumber(metric.emission_kg),
      energyConsumedKWh: toNullableNumber(metric.energy_consumed_kWh),
      totalEmissionsGCO2eq: toNullableNumber(metric.total_emissions_gCO2eq),
      linesOfCode: toNullableInteger(metric.lines_of_code),
      cfp: toNullableInteger(metric.cfp),
      sciPerCfp: toNullableNumber(metric.sci_per_cfp),
      sciPerLine: toNullableNumber(metric.sci_gCO2eq_per_line),
      region: String(metric.region ?? parsedReport?.energyAndEmissions.Region ?? 'Unknown'),
      countryName: String(metric.country_name ?? parsedReport?.energyAndEmissions.Country ?? 'Unknown'),
      status,
      improvementPercent,
      smellBreakdown,
      issuesBySmell,
      reportSections: buildReportSections(metric, smellBreakdown, isLatestRun ? parsedReport : null),
      healthPercent,
      hpPoints: clamp(Math.round(healthPercent / 10), 1, 10),
      epPercent,
      epPoints: clamp(Math.round(epPercent / 10), 1, 10),
      xpPercent,
      xpPoints: improvementPercent === null ? 0 : clamp(Math.round(xpPercent / 10), 0, 10),
      bolts,
      isFast: typeof metric.duration_seconds === 'number' ? metric.duration_seconds < 1e-7 : false,
      level: getLevel(metric.total_emissions_gCO2eq, maxEmission),
      attack: smellBreakdown.length,
      defense: Math.max(1, 10 - totalSmells),
      sprite: getSprite(status, totalSmells),
      improvementState,
      improvementStatusLabel: getImprovementStatusLabel(improvementState),
      improvementValueLabel: formatImprovementValue(improvementPercent),
      statusMark: getStatusMark(status, improvementPercent),
      rawHistoryJson: JSON.stringify(metric, null, 2),
      energyDisplay: buildEnergyDisplay(metric.energy_consumed_kWh, maxEnergy),
    };
  });
}

function getSmellBreakdown(metric: HistoryMetric, parsedReport: ParsedTerminalReport | null): SmellUiItem[] {
  const historyEntries = Object.entries(metric.smell_breakdown ?? {}).map(([key, value]) => {
    const meta = SMELL_META[key] ?? getDefaultSmellMeta(key);
    return {
      key,
      icon: meta.icon,
      label: meta.label,
      className: meta.className,
      pillLabel: meta.pillLabel,
      count: value.count ?? 0,
      loc: value.loc ?? 0,
    };
  });

  if (historyEntries.length > 0) {
    return historyEntries.sort((left, right) => right.count - left.count);
  }

  return (parsedReport?.summaryByRule ?? parsedReport?.analysisSummary ?? []).map((entry) => {
    const meta = SMELL_META[entry.rule] ?? getDefaultSmellMeta(entry.rule);
    return {
      key: entry.rule,
      icon: meta.icon,
      label: meta.label,
      className: meta.className,
      pillLabel: meta.pillLabel,
      count: entry.count,
      loc: 0,
    };
  });
}

function buildIssuesBySmell(parsedReport: ParsedTerminalReport | null): Record<string, IssueUiItem[]> {
  if (!parsedReport) {
    return {};
  }

  return Object.fromEntries(
    parsedReport.issueGroups.map((group) => [
      group.rule,
      group.issues.map((issue) => ({
        line: issue.lineNumber,
        message: issue.message,
      })),
    ])
  );
}

function buildReportSections(
  metric: HistoryMetric,
  smellBreakdown: SmellUiItem[],
  parsedReport: ParsedTerminalReport | null
): ReportSectionUi[] {
  const smellRows = smellBreakdown.length > 0
    ? smellBreakdown.map((smell) => `${smell.key}: ${smell.count} issue(s), ${smell.loc} LOC`)
    : ['No smell summary saved for this run'];

  const comparisonRow = parsedReport?.previousComparison ?? getImprovementReportNote(metric.improvement_percent);

  return [
    {
      title: 'Execution Details',
      rows: [
        `Date: ${formatHistoryDate(metric.date_time)}`,
        `Target: ${String(metric.target_file ?? parsedReport?.trackedFile ?? 'Unknown target')}`,
        `Duration: ${parsedReport?.executionDetails.Duration ?? formatDuration(metric.duration_seconds)}`,
      ],
    },
    {
      title: 'Energy & Emissions',
      rows: [
        `Energy: ${parsedReport?.energyAndEmissions['Total energy consumed'] ?? formatScientific(metric.energy_consumed_kWh, ' kWh')}`,
        `Emission: ${parsedReport?.energyAndEmissions['Carbon emissions'] ?? formatScientific(metric.emission_kg, ' kg CO2')}`,
        `gCO2eq: ${formatScientific(metric.total_emissions_gCO2eq)}`,
      ],
    },
    {
      title: 'Code Metrics',
      rows: [
        `LOC: ${metric.lines_of_code ?? '—'}  CFP: ${metric.cfp ?? '—'}`,
        `SCI/line: ${formatScientific(metric.sci_gCO2eq_per_line)}`,
        `SCI/CFP: ${formatScientific(metric.sci_per_cfp)}`,
      ],
    },
    {
      title: 'Code Smell Summary',
      rows: [...smellRows, comparisonRow],
    },
  ];
}

function createSyntheticMetric(data: PyGreenSenseResultsViewModel, parsedReport: ParsedTerminalReport | null): HistoryMetric {
  return {
    id: 0,
    date_time: 'Latest run',
    target_file: parsedReport?.trackedFile ?? data.targetFile,
    duration_seconds: extractFirstNumber(parsedReport?.executionDetails.Duration),
    emission_kg: extractFirstNumber(parsedReport?.energyAndEmissions['Carbon emissions']),
    energy_consumed_kWh: extractFirstNumber(parsedReport?.energyAndEmissions['Total energy consumed']),
    region: parsedReport?.energyAndEmissions.Region ?? null,
    country_name: parsedReport?.energyAndEmissions.Country ?? null,
    total_emissions_gCO2eq: extractFirstNumber(parsedReport?.currentRunCarbonEmission ?? undefined),
    lines_of_code: extractFirstInteger(parsedReport?.codeMetrics['Total lines of code']),
    sci_gCO2eq_per_line: undefined,
    status: data.runResult.code === 0 ? (parsedReport?.currentRunLabel ?? 'Initial') : 'Failed',
    cfp: extractFirstInteger(parsedReport?.codeMetrics['COSMIC Function Points']),
    sci_per_cfp: undefined,
    improvement_percent: null,
    smell_breakdown: Object.fromEntries(
      (parsedReport?.summaryByRule ?? parsedReport?.analysisSummary ?? []).map((entry) => [
        entry.rule,
        { count: entry.count, loc: 0 },
      ])
    ),
  };
}

function buildSelectorLabel(metric: HistoryMetric, targetName: string, status: string): string {
  const mark = getStatusMark(status, metric.improvement_percent);
  return `${formatHistoryDate(metric.date_time)}  ·  ${targetName}  ·  ${status} ${mark}`;
}

function getStatusMark(status: string, improvementPercent: number | null | undefined): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('hotter') || (typeof improvementPercent === 'number' && improvementPercent < 0)) {
    return '⚠';
  }

  if (normalized.includes('cooler') || (typeof improvementPercent === 'number' && improvementPercent > 0)) {
    return '✓';
  }

  return '✓';
}

function getImprovementState(status: string, improvementPercent: number | null | undefined): ImprovementState {
  const normalized = status.toLowerCase();
  if (normalized.includes('hotter') || (typeof improvementPercent === 'number' && improvementPercent < 0)) {
    return 'hotter';
  }

  if (normalized.includes('cooler') || (typeof improvementPercent === 'number' && improvementPercent > 0)) {
    return 'cooler';
  }

  return 'initial';
}

function getImprovementStatusLabel(state: ImprovementState): string {
  if (state === 'hotter') {
    return '⚠ Hotter';
  }

  if (state === 'cooler') {
    return '✓ Cooler';
  }

  return 'Initial';
}

function formatImprovementValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No prev. run';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function getImprovementReportNote(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No previous run to compare';
  }

  return value >= 0 ? 'Improvement versus previous run' : 'Regression versus previous run';
}

function getHealthPercent(value: number | undefined, maxValue: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || maxValue <= 0) {
    return 100;
  }

  const ratio = value / maxValue;
  return Math.max(5, Math.round((1 - ratio) * 100));
}

function getEnergyBolts(value: number | undefined, maxValue: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || maxValue <= 0) {
    return 0;
  }

  return clamp(Math.round((value / maxValue) * 6), 0, 6);
}

function getLevel(value: number | undefined, maxValue: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || maxValue <= 0) {
    return 1;
  }

  return Math.max(1, Math.round((1 - value / maxValue) * 5) + 1);
}

function getSprite(status: string, totalSmells: number): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('hotter')) {
    return '😿';
  }

  if (totalSmells === 0) {
    return '😺';
  }

  return '🐱';
}

function buildEnergyDisplay(value: number | undefined, maxValue: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'No energy measurement saved';
  }

  return `${value.toExponential(2)} kWh  ·  scale: ${maxValue > 0 ? maxValue.toExponential(2) : '—'}`;
}

function sortHistoryEntries(entries: HistoryMetric[]): HistoryMetric[] {
  return entries.slice().sort((left, right) => {
    const leftId = typeof left.id === 'number' ? left.id : -1;
    const rightId = typeof right.id === 'number' ? right.id : -1;
    if (leftId !== rightId) {
      return rightId - leftId;
    }

    return getHistoryTimestamp(right.date_time) - getHistoryTimestamp(left.date_time);
  });
}

function getHistoryTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatHistoryDate(value: string | undefined): string {
  if (!value) {
    return 'Latest run';
  }

  return value.replace(/\.\d+$/, '').replace('T', ' ');
}

function formatDuration(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return `${value.toExponential(2)} s`;
}

function formatScientific(value: unknown, suffix = ''): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `—${suffix}`;
  }

  return `${value.toExponential(2)}${suffix}`;
}

function extractFirstNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[0]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function extractFirstInteger(value: string | undefined): number | undefined {
  const parsed = extractFirstNumber(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.round(parsed);
}

function getDefaultSmellMeta(rule: string): SmellUiMeta {
  return {
    icon: '❓',
    label: rule,
    className: '',
    pillLabel: rule,
  };
}

function getMaxNumeric(values: Array<number | undefined>): number {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  if (numericValues.length === 0) {
    return 0;
  }

  return Math.max(...numericValues);
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function toNullableInteger(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? Math.round(value) : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeForScript(value: string): string {
  return value
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}
