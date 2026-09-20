// The rules files the agent-rules package writes, one per tool, with the published copy on
// this site and the one-line install. Content comes from packages/agent-rules/generated-samples
// through the sample pipeline; nothing here is retyped.
export interface RulesFile {
  tool: string;
  file: string;
  sampleId: string;
  url: string;
  install: string;
  note: string;
}

export const rulesFiles: RulesFile[] = [
  {
    tool: 'Claude Code',
    file: 'CLAUDE.md',
    sampleId: 'rules-claude',
    url: '/agent-rules/CLAUDE.md',
    install: 'npx redbelly-agent-rules --only claude --out .',
    note: 'Read at the start of every session from the project root. Add your own rules under .claude/rules/ rather than editing the generated file.',
  },
  {
    tool: 'Codex CLI',
    file: 'AGENTS.md',
    sampleId: 'rules-agents',
    url: '/agent-rules/AGENTS.md',
    install: 'npx redbelly-agent-rules --only agents --out .',
    note: 'Walked from the git root to the working directory, 32 KiB combined budget. Copilot and Cursor read it too.',
  },
  {
    tool: 'Cursor',
    file: '.cursor/rules/redbelly.mdc',
    sampleId: 'rules-cursor',
    url: '/agent-rules/cursor-rules-redbelly.mdc',
    install: 'npx redbelly-agent-rules --only cursor --out .',
    note: 'A Project Rule with alwaysApply: true, so it applies to every conversation.',
  },
  {
    tool: 'GitHub Copilot',
    file: '.github/copilot-instructions.md',
    sampleId: 'rules-copilot',
    url: '/agent-rules/copilot-instructions.md',
    install: 'npx redbelly-agent-rules --only copilot --out .',
    note: 'Repository custom instructions, plain markdown, no front matter.',
  },
  {
    tool: 'Gemini CLI',
    file: 'GEMINI.md',
    sampleId: 'rules-gemini',
    url: '/agent-rules/GEMINI.md',
    install: 'npx redbelly-agent-rules --only gemini --out .',
    note: 'Loaded from the workspace and its parents; @file.md imports work.',
  },
];
