export type ParsedRuleIssue = {
  lineNumber: number | null;
  message: string;
};

export type ParsedRuleGroup = {
  rule: string;
  count: number;
  issues: ParsedRuleIssue[];
};

export type ParsedRuleSummary = {
  rule: string;
  count: number;
};

export type ParsedTerminalReport = {
  totalIssues: number | null;
  analyzedFileCount: number | null;
  analyzedTarget: string | null;
  trackedFile: string | null;
  iterationCount: number | null;
  issueGroups: ParsedRuleGroup[];
  summaryByRule: ParsedRuleSummary[];
  programOutputLines: string[];
  executionDetails: Record<string, string>;
  energyAndEmissions: Record<string, string>;
  codeMetrics: Record<string, string>;
  currentRunLabel: string | null;
  currentRunCarbonEmission: string | null;
  analysisSummary: ParsedRuleSummary[];
  previousComparison: string | null;
};

const ISSUE_HEADER_RE = /^([A-Za-z][\w]+) \((\d+) issue\(s\)\):$/;
const ISSUE_LINE_RE = /^Line (\d+):\s*(.+)$/;
const SUMMARY_LINE_RE = /^([A-Za-z][\w]+):\s*(\d+) issue\(s\)$/;
const FOUND_ISSUES_RE = /^.+Found (\d+) issue\(s\) in (\d+) file\(s\):$/;
const FILE_HEADER_RE = /^.+\s(.+?) \((\d+) issue\(s\)\)$/;
const TRACKED_FILE_RE = /^.+Tracking carbon emissions for:\s*(.+)$/;
const ITERATION_RE = /^Running (\d+) iterations/;
const CURRENT_RUN_RE = /^Current Run \((.+)\):$/;
const LABEL_VALUE_RE = /^([^:]+):\s*(.+)$/;

export function parseTerminalReport(stdout: string): ParsedTerminalReport | null {
  if (!stdout.trim()) {
    return null;
  }

  const lines = stdout.split(/\r?\n/);
  const foundIssuesIndex = lines.findIndex((line) => FOUND_ISSUES_RE.test(line.trim()));
  const summaryIndex = lines.findIndex((line) => line.includes('Summary by Rule:'));
  const programOutputIndex = lines.findIndex((line) => line.includes('Program output (from last run):'));
  const executionIndex = lines.findIndex((line) => line.includes('Execution Details:'));
  const energyIndex = lines.findIndex((line) => line.includes('Energy & Emissions:'));
  const metricsIndex = lines.findIndex((line) => line.includes('Code Metrics:'));
  const analysisIndex = lines.findIndex((line) => line.includes('Code Smell & Carbon Emission Analysis'));

  const foundIssuesMatch = foundIssuesIndex >= 0 ? lines[foundIssuesIndex].trim().match(FOUND_ISSUES_RE) : null;
  const issueGroups = parseIssueGroups(lines, summaryIndex);
  const summaryByRule = parseSummaryByRule(lines, summaryIndex);
  const trackedFile = parseTrackedFile(lines);
  const iterationCount = parseIterationCount(lines);
  const programOutputLines = parseProgramOutput(lines, programOutputIndex);
  const executionDetails = parseLabelValueSection(lines, executionIndex);
  const energyAndEmissions = parseLabelValueSection(lines, energyIndex);
  const codeMetrics = parseLabelValueSection(lines, metricsIndex);
  const analysisDetails = parseAnalysisSection(lines, analysisIndex);

  return {
    totalIssues: foundIssuesMatch ? Number(foundIssuesMatch[1]) : null,
    analyzedFileCount: foundIssuesMatch ? Number(foundIssuesMatch[2]) : null,
    analyzedTarget: parseAnalyzedTarget(lines),
    trackedFile,
    iterationCount,
    issueGroups,
    summaryByRule,
    programOutputLines,
    executionDetails,
    energyAndEmissions,
    codeMetrics,
    currentRunLabel: analysisDetails.currentRunLabel,
    currentRunCarbonEmission: analysisDetails.currentRunCarbonEmission,
    analysisSummary: analysisDetails.analysisSummary,
    previousComparison: analysisDetails.previousComparison,
  };
}

function parseIssueGroups(lines: string[], summaryIndex: number): ParsedRuleGroup[] {
  const fileHeaderIndex = lines.findIndex((line) => line.trimStart().startsWith('📄 '));
  if (fileHeaderIndex < 0) {
    return [];
  }

  const groups: ParsedRuleGroup[] = [];
  let currentGroup: ParsedRuleGroup | null = null;
  const stopIndex = summaryIndex >= 0 ? summaryIndex : lines.length;

  for (let index = fileHeaderIndex + 1; index < stopIndex; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('===')) {
      continue;
    }

    const groupMatch = trimmed.match(ISSUE_HEADER_RE);
    if (groupMatch) {
      if (currentGroup) {
        groups.push(currentGroup);
      }

      currentGroup = {
        rule: groupMatch[1],
        count: Number(groupMatch[2]),
        issues: [],
      };
      continue;
    }

    const issueMatch = trimmed.match(ISSUE_LINE_RE);
    if (issueMatch && currentGroup) {
      currentGroup.issues.push({
        lineNumber: Number(issueMatch[1]),
        message: issueMatch[2],
      });
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

function parseSummaryByRule(lines: string[], summaryIndex: number): ParsedRuleSummary[] {
  if (summaryIndex < 0) {
    return [];
  }

  const summary: ParsedRuleSummary[] = [];

  for (let index = summaryIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('---')) {
      continue;
    }

    if (trimmed.startsWith('===') || trimmed.startsWith('🌱')) {
      break;
    }

    const match = trimmed.match(SUMMARY_LINE_RE);
    if (match) {
      summary.push({
        rule: match[1],
        count: Number(match[2]),
      });
    }
  }

  return summary;
}

function parseAnalyzedTarget(lines: string[]): string | null {
  const fileHeaderLine = lines.find((line) => line.trimStart().startsWith('📄 '));
  if (!fileHeaderLine) {
    return null;
  }

  const match = fileHeaderLine.trim().match(FILE_HEADER_RE);
  return match ? match[1] : null;
}

function parseTrackedFile(lines: string[]): string | null {
  const line = lines.find((value) => value.includes('Tracking carbon emissions for:'));
  if (!line) {
    return null;
  }

  const match = line.trim().match(TRACKED_FILE_RE);
  return match ? match[1] : null;
}

function parseIterationCount(lines: string[]): number | null {
  const line = lines.find((value) => value.includes('Running') && value.includes('iterations'));
  if (!line) {
    return null;
  }

  const match = line.trim().match(ITERATION_RE);
  return match ? Number(match[1]) : null;
}

function parseProgramOutput(lines: string[], programOutputIndex: number): string[] {
  if (programOutputIndex < 0) {
    return [];
  }

  const output: string[] = [];

  for (let index = programOutputIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('===') || trimmed === '🌍 GREEN CODE CARBON EMISSIONS REPORT 🌍') {
      break;
    }

    if (!trimmed) {
      continue;
    }

    output.push(rawLine);
  }

  return output;
}

function parseLabelValueSection(lines: string[], headerIndex: number): Record<string, string> {
  if (headerIndex < 0) {
    return {};
  }

  const section: Record<string, string> = {};

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }

    if (isSectionBoundary(trimmed)) {
      break;
    }

    const match = trimmed.match(LABEL_VALUE_RE);
    if (match) {
      section[match[1]] = match[2];
    }
  }

  return section;
}

function parseAnalysisSection(
  lines: string[],
  analysisIndex: number
): Pick<ParsedTerminalReport, 'currentRunLabel' | 'currentRunCarbonEmission' | 'analysisSummary' | 'previousComparison'> {
  if (analysisIndex < 0) {
    return {
      currentRunLabel: null,
      currentRunCarbonEmission: null,
      analysisSummary: [],
      previousComparison: null,
    };
  }

  let currentRunLabel: string | null = null;
  let currentRunCarbonEmission: string | null = null;
  let previousComparison: string | null = null;
  const analysisSummary: ParsedRuleSummary[] = [];
  let inSmellSummary = false;

  for (let index = analysisIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('===') || trimmed === 'Analysis complete.') {
      break;
    }

    const currentRunMatch = trimmed.match(CURRENT_RUN_RE);
    if (currentRunMatch) {
      currentRunLabel = currentRunMatch[1];
      continue;
    }

    if (trimmed === 'Code Smells Detected:') {
      inSmellSummary = true;
      continue;
    }

    if (trimmed.startsWith('Carbon Emission:')) {
      currentRunCarbonEmission = trimmed.replace('Carbon Emission:', '').trim();
      continue;
    }

    if (trimmed.startsWith('ℹ')) {
      previousComparison = trimmed;
      continue;
    }

    if (!inSmellSummary) {
      continue;
    }

    const match = trimmed.match(SUMMARY_LINE_RE);
    if (match) {
      analysisSummary.push({
        rule: match[1],
        count: Number(match[2]),
      });
    }
  }

  return {
    currentRunLabel,
    currentRunCarbonEmission,
    analysisSummary,
    previousComparison,
  };
}

function isSectionBoundary(trimmed: string): boolean {
  return (
    trimmed.includes('Execution Details:') ||
    trimmed.includes('Energy & Emissions:') ||
    trimmed.includes('Code Metrics:') ||
    trimmed.includes('Code Smell & Carbon Emission Analysis') ||
    trimmed.startsWith('===') ||
    trimmed.startsWith('✨')
  );
}
