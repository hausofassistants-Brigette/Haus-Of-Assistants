const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
const FROM="Haus of Assistants <notifications@hausofassistants.com.au>";
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers=()=>({apikey:key(),Authorization:"Bearer "+key()});
async function db(path,options={}){const r=await fetch(BASE+"/rest/v1/"+path,{...options,headers:{...headers(),...(options.headers||{})}});if(!r.ok)throw Error("Database request failed ("+r.status+")");return r.status===204?null:r.json();}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!key()||!process.env.RESEND_API_KEY)return res.status(503).json({error:"Email configuration incomplete"});
 const token=(req.headers.authorization||"").replace(/^Bearer /i,"");
 if(!token)return res.status(401).json({error:"Please log in"});
 try{
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{apikey:key(),Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Please log in again"});
  const user=await auth.json();
  const admins=await db("profiles?id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=id");
  if(!admins?.length)return res.status(403).json({error:"Admin access required"});
  const id=String(req.body?.invoiceId||"");
  if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:"Invalid invoice"});
  // Only a new transition into Paid can generate a confirmation.
  const updated=await db("invoices?id=eq."+encodeURIComponent(id)+"&status=neq.Paid&select=id,client_id,invoice_number,amount",{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({status:"Paid"})});
  if(!updated?.length)return res.status(200).json({paid:true,alreadyPaid:true,emailSent:false});
  const inv=updated[0];
  let reservation;
  try{
   const p=await db("profiles?id=eq."+encodeURIComponent(inv.client_id)+"&select=email,full_name");
   const person=p?.[0];if(!person?.email)throw Error("Client email is missing");
   const prior=await db("invoice_email_deliveries?invoice_id=eq."+encodeURIComponent(id)+"&kind=eq.paid&select=id");
   if(prior?.length)return res.status(200).json({paid:true,alreadySent:true,emailSent:false});
   const rows=await db("invoice_email_deliveries",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({invoice_id:id,kind:"paid",status:"sending"})});
   reservation=rows?.[0];if(!reservation)throw Error("Unable to queue confirmation");
   const name=String(person.full_name||"").trim().split(/\\s+/)[0]||"there";
   const amount=Number(inv.amount).toLocaleString("en-AU",{style:"currency",currency:"AUD"});
   const body=`Hi ${name},\n\nJust a quick email to confirm that payment of ${amount} for invoice ${inv.invoice_number} has been received.\n\nThank you so much for your payment and for trusting Haus of Assistants with your business support.\n\nIf you have any questions, please don't hesitate to reach out.\n\nKind regards,\nBrigette Slattery\nHaus of Assistants`;
   const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"hoa-paid-"+id},body:JSON.stringify({from:FROM,to:[person.email],reply_to:"hausofassistants@gmail.com",subject:"Payment Received | Haus of Assistants",text:body})});
   const result=await sent.json();if(!sent.ok)throw Error("Email provider rejected the request ("+sent.status+")");
   await db("invoice_email_deliveries?id=eq."+reservation.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"sent",provider_id:result.id,sent_at:new Date().toISOString()})});
   return res.status(200).json({paid:true,emailSent:true});
  }catch(e){
   if(reservation)await db("invoice_email_deliveries?id=eq."+reservation.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"failed",error:String(e.message).slice(0,300)})}).catch(()=>{});
   return res.status(200).json({paid:true,emailSent:false,warning:"Invoice marked Paid, but the confirmation email could not be sent: "+e.message});
  }
 }catch(e){return res.status(400).json({error:e.message||"Unable to update invoice"});}
}