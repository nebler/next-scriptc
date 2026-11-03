import {experimental_AstroContainer} from 'astro/container';
import {readdirSync} from 'node:fs';
const file=readdirSync(new URL('./astro/dist/server/chunks/',import.meta.url)).find(f=>/^index_.*\.mjs$/.test(f));
const {page}=await import('./astro/dist/server/chunks/'+file);
const component=page().default;
const container=await experimental_AstroContainer.create();
export const name='astro';
export async function render(){const html=await container.renderToString(component);const start=html.indexOf('<main id="benchmark">');return html.slice(start,html.indexOf('</main>',start)+7);}
