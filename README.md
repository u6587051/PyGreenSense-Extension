# PyGreenSense

PyGreenSense brings green-code analysis for Python into Visual Studio Code. It detects sustainability-related code smells, runs the PyGreenSense Python analyzer from an extension-managed environment, and shows the latest results in a VS Code report view.

## Features

- Analyze the active Python file for green code smells.
- Analyze an entire workspace folder.
- Create and manage the extension's own Python virtual environment.
- Install the required Python packages from `python/requirements.txt`.
- Show issue groups, emissions, energy, CFP, LOC, SCI per line, and SCI per CFP in a webview report.
- Keep run history so results can be compared across analysis runs.

## Requirements

- Visual Studio Code `^1.110.0`
- Python available on your system as `python3`, `python`, or `py -3`
- Internet access the first time dependencies are installed

The extension installs these Python dependencies into its own VS Code global-storage virtual environment:

- `pygreensense==0.0.5`
- `codecarbon==3.2.6`

## Commands

| Command | Description |
| --- | --- |
| `PyGreenSense: Install Extension Requirements` | Creates the extension virtual environment and installs Python dependencies. |
| `PyGreenSense: Check Virtual Environment` | Checks whether the extension virtual environment is available. |
| `PyGreenSense: Run Code Analysis` | Analyzes the active Python file. |
| `PyGreenSense: Analyze Entire Project` | Analyzes the selected workspace folder. |

## Getting Started

1. Open a Python project in VS Code.
2. Run `PyGreenSense: Install Extension Requirements`.
3. Open a Python file and run `PyGreenSense: Run Code Analysis`.
4. Review the PyGreenSense report panel after the analysis completes.

For workspace-wide analysis, run `PyGreenSense: Analyze Entire Project` from the Command Palette.

## Notes

Energy and carbon measurements can vary by machine, workload size, region, and runtime conditions. Treat PyGreenSense results as a practical signal for code-quality and sustainability review, not as a perfectly deterministic measurement.

## Repository

Source code and issue tracking are available at:

https://github.com/u6587051/PyGreenSense-Extension
