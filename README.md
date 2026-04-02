# claude-stealth

Undercover-mode wrapper for [Claude Code](https://claude.ai/code). Prevents confidential information from leaking into commits, PRs, and code comments.

## Background

Claude Code has an internal feature called **undercover mode**, found in the [source code that was exposed via sourcemaps](https://github.com/anthropics/claude-code) on March 31, 2026. Anthropic uses it internally to prevent their engineers from accidentally leaking internal model codenames, project names, and other sensitive details when contributing to public repositories with Claude Code.

`claude-stealth` brings that same concept to everyone. It injects a system prompt override that acts as a firewall between your internal knowledge and your public-facing git history.

## What it does

The primary use case is **protecting confidential information** when working on projects where internal details must not leak. You configure the terms, codenames, version strings, and other sensitive information that should never appear in any externally visible output. Claude Code will then actively avoid referencing any of it in commit messages, PR descriptions, and code comments.

As a side effect of how undercover mode works, it also suppresses AI attribution markers (like `Co-Authored-By` lines) from commits, matching the behavior of Anthropic's own internal implementation.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/mateoltd/claude-stealth/main/install.sh | sh
```

That's it. The script installs dependencies, then launches the setup wizard automatically. It detects your workspace, finds sensitive terms, and writes the config.

### Upgrading from v2

Re-run the install script. Your existing config at `~/.config/claude-stealth/config` is automatically migrated to JSON format on first run.

## Usage

After setup, just use `claude` as you normally would. Undercover mode is always active.

```sh
claude                          # interactive session
claude -p "fix the auth bug"    # one-shot prompt
claude --resume                 # resume previous session
```

All flags pass through to Claude Code.

## Setup wizard

The setup wizard runs on first use or anytime with `--setup`. It offers three modes:

- **Auto-scan workspace**: scans your repos for git orgs, private npm scopes, internal domains, and author email domains. Presents findings as a checklist you can toggle.
- **Manual setup**: type your terms directly.
- **Skip**: use defaults now, configure later.

```sh
claude-stealth --setup
```

## Configuration

Config lives at `~/.config/claude-stealth/config.json`:

```json
{
  "terms": ["project-phoenix", "acme-corp", "internal.myco.io"],
  "versionPatterns": ["v*-internal", "alpha-*"],
  "skipPermissions": true
}
```

| Field | Description |
|-------|-------------|
| `terms` | Strings that must never appear in commits, PRs, or comments |
| `versionPatterns` | Version string patterns to suppress |
| `skipPermissions` | Pass `--dangerously-skip-permissions` to Claude Code |

## Commands

| Flag | Description |
|------|-------------|
| *(first run)* | Setup wizard launches automatically |
| `--setup`, `-s` | Re-run the setup wizard |
| `--uninstall` | Remove config and shell aliases |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

## How it works

`claude-stealth` creates a temporary file containing a system prompt override and passes it to Claude Code via `--append-system-prompt-file`. The override instructs the model to never include configured confidential terms or AI attribution in any externally visible output. The temp file is cleaned up on exit.

## Requirements

- [Claude Code](https://claude.ai/code) installed and authenticated
- Node.js 18+

## License

MIT
