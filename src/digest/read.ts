import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_STATUSES, type DigestNight, type DigestRow, type RunLine, type RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// Reads runs/<night>.jsonl into a DigestNight. Contract in ./types.ts (ReadNight):
// null when the night has no file or is not YYYY-MM-DD; never throws for bad lines.
export function readNight(runsDir: string, night: string): DigestNight | null {
  if (!NIGHT.test(night)) return null;

  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rowsByJob = new Map<string, DigestRow>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    addLine(rowsByJob, line);
  }

  const rows = [...rowsByJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isNodeError(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

function addLine(rowsByJob: Map<string, DigestRow>, line: RunLine): void {
  const row = rowsByJob.get(line.job);
  if (row === undefined) {
    rowsByJob.set(line.job, {
      job: line.job,
      owner: line.owner,
      runs: 1,
      retries: line.status === 'retry' ? 1 : 0,
      lastStatus: line.status,
      lastError: line.error ?? null,
      firstAt: line.at,
      lastAt: line.at,
    });
    return;
  }
  row.owner = line.owner;
  row.runs++;
  if (line.status === 'retry') row.retries++;
  row.lastStatus = line.status;
  if (line.error !== undefined) row.lastError = line.error;
  row.lastAt = line.at;
}

// One raw line → RunLine, or null when it is not JSON or not the RunLine shape.
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isRunStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return error === undefined ? { at, job, status, owner } : { at, job, status, owner, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (RUN_STATUSES as readonly string[]).includes(value);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
