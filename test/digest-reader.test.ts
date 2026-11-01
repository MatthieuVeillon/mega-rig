import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight, type DigestNight, type DigestRow } from '../src/digest/index.js';

function row(night: DigestNight, job: string): DigestRow {
  const found = night.rows.find((r) => r.job === job);
  if (found === undefined) throw new Error(`no row for ${job}`);
  return found;
}

function tempNight(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-11-01.jsonl'), content);
  return dir;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  if (night === null) throw new Error('fixture night missing');

  it('has 5 jobs sorted by name, 1 bad line, counts per status', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps the last error after a later ok line', () => {
    expect(row(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('reports a failed job', () => {
    const backup = row(night, 'notes/backup');
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row(night, 'digest/render').owner).toBeNull();
  });

  it('copies times verbatim with their offset', () => {
    const sync = row(night, 'lane/sync');
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt.endsWith('+01:00')).toBe(true);
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a night not in YYYY-MM-DD form', () => {
    expect(readNight('runs', '../x')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
    expect(readNight('runs', '')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    expect(readNight(tempNight(''), '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank lines and counts wrong shapes as bad lines', () => {
    const lines = [
      '',
      '{"at":"2026-11-01T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      '   ',
      '{"at":"2026-11-01T01:00:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-11-01T01:00:00+01:00","status":"ok","owner":"rook"}',
      '{"at":"2026-11-01T01:00:00+01:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-11-01T01:00:00+01:00","job":"a","status":"ok","owner":"rook","error":42}',
      '[1,2]',
      'null',
      'not json',
    ];
    const night = readNight(tempNight(lines.join('\n') + '\n'), '2026-11-01');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('takes owner and status from the last line in file order', () => {
    const lines = [
      '{"at":"2026-11-01T02:00:00+01:00","job":"b","status":"fail","owner":"rook","error":"boom"}',
      '{"at":"2026-11-01T01:00:00+01:00","job":"b","status":"ok","owner":null}',
    ];
    const b = readNight(tempNight(lines.join('\n')), '2026-11-01')?.rows[0];
    expect(b).toMatchObject({
      owner: null,
      lastStatus: 'ok',
      lastError: 'boom',
      firstAt: '2026-11-01T02:00:00+01:00',
      lastAt: '2026-11-01T01:00:00+01:00',
    });
  });
});
