import { deliver } from "./send-invoice.js";
const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.authorization!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized"});
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.RESEND_API_KEY)return res.status(503).json({error:"Email service not configured"});
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 const [y,m,d]=today.split("-").map(Number);
 const yesterday=new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const query=new URLSearchParams({due_date:"eq."+yesterday,status:"in.(Outstanding,Overdue,Partially Paid)",select:"id,amount,amount_paid"});
  const response=await fetch(BASE+"/rest/v1/invoices?"+query,{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!response.ok)throw Error("Could not retrieve invoices ("+response.status+")");
  const rows=await response.json();let sent=0,skipped=0,failed=0;
  for(const invoice of rows){
   if(Number(invoice.amount_paid||0)>=Number(invoice.amount)){skipped++;continue}
   try{await deliver(invoice.id,"overdue");sent++}
   catch(error){if(/already been queued or sent/.test(String(error.message))){skipped++;continue}failed++;console.error("Overdue email failed for invoice",invoice.id,error.message)}
  }
  return res.status(failed?207:200).json({date:today,checked:rows.length,sent,skipped,failed});
 }catch(error){console.error("Overdue cron error",error);return res.status(500).json({error:"Overdue reminder run failed"})}
}