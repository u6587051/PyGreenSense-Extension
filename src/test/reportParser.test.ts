import * as assert from 'assert';
import { parsePyGreenSenseReport } from '../webview/reportParser';

suite('reportParser', () => {
  test('parses issue groups, metrics, and program output', () => {
    const parsed = parsePyGreenSenseReport(`
🔍 Analyzing 1 Python file(s)...

================================================================================
⚠️  Found 9 issue(s) in 1 file(s):
================================================================================

📄 /tmp/example.py (9 issue(s))
--------------------------------------------------------------------------------

  DeadCode (3 issue(s)):
    Line 286: Unused function 'generate_payroll_report' is never referenced. Suggest removing it.
    Line 308: Unused function 'generate_payroll_report_backup' is never referenced. Suggest removing it.
    Line 363: Unused function 'generate_annual_report' is never referenced. Suggest removing it.

  DuplicatedCode (2 issue(s)):
    Line 286: Similar function implementations. Consider refactoring.
    Line 327: Similar function implementations. Consider refactoring.

================================================================================
📊 Summary by Rule:
--------------------------------------------------------------------------------
  DeadCode: 3 issue(s)
  DuplicatedCode: 2 issue(s)
================================================================================

🌱 Tracking carbon emissions for: /tmp/example.py
   Running 5 iterations for average calculations...
--------------------------------------------------------------------------------

📋 Program output (from last run):
[]
Paying employee Louis a monthly salary of $5000.

================================================================================
🌍 GREEN CODE CARBON EMISSIONS REPORT 🌍
================================================================================

📋 Execution Details:
  Target file: /tmp/example.py
  Duration: 0.00 seconds

⚡ Energy & Emissions:
  Total energy consumed: 0.000000 kWh
  Carbon emissions: 1.175040e-07 kg CO2
  Emissions rate: 0.13 gCO2eq/kWh
  Region: bangkok
  Country: Thailand

📊 Code Metrics:
  COSMIC Function Points: 43 CFP
  Total lines of code: 345 LOC

📊 Code Smell & Carbon Emission Analysis

   Current Run (Initial):
      Carbon Emission: 1.175040e-07 kg CO2
`);

    assert.strictEqual(parsed.analyzedFileCount, 1);
    assert.strictEqual(parsed.issueCount, 9);
    assert.strictEqual(parsed.issueFileCount, 1);
    assert.strictEqual(parsed.targetFile, '/tmp/example.py');
    assert.strictEqual(parsed.iterations, 5);
    assert.strictEqual(parsed.region, 'bangkok');
    assert.strictEqual(parsed.country, 'Thailand');
    assert.strictEqual(parsed.cfp, 43);
    assert.strictEqual(parsed.loc, 345);
    assert.strictEqual(parsed.currentRunStatus, 'Initial');
    assert.deepStrictEqual(parsed.programOutput, [
      '[]',
      'Paying employee Louis a monthly salary of $5000.',
    ]);

    const deadCode = parsed.issueGroups.find(group => group.rule === 'DeadCode');
    assert.ok(deadCode);
    assert.strictEqual(deadCode?.count, 3);
    assert.strictEqual(deadCode?.issues.length, 3);
    assert.strictEqual(deadCode?.issues[0].line, 286);

    const duplicatedCode = parsed.issueGroups.find(group => group.rule === 'DuplicatedCode');
    assert.ok(duplicatedCode);
    assert.strictEqual(duplicatedCode?.count, 2);
  });
});
