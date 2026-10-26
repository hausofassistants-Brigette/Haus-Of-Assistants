// Preview-only invoice email endpoint. RESEND_API_KEY and SUPABASE_SERVICE_ROLE_KEY remain server-side.
const BASE = "https://qitbfjlsebdkejsnzcap.supabase.co";
const FROM = "Haus of Assistants <notifications@hausofassistants.com.au>";
const HEAD = () => ({apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY});
async function db(path,options={}) {const r=await fetch(BASE+"/rest/v1/"+path,{...options,headers:{...HEAD(),...(options.headers||{})}});if(!r.ok)throw Error("Database request failed ("+r.status+")");return r.status===204?null:r.json();}
export async function deliver(invoiceId,kind) {
 const rows=await db("invoices?id=eq."+encodeURIComponent(invoiceId)+"&select=id,client_id,invoice_number,amount,due_date,status,pdf_path,pdf_url");
 const inv=rows?.[0];if(!inv)throw Error("Invoice not found");
 if(inv.status==="Paid"||inv.status==="Draft")throw Error("This invoice cannot be emailed");
 if(kind==="overdue" && (!inv.due_date||inv.due_date>=new Date().toLocaleDateString("en-CA",{timeZone:"Australia/Brisbane"})))throw Error("Invoice is not overdue");
 const p=await db("profiles?id=eq."+encodeURIComponent(inv.client_id)+"&select=email,full_name");
 const person=p?.[0];if(!person?.email)throw Error("Client email is missing");
 if(!inv.pdf_path)throw Error("A stored invoice PDF is required to send this email");
 // The unique constraint prevents repeat emails, including repeat cron executions.
 const prior=await db("invoice_email_deliveries?invoice_id=eq."+encodeURIComponent(inv.id)+"&kind=eq."+kind+"&select=id,status");
 if(prior?.length)throw Error("This invoice email has already been queued or sent");
 const reserved=await db("invoice_email_deliveries",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({invoice_id:inv.id,kind,status:"sending"})});
 const reservation=reserved?.[0];if(!reservation)throw Error("Could not reserve email");
 try {
  const storage=await fetch(BASE+"/storage/v1/object/client-files/"+inv.pdf_path.split("/").map(encodeURIComponent).join("/"),{headers:HEAD()});
  if(!storage.ok)throw Error("Unable to retrieve the invoice PDF");
  const bytes=Buffer.from(await storage.arrayBuffer());if(bytes.length>10*1024*1024)throw Error("Invoice PDF is too large");
  const name=String(person.full_name||"").trim().split(/\\s+/)[0]||"there";
  const amount=Number(inv.amount).toLocaleString("en-AU",{style:"currency",currency:"AUD"});
  const due=inv.due_date?new Date(inv.due_date+"T00:00:00+10:00").toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"}):"the due date shown on the invoice";
  const overdue=kind==="overdue";
  const subject=overdue?"Friendly reminder: Invoice "+inv.invoice_number+" is overdue":"Your invoice "+inv.invoice_number+" | Haus of Assistants";
  const body=overdue?`Hi ${name},\n\nJust a friendly reminder that invoice ${inv.invoice_number} for ${amount} was due on ${due}.\n\nI've attached another copy for your convenience. If you've already made payment, please disregard this reminder.\n\nThanks so much!\nHaus of Assistants`:`Hi ${name},\n\nI hope you're well! Please find attached invoice ${inv.invoice_number} for ${amount}, due ${due}.\n\nIf you have any questions, please don't hesitate to contact me via message or email.\n\nThank you for trusting Haus of Assistants with your business support.\n\nHaus of Assistants\nBrigette Slattery`;
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"hoa-"+kind+"-"+inv.id},body:JSON.stringify({from:FROM,to:[person.email],reply_to:"hausofassistants@gmail.com",subject,text:body,attachments:[{filename:"Invoice-"+inv.invoice_number.replace(/[^a-zA-Z0-9_-]/g,"-")+".pdf",content:bytes.toString("base64")} ]})});
  const result=await sent.json();if(!sent.ok)throw Error("Email provider rejected the request ("+sent.status+")");
  await db("invoice_email_deliveries?id=eq."+reservation.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"sent",provider_id:result.id,sent_at:new Date().toISOString()})});
  return {sent:true,invoice:inv.invoice_number};
 }catch(e){await db("invoice_email_deliveries?id=eq."+reservation.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"failed",error:String(e.message).slice(0,300)})}).catch(()=>{});throw e;}
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.RESEND_API_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Email configuration incomplete"});
 const token=(req.headers.authorization||"").replace(/^Bearer /i,"");
 if(!token)return res.status(401).json({error:"Please log in"});
 try{
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Please log in again"});
  const user=await auth.json();
  const admins=await db("profiles?id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=id");
  if(!admins?.length)return res.status(403).json({error:"Admin access required"});
  const id=req.body?.invoiceId;
  if(!/^[a-f0-9-]{36}$/i.test(String(id||"")))return res.status(400).json({error:"Invalid invoice"});
  return res.status(200).json(await deliver(id,"initial"));
 }catch(e){return res.status(400).json({error:e.message||"Could not send invoice"});}
}
