# Contributor Trust Scoring

This repository ships a compact trust scoring pipeline in
`.github/trust-scoring.js` for agent-only contributor quality control.

## Quick Start

- `createContributorState(contributorId)` creates a compact state row.
- `addEvent(state, event)` appends a trust event and returns updated state.
- `computeTrustScore(state, config, now)` returns:
  - numeric `score`
  - assigned `tier`
  - `tierInfo`
  - detailed `breakdown` and `warnings`

## Storage Shape

Contributor state is persisted in `.github/contributor-trust.json` using compact keys
for size efficiency:

- `c`: contributor id
- `t`: timestamp of last mutation
- `m`: event count (approximate)
- `e`: compact events
  - `y`: event type (`a`, `r`, `c`, `s`)
  - `ts`: event timestamp
  - `l`: lines changed
  - `lb`: labels
  - `s`: review severity
  - `p`: PR number

## Scoring Factors

1. diminishing returns on approvals
2. recency exponential decay
3. complexity multiplier
4. category weighting from labels
5. streak mechanics
6. review severity on rejections
7. daily positive cap
8. velocity gates (7-day rolling)
9. inactivity decay toward target score

## Defaults

Defined in `DEFAULT_CONFIG` inside `.github/trust-scoring.js`.

## CI Integration

The review automation is wired in via:

- `.github/workflows/agent-review.yml`
- `.github/contributor-trust.json`
- `scripts/agent-review-score.js`

The workflow records trust-impacting PR review events (`approved`, `changes_requested`)
and PR closures, computes updated trust scores, and persists the compact trust
state when the event is in-scope.
