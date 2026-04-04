import * as fs from 'fs';
import * as path from 'path';

export type HistoryRead = {
  pathChecked: string[];
  foundPath: string | null;
  json: any | null;
};

function tryReadJson(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readHistoryJson(workspaceRoot: string): HistoryRead {
  // Common candidate locations (adjust if your library writes elsewhere)
  const candidates = [
    path.join(workspaceRoot, 'history.json'),
    path.join(workspaceRoot, '.pygreensense', 'history.json'),
    path.join(workspaceRoot, 'pygreensense', 'history.json'),
  ];

  for (const p of candidates) {
    const json = tryReadJson(p);
    if (json !== null) {
      return { pathChecked: candidates, foundPath: p, json };
    }
  }

  return { pathChecked: candidates, foundPath: null, json: null };
}