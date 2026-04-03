import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type VenvStatus = {
  venvDir: string;
  pythonPath: string;
  venvExists: boolean;
  pythonExists: boolean;
};

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function getExtensionVenvPaths(context: vscode.ExtensionContext): { venvDir: string; pythonPath: string } {
  // Extension-owned storage directory (safe & writable)
  const base = context.globalStorageUri.fsPath;

  // Put venv under: <globalStorage>/pygreensense/.venv
  const venvDir = path.join(base, 'pygreensense', '.venv');

  const pythonPath =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python');

  return { venvDir, pythonPath };
}

export function checkExtensionVenv(context: vscode.ExtensionContext): VenvStatus {
  const { venvDir, pythonPath } = getExtensionVenvPaths(context);

  const venvExists = exists(venvDir);
  const pythonExists = exists(pythonPath);

  return { venvDir, pythonPath, venvExists, pythonExists };
}