import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function makePassword(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";const bytes=crypto.getRandomValues(new Uint8Array(14));let out="Hoa!";for(const b of bytes)out+=chars[b%chars.length];return out;}
serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return json({error:"SERVER_CONFIG_ERROR",details:"Supabase function environment variables are missing."},500);
 const auth=req.headers.get("Authorization"); if(!auth)return json({error:"UNAUTHENTICATED",details:"Please log in again."},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await userClient.auth.getUser(); if(userError||!user)return json({error:"UNAUTHENTICATED",details:userError?.message||"Your login session is invalid."},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:caller,error:callerError}=await admin.from("profiles").select("id,role").eq("id",user.id).single();
 if(callerError||caller?.role!=="admin")return json({error:"FORBIDDEN",details:"Administrator access is required."},403);
 let body:any; try{body=await req.json();}catch{return json({error:"INVALID_JSON",details:"The request body is not valid JSON."},400);}
 const email=String(body.email??"").trim().toLowerCase(),fullName=String(body.full_name??"").trim(),companyName=String(body.company_name??"").trim(),phone=String(body.phone??"").trim(),packageName=String(body.package_name??"Essential").trim(),hours=Number(body.hours_per_week??3);
 if(!email||!fullName)return json({error:"VALIDATION_ERROR",details:"Client name and email are required."},400);
 if(!Number.isFinite(hours)||hours<0)return json({error:"VALIDATION_ERROR",details:"Hours per week must be a valid non-negative number."},400);
 if(!["Essential","Professional","Premium"].includes(packageName))return json({error:"VALIDATION_ERROR",details:"Invalid package selected."},400);
 const {data:users,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
 if(!listError&&users?.users?.some(u=>u.email?.toLowerCase()===email))return json({error:"EMAIL_ALREADY_EXISTS",details:"A Supabase login already exists for this email address. Use a different email or manage the existing account."},409);
 const password=makePassword();
 const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName,company_name:companyName}});
 if(createError||!created.user)return json({error:"AUTH_CREATE_FAILED",details:createError?.message||"Supabase could not create the user.",status:createError?.status??null},createError?.status===422?409:400);
 const {data:profile,error:profileError}=await admin.from("profiles").insert({id:created.user.id,email,full_name:fullName,company_name:companyName,phone,role:"client",package_name:packageName,hours_per_week:hours,status:"Active"}).select("client_id").single();
 if(profileError||!profile){await admin.auth.admin.deleteUser(created.user.id);return json({error:"PROFILE_CREATE_FAILED",details:profileError?.message||"The client profile could not be saved. The partial account was removed.",code:profileError?.code??null,hint:profileError?.hint??null},400);}
 return json({success:true,user_id:created.user.id,client_id:profile.client_id,email,full_name:fullName,package_name:packageName,hours_per_week:hours,temp_password:password});
});
