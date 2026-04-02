import * as p from '@clack/prompts';
import pc from 'picocolors';
import { saveConfig, getConfigPath } from './config.js';
import { scanWorkspace, findVCSRoot } from './scanner.js';
import { findClaude, installAlias } from './install.js';

export async function runSetup({ firstRun = false } = {}) {
  console.clear();

  p.intro(pc.bgMagenta(pc.white(pc.bold(' ◆ claude-stealth '))));

  if (firstRun) {
    p.note(
      'Stealth mode keeps confidential terms and\n' +
        'AI attribution markers out of your commits,\n' +
        'PR descriptions, and code comments.',
      'Welcome',
    );
  }

  const claude = findClaude();
  if (!claude) {
    p.log.warn('Claude Code CLI not found.');
    p.log.info('Install it first: npm i -g @anthropic-ai/claude-code');
    p.outro('Then re-run: claude-stealth --setup');
    return;
  }
  p.log.success(`Claude Code found at ${pc.dim(claude)}`);

  const mode = await p.select({
    message: 'How would you like to configure?',
    options: [
      {
        value: 'scan',
        label: 'Auto-scan workspace',
        hint: 'detect sensitive terms from your repos',
      },
      {
        value: 'manual',
        label: 'Manual setup',
        hint: 'type terms yourself',
      },
      {
        value: 'skip',
        label: 'Skip for now',
        hint: 'default settings, configure later with --setup',
      },
    ],
  });
  if (p.isCancel(mode)) return void p.cancel('Cancelled.');

  let terms = [];

  if (mode === 'scan') {
    terms = await runScan();
    if (terms === null) return;
  } else if (mode === 'manual') {
    const input = await p.text({
      message: 'Terms to protect (comma-separated)',
      placeholder: 'project-phoenix, acme-corp, internal.myco.io',
      validate: (v) => (!v?.trim() ? 'Enter at least one term' : undefined),
    });
    if (p.isCancel(input)) return void p.cancel('Cancelled.');
    terms = input.split(',').map((t) => t.trim()).filter(Boolean);
  }

  const patterns = await p.text({
    message: 'Version patterns to suppress (comma-separated, optional)',
    placeholder: 'v*-internal, alpha-*, or leave empty',
    defaultValue: '',
  });
  if (p.isCancel(patterns)) return void p.cancel('Cancelled.');

  const notes = await collectNotes();
  if (notes === null) return;

  const skipPerms = await p.confirm({
    message: 'Auto-approve Claude Code permission prompts?',
    initialValue: true,
  });
  if (p.isCancel(skipPerms)) return void p.cancel('Cancelled.');

  const config = {
    terms: [...new Set(terms)],
    versionPatterns: patterns?.trim()
      ? patterns.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    notes,
    skipPermissions: skipPerms,
  };
  saveConfig(config);

  if (firstRun) {
    const alias = await p.confirm({
      message: `Alias ${pc.cyan('claude')} → ${pc.cyan('claude-stealth')} in your shell?`,
      initialValue: true,
    });
    if (!p.isCancel(alias) && alias) {
      const didInstall = installAlias();
      if (didInstall)
        p.log.success('Shell alias installed. Reload your shell to activate.');
      else p.log.info('Alias already configured.');
    }
  }

  p.note(
    [
      `${pc.bold('Terms:')}        ${config.terms.length ? config.terms.join(', ') : pc.dim('none')}`,
      `${pc.bold('Patterns:')}     ${config.versionPatterns.length ? config.versionPatterns.join(', ') : pc.dim('none')}`,
      `${pc.bold('Notes:')}        ${config.notes.length ? config.notes.length + ' instruction' + (config.notes.length === 1 ? '' : 's') : pc.dim('none')}`,
      `${pc.bold('Auto-approve:')} ${config.skipPermissions ? 'yes' : 'no'}`,
      `${pc.bold('Config:')}       ${pc.dim(getConfigPath())}`,
    ].join('\n'),
    'Saved',
  );

  p.outro(`Ready. Just type ${pc.cyan('claude')} to start working.`);
}

async function runScan() {
  const cwd = process.cwd();
  const vcsRoot = findVCSRoot(cwd);

  let scanPath = cwd;
  if (vcsRoot) {
    const where = await p.select({
      message: 'Where should I scan?',
      options: [
        { value: vcsRoot, label: 'Entire workspace', hint: vcsRoot },
        { value: cwd, label: 'Current directory only', hint: cwd },
      ],
    });
    if (p.isCancel(where)) {
      p.cancel('Cancelled.');
      return null;
    }
    scanPath = where;
  }

  const s = p.spinner();
  s.start('Scanning workspace…');
  const found = scanWorkspace(scanPath);
  s.stop(
    found.length
      ? `Found ${found.length} potential term${found.length === 1 ? '' : 's'}`
      : 'No terms detected',
  );

  let terms = [];

  if (found.length) {
    const selected = await p.multiselect({
      message: 'Select terms to protect',
      options: found.map((f) => ({
        value: f.term,
        label: f.term,
        hint: f.hint,
      })),
      initialValues: found.map((f) => f.term),
      required: false,
    });
    if (p.isCancel(selected)) {
      p.cancel('Cancelled.');
      return null;
    }
    terms = selected;
  }

  const extra = await p.text({
    message: 'Additional terms (comma-separated, or press enter to skip)',
    placeholder: 'project-phoenix, secret-api',
    defaultValue: '',
  });
  if (p.isCancel(extra)) {
    p.cancel('Cancelled.');
    return null;
  }
  if (extra?.trim())
    terms.push(...extra.split(',').map((t) => t.trim()).filter(Boolean));

  return terms;
}

async function collectNotes() {
  const notes = [];

  const wantsNotes = await p.confirm({
    message: 'Add custom instructions for Claude?',
    initialValue: false,
  });
  if (p.isCancel(wantsNotes)) {
    p.cancel('Cancelled.');
    return null;
  }
  if (!wantsNotes) return notes;

  while (true) {
    const note = await p.text({
      message: notes.length
        ? 'Another instruction (or press enter to finish)'
        : 'Instruction for Claude',
      placeholder: "e.g. Don't reference anything related to bananas",
      defaultValue: '',
    });
    if (p.isCancel(note)) {
      p.cancel('Cancelled.');
      return null;
    }
    if (!note?.trim()) break;
    notes.push(note.trim());
    p.log.success(`Added: ${pc.dim(note.trim())}`);
  }

  return notes;
}
