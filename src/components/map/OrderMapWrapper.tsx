"use client";
import nextDynamic from "next/dynamic";
const LocationPicker = nextDynamic(() => import("@/components/map/LocationPicker"), { ssr: false, loading: () => <div className="location-map-loading" /> });
export default function OrderMapWrapper({lat,lng,readOnly=true}:{lat:number;lng:number;readOnly?:boolean}) { return <LocationPicker initialLat={lat} initialLng={lng} readOnly={readOnly} showGoogleLink />; }