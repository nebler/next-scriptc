#!/usr/bin/env node
import {reportCommand} from './report.mjs';
if(process.argv[2]==='doctor'){try{(await import('./doctor.mjs')).doctorCommand();}catch(e){console.error(e.message);process.exitCode=1;}}
else if(process.argv[2]==='fuzz'){try{await (await import('./fuzz.mjs')).fuzzCommand();}catch(e){console.error(e.message);process.exitCode=1;}}
else if(process.argv[2]!=='report'){console.error('Usage: scriptc-promote doctor [dir] [--json] | fuzz [dir] [--seed N] [--budget-ms N] [--max-cases N] [--json file] | report [dir] [--framework name] [--source-dir dir] [--profile file.cpuprofile] [--suggest] [--measure] [--inputs file.json] [--json file] [--md file]');process.exitCode=1;}
else try{await reportCommand();}catch(e){console.error('scriptc-promote report: '+e.message);process.exitCode=1;}
