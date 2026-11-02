import {defineConfig} from 'vite';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {nitro} from 'nitro/vite';
import {scriptcTanstack} from 'scriptc-promote/tanstack';
export default defineConfig({plugins:[scriptcTanstack(),tanstackStart(),react(),nitro({preset:'node-server'})]});
