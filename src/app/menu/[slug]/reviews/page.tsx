import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const restaurant=await prisma.restaurant.findUnique({where:{slug:(await params).slug},select:{name:true,nameAr:true}});
  return restaurant?{title:`${restaurant.nameAr||restaurant.name} Reviews | MenuQR`}:{};
}

export default async function Reviews({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{sort?:string;images?:string;q?:string;page?:string}>}){
  const[{slug},query,locale]=await Promise.all([params,searchParams,getLocale()]);
  const page=Math.max(1,Number(query.page)||1),take=12;
  const restaurant=await prisma.restaurant.findUnique({where:{slug,isActive:true},select:{id:true,name:true,nameAr:true,logoUrl:true,settings:{select:{reviewsEnabled:true}}}});
  if(!restaurant?.settings?.reviewsEnabled)notFound();
  const where={restaurantId:restaurant.id,status:"PUBLISHED" as const,...(query.images==="1"?{images:{some:{}}}:{}),...(query.q?{comment:{contains:query.q,mode:"insensitive" as const}}:{})};
  const[reviews,aggregate,distribution,total]=await Promise.all([
    prisma.restaurantReview.findMany({where,orderBy:query.sort==="highest"?{overall:"desc"}:query.sort==="lowest"?{overall:"asc"}:{publishedAt:"desc"},skip:(page-1)*take,take,select:{id:true,overall:true,comment:true,customerName:true,isVerified:true,ownerReply:true,order:{select:{customerName:true}},images:{orderBy:{sortOrder:"asc"},select:{id:true,url:true}}}}),
    prisma.restaurantReview.aggregate({where:{restaurantId:restaurant.id,status:"PUBLISHED"},_avg:{overall:true},_count:{_all:true}}),
    prisma.restaurantReview.groupBy({by:["overall"],where:{restaurantId:restaurant.id,status:"PUBLISHED"},_count:{_all:true}}),
    prisma.restaurantReview.count({where})
  ]);
  const name=locale==="ar"&&restaurant.nameAr?restaurant.nameAr:restaurant.name,average=aggregate._avg.overall??0;
  const counts=new Map(distribution.map(item=>[item.overall,item._count._all]));
  const schema={"@context":"https://schema.org","@type":"Restaurant",name,...(aggregate._count._all?{aggregateRating:{"@type":"AggregateRating",ratingValue:average,reviewCount:aggregate._count._all}}:{})};
  return <main className="reviews-public-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}}/>
    <header><Link href={`/menu/${slug}`}>← {locale==="ar"?"العودة للقائمة":"Back to menu"}</Link>{restaurant.logoUrl&&<Image src={restaurant.logoUrl} width={72} height={72} alt=""/>}<h1>{name}</h1><strong>★ {average.toFixed(1)}</strong><p>{aggregate._count._all} {locale==="ar"?"تقييمات":"reviews"}</p></header>
    <section className="rating-distribution">{[5,4,3,2,1].map(value=><div key={value}><span>{"★".repeat(value)}</span><progress max={aggregate._count._all||1} value={counts.get(value)||0}/><b>{counts.get(value)||0}</b></div>)}</section>
    <form className="review-filters"><input name="q" defaultValue={query.q} placeholder={locale==="ar"?"ابحث في التقييمات":"Search reviews"}/><select name="sort" defaultValue={query.sort||"latest"}><option value="latest">{locale==="ar"?"الأحدث":"Latest"}</option><option value="highest">{locale==="ar"?"الأعلى":"Highest"}</option><option value="lowest">{locale==="ar"?"الأقل":"Lowest"}</option></select><label><input type="checkbox" name="images" value="1" defaultChecked={query.images==="1"}/>{locale==="ar"?"مع صور":"With images"}</label><button className="button ghost">{locale==="ar"?"تطبيق":"Apply"}</button></form>
    <section className="public-review-grid">{reviews.map(review=><article key={review.id}><header><b>{"★".repeat(review.overall)}</b>{review.isVerified&&<span>✓ {locale==="ar"?"عميل موثّق":"Verified customer"}</span>}</header><p>{review.comment||"—"}</p><small>{review.customerName||review.order?.customerName||(locale==="ar"?"عميل":"Customer")}</small>{review.images.length>0&&<div>{review.images.map(image=><Image key={image.id} src={image.url} alt="" width={180} height={180}/>)}</div>}{review.ownerReply&&<blockquote><b>{locale==="ar"?"رد المطعم":"Restaurant reply"}</b>{review.ownerReply}</blockquote>}</article>)}</section>
    <nav className="pagination">{page>1&&<Link href={`?page=${page-1}`}>{locale==="ar"?"السابق":"Previous"}</Link>}{page*take<total&&<Link href={`?page=${page+1}`}>{locale==="ar"?"التالي":"Next"}</Link>}</nav>
  </main>;
}
