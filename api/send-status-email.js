const BASE="https://qitbfjlsebdkejsnzcap.supabase.co";
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEAD=()=>({apikey:key(),Authorization:"Bearer "+key()});
async function db(path,options={}){const r=await fetch(BASE+"/rest/v1/"+path,{...options,headers:{...HEAD(),...(options.headers||{})}});if(!r.ok)throw Error("Database request failed ("+r.status+")");return r.status===204?null:r.json();}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!key()||!process.env.RESEND_API_KEY)return res.status(503).json({error:"Email configuration incomplete"});
 const token=(req.headers.authorization||"").replace(/^Bearer /i,"");
 if(!token)return res.status(401).json({error:"Please log in"});
 try{
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{...HEAD(),Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Please log in again"});
  const user=await auth.json();
  const admins=await db("profiles?id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=id");
  if(!admins?.length)return res.status(403).json({error:"Admin access required"});
  const id=String(req.body?.invoiceId||"");
  if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:"Invalid invoice"});
  const invoices=await db("invoices?id=eq."+encodeURIComponent(id)+"&select=id,client_id,invoice_number,amount,amount_paid,due_date,status,pdf_path");
  const inv=invoices?.[0];if(!inv)return res.status(404).json({error:"Invoice not found"});
  if(inv.status==="Draft")return res.status(400).json({error:"Draft invoices cannot be emailed"});
  const kind=inv.status==="Paid"?"paid":inv.status==="Overdue"?"overdue":inv.status==="Partially Paid"?"partial":"initial";
  const profiles=await db("profiles?id=eq."+encodeURIComponent(inv.client_id)+"&select=email,full_name");
  const person=profiles?.[0];if(!person?.email)return res.status(400).json({error:"Client email is missing"});
  const name=String(person.full_name||"").trim().split(/\s+/)[0]||"there";
  const amount=Number(inv.amount).toLocaleString("en-AU",{style:"currency",currency:"AUD"});
  const paid=Number(inv.amount_paid||0).toLocaleString("en-AU",{style:"currency",currency:"AUD"});
  const remaining=Math.max(0,Number(inv.amount)-Number(inv.amount_paid||0)).toLocaleString("en-AU",{style:"currency",currency:"AUD"});
  const due=inv.due_date?new Date(inv.due_date+"T00:00:00+10:00").toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"}):"the date shown on the invoice";
  const subject=kind==="partial"?"Partial Payment Received | Invoice "+inv.invoice_number+" | Haus of Assistants":kind==="paid"?"Payment Received | Haus of Assistants":kind==="overdue"?"Friendly reminder: Invoice "+inv.invoice_number+" is overdue":"Your invoice "+inv.invoice_number+" | Haus of Assistants";
  const body=kind==="partial"?`Hi ${name},\n\nThank you for your recent payment towards invoice ${inv.invoice_number}. I have received your payment and updated your invoice accordingly.\n\nInvoice total: ${amount}\nPayment received so far: ${paid}\nRemaining balance: ${remaining}\n\nThe remaining balance is still outstanding and can be paid using your usual payment details.\n\nThank you again for your payment and for choosing Haus of Assistants!\n\nKind regards,\nBrigette Slattery\nHaus of Assistants`:kind==="paid"?`Hi ${name},\n\nJust a quick email to confirm that payment of ${amount} for invoice ${inv.invoice_number} has been received.\n\nThank you so much for your payment and for trusting Haus of Assistants with your business support.\n\nIf you have any questions, please don't hesitate to reach out.\n\nKind regards,\nBrigette Slattery\nHaus of Assistants`:kind==="overdue"?`Hi ${name},\n\nJust a friendly reminder that invoice ${inv.invoice_number} for ${amount} was due on ${due}.\n\nI've attached another copy for your convenience. If you've already made payment, please disregard this reminder.\n\nIf you have any questions, please don't hesitate to reach out.\n\nKind regards,\nBrigette Slattery\nHaus of Assistants`:`Hi ${name},\n\nI hope you're well!\n\nPlease find attached invoice ${inv.invoice_number} for ${amount}, due ${due}.\n\nIf you have any questions, please don't hesitate to contact me via message or email.\n\nThank you for trusting Haus of Assistants with your business support.\n\nHaus of Assistants\nBrigette Slattery`;
  if(kind!=="paid"&&kind!=="partial"&&!inv.pdf_path)return res.status(400).json({error:"An attached invoice PDF is required"});
  let attachment=[];
  if(kind!=="paid"&&kind!=="partial"){
   const storage=await fetch(BASE+"/storage/v1/object/client-files/"+inv.pdf_path.split("/").map(encodeURIComponent).join("/"),{headers:HEAD()});
   if(!storage.ok)return res.status(400).json({error:"Could not retrieve the invoice PDF"});
   const bytes=Buffer.from(await storage.arrayBuffer());if(bytes.length>10*1024*1024)return res.status(400).json({error:"Invoice PDF is too large"});
   attachment=[{filename:"Invoice-"+inv.invoice_number.replace(/[^a-zA-Z0-9_-]/g,"-")+".pdf",content:bytes.toString("base64")}];
  }
  const log=await db("invoice_manual_email_log",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({invoice_id:id,kind,status:"sending"})});
  const entry=log?.[0];if(!entry)throw Error("Could not create email log");
  try{
   const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"hoa-manual-"+entry.id},body:JSON.stringify({from:"Haus of Assistants <notifications@hausofassistants.com.au>",to:[person.email],reply_to:"hausofassistants@gmail.com",subject,text:body,...(attachment.length?{attachments:attachment}:{})})});
   const result=await sent.json();if(!sent.ok)throw Error("Email provider rejected the request ("+sent.status+")");
   await db("invoice_manual_email_log?id=eq."+entry.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"sent",provider_id:result.id,sent_at:new Date().toISOString()})});
   return res.status(200).json({sent:true,kind,invoice:inv.invoice_number});
  }catch(e){await db("invoice_manual_email_log?id=eq."+entry.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"failed",error:String(e.message).slice(0,300)})}).catch(()=>{});throw e}
 }catch(e){return res.status(400).json({error:e.message||"Could not send email"})}
}