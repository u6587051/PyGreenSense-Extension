export type ParsedSeverity = 'good' | 'medium' | 'low' | 'neutral' | 'danger';

export type ParsedIssue = {
  filePath: string | null;
  line: number | null;
  message: string;
};

export type ParsedIssueGroup = {
  rule: string;
  count: number;
  severity: ParsedSeverity;
  issues: ParsedIssue[];
};

export type ParsedReport = {
  analyzedFileCount: number | null;
  issueCount: number | null;
  issueFileCount: number | null;
  targetFile: string | null;
  iterations: number | null;
  durationSeconds: number | null;
  energyKWh: number | null;
  emissionKg: number | null;
  emissionsRate: number | null;
  region: string | null;
  country: string | null;
  cfp: number | null;
  loc: number | null;
  currentRunStatus: string | null;
  programOutput: string[];
  issueGroups: ParsedIssueGroup[];
  rawText: string;
};

export function parsePyGreenSenseReport(text: string): ParsedReport {
  const rawText = text.trim();
  const groupMap = new Map<string, ParsedIssueGroup>();
  const groupOrder: string[] = [];
  let currentFile: string | null = null;
  let currentRule: string | null = null;

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const fileMatch = trimmed.match(/^📄\s+(.+?)\s+\((\d+)\s+issue\(s\)\)$/u);
    if (fileMatch) {
      currentFile = fileMatch[1];
      currentRule = null;
      continue;
    }

    const ruleMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_]+)\s+\((\d+)\s+issue\(s\)\):$/);
    if (ruleMatch) {
      currentRule = ruleMatch[1];
      ensureGroup(groupMap, groupOrder, currentRule, Number(ruleMatch[2]));
      continue;
    }

    const issueMatch = trimmed.match(/^Line\s+(\d+):\s+(.+)$/);
    if (issueMatch && currentRule) {
      const group = ensureGroup(groupMap, groupOrder, currentRule, 0);
      group.issues.push({
        filePath: currentFile,
        line: Number(issueMatch[1]),
        message: issueMatch[2],
      });
    }
  }

  const summaryMatches = rawText.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]+):\s+(\d+)\s+issue\(s\)/gm);
  for (const match of summaryMatches) {
    const rule = match[1];
    const count = Number(match[2]);
    ensureGroup(groupMap, groupOrder, rule, count);
  }

  const issueGroups = groupOrder
    .map((rule) => {
      const group = groupMap.get(rule);
      if (!group) {
        return null;
      }

      const count = Math.max(group.count, group.issues.length);
      return {
        ...group,
        count,
        severity: getRuleSeverity(rule, count),
      };
    })
    .filter((group): group is ParsedIssueGroup => Boolean(group));

  return {
    analyzedFileCount: extractInteger(rawText, /Analyzing\s+(\d+)\s+Python file\(s\)/u),
    issueCount: extractInteger(rawText, /Found\s+(\d+)\s+issue\(s\)\s+in/u),
    issueFileCount: extractInteger(rawText, /Found\s+\d+\s+issue\(s\)\s+in\s+(\d+)\s+file\(s\)/u),
    targetFile: extractText(rawText, /Target file:\s+(.+)/u) ?? extractText(rawText, /Tracking carbon emissions for:\s+(.+)/u),
    iterations: extractInteger(rawText, /Running\s+(\d+)\s+iterations/u),
    durationSeconds: extractNumber(rawText, /Duration:\s+([0-9.eE+-]+)\s+seconds/u),
    energyKWh: extractNumber(rawText, /Total energy consumed:\s+([0-9.eE+-]+)\s+kWh/u),
    emissionKg: extractNumber(rawText, /Carbon emissions:\s+([0-9.eE+-]+)\s+kg CO2/u),
    emissionsRate: extractNumber(rawText, /Emissions rate:\s+([0-9.eE+-]+)\s+gCO2eq\/kWh/u),
    region: extractText(rawText, /Region:\s+(.+)/u),
    country: extractText(rawText, /Country:\s+(.+)/u),
    cfp: extractNumber(rawText, /COSMIC Function Points:\s+([0-9.eE+-]+)\s+CFP/u),
    loc: extractNumber(rawText, /Total lines of code:\s+([0-9.eE+-]+)\s+LOC/u),
    currentRunStatus: extractText(rawText, /Current Run\s+\(([^)]+)\):/u),
    programOutput: extractProgramOutput(rawText),
    issueGroups,
    rawText,
  };
}

function ensureGroup(
  groupMap: Map<string, ParsedIssueGroup>,
  groupOrder: string[],
  rule: string,
  count: number
): ParsedIssueGroup {
  let existing = groupMap.get(rule);
  if (!existing) {
    existing = {
      rule,
      count,
      severity: getRuleSeverity(rule, count),
      issues: [],
    };
    groupMap.set(rule, existing);
    groupOrder.push(rule);
    return existing;
  }

  existing.count = Math.max(existing.count, count);
  existing.severity = getRuleSeverity(rule, existing.count);
  return existing;
}

function extractProgramOutput(text: string): string[] {
  const match = text.match(/Program output \(from last run\):\s*([\s\S]*?)\n={20,}/u);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function extractInteger(text: string, regex: RegExp): number | null {
  const value = extractNumber(text, regex);
  return value === null ? null : Math.trunc(value);
}

function extractNumber(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractText(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

function getRuleSeverity(rule: string, count: number): ParsedSeverity {
  const normalized = rule.replace(/[\s_-]+/g, '').toLowerCase();

  if (normalized.includes('godclass') || normalized.includes('deadcode') || normalized.includes('leak')) {
    return 'danger';
  }

  if (normalized.includes('duplicated') || normalized.includes('longmethod') || normalized.includes('complex')) {
    return 'medium';
  }

  if (normalized.includes('mutabledefault') || normalized.includes('naming') || normalized.includes('style')) {
    return 'low';
  }

  if (count === 0) {
    return 'good';
  }

  if (count >= 4) {
    return 'danger';
  }

  if (count >= 2) {
    return 'medium';
  }

  return 'neutral';
}
