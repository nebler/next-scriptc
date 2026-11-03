import {copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// A fatal VM error poisons an addon instance. Keep each input's measurement
// independent of failures in inputs measured before it.
export async function measurementAddon(source,destination){
 await copyFile(source,destination);
 return require(destination);
}
