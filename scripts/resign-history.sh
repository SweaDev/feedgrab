#!/usr/bin/env bash
# Re-signs every commit that isn't signed by your key, keeping trees, messages, authors, committers
# and their dates (GIT_AUTHOR_DATE, GIT_COMMITTER_DATE) exactly. Then moves `main` to the rewritten
# branch tip, moves every tag to its rewritten commit (annotated tags keep their message, tagger and
# date, and are signed), and creates the pending tags from scripts/release-tags.txt.
# The same file lives in feedgrab and Ghostify (scripts/resign-history.sh); keep the copies identical.
#
# Usage: scripts/resign-history.sh [options]
#   --report          list each commit's local signature status (and GitHub's, with gh), change nothing
#   --push            rewrite, verify, then push main, the branch and the tags (asks first)
#   --branch NAME     branch to rewrite and fast-forward main to (default: claude/exciting-davinci-lvhp5s)
#   --main NAME       main branch (default: main)
#   --remote NAME     remote (default: origin)
#   --fix-identity E  author/committer email to replace with your user.name/user.email (dates
#                     kept); repeatable, default noreply@anthropic.com (an agent's identity)
#   --yes             don't ask before pushing
#   -h, --help        show this help
# Without --report or --push it is a dry run: it rewrites into new objects, verifies them and prints
# the push plan; no ref, local or remote, changes.
#
# Only the newest pending tag runs a release workflow: GitHub creates no push events when more than
# three tags are pushed at once, so every other moved or created tag goes in one batch (refused if
# that batch would have 1-3 tags), and the newest pending tag is pushed alone afterwards.
set -euo pipefail
if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 4 ]; }; then
  echo "bash 4.4+ is needed (macOS: brew install bash, then run it with that bash)" >&2
  exit 1
fi

BRANCH=claude/exciting-davinci-lvhp5s MAIN=main REMOTE=origin MODE=dry YES=0
FIX_IDS=(noreply@anthropic.com)
while [ $# -gt 0 ]; do
  case "$1" in
    --report) MODE=report; shift ;;
    --push) MODE=push; shift ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --main) MAIN="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --fix-identity) FIX_IDS+=("$2"); shift 2 ;;
    --yes) YES=1; shift ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
ok() { printf '    %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ---- preflight ---------------------------------------------------------------------------------
say "Preflight"
ver=$(git version | awk '{print $3}')
[ "$(printf '%s\n2.34.0\n' "$ver" | sort -V | head -1)" = 2.34.0 ] || die "git $ver is too old (need 2.34+)"
if ! git diff --quiet || ! git diff --cached --quiet; then die "commit or stash your changes first"; fi
FORMAT=$(git config gpg.format || echo openpgp)
SIGNKEY=$(git config user.signingkey || true)
# Signature checks run through `sig`: quiet, and able to read SSH signatures (as "not yours")
# even when you sign with OpenPGP and have no allowed-signers file.
SIGOPTS=()
signers=$(git config gpg.ssh.allowedSignersFile || true)
signers="${signers/#\~/$HOME}"
if [ -z "$signers" ] || [ ! -f "$signers" ]; then
  : > "$TMP/no-signers"
  SIGOPTS=(-c "gpg.ssh.allowedSignersFile=$TMP/no-signers")
fi
sig() { git "${SIGOPTS[@]}" "$@" 2>/dev/null; }
MYFPRS=""
case "$FORMAT" in
  ssh)
    [ -n "$SIGNKEY" ] || die "no user.signingkey; run scripts/setup-env.sh first"
    pub="$SIGNKEY"
    case "$pub" in
      key::*) printf '%s\n' "${pub#key::}" > "$TMP/key.pub"; pub="$TMP/key.pub" ;;
      ssh-*) printf '%s\n' "$pub" > "$TMP/key.pub"; pub="$TMP/key.pub" ;;
    esac
    pub="${pub/#\~/$HOME}"
    [ -f "$pub" ] || die "signing key $pub not found"
    MYKEY=$(ssh-keygen -lf "$pub" | awk '{print $2}')
    body=$(awk '{print $2}' "$pub")
    if [ ${#SIGOPTS[@]} -gt 0 ] || ! grep -qF "$body" "$signers" 2>/dev/null; then
      die "your key is not in gpg.ssh.allowedSignersFile, so git can't check signatures; run scripts/setup-env.sh"
    fi
    ;;
  openpgp)
    GPG=$(git config gpg.openpgp.program || git config gpg.program || echo gpg)
    spec=${SIGNKEY:-$(git config user.email)}
    MYFPRS=$("$GPG" --batch --with-colons --list-secret-keys "${spec%!}" 2>/dev/null |
      awk -F: '$1 == "fpr" { print $10 }')
    [ -n "$MYFPRS" ] || die "no secret GPG key for '$spec' (set user.signingkey to your key id)"
    MYKEY=$(head -1 <<<"$MYFPRS")
    ;;
  *) die "gpg.format $FORMAT isn't supported (use openpgp or ssh)" ;;
esac
ok "signing with $FORMAT key $MYKEY ($(git config user.name) <$(git config user.email)>)"
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
  say "Unshallowing (the whole history is rewritten)"
  git fetch --unshallow "$REMOTE"
fi
git fetch --quiet "$REMOTE" "+refs/heads/$MAIN:refs/remotes/$REMOTE/$MAIN" \
  "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH"
git fetch --quiet --tags "$REMOTE"
OLD_MAIN=$(git rev-parse "refs/remotes/$REMOTE/$MAIN")
OLD_TIP=$(git rev-parse "refs/remotes/$REMOTE/$BRANCH")
git merge-base --is-ancestor "$OLD_MAIN" "$OLD_TIP" ||
  die "$REMOTE/$MAIN is not an ancestor of $REMOTE/$BRANCH; merge them first"
if git rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null &&
  [ "$(git rev-parse "refs/heads/$BRANCH")" != "$OLD_TIP" ]; then
  die "local $BRANCH differs from $REMOTE/$BRANCH; push or reset it first"
fi
REMOTE_TAGS=$(git ls-remote --tags "$REMOTE" | awk '$2 !~ /\^\{\}$/ {sub("refs/tags/","",$2); print $2}')
ok "$MAIN $(git rev-parse --short "$OLD_MAIN"), $BRANCH $(git rev-parse --short "$OLD_TIP")"

mine() { [ -n "$1" ] && grep -qxF "$1" <<<"$MYFPRS"; }

# Whether a commit or tag is already signed by your key (OpenPGP: good, trusted or not).
good() { # good <commit-or-tag> <commit|tag>
  local st key fpr pfpr raw
  if [ "$FORMAT" = ssh ]; then
    if [ "$2" = commit ]; then
      IFS='|' read -r st key < <(sig log -1 --format='%G?|%GK' "$1") || return 1
    else
      sig verify-tag "$1" >/dev/null || return 1
      key=$(git "${SIGOPTS[@]}" verify-tag --raw "$1" 2>&1 | grep -oE 'SHA256:[A-Za-z0-9+/=]+' | head -1)
      st=G
    fi
    [ "$st" = G ] && [ "$key" = "$MYKEY" ]
    return
  fi
  if [ "$2" = commit ]; then
    IFS='|' read -r st fpr pfpr < <(sig log -1 --format='%G?|%GF|%GP' "$1") || return 1
    case "$st" in G | U) ;; *) return 1 ;; esac
  else
    raw=$(git "${SIGOPTS[@]}" verify-tag --raw "$1" 2>&1 || true)
    grep -q '^\[GNUPG:\] GOODSIG ' <<<"$raw" || return 1
    read -r fpr pfpr < <(awk '$2 == "VALIDSIG" { print $3, $NF }' <<<"$raw")
  fi
  mine "$fpr" || mine "$pfpr"
}

ME_NAME=$(git config user.name || true)
ME_EMAIL=$(git config user.email || true)
if [ -z "$ME_NAME" ] || [ -z "$ME_EMAIL" ]; then die "set git user.name and user.email first"; fi
for e in "${FIX_IDS[@]}"; do
  [ "$e" != "$ME_EMAIL" ] || die "your own user.email ($e) is in --fix-identity; set your identity first"
done
fixid() { local e; for e in "${FIX_IDS[@]}"; do [ "$1" = "$e" ] && return 0; done; return 1; }
# Whether a commit's author or committer is an identity to replace.
wrong_ident() {
  local ae ce
  IFS='|' read -r ae ce < <(git log -1 --format='%ae|%ce' "$1")
  fixid "$ae" || fixid "$ce"
}

if [ "$MODE" = report ]; then
  say "Commits on $BRANCH (oldest first): local status, GitHub verified"
  slug=$(git remote get-url "$REMOTE" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
  use_gh=0
  command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && use_gh=1
  bad=0 wrong=0
  while read -r c; do
    st=$(sig log -1 --format='%G?' "$c")
    on=$(git merge-base --is-ancestor "$c" "$OLD_MAIN" && echo "$MAIN" || echo "$BRANCH")
    gh_v=-
    [ "$use_gh" = 1 ] && gh_v=$(gh api "repos/$slug/commits/$c" --jq .commit.verification.verified 2>/dev/null || echo '?')
    if good "$c" commit; then st="$st*"; else bad=$((bad + 1)); fi
    if wrong_ident "$c"; then st="$st!"; wrong=$((wrong + 1)); fi
    printf '    %s %-2s %-6s gh:%-5s %s\n' "$(git rev-parse --short "$c")" "$st" "$on" "$gh_v" "$(git log -1 --format=%s "$c" | cut -c1-70)"
  done < <(git rev-list --reverse --topo-order "$OLD_TIP")
  ok "$bad commit(s) not signed by your key would be re-signed"
  ok "$wrong commit(s) by ${FIX_IDS[*]} (!) would get your identity ($ME_NAME <$ME_EMAIL>), dates kept"
  others=$(git log --format='%an <%ae>%n%cn <%ce>' "$OLD_TIP" | sort -u |
    grep -vxF "$ME_NAME <$ME_EMAIL>" | grep -vF "${FIX_IDS[@]/#/-e}" || true)
  [ -z "$others" ] || ok "other identities, kept as they are: $(tr '\n' ';' <<<"$others" | sed 's/;$//; s/;/; /g')"
  ok "status: * = signed by your key; G good, U good but key not trusted, N none, E can't check (not your key), B/X/Y/R bad or expired"
  [ "$use_gh" = 1 ] || ok "install and log in to gh to also see GitHub's verdict"
  exit 0
fi

# ---- rewrite commits ---------------------------------------------------------------------------
say "Rewriting commits"
declare -A MAP
kept=0 signed=0
while read -r c; do
  parents=()
  changed=0
  for p in $(git log -1 --format=%P "$c"); do
    np=${MAP[$p]:-$p}
    [ "$np" = "$p" ] || changed=1
    parents+=(-p "$np")
  done
  if [ "$changed" = 0 ] && ! wrong_ident "$c" && good "$c" commit; then
    MAP[$c]=$c
    kept=$((kept + 1))
    continue
  fi
  git cat-file commit "$c" | sed '1,/^$/d' > "$TMP/msg"
  mapfile -d '' f < <(git log -1 --format='%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd%x00' --date=raw "$c")
  if fixid "${f[1]}"; then f[0]=$ME_NAME f[1]=$ME_EMAIL; fi
  if fixid "${f[4]}"; then f[3]=$ME_NAME f[4]=$ME_EMAIL; fi
  MAP[$c]=$(GIT_AUTHOR_NAME="${f[0]}" GIT_AUTHOR_EMAIL="${f[1]}" GIT_AUTHOR_DATE="${f[2]}" \
    GIT_COMMITTER_NAME="${f[3]}" GIT_COMMITTER_EMAIL="${f[4]}" GIT_COMMITTER_DATE="${f[5]}" \
    git commit-tree -S "$(git rev-parse "$c^{tree}")" "${parents[@]}" -F "$TMP/msg")
  signed=$((signed + 1))
done < <(git rev-list --reverse --topo-order "$OLD_TIP")
NEW_TIP=${MAP[$OLD_TIP]}
ok "$signed re-signed, $kept kept"

say "Verifying commits"
# Author and committer with dates; identities to fix read as yours.
ident() {
  local an ae ad cn ce cd
  IFS='|' read -r an ae ad cn ce cd < <(git log -1 --format='%an|%ae|%ad|%cn|%ce|%cd' --date=raw "$1")
  if fixid "$ae"; then an=$ME_NAME ae=$ME_EMAIL; fi
  if fixid "$ce"; then cn=$ME_NAME ce=$ME_EMAIL; fi
  printf '%s|%s|%s|%s|%s|%s\n' "$an" "$ae" "$ad" "$cn" "$ce" "$cd"
}
for c in "${!MAP[@]}"; do
  n=${MAP[$c]}
  [ "$n" = "$c" ] && continue
  [ "$(git rev-parse "$c^{tree}")" = "$(git rev-parse "$n^{tree}")" ] || die "tree differs for $c"
  [ "$(ident "$c")" = "$(ident "$n")" ] || die "author/committer or dates differ for $c"
  ! wrong_ident "$n" || die "new commit $n for $c still has an identity to fix"
  [ "$(git cat-file commit "$c" | sed '1,/^$/d' | git hash-object --stdin)" = \
    "$(git cat-file commit "$n" | sed '1,/^$/d' | git hash-object --stdin)" ] || die "message differs for $c"
  good "$n" commit || die "new commit $n for $c is not signed by your key"
done
git diff --quiet "$OLD_TIP" "$NEW_TIP" || die "the rewritten tip's tree differs"
ok "trees, messages and dates identical; authors and committers identical except ${FIX_IDS[*]} → you; every commit signed"

# ---- tags ---------------------------------------------------------------------------------------
say "Planning tags"
declare -A TAG_TARGET TAG_TYPE PENDING_MSG
CHANGED_TAGS=()
while read -r t; do
  target=$(git rev-parse -q --verify "refs/tags/$t^{commit}" 2>/dev/null) || continue
  [ -n "${MAP[$target]:-}" ] || continue
  type=$(git cat-file -t "refs/tags/$t")
  if [ "${MAP[$target]}" = "$target" ] && { [ "$type" = commit ] || good "refs/tags/$t" tag; }; then
    continue
  fi
  TAG_TARGET[$t]=${MAP[$target]}
  TAG_TYPE[$t]=$type
  CHANGED_TAGS+=("$t")
done < <(git for-each-ref --format='%(refname:short)' refs/tags)

PENDING=()
if [ -f scripts/release-tags.txt ]; then
  while read -r t c msg; do
    case "$t" in '' | '#'*) continue ;; esac
    if grep -qxF "$t" <<<"$REMOTE_TAGS"; then continue; fi
    c=$(git rev-parse -q --verify "$c^{commit}") || die "release-tags.txt: commit of $t not found"
    [ -n "${MAP[$c]:-}" ] || die "release-tags.txt: $t points outside $BRANCH"
    PENDING+=("$t")
    PENDING_MSG[$t]=$msg
    if [ -z "${TAG_TARGET[$t]:-}" ]; then
      TAG_TARGET[$t]=${MAP[$c]}
      TAG_TYPE[$t]=new
      git rev-parse -q --verify "refs/tags/$t" >/dev/null && TAG_TYPE[$t]=$(git cat-file -t "refs/tags/$t")
      CHANGED_TAGS+=("$t")
    fi
  done < scripts/release-tags.txt
fi
NEWEST=""
[ ${#PENDING[@]} -gt 0 ] && NEWEST=$(printf '%s\n' "${PENDING[@]}" | sort -V | tail -1)
BATCH=()
for t in "${CHANGED_TAGS[@]}"; do [ "$t" = "$NEWEST" ] || BATCH+=("$t"); done
for t in $(printf '%s\n' "${CHANGED_TAGS[@]}" | sort -V); do
  ok "$t → $(git rev-parse --short "${TAG_TARGET[$t]}") (${TAG_TYPE[$t]}$([ "$t" = "$NEWEST" ] && echo ', pushed alone: runs its release'))"
done
if [ ${#BATCH[@]} -ge 1 ] && [ ${#BATCH[@]} -le 3 ]; then
  die "only ${#BATCH[@]} tag(s) to batch; GitHub would run a workflow for each. Push them by hand after checking their release.yml."
fi

say "Push plan"
ok "1. $MAIN: $(git rev-parse --short "$OLD_MAIN") → $(git rev-parse --short "$NEW_TIP") (force, with lease)"
ok "2. $BRANCH: $(git rev-parse --short "$OLD_TIP") → $(git rev-parse --short "$NEW_TIP") (force, with lease)"
ok "3. ${#BATCH[@]} tag(s) in one push (no workflow runs)"
[ -n "$NEWEST" ] && ok "4. $NEWEST alone (its release workflow runs)"
if [ "$MODE" = dry ]; then
  say "Dry run: nothing changed. Run again with --push to apply."
  exit 0
fi

# ---- apply -------------------------------------------------------------------------------------
if [ "$YES" = 0 ]; then
  read -r -p "    Rewrite $REMOTE/$MAIN, $REMOTE/$BRANCH and ${#CHANGED_TAGS[@]} tag(s)? Type yes: " answer </dev/tty
  [ "$answer" = yes ] || die "stopped"
fi
STAMP=$(date +%Y%m%d%H%M%S)
BACKUP=refs/resign-backup/$STAMP
say "Backing up refs under $BACKUP"
git update-ref "$BACKUP/heads/$MAIN" "$OLD_MAIN"
git update-ref "$BACKUP/heads/$BRANCH" "$OLD_TIP"
while read -r ref obj; do git update-ref "$BACKUP/${ref#refs/}" "$obj"; done \
  < <(git for-each-ref --format='%(refname) %(objectname)' refs/tags)

say "Creating tags"
for t in "${CHANGED_TAGS[@]}"; do
  target=${TAG_TARGET[$t]}
  case "${TAG_TYPE[$t]}" in
    commit) git update-ref "refs/tags/$t" "$target" ;;
    tag)
      git cat-file tag "refs/tags/$t" | sed '1,/^$/d' |
        sed -E '/^-----BEGIN (PGP|SSH) SIGNATURE-----$/,$d' > "$TMP/tagmsg"
      [ -s "$TMP/tagmsg" ] || printf '%s\n' "${PENDING_MSG[$t]:-$t}" > "$TMP/tagmsg"
      mapfile -d '' f < <(git for-each-ref --format='%(taggername)%00%(taggeremail)%00%(taggerdate:raw)%00' "refs/tags/$t")
      email=${f[1]#<}
      email=${email%>}
      if fixid "$email"; then f[0]=$ME_NAME email=$ME_EMAIL; fi
      GIT_COMMITTER_NAME="${f[0]}" GIT_COMMITTER_EMAIL="$email" GIT_COMMITTER_DATE="${f[2]}" \
        git tag -s -f --cleanup=verbatim -F "$TMP/tagmsg" "$t" "$target" >/dev/null
      ;;
    new) git tag -s -m "${PENDING_MSG[$t]}" "$t" "$target" ;;
  esac
  [ "${TAG_TYPE[$t]}" = commit ] || good "refs/tags/$t" tag || die "tag $t is not signed by your key"
done
ok "${#CHANGED_TAGS[@]} tag(s) ready"

say "Pushing"
git push --force-with-lease="refs/heads/$MAIN:$OLD_MAIN" "$REMOTE" "$NEW_TIP:refs/heads/$MAIN"
git push --force-with-lease="refs/heads/$BRANCH:$OLD_TIP" "$REMOTE" "$NEW_TIP:refs/heads/$BRANCH"
if [ ${#BATCH[@]} -gt 0 ]; then
  refs=()
  for t in "${BATCH[@]}"; do refs+=("+refs/tags/$t:refs/tags/$t"); done
  git push "$REMOTE" "${refs[@]}"
fi
[ -n "$NEWEST" ] && git push "$REMOTE" "+refs/tags/$NEWEST:refs/tags/$NEWEST"

git update-ref "refs/heads/$MAIN" "$NEW_TIP"
git update-ref "refs/heads/$BRANCH" "$NEW_TIP"
git fetch --quiet "$REMOTE"
say "Done"
ok "$MAIN and $BRANCH are $(git rev-parse --short "$NEW_TIP"); other clones: git fetch && git reset --hard $REMOTE/$MAIN"
ok "undo: git push --force $REMOTE $BACKUP/heads/$MAIN:refs/heads/$MAIN (and the tags under $BACKUP/tags)"
