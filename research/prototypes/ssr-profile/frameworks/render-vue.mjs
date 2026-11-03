import {createSSRApp} from 'vue';
import {renderToString} from '@vue/server-renderer';
import Page from './renderers/nuxt/page.mjs';
export const name='nuxt';
export const render=()=>renderToString(createSSRApp(Page));
