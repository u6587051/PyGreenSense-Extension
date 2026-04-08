import * as fs from 'fs';
import * as path from 'path';

export type SmellBreakdownEntry = {
  count?: number;
  loc?: number;
};

export type HistoryMetric = {
  id?: number;
  date_time?: string;
  target_file?: string;
  duration_seconds?: number;
  emission_kg?: number;
  energy_consumed_kWh?: number;
  region?: string | null;
  country_name?: string | null;
  emissions_rate_gCO2eq_per_kWh?: number;
  total_emissions_gCO2eq?: number;
  lines_of_code?: number;
  sci_gCO2eq_per_line?: number;
  status?: string;
  cfp?: number;
  sci_per_cfp?: number | null;
  improvement_percent?: number | null;
  smell_breakdown?: Record<string, SmellBreakdownEntry>;
  [key: string]: unknown;
};

export type HistoryJson = HistoryMetric | HistoryMetric[];

export type HistoryRead = {
  pathChecked: string[];
  foundPath: string | null;
  json: HistoryJson | null;
};

const HISTORY_FILE_NAME = 'history.json';

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function copyFile(sourcePath: string, destinationPath: string): void {
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function moveFile(sourcePath: string, destinationPath: string): void {
  copyFile(sourcePath, destinationPath);
  fs.unlinkSync(sourcePath);
}

function tryReadJson(filePath: string): any | null {
  try {
    if (!fileExists(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getHistoryEntries(historyJson: HistoryJson | null): HistoryMetric[] {
  if (!historyJson) {
    return [];
  }

  return Array.isArray(historyJson) ? historyJson : [historyJson];
}

export function getLatestHistoryMetric(historyJson: HistoryJson | null): HistoryMetric | null {
  const entries = getHistoryEntries(historyJson);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function getGlobalHistoryPath(globalStoragePath: string): string {
  return path.join(globalStoragePath, HISTORY_FILE_NAME);
}

export function getWorkspaceHistoryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, HISTORY_FILE_NAME);
}

export function prepareHistoryForRun(workspaceRoot: string, globalStoragePath: string): void {
  const workspaceHistoryPath = getWorkspaceHistoryPath(workspaceRoot);
  const globalHistoryPath = getGlobalHistoryPath(globalStoragePath);

  if (fileExists(globalHistoryPath)) {
    copyFile(globalHistoryPath, workspaceHistoryPath);
  }
}

export function persistHistoryAfterRun(workspaceRoot: string, globalStoragePath: string): string | null {
  const workspaceHistoryPath = getWorkspaceHistoryPath(workspaceRoot);
  const globalHistoryPath = getGlobalHistoryPath(globalStoragePath);

  if (!fileExists(workspaceHistoryPath)) {
    return fileExists(globalHistoryPath) ? globalHistoryPath : null;
  }

  moveFile(workspaceHistoryPath, globalHistoryPath);
  return globalHistoryPath;
}

export function readHistoryJson(globalStoragePath: string, workspaceRoot?: string): HistoryRead {
  const candidates = [
    getGlobalHistoryPath(globalStoragePath),
  ];

  if (workspaceRoot) {
    candidates.push(
      getWorkspaceHistoryPath(workspaceRoot),
      path.join(workspaceRoot, '.pygreensense', HISTORY_FILE_NAME),
      path.join(workspaceRoot, 'pygreensense', HISTORY_FILE_NAME),
    );
  }

  for (const p of candidates) {
    const json = tryReadJson(p);
    if (json !== null) {
      return { pathChecked: candidates, foundPath: p, json };
    }
  }

  return { pathChecked: candidates, foundPath: null, json: null };
}
