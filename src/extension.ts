// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ensureExtensionEnvironment, installExtensionRequirements } from './python/envManager'; // adjust to your path
import { checkExtensionVenv } from './python/venv';
import { runInVenv, runPyGreenSense } from './python/pythonRunner';
import { persistHistoryAfterRun, prepareHistoryForRun, readHistoryJson } from './python/history';
import { PYGREENSENSE_CLI_MODULE } from './python/config';
import { showPyGreenSenseResultsPanel } from './webview/resultsPanel';

type AnalysisTarget = {
	targetPath: string;
	workspaceRoot: string;
	displayTarget: string;
	successMessage: string;
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('PyGreenSense');
	context.subscriptions.push(output);

	const checkVenv = vscode.commands.registerCommand(
		'pygreensense-extension.checkVenv',
		async () => {
			const status = checkExtensionVenv(context);

			output.clear();
			output.appendLine('=== PyGreenSense: Extension Venv Check ===');
			output.appendLine(`venvDir: ${status.venvDir}`);
			output.appendLine(`pythonPath: ${status.pythonPath}`);
			output.appendLine(`venvExists: ${status.venvExists}`);
			output.appendLine(`pythonExists: ${status.pythonExists}`);
			output.show(true);

			if (!status.venvExists) {
				vscode.window.showErrorMessage(`No extension venv found at: ${status.venvDir}`);
				return;
			}

			if (!status.pythonExists) {
				vscode.window.showErrorMessage(`Venv exists but python not found at: ${status.pythonPath}`);
				return;
			}

			vscode.window.showInformationMessage('Extension venv is OK ✅');
		}
	);

	context.subscriptions.push(checkVenv);

	const installReq = vscode.commands.registerCommand(
		'pygreensense-extension.installRequirements',
		async () => {
			output.clear();
			output.show(true);
			output.appendLine('=== Installing Extension Requirements ===');

			try {
				await installExtensionRequirements(context, output);
				vscode.window.showInformationMessage('Installed PyGreenSense + CodeCarbon ✅');
			} catch (e: any) {
				vscode.window.showErrorMessage(e?.message ?? String(e));
			}
		}
	);

	context.subscriptions.push(installReq);

	const runAnalysis = async ({ targetPath, workspaceRoot, displayTarget, successMessage }: AnalysisTarget) => {
		output.clear();
		output.show(true);
		output.appendLine('=== PyGreenSense Run ===');
		output.appendLine(`workspace: ${workspaceRoot}`);
		output.appendLine(`target: ${displayTarget}`);

		try {
			const pythonPath = await ensureExtensionEnvironment(context, output);
			const globalStoragePath = context.globalStorageUri.fsPath;
			output.appendLine(`venv python: ${pythonPath}`);
			output.appendLine(`history storage: ${globalStoragePath}`);

			const check = await runInVenv(
				pythonPath,
				['-c', `from ${PYGREENSENSE_CLI_MODULE} import main; print("pygreensense cli import ok")`],
				workspaceRoot,
				output
			);

			if (check.code !== 0) {
				vscode.window.showErrorMessage('PyGreenSense CLI is not importable in the extension venv.');
				return;
			}

			prepareHistoryForRun(workspaceRoot, globalStoragePath);

			let result;
			try {
				result = await runPyGreenSense(pythonPath, workspaceRoot, targetPath, output);
			} finally {
				persistHistoryAfterRun(workspaceRoot, globalStoragePath);
			}
			output.appendLine(`--- exit code: ${result.code} ---`);

			const history = readHistoryJson(globalStoragePath, workspaceRoot);
			showPyGreenSenseResultsPanel({
				extensionUri: context.extensionUri,
				targetFile: targetPath,
				workspaceRoot,
				history,
				runResult: result,
			});

			if (result.code !== 0) {
				vscode.window.showErrorMessage('PyGreenSense failed. See Output → PyGreenSense.');
				return;
			}

			if (!history.foundPath) {
				output.appendLine('history.json not found. Checked:');
				history.pathChecked.forEach(p => output.appendLine(`  - ${p}`));
				vscode.window.showWarningMessage('Run completed, but history.json was not found.');
				return;
			}

			output.appendLine(`history.json found at: ${history.foundPath}`);
			vscode.window.showInformationMessage(successMessage);
		} catch (e: any) {
			output.appendLine(`ERROR: ${e?.message ?? String(e)}`);
			vscode.window.showErrorMessage(e?.message ?? String(e));
		}
	};

	const analyzeFile = vscode.commands.registerCommand(
		'pygreensense-extension.analyzeFile',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No file open.');
				return;
			}

			const targetFile = editor.document.uri.fsPath;
			const workspaceRoot = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('Open a folder/workspace first.');
				return;
			}

			await runAnalysis({
				targetPath: targetFile,
				workspaceRoot,
				displayTarget: targetFile,
				successMessage: 'PyGreenSense file analysis complete ✅',
			});
		}
	);

	context.subscriptions.push(analyzeFile);

	const analyzeProject = vscode.commands.registerCommand(
		'pygreensense-extension.analyzeProject',
		async () => {
			const workspaceFolder = await resolveWorkspaceFolderForProjectAnalysis();
			if (!workspaceFolder) {
				return;
			}

			await runAnalysis({
				targetPath: workspaceFolder.uri.fsPath,
				workspaceRoot: workspaceFolder.uri.fsPath,
				displayTarget: `${workspaceFolder.uri.fsPath} (entire project)`,
				successMessage: 'PyGreenSense project analysis complete ✅',
			});
		}
	);

	context.subscriptions.push(analyzeProject);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pygreensense-extension" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('pygreensense-extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from pygreensense-extension!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }

async function resolveWorkspaceFolderForProjectAnalysis(): Promise<vscode.WorkspaceFolder | undefined> {
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (activeWorkspace) {
			return activeWorkspace;
		}
	}

	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	if (workspaceFolders.length === 0) {
		vscode.window.showErrorMessage('Open a folder/workspace first.');
		return undefined;
	}

	if (workspaceFolders.length === 1) {
		return workspaceFolders[0];
	}

	return vscode.window.showWorkspaceFolderPick({
		placeHolder: 'Select a workspace folder to analyze with PyGreenSense',
	});
}
