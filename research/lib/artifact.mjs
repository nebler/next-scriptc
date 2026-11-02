import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// Prefer the requested path; fall back only when it is missing. Return bytes,
// like readFileSync, unless an encoding (or { encoding }) is supplied.
export function readArtifact(path, options) {
  const requested = path instanceof URL ? fileURLToPath(path) : path;
  let actual = requested;
  let bytes;
  try {
    bytes = readFileSync(actual);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    actual = requested.endsWith('.gz') ? requested.slice(0, -3) : requested + '.gz';
    bytes = readFileSync(actual);
  }
  if (actual.endsWith('.gz')) bytes = gunzipSync(bytes);
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}

export function readJsonArtifact(path) {
  return JSON.parse(readArtifact(path, 'utf8'));
}
