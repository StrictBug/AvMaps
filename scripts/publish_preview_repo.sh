#!/usr/bin/env bash
# Create/update StrictBug/AvMaps-preview from the current branch and kick off Pages.
# Does not push to StrictBug/AvMaps (production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PREVIEW_REPO="${PREVIEW_REPO:-StrictBug/AvMaps-preview}"
PREVIEW_URL="https://strictbug.github.io/AvMaps-preview/"

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not logged in. Run: gh auth login"
  exit 1
fi

BRANCH="$(git branch --show-current)"
echo "Publishing branch '${BRANCH}' → ${PREVIEW_REPO}"

if ! gh repo view "$PREVIEW_REPO" >/dev/null 2>&1; then
  echo "Creating ${PREVIEW_REPO}..."
  gh repo create "$PREVIEW_REPO" --public --description "Staging preview for AvMaps (does not affect production Pages)"
fi

# Push current HEAD to preview main (force-with-lease so preview tracks this branch).
git push -f "https://github.com/${PREVIEW_REPO}.git" "HEAD:main"

# Enable Pages via GitHub Actions if not already configured.
if ! gh api "repos/${PREVIEW_REPO}/pages" >/dev/null 2>&1; then
  echo "Enabling GitHub Pages (Actions) on ${PREVIEW_REPO}..."
  gh api "repos/${PREVIEW_REPO}/pages" -X POST \
    -f build_type=workflow \
    -f source[branch]=main \
    -f source[path]=/ \
    || true
fi

echo "Triggering forced rebuild on preview..."
gh workflow run auto-update-maps.yml --repo "$PREVIEW_REPO" --ref main -f force=true

echo
echo "Preview repo: https://github.com/${PREVIEW_REPO}"
echo "Preview URL (after the Actions deploy finishes): ${PREVIEW_URL}"
echo "Watch: gh run watch --repo ${PREVIEW_REPO}"
