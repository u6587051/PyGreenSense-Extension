# PyGreenSense Project Knowledge

This file captures project knowledge distilled from the supplied senior-project report materials so the repository can preserve the intended academic and product context in one place.

## Chapter 1: Motivation, Objectives, And Scope

### Motivation

The project is motivated by the idea that inefficient software can increase unnecessary energy use and therefore contribute to environmental impact. In that framing, code quality is not only a maintainability concern but also part of sustainable software engineering.

### Objectives

The report positions PyGreenSense around three main objectives:

- build a Python library and a VS Code extension for detecting green code smells
- study how code structure and code smells relate to energy-oriented outcomes
- present actionable analysis results that help developers improve code sustainability

### Scope

The intended project scope includes:

- AST-based static analysis of Python source code
- a ruleset for smell detection
- reporting for energy, carbon, CFP, and related metrics
- a developer-facing extension workflow inside Visual Studio Code

## Chapter 2: Background Theory

The report anchors the project in four areas:

- Green Software Engineering
- the relationship between code smells and energy consumption
- Green Code Smells and the ecoCode line of work
- sustainability metrics such as Software Carbon Intensity (SCI), CodeCarbon measurements, and COSMIC Function Points (CFP)

Important interpretation guidance from this chapter:

- carbon intensity should be treated as a function of energy, grid intensity, and functional output
- CodeCarbon is useful for practical emissions estimation, but the results remain context-sensitive
- CFP is used here as a functional-size approximation that helps normalize impact

## Chapter 3: Related Work And Tool Positioning

The project is positioned against tools and references such as:

- ecoCode and SonarQube
- Pylint
- Ruff
- PySmell
- CodeCarbon
- Green Metrics Tool
- Green Software Foundation impact and SCI concepts

The differentiator claimed for PyGreenSense is not just generic Python linting. It is the combination of:

- Python smell detection
- sustainability-oriented metrics
- a developer-friendly reporting experience
- an editor-integrated workflow through VS Code

## Chapter 4: System Design And Implementation

The implementation story implied by the report and reflected in this repository is:

- the Python package performs AST-based static analysis and emits report output plus history data
- the VS Code extension owns its own virtual environment and installs the Python dependencies it needs
- analysis can target a single file or an entire project
- the extension preserves `history.json` across runs
- the report panel combines parsed CLI output with persisted history
- the user-facing dashboard emphasizes metric cards, smell groups, history, and program output

Core smell families repeatedly mentioned in the project narrative:

- Dead Code
- Long Method
- God Class
- Duplicated Code
- Mutable Default Arguments

Core metrics repeatedly mentioned in the project narrative:

- carbon emissions
- energy consumed
- emissions rate
- region and grid context
- LOC
- CFP
- SCI per line
- SCI per CFP

## Chapter 5: Evaluation And Interpretation

The evaluation chapter suggests these takeaways:

- refactoring can reduce code smells consistently
- lower smell counts do not guarantee lower carbon or energy in every benchmark
- smaller codebases are especially noisy for emissions and energy comparisons
- results should be interpreted as directional evidence, not universal proof
- the extension is valuable because it exposes these tradeoffs in a workflow developers can actually use

This means repository docs and product messaging should avoid overclaiming. PyGreenSense should be described as:

- a tool for smell detection plus sustainability-oriented reporting
- a support tool for greener coding decisions
- a source of approximate and contextualized carbon insight

It should not be described as:

- a definitive carbon auditor for every Python program
- a guarantee that refactoring always reduces emissions
- a replacement for broader runtime profiling or controlled experiments

## Chapter 6: Limitations And Future Work

The report highlights several constraints that should stay visible to contributors:

- benchmark diversity is still limited
- the mapping from each smell type to energy impact is still underdeveloped
- machine conditions and runtime noise affect measurements
- AST-based static analysis cannot explain every runtime behavior
- novice users may still need stronger explanations and remediation guidance

Recommended future directions include:

- larger and more diverse Python benchmarks
- better evidence linking smell categories to energy outcomes
- more beginner-friendly education and refactoring guidance
- recommendation support for fixes
- stronger statistical treatment of repeated runs

## Practical Guidance For Future Contributors

- Keep documentation aligned with the idea of "code quality plus sustainability", not sustainability in isolation.
- When adding UI or docs, preserve the visibility of CFP, SCI, carbon, energy, and smell breakdowns.
- When describing results, prefer words like "estimate", "trend", "signal", and "approximation" over absolute claims.
- Treat history persistence as part of the product story because the report emphasizes before/after comparison.
- If new rules are added, document both the code-quality rationale and the sustainability rationale where possible.
