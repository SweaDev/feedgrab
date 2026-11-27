#!/usr/bin/env bash
# Idempotent development environment setup for feedgrab and Ghostify.
# The same file lives in both repos (scripts/setup-env.sh); keep the copies identical.
#
# Usage: scripts/setup-env.sh [options]
#   --name "Full Name"     git user.name (asked when unset and not given)
#   --email you@example    git user.email (asked when unset and not given)
#   --key new|skip|<path>  SSH signing key: create one, skip signing, or use an existing private key
#   --clone-sibling        clone the other repo next to this one if it is missing (asked otherwise)
#   --no-clone             never clone the sibling repo
#   --playwright           install Playwright browsers for feedgrab's e2e tests
#   --yes                  non-interactive: never prompt, use only the flags above
#   -h, --help             show this help
#
# Nothing personal is stored in this script: identity and keys are asked for or passed as flags.
set -euo pipefail

NAME="" EMAIL="" KEY="" CLONE="" PLAYWRIGHT=0 YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --clone-sibling) CLONE=yes; shift ;;
    --no-clone) CLONE=no; shift ;;
    --playwright) PLAYWRIGHT=1; shift ;;
    --yes) YES=1; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -t 0 ] || YES=1

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
ok() { printf '    %s\n' "$*"; }
ask() { # ask "Question" default -> echoes answer
  local reply
  if [ "$YES" = 1 ]; then echo "$2"; return; fi
  read -r -p "    $1 [$2]: " reply </dev/tty || true
  echo "${reply:-$2}"
}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT="$(dirname "$REPO_DIR")"
SELF="$(basename "$REPO_DIR")"
case "$SELF" in
  feedgrab) SIBLING=ghostify ;;
  ghostify) SIBLING=feedgrab ;;
  *) SIBLING="" ;;
esac

# 1. System packages
say "System packages"
need=()
for cmd in git curl unzip ssh-keygen; do command -v "$cmd" >/dev/null 2>&1 || need+=("$cmd"); done
if [ ${#need[@]} -eq 0 ]; then
  ok "git, curl, unzip and ssh-keygen are installed"
else
  pkgs=()
  for cmd in "${need[@]}"; do [ "$cmd" = ssh-keygen ] && pkgs+=(openssh-client) || pkgs+=("$cmd"); done
  SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO=sudo
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "${pkgs[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y "${pkgs[@]/openssh-client/openssh-clients}"
  elif command -v brew >/dev/null 2>&1; then
    brew install "${pkgs[@]/openssh-client/openssh}"
  else
    echo "Install these yourself, then rerun: ${pkgs[*]}" >&2; exit 1
  fi
  ok "installed ${pkgs[*]}"
fi

# 2. Bun
say "Bun"
export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
  ok "bun $(bun --version) is installed"
else
  curl -fsSL https://bun.sh/install | bash >/dev/null
  ok "installed bun $(bun --version) (add ~/.bun/bin to PATH)"
fi

# 3. Sibling repo
if [ -n "$SIBLING" ]; then
  say "Sibling repo ($SIBLING)"
  if [ -d "$PARENT/$SIBLING/.git" ]; then
    ok "found $PARENT/$SIBLING"
  else
    if [ -z "$CLONE" ]; then
      CLONE=$(ask "Clone SweaDev/$SIBLING into $PARENT? (yes/no)" no)
    fi
    if [ "$CLONE" = yes ]; then
      git clone "https://github.com/SweaDev/$SIBLING" "$PARENT/$SIBLING"
      ok "cloned $PARENT/$SIBLING"
    else
      ok "skipped: work that touches $SIBLING needs it at $PARENT/$SIBLING"
    fi
  fi
fi

# 4. Dependencies
say "Dependencies"
for dir in "$REPO_DIR" ${SIBLING:+"$PARENT/$SIBLING"}; do
  [ -f "$dir/package.json" ] || continue
  if ! (cd "$dir" && bun install --frozen-lockfile >/dev/null 2>&1); then
    (cd "$dir" && bun install >/dev/null)
  fi
  ok "bun install in $dir"
done
if [ "$PLAYWRIGHT" = 1 ]; then
  for dir in "$REPO_DIR" ${SIBLING:+"$PARENT/$SIBLING"}; do
    if [ "$(basename "$dir")" = feedgrab ] && [ -d "$dir/node_modules/@playwright/test" ]; then
      (cd "$dir" && bunx playwright install --with-deps chromium firefox)
      ok "Playwright browsers installed for $dir"
    fi
  done
fi

# 5. Git identity
say "Git identity"
cur_name=$(git config --global user.name || true)
cur_email=$(git config --global user.email || true)
[ -n "$NAME" ] || NAME=$(ask "git user.name" "$cur_name")
[ -n "$EMAIL" ] || EMAIL=$(ask "git user.email" "$cur_email")
if [ -z "$NAME" ] || [ -z "$EMAIL" ]; then
  echo "    git user.name and user.email are required (pass --name and --email)" >&2; exit 1
fi
[ "$NAME" = "$cur_name" ] || git config --global user.name "$NAME"
[ "$EMAIL" = "$cur_email" ] || git config --global user.email "$EMAIL"
ok "$NAME <$EMAIL>"

# 6. SSH signing key
say "Commit and tag signing"
cur_key=$(git config --global user.signingkey || true)
if [ -z "$KEY" ]; then
  if [ "$(git config --global gpg.format || true)" = ssh ] && [ -f "${cur_key%.pub}" ] && [ -z "$(git config --global gpg.ssh.program || true)" ]; then
    KEY="${cur_key%.pub}"
  else
    KEY=$(ask "SSH signing key: 'new', 'skip', or the path of an existing private key" new)
  fi
fi
if [ "$KEY" = skip ]; then
  ok "signing not configured"
else
  if [ "$KEY" = new ]; then
    KEY="$HOME/.ssh/id_ed25519_signing"
    if [ -f "$KEY" ]; then
      ok "reusing $KEY"
    else
      mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
      ssh-keygen -q -t ed25519 -N '' -C "$EMAIL (git signing)" -f "$KEY"
      ok "created $KEY"
    fi
  fi
  KEY="${KEY%.pub}"
  [ -f "$KEY" ] || { echo "    no private key at $KEY" >&2; exit 1; }
  [ -f "$KEY.pub" ] || ssh-keygen -y -f "$KEY" > "$KEY.pub"
  set_cfg() { [ "$(git config --global "$1" || true)" = "$2" ] || git config --global "$1" "$2"; }
  set_cfg gpg.format ssh
  set_cfg user.signingkey "$KEY.pub"
  set_cfg commit.gpgsign true
  set_cfg tag.gpgsign true
  git config --global --unset gpg.ssh.program >/dev/null 2>&1 || true
  signers="$HOME/.ssh/allowed_signers"
  line="$EMAIL $(cut -d' ' -f1,2 "$KEY.pub")"
  grep -qxF "$line" "$signers" 2>/dev/null || echo "$line" >> "$signers"
  set_cfg gpg.ssh.allowedSignersFile "$signers"
  ok "commits and tags are signed with $KEY.pub"
  echo
  echo "Add this public key on GitHub: Settings > SSH and GPG keys > New SSH key > Key type: Signing key"
  echo "(it marks commits Verified; pushing needs your normal GitHub access)"
  echo
  cat "$KEY.pub"
fi
echo
say "Done"
