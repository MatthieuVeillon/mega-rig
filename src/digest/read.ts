import type { DigestNight } from './types.js';

// Reads runs/<night>.jsonl into a DigestNight. Contract in ./types.ts (ReadNight):
// null when the night has no file or is not YYYY-MM-DD; never throws for bad lines.
export function readNight(runsDir: string, night: string): DigestNight | null {
  throw new Error(`not implemented: #2 (readNight ${runsDir} ${night})`);
}
