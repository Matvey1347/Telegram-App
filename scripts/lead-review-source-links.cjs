#!/usr/bin/env node
/** Enrich the offline review sample using stored workspace-scoped message URLs only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve('research/telegram-ad-filter'),workspace=process.env.LEAD_REVIEW_WORKSPACE_ID;
const {sourceInputs}=require(path.join(root,'export-original.cjs'));
const {Client}=require(require.resolve('pg',{paths:[path.resolve('apps/api')]}));
require(require.resolve('dotenv',{paths:[path.resolve('apps/api')]})).config({path:'.env',quiet:true});
const stable=(source,id)=>'post-'+crypto.createHash('sha256').update(`${workspace}:${source}:${id}`).digest('hex').slice(0,24);
function validUrl(raw,source,messageId){
  if(typeof raw!=='string'||!/^\d+$/.test(String(messageId)))return null;
  try {const u=new URL(raw);if(u.protocol!=='https:'||!['t.me','telegram.me'].includes(u.hostname.toLowerCase())||u.username||u.password||u.port||u.search||u.hash)return null;
    const parts=u.pathname.split('/').filter(Boolean),user=source.username?.toLowerCase().replace(/^@/,''),channel=String(source.channelId||'').replace(/^-100/,'');
    const ok=parts.length===2&&user&&parts[0].toLowerCase()===user&&parts[1]===String(messageId)||parts.length===3&&parts[0]==='c'&&/^\d+$/.test(channel)&&parts[1]===channel&&parts[2]===String(messageId);
    return ok?raw:null;
  }catch{return null}
}
const cell=value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@\-]/u.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};
async function main(){
 if(!workspace)throw Error('LEAD_REVIEW_WORKSPACE_ID is required');
 const v2=path.join(root,'review-sample-v2'),out=path.join(root,'review-sample-v3');
 const groups=['dev','holdout'].map(name=>({name,rows:fs.readFileSync(path.join(v2,`review-${name}.jsonl`),'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse)}));
 fs.mkdirSync(out,{recursive:true,mode:0o700});const actual=fs.realpathSync(out),rel=path.relative(fs.realpathSync(root),actual);if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw Error('Invalid output directory');
 for(const name of ['review-dev.csv','review-dev.jsonl','review-holdout.csv','review-holdout.jsonl','README.txt']){const p=path.relative(process.cwd(),path.join(actual,name));try{execFileSync('git',['check-ignore','-q','--no-index','--',p],{stdio:'ignore'})}catch{throw Error('Output must be Git ignored')}if(execFileSync('git',['ls-files','--',p],{encoding:'utf8'}).trim())throw Error('Output is tracked')}
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:12000});await client.connect();let found=0;try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const sources=(await client.query('SELECT id,"normalizedKey",username,"channelId" FROM "TelegramLeadSource" WHERE "workspaceId"=$1 AND "normalizedKey"=ANY($2::text[])',[workspace,sourceInputs.map(s=>s.key)])).rows;
  const rows=groups.flatMap(g=>g.rows);const links=new Map();
  for(const spec of sourceInputs){const source=sources.find(s=>s.normalizedKey===spec.key),selection=rows.filter(r=>r.sourceId===spec.id);if(!source||!selection.length)continue;
    const times=selection.map(r=>r.publishedAt).sort();
    const obs=(await client.query('SELECT id,"externalMessageId","messageUrl" FROM "TelegramLeadObservation" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND "publishedAt">=$3 AND "publishedAt"<=$4',[workspace,source.id,times[0],times.at(-1)])).rows;
    for(const item of obs){const id=stable(source.id,item.id);if(selection.some(r=>r.id===id))links.set(id,validUrl(item.messageUrl,source,item.externalMessageId))}
  }
  for(const group of groups)for(const row of group.rows){row.messageUrl=links.get(row.id)||null;if(row.messageUrl)found++}
  await client.query('ROLLBACK');
 }finally{await client.end()}
 const columns=['id','sourceId','channel','publishedAt','messageUrl','split','text','provisional_label','provisional_reason','vp_review_hint','vp_review_reason','human_label','human_reason','human_evidence','reviewer'];
 const write=(name,data)=>fs.writeFileSync(path.join(actual,name),data,{flag:'wx',mode:0o600});
 for(const {name,rows} of groups){write(`review-${name}.jsonl`,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');write(`review-${name}.csv`,columns.map(cell).join(',')+'\n'+rows.map(r=>columns.map(k=>cell(r[k])).join(',')).join('\n')+'\n')}
 write('README.txt','Sensitive local review material. Do not commit or send automatically.\nOnly previously stored message URLs matching the workspace source and message ID are included. Null means unavailable or not verifiable. Links are not proof of reciprocal promotion.\nDev and holdout are separate; keep holdout blind until rules are frozen. The VP review hint is unvalidated and applies only to dev. Human review fields are blank.\nJSONL preserves original text; CSV neutralizes spreadsheet formulas.\n');
 console.log(JSON.stringify({total:groups.flatMap(g=>g.rows).length,withVerifiedStoredUrl:found,withoutVerifiedStoredUrl:groups.flatMap(g=>g.rows).length-found}));
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.name);process.exitCode=1});
module.exports={validUrl,stable,cell};
