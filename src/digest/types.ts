// Plan morning-digest § 1. The contract every part of § 2 builds against: the reader (#2)
// produces these, the page, the JSON route and the board link only consume them.

export const RUN_STATUSES = ['ok', 'retry', 'fail'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// One line of runs/<night>.jsonl, once parsed and checked. A line that is not valid JSON or
// does not have this shape is a bad line: counted in DigestNight.badLines, never thrown.
export type RunLine = {
  at: string; // ISO 8601 with the log's offset, e.g. "2026-10-29T01:30:00+01:00"
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night. Lines of a job are taken in file order (the log is
// append-only), never re-sorted by time.
export type DigestRow = {
  job: string;
  owner: string | null; // owner of the job's last line; null renders as "—"
  runs: number; // good lines for this job
  retries: number; // good lines for this job with status "retry"
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // error of the job's last line that had one, null if none did
  firstAt: string; // `at` of the job's first line, verbatim: offset kept, never UTC
  lastAt: string; // `at` of the job's last line, verbatim: offset kept, never UTC
};

// What readNight returns for a night whose file exists.
// - Empty file (or only blank lines): rows = [], badLines = 0 → the page says "nothing ran".
// - Blank lines are skipped, not counted as bad.
export type DigestNight = {
  night: string; // "YYYY-MM-DD", as asked
  rows: DigestRow[]; // one per job, sorted by job (plain string order, a < b)
  badLines: number; // lines that did not parse into a RunLine
};

// readNight(runsDir, night): DigestNight | null — synchronous, never throws for bad content.
// null means "no file for this night" (→ 404): also returned when `night` is not YYYY-MM-DD,
// so a route can pass the URL param straight in without building a path from it.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
