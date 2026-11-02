import {scriptcNitro} from 'scriptc-promote/nitro';
export default defineNuxtConfig({nitro:{preset:'node-server',modules:[scriptcNitro({sourceDir:'server'})]}});
