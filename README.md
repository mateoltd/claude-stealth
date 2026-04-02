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
curl -fsSL https://raw.githubusercontent.com/mateoltd/claude-stealth/main/claude-stealth -o claude-stealth && sh claude-stealth
```

That is it. On first run, `claude-stealth` detects that no config exists and walks you through everything:

1. Installs itself to `~/.local/bin`
2. Aliases `claude` to `claude-stealth` in your shell rc
3. Launches Claude Code to interactively ask what you need to keep confidential
4. Writes the config and you are ready to go

Reload your shell after setup:

```sh
source ~/.bashrc  # or ~/.zshrc
```

## Usage

After setup, just use `claude` as you normally would. Undercover mode is always active.

```sh
claude                          # interactive session
claude -p "fix the auth bug"    # one-shot prompt
claude --resume                 # resume previous session
```

All flags pass through to Claude Code.

## Configuration

The config lives at `~/.config/claude-stealth/config`. You can edit it directly or re-run the setup wizard:

```sh
claude-stealth --setup
```

Available settings:

```sh
# Terms that should NEVER appear in commits, PRs, or comments (comma-separated)
STEALTH_NEVER_MENTION="ProjectPhoenix,internal-api,codename-x,acme-corp"

# Version string patterns to suppress (comma-separated, optional)
STEALTH_VERSION_PATTERNS="v[0-9]+-internal,alpha-[0-9]+"

# Auto-skip permission prompts (default: true)
STEALTH_SKIP_PERMISSIONS="true"
```

## Commands

| Flag | Description |
|------|-------------|
| *(none, first run)* | Full onboarding: install + interactive config |
| `--setup`, `-s` | Re-run the configuration wizard |
| `--install`, `-i` | Install only (skip interactive setup) |
| `--update`, `-u` | Update script in place, preserving config |
| `--uninstall` | Remove binary, config, and shell aliases completely |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

## How it works

`claude-stealth` creates a temporary file containing a system prompt override and passes it to Claude Code via `--append-system-prompt-file`. The override instructs the model to never include configured confidential terms or AI attribution in any externally visible output. The temp file is cleaned up on exit.

The interactive setup wizard works by launching Claude Code itself in a one-shot prompt to have a natural conversation about what you need to keep confidential, then writing the config file directly.

## Requirements

- [Claude Code](https://claude.ai/code) installed and authenticated
- Any POSIX-compatible shell (bash, zsh, dash, ksh)

## License

MIT
