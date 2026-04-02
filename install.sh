#!/bin/sh
set -e

REPO="https://github.com/mateoltd/claude-stealth.git"
INSTALL_DIR="${HOME}/.local/share/claude-stealth"
BIN_DIR="${HOME}/.local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js >= 18 is required. Install from https://nodejs.org"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required."
  exit 1
fi

echo "Installing claude-stealth..."

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  git -C "$INSTALL_DIR" pull --quiet 2>/dev/null || true
else
  git clone --quiet --depth 1 "$REPO" "$INSTALL_DIR"
fi

# Install dependencies
cd "$INSTALL_DIR"
npm install --production --silent 2>/dev/null

# Create wrapper script in PATH
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/claude-stealth" <<'WRAPPER'
#!/bin/sh
exec node "${HOME}/.local/share/claude-stealth/src/cli.js" "$@"
WRAPPER
chmod +x "$BIN_DIR/claude-stealth"

# Ensure ~/.local/bin is in PATH and alias claude
for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
  [ -f "$rc" ] || continue
  if ! grep -q 'claude-stealth' "$rc" 2>/dev/null; then
    printf '\n# claude-stealth\nexport PATH="$HOME/.local/bin:$PATH"\nalias claude='\''claude-stealth'\''\n' >> "$rc"
  fi
done

echo "Installed to $BIN_DIR/claude-stealth"
echo ""

# Run setup (reopen stdin from terminal so interactive TUI works after curl|sh)
exec "$BIN_DIR/claude-stealth" < /dev/tty
