import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getExtensionVenvPaths } from './venv'; // adjust path if needed

type CommandSpec = {
    cmd: string;
    args: string[];
};

function run(cmd: string, args: string[], cwd: string, output: vscode.OutputChannel): Promise<void> {
    return new Promise((resolve, reject) => {
        output.appendLine(`$ ${cmd} ${args.join(' ')}`);

        const p = spawn(cmd, args, { cwd });

        p.stdout.on('data', (d) => output.appendLine(String(d)));
        p.stderr.on('data', (d) => output.appendLine(String(d)));

        p.on('error', reject);
        p.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed (${code}): ${cmd} ${args.join(' ')}`));
            }
        });
    });
}

function commandExists(cmd: string, args: string[], cwd: string): Promise<boolean> {
    return new Promise((resolve) => {
        const p = spawn(cmd, args, { cwd });

        p.on('error', () => resolve(false));
        p.on('close', (code) => resolve(code === 0));
    });
}

async function findBootstrapPython(cwd: string): Promise<CommandSpec | null> {
    const candidates: CommandSpec[] =
        process.platform === 'win32'
            ? [
                { cmd: 'py', args: ['-3', '--version'] },
                { cmd: 'python', args: ['--version'] },
                { cmd: 'python3', args: ['--version'] },
            ]
            : [
                { cmd: 'python3', args: ['--version'] },
                { cmd: 'python', args: ['--version'] },
            ];

    for (const candidate of candidates) {
        if (await commandExists(candidate.cmd, candidate.args, cwd)) {
            return candidate;
        }
    }

    return null;
}

async function createExtensionVenv(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
): Promise<{ pythonPath: string; created: boolean }> {
    const { venvDir, pythonPath } = getExtensionVenvPaths(context);
    const cwd = path.dirname(venvDir);

    fs.mkdirSync(cwd, { recursive: true });

    if (fs.existsSync(pythonPath)) {
        return { pythonPath, created: false };
    }

    if (fs.existsSync(venvDir)) {
        output.appendLine(`Removing incomplete extension venv: ${venvDir}`);
        fs.rmSync(venvDir, { recursive: true, force: true });
    }

    const bootstrap = await findBootstrapPython(cwd);
    if (!bootstrap) {
        throw new Error('Could not find a system Python to create the extension venv.');
    }

    output.appendLine(`Creating extension venv at: ${venvDir}`);
    await run(bootstrap.cmd, [...bootstrap.args.slice(0, -1), '-m', 'venv', venvDir], cwd, output);

    return { pythonPath, created: true };
}

async function installRequirementsWithVenvPython(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    pythonPath: string,
): Promise<void> {
    // requirements.txt bundled with extension
    const reqPath = vscode.Uri.joinPath(context.extensionUri, 'python', 'requirements.txt').fsPath;
    if (!fs.existsSync(reqPath)) {
        throw new Error(`Bundled requirements.txt not found at: ${reqPath}`);
    }

    output.appendLine(`Using venv python: ${pythonPath}`);
    output.appendLine(`Installing from: ${reqPath}`);

    await run(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], path.dirname(reqPath), output);
    await run(pythonPath, ['-m', 'pip', 'install', '-r', reqPath], path.dirname(reqPath), output);

    output.appendLine('✅ Requirements installed successfully.');
}

export async function ensureExtensionEnvironment(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
): Promise<string> {
    const { pythonPath, created } = await createExtensionVenv(context, output);

    if (created) {
        output.appendLine('Extension venv was missing. Installing bundled requirements...');
        await installRequirementsWithVenvPython(context, output, pythonPath);
    }

    return pythonPath;
}

export async function installExtensionRequirements(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
): Promise<void> {
    const { pythonPath } = await createExtensionVenv(context, output);
    await installRequirementsWithVenvPython(context, output, pythonPath);
}
