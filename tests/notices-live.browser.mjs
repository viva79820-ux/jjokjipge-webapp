// 명시적으로 실행하는 실제 연동 검사. 생성한 UUID 자원만 추적·정리한다.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const probe = await db
  .from("notices")
  .select("id,title,image_path,updated_at")
  .limit(0);
if (probe.error) throw Error(`Public API precheck failed: ${probe.status}`);
console.log("PUBLIC_API_OK: notices known columns, limit=0");
const port = Number(process.env.NOTICES_LIVE_PORT || 4315),
  base = `http://127.0.0.1:${port}`;
const app = server(port);
let b,
  ready = false;
try {
  await until(async () => {
    try {
      return (await fetch(base + "/admin/login")).ok;
    } catch {
      return false;
    }
  }, "local server");
  b = await browser(true);
  await b.go(base + "/admin/notices/new");
  await b.evaluate(
    `globalThis.__noticeApi={url:${JSON.stringify(url)},key:${JSON.stringify(key)}}`,
  );
  const authCode = authCodePlaceholder();
  console.log(
    `LOGIN_READY: ${base}/admin/notices/new (administrator login once; 5 minute limit)`,
  );
  await until(
    () =>
      b.evaluate(
        `(async()=>{const token=${authCode};if(!token)return false;const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));const r=await fetch(__noticeApi.url+'/rest/v1/profiles?select=role&id=eq.'+claims.sub,{headers:{apikey:__noticeApi.key,Authorization:'Bearer '+token}});if(!r.ok)return false;const data=await r.json();return data[0]?.role==='admin';})()`,
      ),
    "administrator login",
    300000,
  );
  ready = true;
  const setup = `globalThis.__noticeRun={files:[],ids:[],results:[],run:crypto.randomUUID()};`;
  await b.evaluate(setup);
  const code = `(async()=>{
 const state=__noticeRun, config=__noticeApi;
 const token=()=>${authCode};
 const request=(path,options={},anon=false)=>fetch(config.url+path,{...options,headers:{apikey:config.key,...(!anon?{Authorization:'Bearer '+token()}:{}),...options.headers}});
 const check=(ok,label)=>{if(!ok)throw Error(label);state.results.push(label);};
 const canvas=document.createElement('canvas');canvas.width=800;canvas.height=800;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(800,800);crypto.getRandomValues(pixels.data.subarray(0,65536));for(let i=0;i<pixels.data.length;i+=65536)crypto.getRandomValues(pixels.data.subarray(i,Math.min(i+65536,pixels.data.length)));ctx.putImageData(pixels,0,0);const png=await new Promise(r=>canvas.toBlob(r,'image/png'));
 check(png.size>1048576&&png.size<=5242880,'generated image 1MB to 5MiB');
 const path=()=> 'notices/'+crypto.randomUUID()+'.png';
 const upload=async(file=png,type='image/png',anon=false)=>{const p=path();state.files.push(p);const r=await request('/storage/v1/object/public-images/'+p,{method:'POST',headers:{'Content-Type':type,'x-upsert':'false'},body:file},anon);return {p,r};};
 const info=p=>request('/storage/v1/object/info/public-images/'+p);
 const remove=async p=>{const r=await request('/storage/v1/object/public-images',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[p]})});check(r.ok,'administrator Storage remove response');check(!(await info(p)).ok,'Storage metadata confirms removed');};
 const first=await upload();check(first.r.ok,'administrator direct upload');check((await fetch(config.url+'/storage/v1/object/public/public-images/'+first.p)).ok,'public image URL');
 const id=crypto.randomUUID(),title='[자동검사] '+state.run;state.ids.push({id,title});
 let r=await request('/rest/v1/notices?select=id,updated_at',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({id,title,body:'개인정보 없는 자동 연동 검사',image_path:first.p,image_alt:'자동 생성 이미지',is_published:false})});check(r.ok,'DB attach insert');let row=(await r.json())[0];
 const second=await upload();check(second.r.ok,'replacement upload');r=await request('/rest/v1/notices?id=eq.'+id+'&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id,updated_at',{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({image_path:second.p})});check(r.ok,'DB replacement response');row=(await r.json())[0];check(!!row,'DB replacement CAS');await remove(first.p);
 r=await request('/rest/v1/notices?id=eq.'+id+'&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id,updated_at',{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({image_path:null,image_alt:null})});check(r.ok,'DB attachment removal');row=(await r.json())[0];check(!!row,'DB attachment removal CAS');await remove(second.p);
 const oversized=await upload(new Blob([new Uint8Array(5242881)],{type:'image/png'}));check(!oversized.r.ok,'direct API rejects over 5MiB');
 const wrong=await upload(png,'image/gif');check(!wrong.r.ok,'direct API rejects forbidden MIME');
 const anonymous=await upload(png,'image/png',true);check(!anonymous.r.ok,'anonymous upload rejected');
 const third=await upload();check(third.r.ok,'deletion test upload');
 r=await request('/rest/v1/notices?id=eq.'+id+'&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id,updated_at',{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({image_path:third.p,image_alt:'삭제 검사 이미지'})});check(r.ok,'DB deletion attachment');row=(await r.json())[0];check(!!row,'DB deletion attachment CAS');
 const deniedRemove=await request('/storage/v1/object/public-images',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[third.p]})},true);await deniedRemove.text();check((await info(third.p)).ok,'anonymous remove preserves metadata');
 r=await request('/rest/v1/notices?id=eq.'+id+'&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id',{method:'DELETE',headers:{Prefer:'return=representation'}});check(r.ok&&(await r.json()).length===1,'DB notice DELETE CAS');await remove(third.p);
 return state.results;
 })()`;
  const results = await b.evaluate(code);
  console.log(
    JSON.stringify({
      checks: results,
      ordinaryUser: "NOT_RUN: no ordinary member session",
    }),
  );
} finally {
  try {
    if (ready && b) {
      const result = await b.evaluate(
        `(async()=>{const s=__noticeRun,c=__noticeApi;const getToken=${authCodePlaceholder()};const headers={apikey:c.key,Authorization:'Bearer '+getToken,'Content-Type':'application/json'};let remaining=0;for(const n of s.ids){const r=await fetch(c.url+'/rest/v1/notices?id=eq.'+n.id+'&title=eq.'+encodeURIComponent(n.title),{method:'DELETE',headers});if(!r.ok)remaining++;}for(const p of s.files){const refs=await fetch(c.url+'/rest/v1/notices?select=id&image_path=eq.'+encodeURIComponent(p),{headers});if(!refs.ok||(await refs.json()).length){remaining++;continue;}const r=await fetch(c.url+'/storage/v1/object/public-images',{method:'DELETE',headers,body:JSON.stringify({prefixes:[p]})});if(!r.ok)remaining++;}return {remaining};})()`,
      );
      console.log("TEST_RESOURCE_CLEANUP " + JSON.stringify(result));
    }
  } catch {
    console.log("TEST_RESOURCE_CLEANUP_UNCONFIRMED");
  } finally {
    try {
      await b?.close();
    } finally {
      stop(app);
    }
  }
}
function authCodePlaceholder() {
  return `(()=>{try{const parts=document.cookie.split('; ').map(x=>x.split('='));const names=parts.filter(([k])=>k.startsWith("sb-")&&k.includes("-auth-token")).sort(([a],[b])=>a.localeCompare(b));let raw=decodeURIComponent(names.map(([,v])=>v).join(''));if(raw.startsWith('base64-'))raw=atob(raw.slice(7).replaceAll('-','+').replaceAll('_','/'));return JSON.parse(raw).access_token||'';}catch{return '';}})()`;
}
