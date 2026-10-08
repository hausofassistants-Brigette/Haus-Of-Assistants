import crypto from 'node:crypto';
const BASE='https://qitbfjlsebdkejsnzcap.supabase.co';
const ORIGIN='https://haus-of-assistants.vercel.app';
const CALLBACK=ORIGIN+'/api/google-calendar/callback';
const SCOPES='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const secret=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
async function sb(path,opts={}){const r=await fetch(BASE+'/rest/v1/'+path,{...opts,headers:{apikey:secret(),Authorization:'Bearer '+secret(),...(opts.body?{'Content-Type':'application/json'}:{}),...opts.headers}});const data=r.status===204?null:await r.json();if(!r.ok)throw Error(data?.message||data?.error||'Database request failed');return data;}
async function getAdmin(req){const jwt=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!jwt)throw Error('Authentication required');const r=await fetch(BASE+'/auth/v1/user',{headers:{apikey:secret(),Authorization:'Bearer '+jwt}});if(!r.ok)throw Error('Authentication required');const u=await r.json();const p=await sb('profiles?id=eq.'+encodeURIComponent(u.id)+'&select=role');if(p[0]?.role!=='admin')throw Error('Admin access required');return u.id;}
function sign(payload){const raw=Buffer.from(JSON.stringify(payload)).toString('base64url');return raw+'.'+crypto.createHmac('sha256',secret()).update(raw).digest('base64url');}
function verify(state){const [raw,mac]=String(state||'').split('.');if(!raw||!mac)throw Error('Invalid OAuth state');const expected=crypto.createHmac('sha256',secret()).update(raw).digest('base64url');if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw Error('Invalid OAuth state');const p=JSON.parse(Buffer.from(raw,'base64url').toString());if(Date.now()-p.time>600000||Date.now()<p.time)throw Error('Expired OAuth state');return p;}
async function token(params){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,...params})});const j=await r.json();if(!r.ok)throw Error(j.error_description||j.error||'Google authentication failed');return j;}
async function google(access,path,method='GET',body){const r=await fetch('https://www.googleapis.com/calendar/v3/'+path,{method,headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const j=r.status===204?{}:await r.json();if(!r.ok)throw Error(j.error?.message||'Google request failed');return j;}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
const action=Array.isArray(req.query.action)?req.query.action[0]:req.query.action;
if(action==='callback'){if(req.query.error)throw Error('Google access was declined');const state=verify(req.query.state);const p=await sb('profiles?id=eq.'+encodeURIComponent(state.uid)+'&select=role');if(p[0]?.role!=='admin')throw Error('Admin access required');const t=await token({code:String(req.query.code||''),redirect_uri:CALLBACK,grant_type:'authorization_code'});if(!t.refresh_token)throw Error('Google did not provide offline access. Revoke prior access and reconnect.');await sb('admin_google_calendar_tokens?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:state.uid,refresh_token:t.refresh_token,updated_at:new Date().toISOString()})});return res.redirect(302,ORIGIN+'/portal.html?calendar_connected=1');}
const uid=await getAdmin(req);
if(action==='connect'&&req.method==='POST'){const state=sign({uid,time:Date.now(),nonce:crypto.randomBytes(16).toString('hex')});const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');Object.entries({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:SCOPES,access_type:'offline',prompt:'consent',state}).forEach(([k,v])=>u.searchParams.set(k,v));return res.json({url:u.toString()});}
const records=await sb('admin_google_calendar_tokens?user_id=eq.'+encodeURIComponent(uid)+'&select=refresh_token,calendar_id');
if(action==='status')return res.json({connected:records.length>0});
if(action==='disconnect'&&req.method==='POST'){await sb('admin_google_calendar_tokens?user_id=eq.'+encodeURIComponent(uid),{method:'DELETE'});return res.json({ok:true});}
if(!records.length)return res.status(409).json({error:'Connect Google Calendar first'});
const access=(await token({refresh_token:records[0].refresh_token,grant_type:'refresh_token'})).access_token;
const base='calendars/'+encodeURIComponent(records[0].calendar_id||'primary')+'/events';
if(action==='list'&&req.method==='GET'){const start=String(req.query.start||'');const end=String(req.query.end||'');if(!start||!end)return res.status(400).json({error:'Date range required'});const q=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',orderBy:'startTime',maxResults:'250'});return res.json(await google(access,base+'?'+q));}
if(action==='create'&&req.method==='POST')return res.json(await google(access,base,'POST',req.body));
if(action==='update'&&req.method==='PUT')return res.json(await google(access,base+'/'+encodeURIComponent(String(req.query.id||'')),'PATCH',req.body));
if(action==='delete'&&req.method==='DELETE')return res.json(await google(access,base+'/'+encodeURIComponent(String(req.query.id||'')),'DELETE'));
return res.status(405).json({error:'Method not allowed'});
}catch(e){const status=/Authentication required|Admin access required/.test(e.message)?403:400;return res.status(status).json({error:e.message});}}
