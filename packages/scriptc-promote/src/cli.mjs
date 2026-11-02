#!/usr/bin/env node
import {reportCommand} from './report.mjs';
if(process.argv[2]!=='report'){console.error('Usage: scriptc-promote report [dir] [--framework name] [--source-dir dir] [--measure] [--inputs file.json] [--json file] [--md file]');process.exitCode=1;}
else try{await reportCommand();}catch(e){console.error('scriptc-promote report: '+e.message);process.exitCode=1;}
