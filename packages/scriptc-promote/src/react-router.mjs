import {scriptcPromote} from './vite.mjs';

/** Place before reactRouter() in vite.config; classic Node server builds only. */
export function scriptcReactRouter(options={}) {
 return scriptcPromote({sourceDir:'app',...options});
}
export default scriptcReactRouter;
