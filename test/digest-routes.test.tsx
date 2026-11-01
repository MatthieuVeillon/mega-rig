import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/index.js';

const NORMAL = '2031-01-01';
const EMPTY = '2031-01-02';
const BAD = '2031-01-03';
const MISSING = '2031-01-04';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Written out of job order on purpose: the page and the JSON must sort by job.
const normalLines = [
  line('2031-01-01T03:00:00+01:00', 'zeta-sync', 'ok', 'matt'),
  line('2031-01-01T01:30:00+01:00', 'mid-backup', 'retry', 'matt', 'timeout'),
  line('2031-01-01T01:35:00+01:00', 'mid-backup', 'retry', 'matt', 'timeout'),
  line('2031-01-01T01:40:00+01:00', 'mid-backup', 'retry', 'matt', 'timeout'),
  line('2031-01-01T01:45:00+01:00', 'mid-backup', 'ok', 'matt'),
  line('2031-01-01T02:00:00+01:00', 'alpha-report', 'fail', null, 'boom'),
];

const badLines = [
  line('2031-01-03T01:00:00+01:00', 'beta-job', 'ok', 'matt'),
  'this is not json',
  line('2031-01-03T02:00:00+01:00', 'alpha-job', 'ok', 'matt'),
];

let dir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  fs.writeFileSync(path.join(dir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(path.join(dir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const page = (night: string) => createApp(config).request(`/digest/${night}`);
const api = (night: string) => createApp(config).request(`/api/digest/${night}`);

// Job names ordered by where they first appear in the html.
const orderInHtml = (html: string, jobs: string[]) =>
  jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);

describe('GET /digest/:night', () => {
  it('200 for a normal night, with every job and the lane banner', async () => {
    const res = await page(NORMAL);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of ['alpha-report', 'mid-backup', 'zeta-sync']) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    expect((await page(MISSING)).status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await page(EMPTY);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good jobs when a line is bad, and notes it', async () => {
    const res = await page(BAD);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-job');
    expect(html).toContain('beta-job');
    expect(html).toContain('1 line in the log did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a normal night, rows sorted by job', async () => {
    const res = await api(NORMAL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-report', 'mid-backup', 'zeta-sync']);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await api(MISSING);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('empty night has no rows', async () => {
    const res = await api(EMPTY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('bad line night is 200 with badLines 1 and the good jobs', async () => {
    const res = await api(BAD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-job', 'beta-job']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('same jobs in the same order for %s', async (night) => {
    const html = await (await page(night)).text();
    const body = (await (await api(night)).json()) as DigestNight;
    const jobs = body.rows.map((r) => r.job);
    expect(orderInHtml(html, jobs)).toEqual(jobs);
  });
});
