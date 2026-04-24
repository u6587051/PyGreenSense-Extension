# PyGreenSense VS Code Extension

PyGreenSense is a VS Code extension that brings the PyGreenSense Python library into the editor workflow. It analyzes Python files or entire workspaces for green code smells, tracks sustainability-oriented metrics, and presents the latest run in a webview dashboard with history, smell breakdowns, and copyable remediation prompts.

This repository now reflects the senior-project narrative captured in the supplied report materials: the project is positioned as an AST-based Python analysis tool that helps developers connect code quality with energy and carbon awareness.

## Why This Project Exists

The thesis materials frame PyGreenSense around a simple problem: inefficient software structure can waste compute resources, which in turn increases energy use and environmental impact. The extension exists to make that concern actionable inside a familiar developer tool by combining:

- static detection of Python code smells with an AST-driven analysis flow
- carbon and energy reporting from the underlying PyGreenSense tooling
- sustainability metrics such as CFP and SCI-derived values
- a report UI that is easier to interpret than raw console output alone

## Project Goals

Based on the provided chapter materials, the project is expected to support these goals:

- detect Python green code smells in a repeatable, automated way
- surface energy and carbon-oriented metrics alongside traditional code-quality findings
- make the analysis available from VS Code, not only from a standalone CLI
- preserve analysis history so users can compare runs before and after refactoring
- help developers move toward greener and more maintainable Python code

## Scope

The current extension is aligned with the documented project scope:

- integrates with the PyGreenSense Python package from an extension-managed virtual environment
- analyzes either the active Python file or an entire workspace folder
- parses CLI output and `history.json` results into a structured report
- displays issue counts, smell groups, carbon emission, energy, CFP, LOC, SCI per line, and SCI per CFP
- keeps a saved history of prior runs for trend review inside the webview

## What The Extension Does

### Command Workflow

The extension contributes these commands:

| Command | Purpose |
| --- | --- |
| `PyGreenSense: Check Virtual Environment` | Verify that the extension-owned Python environment exists and is usable |
| `PyGreenSense: Install Extension Requirements` | Create the extension venv if needed and install bundled Python dependencies |
| `PyGreenSense: Run Code Analysis` | Analyze the currently open Python file |
| `PyGreenSense: Analyze Entire Project` | Analyze the selected workspace folder |

### Report Experience

After a run, the webview dashboard can show:

- carbon emission and issue summary cards
- CFP and LOC rollups
- duration, energy, emission rate, region, SCI per line, and SCI per CFP
- grouped issue rows by smell category
- saved run history from `history.json`
- program output from the last run
- copyable prompts for refactoring or remediation follow-up

## Smells And Metrics Highlighted In The Thesis

The provided chapter material repeatedly references these smell categories as part of the project narrative:

- Dead Code
- Long Method
- God Class
- Duplicated Code
- Mutable Default Arguments

The extension is also documented around these sustainability-related metrics:

- carbon emissions
- energy consumed
- emissions rate
- COSMIC Function Points (CFP)
- SCI per line
- SCI per CFP
- lines of code (LOC)

## Requirements

- VS Code `^1.110.0`
- a system Python installation discoverable as `python3`, `python`, or `py -3`
- network access during dependency installation so pip can install the bundled requirements

The extension creates its own venv under VS Code global storage and installs the Python dependencies listed in [`python/requirements.txt`](/Users/tardi9rad3/hym-dev/GitHub/PyGreenSens-Extension/python/requirements.txt).

## Getting Started

1. Open a Python project in VS Code.
2. Run `PyGreenSense: Install Extension Requirements`.
3. Open a Python file and run `PyGreenSense: Run Code Analysis`, or use `PyGreenSense: Analyze Entire Project`.
4. Review the generated dashboard and compare the latest findings with the saved history.

## Architecture

The implementation follows a clear pipeline:

1. Resolve the analysis target from the active editor or workspace.
2. Ensure the extension-owned Python environment exists.
3. Verify the PyGreenSense CLI import inside that environment.
4. Prepare `history.json` for the current run.
5. Execute the PyGreenSense CLI in the selected workspace.
6. Persist updated history back to extension storage.
7. Parse stdout plus history data and render the webview report.

For the module-level flow, see [`ARCHITECTURE.md`](/Users/tardi9rad3/hym-dev/GitHub/PyGreenSens-Extension/ARCHITECTURE.md).

## Evaluation Notes And Limitations

The thesis materials emphasize that code-quality improvements and carbon improvements do not always move in lockstep. When interpreting results from this extension, keep in mind:

- code smell reduction is a useful signal, but not proof of lower carbon impact in every case
- energy and carbon measurements are sensitive to machine conditions and runtime noise
- small projects can produce unstable sustainability metrics because the measured workload is tiny
- the current analysis is primarily static and AST-based, so runtime-only behavior is out of scope
- smell detection is more mature than causal energy attribution for each smell type

## Future Directions Captured From The Report

- build a stronger data catalog for smell-to-energy impact in Python
- expand the benchmark set to more realistic project types and workloads
- improve beginner-friendly explanations and remediation guidance
- add recommendation support for refactoring actions
- strengthen evaluation with more repeated experiments and statistical analysis

## Repository Knowledge Base

The supplied PDF chapters have been distilled into [`PROJECT_KNOWLEDGE.md`](/Users/tardi9rad3/hym-dev/GitHub/PyGreenSens-Extension/PROJECT_KNOWLEDGE.md) so future contributors can keep implementation, docs, and terminology aligned with the senior-project report.
