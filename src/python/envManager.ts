import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getExtensionVenvPaths } from './venv'; // adjust path if needed

function run(cmd: string, args: string[], cwd: string, output: vscode.OutputChannel): Promise<void> {
    return new Promise((resolve, reject) => {
        output.appendLine(`$ ${cmd} ${args.join(' ')}`);

        const p = spawn(cmd, args, { cwd });

        p.stdout.on('data', (d) => output.appendLine(String(d)));
        p.stderr.on('data', (d) => output.appendLine(String(d)));

        p.on('error', reject);
        p.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed (${code}): ${cmd} ${args.join(' ')}`));
        });
    });
}

export async function installExtensionRequirements(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
): Promise<void> {
    const { venvDir, pythonPath } = getExtensionVenvPaths(context);

    // requirements.txt bundled with extension
    const reqPath = vscode.Uri.joinPath(context.extensionUri, 'python', 'requirements.txt').fsPath;
    if (!fs.existsSync(reqPath)) {
        throw new Error(`Bundled requirements.txt not found at: ${reqPath}`);
    }

    // Run pip using the venv python
    const cwd = path.dirname(venvDir);

    output.appendLine(`Using venv python: ${pythonPath}`);
    output.appendLine(`Installing from: ${reqPath}`);

    await run(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], cwd, output);
    await run(pythonPath, ['-m', 'pip', 'install', '-r', reqPath], cwd, output);

    output.appendLine('✅ Requirements installed successfully.');
}