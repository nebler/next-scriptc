import {createHash} from 'node:crypto';
import path from 'node:path';
import {withScriptc} from 'next-scriptc';
// Default automatic discovery. No directive, forced lane, or separate native port.
export default withScriptc({experimental: {cpus: 2}, env: {SHARED_NATIVE_FUNCTION_ID: createHash('sha256').update(path.join(import.meta.dirname, 'lib/forecast.ts') + '\0forecast').digest('hex').slice(0, 20)}});
