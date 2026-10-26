const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.RESEND_API_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Email history unavailable"});
 const token=(req.headers.authorization||"").replace(/^Bearer /i,"");
 if(!token)return res.status(401).json({error:"Please log in"});
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Please log in again"});
  const user=await auth.json();
  const admin=await fetch(BASE+"/rest/v1/profiles?id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=id",{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!admin.ok||(await admin.json()).length===0)return res.status(403).json({error:"Admin access required"});
  const response=await fetch("https://api.resend.com/emails?limit=100",{headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY}});
  if(!response.ok)throw Error("Unable to load email history ("+response.status+")");
  const data=await response.json();
  const rows=Array.isArray(data.data)?data.data:Array.isArray(data)?data:[];
  return res.status(200).json({emails:rows.map(x=>({id:x.id,to:x.to,subject:x.subject,status:x.last_event||x.status||"sent",created_at:x.created_at}))});
 }catch(e){return res.status(502).json({error:e.message||"Unable to load email history"});}
}