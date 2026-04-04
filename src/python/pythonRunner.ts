import * as vscode from 'vscode';
import { spawn } from 'child_process';

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export async function runInVenv(
  pythonPath: string,
  args: string[],
  cwd: string,
  output: vscode.OutputChannel
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    output.appendLine(`$ ${pythonPath} ${args.join(' ')}`);
    const p = spawn(pythonPath, args, { cwd });

    let stdout = '';
    let stderr = '';

    p.stdout.on('data', (d) => {
      const s = String(d);
      stdout += s;
      output.appendLine(s);
    });

    p.stderr.on('data', (d) => {
      const s = String(d);
      stderr += s;
      output.appendLine(s);
    });

    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}


/**
 * Tries to run PyGreenSense as a module:
 *   python -m pygreensense <targetFile>
 *
 * If your library uses different CLI args, change them here.
 */
export async function runPyGreenSense(
  pythonPath: string,
  workspaceRoot: string,
  targetFile: string,
  output: vscode.OutputChannel
): Promise<RunResult> {
  // Most common pattern for python libs that ship a CLI:
  const PYGREENSENSE_MODULE = 'green_code_smell';
  const args = ['-m', PYGREENSENSE_MODULE, targetFile];

  return runInVenv(pythonPath, ['-m', PYGREENSENSE_MODULE, targetFile], workspaceRoot, output);
}