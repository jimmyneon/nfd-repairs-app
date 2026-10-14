import { NextRequest,NextResponse } from 'next/server'
import { createServiceClient,sendSms } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit,getClientIP } from '@/lib/rate-limit'
import { checked,siteBase } from '@/lib/repair-journey'
export async function OPTIONS(req:NextRequest){return new NextResponse(null,{headers:corsHeaders(req)})}
export async function POST(req:NextRequest){const headers=corsHeaders(req);if(!(await checkRateLimit(getClientIP(req),'fund-recover',3)).allowed)return NextResponse.json({error:'Too many requests'},{status:429,headers});const body=await req.json().catch(()=>({})),email=String(body.customer_email || '').trim(),phone=String(body.customer_phone || '').trim();try{if((email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(phone&&/^(07|\+447)\d{9}$/.test(phone))){const db=createServiceClient();const funds:any[]=await checked(db.from('repair_funds').select('fund_token').eq(email?'customer_email':'customer_phone',email||phone).in('status',['open','funded','redeemed']).limit(3));for(const f of funds){const url=siteBase()+'/repair-fund/?token='+encodeURIComponent(f.fund_token);if(email)await sendEmail(email,'Your repair savings link',`<p><a href="${url}">Open your savings</a></p>`,url);else await sendSms(phone,'Your NFD repair savings link: '+url)}}}catch{}return NextResponse.json({ok:true,message:'If we have savings for those details, we will send your personal link.'},{headers})}
