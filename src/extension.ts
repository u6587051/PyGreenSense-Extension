// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { checkExtensionVenv } from './python/venv';
import { installExtensionRequirements } from './python/envManager'; // adjust to your path

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
