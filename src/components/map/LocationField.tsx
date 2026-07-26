"use client";
import nextDynamic from "next/dynamic";
const LocationPicker = nextDynamic(() => import("@/components/map/LocationPicker"), { ssr: false, loading: () => <div className="location-map-loading" /> });
export default LocationPicker;