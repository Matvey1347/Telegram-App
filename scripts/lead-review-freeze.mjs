#!/usr/bin/env node
/** Freeze IDs and complete predictions without reading the human review file. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {freezeDigest,outputPath} from './lead-review-evaluate.mjs';
const read=p=>readFileSync(p,'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse);
function main(args){if(args.length!==6||args[0]!=='--expected'||args[2]!=='--predictions'||args[4]!=='--output')throw Error('Provide --expected, --predictions, --output');const sha256=freezeDigest(read(args[1]),read(args[3])),out=outputPath(args[5]);writeFileSync(out,JSON.stringify({version:1,sha256,createdAt:new Date().toISOString(),notice:'Local hash proves content consistency only; freeze timing and reviewer independence are not independently verified.'},null,2)+'\n',{flag:'wx',mode:0o600});return {saved:true,freezeTiming:'NOT_VERIFIED',reviewIndependence:'NOT_VERIFIED'}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(main(process.argv.slice(2))))}catch(e){console.error(e.code==='EEXIST'?'Output exists; preserve original freeze':e.message);process.exitCode=1}}
