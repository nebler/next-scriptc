import {render as ssr} from 'svelte/server';
import Page from './renderers/svelte/page.mjs';
export const name='svelte';
export const render=()=>ssr(Page).body;
