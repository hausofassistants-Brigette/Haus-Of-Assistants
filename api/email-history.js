const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Email history unavailable"});
 const token=(req.headers.authorization||"").replace(/^Bearer /i,"");
 if(!token)return res.status(401).json({error:"Please log in"});
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Please log in again"});
  const user=await auth.json();
  const admin=await fetch(BASE+"/rest/v1/profiles?id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=id",{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!admin.ok||(await admin.json()).length===0)return res.status(403).json({error:"Admin access required"});
  const h={apikey:key,Authorization:"Bearer "+key};
  const read=async(path)=>{const r=await fetch(BASE+"/rest/v1/"+path,{headers:h});if(!r.ok)throw Error("Unable to read email history ("+r.status+")");return r.json()};
  const [deliveries,manual,invoices,profiles]=await Promise.all([
   read("invoice_email_deliveries?select=invoice_id,kind,status,provider_id,sent_at,created_at,error&order=created_at.desc&limit=100"),
   read("invoice_manual_email_log?select=invoice_id,kind,status,provider_id,sent_at,created_at,error&order=created_at.desc&limit=100"),
   read("invoices?select=id,client_id,invoice_number"),
   read("profiles?select=id,client_id,full_name,email")
  ]);
  const byInvoice=new Map(invoices.map(i=>[i.id,i]));
  const emails=[...deliveries.map(d=>({...d,manual:false})),...manual.map(d=>({...d,manual:true}))].map(d=>{
   const inv=byInvoice.get(d.invoice_id);
   const person=profiles.find(p=>p.client_id===inv?.client_id||p.id===inv?.client_id);
   const type=d.kind==="paid"?"Payment confirmation":d.kind==="overdue"?"Overdue reminder":"Invoice sent";
   return {id:d.provider_id||d.invoice_id,to:person?.email||"—",subject:(inv?.invoice_number||"Invoice")+" · "+type+(d.manual?" (manual)":""),kind:d.kind,status:d.status,created_at:d.sent_at||d.created_at,client:person?.full_name||"—",invoice_number:inv?.invoice_number||"—",error:d.error||null};
  });
  emails.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return res.status(200).json({emails:emails.slice(0,100)});
 }catch(e){return res.status(502).json({error:e.message||"Unable to load email history"});}
}