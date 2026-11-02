import adapter from '@sveltejs/adapter-node';
import {scriptcAdapter} from 'scriptc-promote/sveltekit';
export default {kit:{adapter:scriptcAdapter(adapter())}};
