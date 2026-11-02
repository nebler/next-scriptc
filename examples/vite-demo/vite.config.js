import {sveltekit} from '@sveltejs/kit/vite';
import {scriptcPromote} from 'scriptc-promote/vite';
export default {plugins:[scriptcPromote(),sveltekit()]};
