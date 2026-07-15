import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

const MAX_BUFFER = 10 * 1024 * 1024;
const LOCK_RETRY_DELAY_MS = 300;

function httpError(status, message, payload) {
  const err = new Error(message);
  err.status = status;
  if (payload !== undefined) {
    err.payload = payload;
  }
  return err;
}

function run(repoRoot, args, okCodes = [0]) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: repoRoot, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err === null) {
          resolve({ stdout, code: 0 });
          return;
        }
        if (typeof err.code === 'number' && okCodes.includes(err.code)) {
          resolve({ stdout, code: err.code });
          return;
        }
        const detail = [stdout, stderr]
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .join('\n');
        reject(new Error(`git ${args[0]} failed: ${detail}`));
      },
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries once on index.lock contention: the user's IDE runs git
 * constantly and can hold the lock for a moment.
 */
async function runWithLockRetry(repoRoot, args) {
  try {
    return await run(repoRoot, args);
  } catch (err) {
    if (!err.message.includes('index.lock')) {
      throw err;
    }
    await sleep(LOCK_RETRY_DELAY_MS);
    return run(repoRoot, args);
  }
}

async function currentBranch(repoRoot) {
  const { stdout } = await run(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout.trim();
}

async function mergeInProgress(repoRoot) {
  const { stdout } = await run(repoRoot, [
    'rev-parse',
    '--git-path',
    'MERGE_HEAD',
    '--git-path',
    'CHERRY_PICK_HEAD',
  ]);
  return stdout.split('\n').some((line) => line.trim() !== '' && existsSync(line.trim()));
}

async function fileState(repoRoot, relPath) {
  const inHead = await run(repoRoot, ['ls-tree', 'HEAD', '--', relPath]);
  const status = await run(repoRoot, ['status', '--porcelain', '--', relPath]);
  if (status.stdout.trim() === '') {
    if (inHead.stdout.trim() === '') {
      throw httpError(404, 'file is neither tracked nor present');
    }
    return 'clean';
  }
  return inHead.stdout.trim() === '' ? 'new' : 'modified';
}

async function fileDiff(repoRoot, relPath, state) {
  if (state === 'new') {
    const { stdout } = await run(
      repoRoot,
      ['diff', '--no-index', '--', '/dev/null', relPath],
      [0, 1],
    );
    return stdout;
  }
  const { stdout } = await run(repoRoot, ['diff', 'HEAD', '--', relPath]);
  return stdout;
}

async function remoteRepo(repoRoot) {
  const { stdout } = await run(repoRoot, ['remote', 'get-url', 'origin']);
  const match = /[:/]([^:/]+)\/([^/]+?)(?:\.git)?$/.exec(stdout.trim());
  if (match === null) {
    throw new Error(`cannot parse origin remote url: ${stdout.trim()}`);
  }
  return { owner: match[1], name: match[2] };
}

export async function preflight(repoRoot, relPath) {
  const blockers = [];
  const branch = await currentBranch(repoRoot);
  if (branch !== 'main') {
    blockers.push(`not on main (currently on ${branch})`);
  }
  if (await mergeInProgress(repoRoot)) {
    blockers.push('a merge or cherry-pick is in progress');
  }
  try {
    await run(repoRoot, ['fetch', 'origin', 'main']);
  } catch (cause) {
    throw httpError(502, `cannot reach origin: ${cause.message}`);
  }
  const counts = await run(repoRoot, [
    'rev-list',
    '--count',
    '--left-right',
    'main...origin/main',
  ]);
  const [ahead, behind] = counts.stdout.trim().split('\t').map(Number);
  if (behind > 0) {
    blockers.push(`main is behind origin/main by ${behind} commit(s) — pull first`);
  }
  let aheadCommits = [];
  if (ahead > 0) {
    const log = await run(repoRoot, ['log', '--format=%h %s', 'origin/main..main']);
    aheadCommits = log.stdout
      .trim()
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const space = line.indexOf(' ');
        return { sha: line.slice(0, space), subject: line.slice(space + 1) };
      });
  }
  const state = await fileState(repoRoot, relPath);
  if (state === 'clean') {
    blockers.push('no changes to publish — file matches the last commit');
  }
  const diff = state === 'clean' ? '' : await fileDiff(repoRoot, relPath, state);
  const repo = await remoteRepo(repoRoot);
  return {
    publishable: blockers.length === 0,
    blockers,
    fileState: state,
    ahead,
    behind,
    aheadCommits,
    diff,
    repo,
    actionsUrl: `https://github.com/${repo.owner}/${repo.name}/actions`,
  };
}

export async function publish(repoRoot, relPath, message) {
  if (typeof message !== 'string' || message.trim() === '' || message.length > 500) {
    throw httpError(400, 'commit message must be a non-empty string under 500 chars');
  }
  const branch = await currentBranch(repoRoot);
  if (branch !== 'main') {
    throw httpError(409, `not on main (currently on ${branch})`);
  }
  const state = await fileState(repoRoot, relPath);
  if (state === 'clean') {
    throw httpError(409, 'no changes to publish — file matches the last commit');
  }
  await runWithLockRetry(repoRoot, ['add', '--', relPath]);
  await runWithLockRetry(repoRoot, ['commit', '-m', message.trim(), '--', relPath]);
  const head = await run(repoRoot, ['rev-parse', 'HEAD']);
  const sha = head.stdout.trim();
  try {
    await run(repoRoot, ['push', 'origin', 'main']);
  } catch (cause) {
    throw httpError(500, `committed ${sha.slice(0, 7)} but push failed: ${cause.message}`, {
      sha,
    });
  }
  return { sha };
}
