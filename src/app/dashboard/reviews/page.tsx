import { revalidatePath, revalidateTag } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { applicationUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({searchParams}:{searchParams:Promise<{status?:string;stars?:string}>}){
  const{restaurantId}=await requireTenant();const query=await searchParams;
  const restaurant=await prisma.restaurant.findUniqueOrThrow({where:{id:restaurantId},select:{slug:true,locale:true}});
  const status=["PENDING","PUBLISHED","HIDDEN"].includes(query.status||"")?query.status as "PENDING"|"PUBLISHED"|"HIDDEN":undefined;
  const stars=Number(query.stars)||undefined,now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),week=new Date(now.getTime()-7*86400000),month=new Date(now.getFullYear(),now.getMonth(),1);
  const where={restaurantId,...(status?{status}:{}),...(stars?{overall:stars}:{})};
  const[reviews,aggregate,todayCount,weekCount,monthCount,statusCounts,scoreAverages]=await Promise.all([
    prisma.restaurantReview.findMany({where,orderBy:{createdAt:"desc"},take:50,select:{id:true,foodQuality:true,deliverySpeed:true,packaging:true,staffBehavior:true,overall:true,comment:true,status:true,customerName:true,isVerified:true,ownerReply:true,abuseReportedAt:true,createdAt:true,images:{select:{id:true,url:true}},order:{select:{orderNumber:true,customerName:true}}}}),
    prisma.restaurantReview.aggregate({where:{restaurantId},_avg:{overall:true},_count:{_all:true}}),
    prisma.restaurantReview.count({where:{restaurantId,createdAt:{gte:today}}}),
    prisma.restaurantReview.count({where:{restaurantId,createdAt:{gte:week}}}),
    prisma.restaurantReview.count({where:{restaurantId,createdAt:{gte:month}}}),
    prisma.restaurantReview.groupBy({by:["status"],where:{restaurantId},_count:{_all:true}}),
    prisma.restaurantReview.aggregate({where:{restaurantId},_avg:{foodQuality:true,deliverySpeed:true,packaging:true,staffBehavior:true}})
  ]);
  const ar=restaurant.locale==="ar",counts=new Map(statusCounts.map(item=>[item.status,item._count._all]));
  async function manage(form:FormData){"use server";const{restaurantId}=await requireTenant();const action=String(form.get("action")),id=String(form.get("id"));if(action==="reply"){const reply=String(form.get("reply")||"").trim().slice(0,1000);if(reply)await prisma.restaurantReview.updateMany({where:{id,restaurantId,ownerReply:null},data:{ownerReply:reply,repliedAt:new Date()}});}else if(action==="report")await prisma.restaurantReview.updateMany({where:{id,restaurantId},data:{abuseReportedAt:new Date(),status:"HIDDEN"}});else if(action==="PUBLISHED"||action==="HIDDEN")await prisma.restaurantReview.updateMany({where:{id,restaurantId},data:{status:action,publishedAt:action==="PUBLISHED"?new Date():null}});revalidatePath("/dashboard/reviews");revalidateTag("public-menu");}
  const reviewUrl=`${applicationUrl()}/r/${restaurant.slug}/review`;
  return <section className="dash-main review-dashboard">
    <header><div><h1>{ar?"التقييمات":"Reviews"}</h1><p>{ar?"إدارة آراء العملاء والرد عليها":"Manage customer feedback and public replies"}</p></div><Link className="button primary" href={reviewUrl}>{ar?"فتح رابط التقييم":"Open review link"}</Link></header>
    <div className="review-kpis">{[[ar?"المتوسط":"Average",(aggregate._avg.overall??0).toFixed(1)], [ar?"اليوم":"Today",todayCount],[ar?"هذا الأسبوع":"This week",weekCount],[ar?"هذا الشهر":"This month",monthCount],[ar?"قيد المراجعة":"Pending",counts.get("PENDING")||0],[ar?"منشور":"Published",counts.get("PUBLISHED")||0]].map(([label,value])=><article className="dash-card" key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}</div>
    <section className="dash-card review-score-summary"><h2>{ar?"متوسط التفاصيل":"Score averages"}</h2><p>{ar?"الطعام":"Food"}: {(scoreAverages._avg.foodQuality??0).toFixed(1)} · {ar?"التوصيل":"Delivery"}: {(scoreAverages._avg.deliverySpeed??0).toFixed(1)} · {ar?"التغليف":"Packaging"}: {(scoreAverages._avg.packaging??0).toFixed(1)} · {ar?"الموظفون":"Staff"}: {(scoreAverages._avg.staffBehavior??0).toFixed(1)}</p></section>
    <form className="management-toolbar"><select name="status" defaultValue={status||""}><option value="">{ar?"كل الحالات":"All statuses"}</option><option value="PENDING">{ar?"قيد المراجعة":"Pending"}</option><option value="PUBLISHED">{ar?"منشور":"Published"}</option><option value="HIDDEN">{ar?"مخفي":"Hidden"}</option></select><select name="stars" defaultValue={stars||""}><option value="">{ar?"كل النجوم":"All ratings"}</option>{[5,4,3,2,1].map(x=><option value={x} key={x}>{x} ★</option>)}</select><button className="button ghost">{ar?"تصفية":"Filter"}</button></form>
    <div className="review-list">{reviews.map(review=><article className="dash-card" key={review.id}><header><div><b>{review.customerName||review.order?.customerName||(ar?"مجهول":"Anonymous")}</b><small>{review.order?.orderNumber|| (ar?"تقييم عام":"Public review")} {review.isVerified&&" · ✓ Verified"}</small></div><strong>{"★".repeat(review.overall)}</strong></header><p>{review.comment||"—"}</p><small>{ar?"الطعام":"Food"}: {review.foodQuality} · {ar?"التوصيل":"Delivery"}: {review.deliverySpeed} · {ar?"التغليف":"Packaging"}: {review.packaging} · {ar?"الموظفون":"Staff"}: {review.staffBehavior}</small>{review.ownerReply&&<blockquote><b>{ar?"رد المطعم":"Restaurant reply"}</b>{review.ownerReply}</blockquote>}<form action={manage} className="review-actions"><input type="hidden" name="id" value={review.id}/><button name="action" value="PUBLISHED">{ar?"نشر":"Publish"}</button><button name="action" value="HIDDEN">{ar?"إخفاء":"Hide"}</button><button name="action" value="report">{ar?"إبلاغ":"Report"}</button>{!review.ownerReply&&<><input name="reply" maxLength={1000} placeholder={ar?"رد علني واحد":"One public reply"}/><button name="action" value="reply">{ar?"رد":"Reply"}</button></>}</form></article>)}</div>
  </section>;
}
