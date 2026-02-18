#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scoring = require('../.github/trust-scoring.cjs');

const DEFAULT_CATEGORIES = new Set([
  'security',
  'critical-fix',
  'core',
  'feature',
  'bugfix',
  'refactor',
  'test',
  'docs',
  'chore',
  'aesthetic',
]);

const SEVERITY_ORDER = ['critical', 'major', 'normal', 'minor', 'trivial'];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLabel(label) {
  return normalizeText(label).replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

function normalizeLabels(rawLabels = []) {
  const seen = new Set();
  const normalized = [];
  for (const label of rawLabels) {
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel || seen.has(normalizedLabel)) {
      continue;
    }
    seen.add(normalizedLabel);
    normalized.push(normalizedLabel);
  }
  return normalized;
}

function extractLabelsFromPayload(payload) {
  const rawLabels = (payload?.pull_request?.labels || []).map((item) => item?.name).filter(Boolean);
  return normalizeLabels(rawLabels);
}

function inferContributor(raw) {
  const contributor = normalizeText(raw?.login || raw?.name || raw?.username || raw?.id);
  return contributor || 'unknown';
}

function inferReviewSeverity(labels, fallback = 'normal') {
  const normalized = normalizeLabels(labels);
  for (const label of normalized) {
    if (label === 'critical' || label === 'security' || label === 'incident') {
      return 'critical';
    }
    if (label === 'major') {
      return 'major';
    }
  }

  for (const severity of SEVERITY_ORDER) {
    if (normalized.includes(severity)) {
      return severity;
    }
  }

  return normalizeLabel(fallback) || 'normal';
}

function inferCategoryLabels(labels) {
  const normalized = normalizeLabels(labels);
  return normalized.filter((label) => DEFAULT_CATEGORIES.has(label));
}

function inferReviewLinesChanged(pr) {
  const additions = Number(pr?.additions || 0);
  const deletions = Number(pr?.deletions || 0);
  return Math.max(0, additions + deletions);
}

function buildEventFromPullRequestReview(payload) {
  const action = normalizeText(payload?.action);
  if (action !== 'submitted') {
    return null;
  }

  const reviewState = normalizeText(payload?.review?.state);
  if (reviewState !== 'approved' && reviewState !== 'changes_requested') {
    return null;
  }

  const labels = extractLabelsFromPayload(payload);

  return {
    type: reviewState === 'approved' ? 'approve' : 'reject',
    contributor: inferContributor(payload?.review?.user),
    timestamp: Date.now(),
    linesChanged: inferReviewLinesChanged(payload.pull_request),
    labels,
    reviewSeverity: inferReviewSeverity(labels, payload?.review?.body),
    prNumber: payload?.pull_request?.number,
  };
}

function buildEventFromPullRequest(payload) {
  const action = normalizeText(payload?.action);
  const pr = payload?.pull_request;

  if (!['closed'].includes(action)) {
    return null;
  }

  if (!pr) {
    return null;
  }

  if (pr.merged) {
    return null;
  }

  const labels = extractLabelsFromPayload(payload);
  const actor = inferContributor(payload?.sender);
  const isAuthor = actor && pr.user && normalizeText(actor) === normalizeText(pr.user.login);

  return {
    type: isAuthor ? 'selfClose' : 'close',
    contributor: actor,
    timestamp: Date.now(),
    linesChanged: inferReviewLinesChanged(pr),
    labels,
    reviewSeverity: inferReviewSeverity(labels),
    prNumber: pr.number,
  };
}

function isForkPayload(payload) {
  const pullRequestRepo = payload?.pull_request?.head?.repo?.full_name;
  const baseRepo = payload?.repository?.full_name;
  if (!pullRequestRepo || !baseRepo) {
    return false;
  }
  return normalizeText(pullRequestRepo) !== normalizeText(baseRepo);
}

function loadLocalState(statePath) {
  if (!fs.existsSync(statePath)) {
    return {};
  }
  const raw = fs.readFileSync(statePath, 'utf8').trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Trust state file must be a JSON object.');
  }
  return parsed;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  fs.appendFileSync(outputPath, `${name}=${String(value)}\n`);
}

function encodePath(filePath) {
  return filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function readRemoteState(owner, repo, filePath, token, ref) {
  const fileUrlPath = encodePath(filePath);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${fileUrlPath}`;
  const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';

  const response = await fetch(`${apiUrl}${params}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'github-actions',
      'x-github-api-version': '2022-11-28',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { state: {}, sha: null };
    }
    const message = await response.text();
    throw new Error(`Unable to read trust state file: ${response.status} ${message}`);
  }

  const payload = await response.json();
  const rawContent = Buffer.from(payload.content || '', 'base64').toString('utf8');
  return {
    state: rawContent ? JSON.parse(rawContent) : {},
    sha: payload.sha || null,
  };
}

async function writeRemoteState(owner, repo, filePath, nextStateJson, token, branch, sha) {
  const fileUrlPath = encodePath(filePath);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${fileUrlPath}`;
  const body = {
    message: 'chore: update contributor trust scoring state',
    content: Buffer.from(nextStateJson, 'utf8').toString('base64'),
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'github-actions',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Unable to write trust state file: ${response.status} ${message}`);
  }

  return true;
}

function buildEventFromPayload(payload, eventName) {
  if (eventName === 'pull_request_review') {
    return buildEventFromPullRequestReview(payload);
  }

  if (eventName === 'pull_request') {
    return buildEventFromPullRequest(payload);
  }

  return null;
}

async function run() {
  const summaryPath = process.env.TRUST_SUMMARY_PATH || path.join(os.tmpdir(), 'agent-trust-summary.json');
  const statePath = path.resolve(process.cwd(), process.env.TRUST_STATE_PATH || '.github/contributor-trust.json');
  const eventPath = process.env.GITHUB_EVENT_PATH;

  const payload = eventPath ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
  const eventName = normalizeText(process.env.GITHUB_EVENT_NAME || 'workflow_dispatch');

  const trustEvent = buildEventFromPayload(payload, eventName);

  const summary = {
    eventName,
    updated: false,
    persisted: false,
    skipReason: 'No trust scoring event detected in payload.',
  };

  if (!trustEvent) {
    setOutput('updated', 'false');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    return;
  }

  const contributor = inferContributor({ login: trustEvent.contributor, name: trustEvent.contributor });
  const labels = inferCategoryLabels(trustEvent.labels);
  const reviewSeverity = inferReviewSeverity(trustEvent.reviewSeverity, 'normal');

  const eventPayload = {
    ...trustEvent,
    contributor,
    labels,
    reviewSeverity,
    timestamp: Number(trustEvent.timestamp || Date.now()),
    linesChanged: Number(trustEvent.linesChanged || 0),
  };

  const localState = loadLocalState(statePath);
  const contributorState = localState[contributor] || {
    c: contributor,
    t: 0,
    m: 0,
    e: [],
  };

  const baseline = scoring.computeTrustScore(contributorState);
  const updatedContributorState = scoring.addEvent(contributorState, eventPayload);
  const next = scoring.computeTrustScore(updatedContributorState);
  localState[contributor] = updatedContributorState;

  const compact = scoring.compactState(localState);
  const nextJson = JSON.stringify(compact, null, 2);
  const isFork = isForkPayload(payload);
  const token = process.env.GITHUB_TOKEN;

  let persisted = false;
  let persistMode = 'local';
  let persistError = null;

  if (token && !isFork) {
    try {
      const repo = payload?.repository?.name;
      const owner = payload?.repository?.owner?.login;
      const defaultBranch = payload?.repository?.default_branch || 'main';
      const filePath = process.env.TRUST_STATE_PATH || '.github/contributor-trust.json';
      if (repo && owner) {
        const current = await readRemoteState(owner, repo, filePath, token, defaultBranch);
        await writeRemoteState(owner, repo, filePath, nextJson, token, defaultBranch, current.sha);
        persisted = true;
        persistMode = 'remote';
      } else {
        persistError = 'Missing repository context for remote state write.';
      }
    } catch (error) {
      persistError = String(error.message || error);
      persisted = false;
      persistMode = 'remote-failed';
    }
  } else {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, nextJson);
    persisted = true;
    persistMode = isFork ? 'local-fork-skipped-remote' : 'local-no-token';
  }

  const scoreDelta = next.score - baseline.score;

  summary.updated = true;
  summary.persisted = persisted;
  summary.persistMode = persistMode;
  summary.persistError = persistError;
  delete summary.skipReason;
  summary.prNumber = eventPayload.prNumber;
  summary.contributor = contributor;
  summary.eventType = eventPayload.type;
  summary.scoreBefore = baseline.score;
  summary.scoreAfter = next.score;
  summary.tier = next.tier;
  summary.tierLabel = next.tierInfo.label;
  summary.delta = Number(scoreDelta);
  summary.warnings = next.warnings || [];
  summary.breakdown = next.breakdown || {};
  summary.labels = labels;

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  setOutput('updated', String(summary.updated));
  setOutput('persisted', String(summary.persisted));
  setOutput('contributor', contributor);
  setOutput('event_type', eventPayload.type);
  setOutput('score_before', baseline.score);
  setOutput('score_after', next.score);
  setOutput('tier', next.tier);
  setOutput('pr_number', eventPayload.prNumber || '');
  setOutput('summary_path', summaryPath);
}

run().catch((error) => {
  const output = {
    eventName: normalizeText(process.env.GITHUB_EVENT_NAME || 'workflow_dispatch'),
    updated: false,
    persisted: false,
    skipReason: String(error.message || error),
  };
  const summaryPath = process.env.TRUST_SUMMARY_PATH || path.join(os.tmpdir(), 'agent-trust-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2));
  setOutput('updated', 'false');
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
