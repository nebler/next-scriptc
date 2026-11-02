import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import scriptcAstro from 'scriptc-promote/astro';
export default defineConfig({output:'server',adapter:node({mode:'standalone'}),integrations:[scriptcAstro()]});
