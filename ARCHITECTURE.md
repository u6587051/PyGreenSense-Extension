# PyGreenSense VS Code Extension Architecture

```mermaid
flowchart TD
  User["User in VS Code"] --> Commands["Command Palette / contributed commands"]
  Package["package.json<br/>activationEvents + contributes.commands"] --> Activate["activate(context)<br/>src/extension.ts"]
  Commands --> Activate

  Activate --> Output["PyGreenSense output channel"]
  Activate --> CheckCmd["checkVenv command"]
  Activate --> InstallCmd["installRequirements command"]
  Activate --> AnalyzeFileCmd["analyzeFile command"]
  Activate --> AnalyzeProjectCmd["analyzeProject command"]
  Activate --> HelloCmd["helloWorld command"]

  CheckCmd --> VenvStatus["checkExtensionVenv()<br/>src/python/venv.ts"]
  VenvStatus --> GlobalStorage["VS Code globalStorage<br/>pygreensense/.venv"]
  VenvStatus --> Output

  InstallCmd --> InstallReq["installExtensionRequirements()<br/>src/python/envManager.ts"]
  InstallReq --> CreateVenv["createExtensionVenv()"]
  CreateVenv --> BootstrapPython["System Python<br/>python3 / python / py -3"]
  CreateVenv --> GlobalStorage
  InstallReq --> Requirements["python/requirements.txt<br/>pygreensense + codecarbon"]
  Requirements --> PipInstall["venv python -m pip install"]
  PipInstall --> GlobalStorage
  InstallReq --> Output

  AnalyzeFileCmd --> ResolveFile["Active editor file<br/>+ workspace folder"]
  AnalyzeProjectCmd --> ResolveProject["Active/multi-root workspace selection"]
  ResolveFile --> RunAnalysis["runAnalysis(targetPath, workspaceRoot)"]
  ResolveProject --> RunAnalysis

  RunAnalysis --> EnsureEnv["ensureExtensionEnvironment()<br/>create venv if needed"]
  EnsureEnv --> GlobalStorage
  EnsureEnv --> Requirements
  RunAnalysis --> ImportCheck["runInVenv()<br/>import green_code_smell.cli"]
  ImportCheck --> Output
  RunAnalysis --> PrepareHistory["prepareHistoryForRun()<br/>copy prior history to workspace"]
  PrepareHistory --> HistoryGlobal["globalStorage/history.json"]
  PrepareHistory --> HistoryWorkspace["workspace/history.json"]

  RunAnalysis --> RunCli["runPyGreenSense()<br/>resolve pygreensense console script"]
  RunCli --> Spawn["child_process.spawn()<br/>cwd = workspaceRoot"]
  Spawn --> PyGreenSense["PyGreenSense CLI<br/>installed in extension venv"]
  PyGreenSense --> StdoutStderr["stdout / stderr report output"]
  PyGreenSense --> HistoryWorkspace
  StdoutStderr --> Output

  RunAnalysis --> PersistHistory["persistHistoryAfterRun()<br/>move workspace history back"]
  PersistHistory --> HistoryGlobal
  RunAnalysis --> ReadHistory["readHistoryJson()<br/>global + fallback workspace paths"]
  ReadHistory --> ResultsPanel["showPyGreenSenseResultsPanel()<br/>src/webview/resultsPanel.ts"]
  StdoutStderr --> ResultsPanel

  ResultsPanel --> Parser["parsePyGreenSenseReport()<br/>src/webview/reportParser.ts"]
  ResultsPanel --> ViewModel["Build metrics, smells, issue rows,<br/>history timeline, cloud prompts"]
  Parser --> ViewModel
  HistoryGlobal --> ViewModel
  ViewModel --> Webview["VS Code Webview Panel<br/>HTML/CSS/JS"]
  Webview --> Media["media/simple-cloud.png"]
  Webview --> CopyPrompt["postMessage: copyPrompt"]
  CopyPrompt --> Clipboard["VS Code clipboard API"]
  Clipboard --> User

  RunAnalysis --> Notifications["VS Code information / warning / error messages"]
  CheckCmd --> Notifications
  InstallCmd --> Notifications
```

## Flow Summary

The extension is activated by the commands declared in `package.json` or when a Python file is opened. During activation, `src/extension.ts` registers all commands and creates the `PyGreenSense` output channel.

There are three main command paths:

- `checkVenv` reads the extension-owned virtual environment status from VS Code global storage.
- `installRequirements` creates or reuses that virtual environment and installs `python/requirements.txt`.
- `analyzeFile` and `analyzeProject` both resolve a target path, then call the shared `runAnalysis` pipeline.

The analysis pipeline ensures the Python environment exists, verifies the PyGreenSense CLI can be imported, prepares a temporary workspace `history.json`, runs the PyGreenSense CLI in the selected workspace, persists history back to global storage, then opens or refreshes the results webview.

The webview layer parses CLI stdout, combines it with persisted history metrics, renders the report UI, and sends `copyPrompt` messages back to the extension host when the user copies a generated remediation prompt.

## Main Modules

| Area | File | Responsibility |
| --- | --- | --- |
| Extension host | `src/extension.ts` | Activation, command registration, target resolution, shared analysis workflow |
| Python environment | `src/python/envManager.ts` | Bootstrap Python discovery, venv creation, requirements installation |
| Venv paths/status | `src/python/venv.ts` | Extension global-storage venv paths and health checks |
| CLI execution | `src/python/pythonRunner.ts` | Spawn venv Python / PyGreenSense console script and collect output |
| History storage | `src/python/history.ts` | Copy, move, read, and normalize `history.json` |
| Report parsing | `src/webview/reportParser.ts` | Extract metrics and issue groups from PyGreenSense stdout |
| Results UI | `src/webview/resultsPanel.ts` | Build the webview model, HTML, styling, and clipboard message handler |
| Bundled assets | `media/simple-cloud.png` | Cloud visual used by the webview |
| Python packages | `python/requirements.txt` | PyGreenSense and CodeCarbon dependencies installed into the venv |
