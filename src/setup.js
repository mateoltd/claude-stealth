import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { findClaude, installAlias } from './install.js';

export async function runSetup({ firstRun = false } = {}) {
  console.clear();

  p.intro(pc.bgMagenta(pc.white(pc.bold(' \u25c6 claude-stealth '))));

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
        hint: 'Claude analyzes your repos to detect sensitive terms',
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
  let versionPatterns = [];

  if (mode === 'scan') {
    const result = await runClaudeScan(claude);
    if (result === null) return;
    terms = result.terms;
    versionPatterns = result.versionPatterns;
  } else if (mode === 'manual') {
    const input = await p.text({
      message: 'Terms to protect (comma-separated)',
      placeholder: 'project-phoenix, acme-corp, internal.myco.io',
      validate: (v) => (!v?.trim() ? 'Enter at least one term' : undefined),
    });
    if (p.isCancel(input)) return void p.cancel('Cancelled.');
    terms = input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Version patterns (skip if auto-scan already found some)
  if (!versionPatterns.length) {
    const patterns = await p.text({
      message: 'Version patterns to suppress (comma-separated, optional)',
      placeholder: 'v*-internal, alpha-*',
      defaultValue: '',
    });
    if (p.isCancel(patterns)) return void p.cancel('Cancelled.');
    if (patterns?.trim()) {
      versionPatterns = patterns
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  const notes = await collectNotes();
  if (notes === null) return;

  const skipPerms = await p.confirm({
    message: 'Auto-approve Claude Code permission prompts?',
    initialValue: true,
  });
  if (p.isCancel(skipPerms)) return void p.cancel('Cancelled.');

  const config = {
    terms: [...new Set(terms)],
    versionPatterns,
    notes,
    skipPermissions: skipPerms,
  };
  saveConfig(config);

  if (firstRun) {
    const alias = await p.confirm({
      message: `Alias ${pc.cyan('claude')} \u2192 ${pc.cyan('claude-stealth')} in your shell?`,
      initialValue: true,
    });
    if (!p.isCancel(alias) && alias) {
      const didInstall = installAlias();
      if (didInstall)
        p.log.success('Shell alias installed. Reload your shell to activate.');
      else p.log.info('Alias already configured.');
    }
  }

  showConfigSummary(config);
  p.outro(`Ready. Just type ${pc.cyan('claude')} to start working.`);
}

export async function runConfigWizard() {
  const config = loadConfig();

  p.intro(pc.bgCyan(pc.white(pc.bold(' \u25c6 claude-stealth config '))));

  showConfigSummary(config);

  const field = await p.select({
    message: 'What would you like to change?',
    options: [
      {
        value: 'terms',
        label: 'Protected terms',
        hint: `${config.terms.length} term${config.terms.length === 1 ? '' : 's'}`,
      },
      {
        value: 'versionPatterns',
        label: 'Version patterns',
        hint: config.versionPatterns.length
          ? config.versionPatterns.join(', ')
          : 'none',
      },
      {
        value: 'notes',
        label: 'Custom instructions',
        hint: `${config.notes.length} note${config.notes.length === 1 ? '' : 's'}`,
      },
      {
        value: 'skipPermissions',
        label: 'Auto-approve permissions',
        hint: config.skipPermissions ? 'enabled' : 'disabled',
      },
      { value: 'done', label: 'Done' },
    ],
  });
  if (p.isCancel(field) || field === 'done') {
    p.outro('No changes made.');
    return;
  }

  if (field === 'terms') {
    await editTerms(config);
  } else if (field === 'versionPatterns') {
    await editPatterns(config);
  } else if (field === 'notes') {
    await editNotes(config);
  } else if (field === 'skipPermissions') {
    const val = await p.confirm({
      message: 'Auto-approve Claude Code permission prompts?',
      initialValue: config.skipPermissions,
    });
    if (!p.isCancel(val)) {
      config.skipPermissions = val;
      saveConfig(config);
      p.log.success(
        `Auto-approve ${val ? 'enabled' : 'disabled'}.`,
      );
    }
  }

  showConfigSummary(config);
  p.outro(`Config saved to ${pc.dim(getConfigPath())}`);
}

// --- Auto-scan using Claude Code ---

async function runClaudeScan(claudePath) {
  const { claudeScan } = await import('./autoscan.js');

  const s = p.spinner();

  try {
    const config = await claudeScan(claudePath, (status) => {
      switch (status) {
        case 'start-scan':
          s.start('Scanning workspace');
          break;
        case 'scan-done':
          s.stop('Workspace scanned');
          break;
        case 'start-apply':
          s.start('Processing findings');
          break;
        case 'apply-done':
          s.stop('Configuration ready');
          break;
      }
    });

    if (!config.terms.length) {
      p.log.info('No sensitive terms detected.');
    } else {
      p.log.success(
        `Found ${config.terms.length} term${config.terms.length === 1 ? '' : 's'}: ${pc.dim(config.terms.join(', '))}`,
      );
    }

    // Let user review found terms
    let terms = config.terms;
    if (terms.length) {
      const selected = await p.multiselect({
        message: 'Select terms to protect',
        options: terms.map((t) => ({ value: t, label: t })),
        initialValues: terms,
        required: false,
      });
      if (p.isCancel(selected)) {
        p.cancel('Cancelled.');
        return null;
      }
      terms = selected;
    }

    // Extra terms
    const extra = await p.text({
      message: 'Additional terms (comma-separated, or enter to skip)',
      placeholder: 'extra-term, another-one',
      defaultValue: '',
    });
    if (p.isCancel(extra)) {
      p.cancel('Cancelled.');
      return null;
    }
    if (extra?.trim()) {
      terms.push(
        ...extra
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      );
    }

    return { terms, versionPatterns: config.versionPatterns };
  } catch (err) {
    s.stop('Scan failed');
    p.log.warn(`Auto-scan error: ${err.message}`);
    p.log.info('Falling back to manual setup.');

    const input = await p.text({
      message: 'Terms to protect (comma-separated)',
      placeholder: 'project-phoenix, acme-corp, internal.myco.io',
      validate: (v) => (!v?.trim() ? 'Enter at least one term' : undefined),
    });
    if (p.isCancel(input)) {
      p.cancel('Cancelled.');
      return null;
    }
    return {
      terms: input
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      versionPatterns: [],
    };
  }
}

// --- Config editing helpers ---

async function editTerms(config) {
  if (config.terms.length) {
    const keep = await p.multiselect({
      message: 'Current terms (deselect to remove)',
      options: config.terms.map((t) => ({ value: t, label: t })),
      initialValues: config.terms,
      required: false,
    });
    if (p.isCancel(keep)) return;
    config.terms = keep;
  }

  const extra = await p.text({
    message: 'Add terms (comma-separated, or enter to skip)',
    placeholder: 'new-term, another',
    defaultValue: '',
  });
  if (p.isCancel(extra)) return;
  if (extra?.trim()) {
    config.terms.push(
      ...extra
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }

  config.terms = [...new Set(config.terms)];
  saveConfig(config);
  p.log.success(`${config.terms.length} term${config.terms.length === 1 ? '' : 's'} saved.`);
}

async function editPatterns(config) {
  const input = await p.text({
    message: 'Version patterns to suppress (comma-separated)',
    placeholder: 'v*-internal, alpha-*',
    defaultValue: config.versionPatterns.join(', '),
  });
  if (p.isCancel(input)) return;
  config.versionPatterns = input?.trim()
    ? input
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  saveConfig(config);
  p.log.success('Version patterns updated.');
}

async function editNotes(config) {
  const action = await p.select({
    message: 'Custom instructions',
    options: [
      { value: 'add', label: 'Add new instruction' },
      ...(config.notes.length
        ? [{ value: 'remove', label: 'Remove instructions' }]
        : []),
      { value: 'clear', label: 'Clear all', hint: `${config.notes.length} instructions` },
      { value: 'back', label: 'Back' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'add') {
    const notes = await collectNotes();
    if (notes?.length) {
      config.notes.push(...notes);
      saveConfig(config);
      p.log.success(`Added ${notes.length} instruction${notes.length === 1 ? '' : 's'}.`);
    }
  } else if (action === 'remove' && config.notes.length) {
    const keep = await p.multiselect({
      message: 'Deselect instructions to remove',
      options: config.notes.map((n, i) => ({
        value: n,
        label: n.length > 60 ? n.slice(0, 57) + '...' : n,
        hint: `#${i + 1}`,
      })),
      initialValues: config.notes,
      required: false,
    });
    if (!p.isCancel(keep)) {
      config.notes = keep;
      saveConfig(config);
      p.log.success('Instructions updated.');
    }
  } else if (action === 'clear') {
    config.notes = [];
    saveConfig(config);
    p.log.success('All instructions cleared.');
  }
}

// --- Shared helpers ---

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

function showConfigSummary(config) {
  p.note(
    [
      `${pc.bold('Terms:')}        ${config.terms.length ? config.terms.join(', ') : pc.dim('none')}`,
      `${pc.bold('Patterns:')}     ${config.versionPatterns.length ? config.versionPatterns.join(', ') : pc.dim('none')}`,
      `${pc.bold('Notes:')}        ${config.notes.length ? config.notes.length + ' instruction' + (config.notes.length === 1 ? '' : 's') : pc.dim('none')}`,
      `${pc.bold('Auto-approve:')} ${config.skipPermissions ? 'yes' : 'no'}`,
      `${pc.bold('Config:')}       ${pc.dim(getConfigPath())}`,
    ].join('\n'),
    'Configuration',
  );
}
