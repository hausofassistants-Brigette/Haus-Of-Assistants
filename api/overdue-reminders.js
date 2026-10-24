// Staged for later activation. No scheduled job is configured on preview.
import { deliver } from "./send-invoice.js";
const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.CRON_SECRET||req.headers.authorization!=="Bearer "+process.env.CRON_SECRET)return res.status(401).json({error:"Unauthorised"});
 if(!process.env.RESEND_API_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Email not configured"});
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const yesterday=new Date(today+"T00:00:00+10:00");yesterday.setUTCDate(yesterday.getUTCDate()-1);
 const cutoff=yesterday.toISOString().slice(0,10);
 const q="invoices?select=id,invoice_number&status=in.(Outstanding,Overdue)&due_date=lte."+cutoff+"&limit=100";
 try{
  const r=await fetch(BASE+"/rest/v1/"+q,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY}});
  if(!r.ok)throw Error("Unable to load overdue invoices");
  const rows=await r.json();if(req.query?.dryRun==="true")return res.status(200).json({dryRun:true,eligible:rows.length,cutoff,emailsSent:0});const results=[];
  for(const i of rows){try{await deliver(i.id,"overdue");results.push({invoice:i.invoice_number,result:"sent"})}catch(e){results.push({invoice:i.invoice_number,result:"skipped_or_failed"})}}
  return res.status(200).json({checked:rows.length,sent:results.filter(x=>x.result==="sent").length});
 }catch(e){return res.status(500).json({error:"Overdue check failed"});}
}
