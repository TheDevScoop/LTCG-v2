#!/usr/bin/env bash
set -euo pipefail

if git rev-parse --verify develop >/dev/null 2>&1; then
  BASE=develop
else
  BASE=main
fi

BRANCH=$(git branch --show-current || true)
FIRST_COMMIT_MSG=$(git log "$BASE"..HEAD --oneline | head -n1 | cut -d' ' -f2- || true)
CLASS_SOURCE="${BRANCH} ${FIRST_COMMIT_MSG}"
CLASS_LOWER=$(printf "%s" "$CLASS_SOURCE" | tr '[:upper:]' '[:lower:]')

CLASSIFICATION="feature"
if [[ "$CLASS_LOWER" =~ (fix|bug|crash|error|broken|regression) ]]; then
  CLASSIFICATION="bug fix"
elif [[ "$CLASS_LOWER" =~ (redesign|restyle|theme|color|font|layout|css|styling|visual|dark[[:space:]-]?mode|icon|logo|animation) ]]; then
  CLASSIFICATION="aesthetic"
fi

CHANGED_FILES="$(
  {
    git diff "$BASE"...HEAD --name-only
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | awk 'NF' | sort -u
)"

SCOPE_VERDICT="in scope"
if [[ "$CLASSIFICATION" == "aesthetic" ]]; then
  SCOPE_VERDICT="out of scope"
else
  if printf "%s\n" "$CHANGED_FILES" | rg -q '^video/|^\.github/workflows/remotion-pr-preview\.yml$'; then
    SCOPE_VERDICT="needs deep review"
  fi
fi

CODE_QUALITY="pass"
CODE_ISSUES=()
SECURITY="clear"
SECURITY_ISSUES=()
TESTS="adequate"
TEST_ISSUES=()

if ! bun run lint >/tmp/pre-review-lint.log 2>&1; then
  CODE_QUALITY="issues found"
  CODE_ISSUES+=("Lint failed. See /tmp/pre-review-lint.log")
fi

if printf "%s\n" "$CHANGED_FILES" | rg -q '^api/blob-upload\.ts$|^apps/web/api/blob-upload\.ts$'; then
  if ! printf "%s\n" "$CHANGED_FILES" | rg -q 'uploadSecurity\.test\.ts|blob-upload\.test\.ts'; then
    SECURITY="concerns"
    SECURITY_ISSUES+=("Blob upload changed without upload security test changes")
  fi
fi

if printf "%s\n" "$CHANGED_FILES" | rg -q '^api/soundtrack\.ts$|^apps/web/api/soundtrack\.ts$'; then
  if ! printf "%s\n" "$CHANGED_FILES" | rg -q 'soundtrack\.test\.ts'; then
    TESTS="missing"
    TEST_ISSUES+=("Soundtrack API changed without soundtrack tests")
  fi
fi

DECISION="APPROVE"
if [[ "$SCOPE_VERDICT" == "out of scope" || "$CODE_QUALITY" != "pass" || "$SECURITY" != "clear" || "$TESTS" != "adequate" ]]; then
  DECISION="REQUEST CHANGES"
fi

printf '## Pre-Review Results\n\n'
printf '1. **Classification:** %s\n' "$CLASSIFICATION"
printf '2. **Scope verdict:** %s\n' "$SCOPE_VERDICT"
printf '3. **Code quality:** %s' "$CODE_QUALITY"
if [[ ${#CODE_ISSUES[@]} -gt 0 ]]; then
  printf ' (%s)' "$(IFS='; '; echo "${CODE_ISSUES[*]}")"
fi
printf '\n'
printf '4. **Security:** %s' "$SECURITY"
if [[ ${#SECURITY_ISSUES[@]} -gt 0 ]]; then
  printf ' (%s)' "$(IFS='; '; echo "${SECURITY_ISSUES[*]}")"
fi
printf '\n'
printf '5. **Tests:** %s' "$TESTS"
if [[ ${#TEST_ISSUES[@]} -gt 0 ]]; then
  printf ' (%s)' "$(IFS='; '; echo "${TEST_ISSUES[*]}")"
fi
printf '\n'
printf '6. **Decision:** %s\n\n' "$DECISION"

printf '### Required changes (if any):\n'
if [[ "$DECISION" == "APPROVE" ]]; then
  printf -- '- [ ] None\n'
else
  if [[ ${#CODE_ISSUES[@]} -gt 0 ]]; then
    for issue in "${CODE_ISSUES[@]}"; do
      printf -- '- [ ] %s\n' "$issue"
    done
  fi
  if [[ ${#SECURITY_ISSUES[@]} -gt 0 ]]; then
    for issue in "${SECURITY_ISSUES[@]}"; do
      printf -- '- [ ] %s\n' "$issue"
    done
  fi
  if [[ ${#TEST_ISSUES[@]} -gt 0 ]]; then
    for issue in "${TEST_ISSUES[@]}"; do
      printf -- '- [ ] %s\n' "$issue"
    done
  fi
fi

if [[ "$DECISION" == "REQUEST CHANGES" ]]; then
  exit 2
fi
