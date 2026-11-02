import {defineConfig} from 'vite';
import {reactRouter} from '@react-router/dev/vite';
import {scriptcReactRouter} from 'scriptc-promote/react-router';
export default defineConfig({plugins:[scriptcReactRouter(),reactRouter()]});
