"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type Coordinates = { lat: number; lng: number };

interface LocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  latitudeName?: string;
  longitudeName?: string;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
  autoLocate?: boolean;
  showGoogleLink?: boolean;
  onAddressResolved?: (address: string, details: {
    street?: string;
    district?: string;
    area?: string;
    city?: string;
    governorate?: string;
    country?: string;
    postalCode?: string;
  }) => void;
  onAddressError?: () => void;
}

const DEFAULT_LOCATION: Coordinates = { lat: 30.0444, lng: 31.2357 };

export default function LocationPicker({
  initialLat,
  initialLng,
  latitudeName,
  longitudeName,
  onChange,
  readOnly = false,
  autoLocate = false,
  showGoogleLink = false,
  onAddressResolved,
  onAddressError,
}: LocationPickerProps) {
  const t = useTranslations("maps");
  const locale = useLocale();
  const rawId = useId();
  const mapId = `location-map-${rawId.replace(/:/g, "")}`;
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onAddressErrorRef = useRef(onAddressError);
  const [position, setPosition] = useState<Coordinates | null>(() =>
    initialLat != null && initialLng != null
      ? { lat: Number(initialLat), lng: Number(initialLng) }
      : null,
  );
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAddressResolvedRef.current = onAddressResolved; }, [onAddressResolved]);
  useEffect(() => { onAddressErrorRef.current = onAddressError; }, [onAddressError]);

  const resolveAddress = useCallback(async (lat: number, lng: number) => {
    if (!onAddressResolvedRef.current) return;
    setResolving(true);
    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lng),
        addressdetails: "1",
        "accept-language": locale,
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("reverse_geocoding_failed");
      const result = await response.json() as {
        display_name?: string;
        address?: Record<string, string>;
      };
      if (!result.display_name) throw new Error("address_not_found");
      const address = result.address ?? {};
      onAddressResolvedRef.current(result.display_name, {
        street: address.road ?? address.pedestrian,
        district: address.city_district ?? address.district ?? address.county,
        area: address.suburb ?? address.neighbourhood ?? address.quarter,
        city: address.city ?? address.town ?? address.village ?? address.municipality,
        governorate: address.state,
        country: address.country,
        postalCode: address.postcode,
      });
    } catch {
      onAddressErrorRef.current?.();
    } finally {
      setResolving(false);
    }
  }, [locale]);

  const markerIcon = useCallback(() => L.divIcon({
    className: "menuqr-map-marker",
    html: "<span></span>",
    iconSize: [34, 44],
    iconAnchor: [17, 42],
  }), []);

  const applyPosition = useCallback((lat: number, lng: number, zoom = false) => {
    const next = { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
    setPosition(next);
    markerRef.current?.setLatLng(next);
    if (zoom) mapRef.current?.setView(next, 17, { animate: true });
    onChangeRef.current?.(next.lat, next.lng);
    void resolveAddress(next.lat, next.lng);
  }, [resolveAddress]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setMessage(t("unsupported")); return; }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const map = mapRef.current;
        if (!map) return;
        applyPosition(coords.latitude, coords.longitude, true);
        if (accuracyRef.current) accuracyRef.current.remove();
        accuracyRef.current = L.circle([coords.latitude, coords.longitude], {
          radius: Math.max(5, coords.accuracy), color: "#e9572b", weight: 1,
          fillColor: "#e9572b", fillOpacity: 0.12, interactive: false,
        }).addTo(map);
        setLocating(false);
      },
      () => { setMessage(t("permissionHelp")); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, [applyPosition, t]);

  useEffect(() => {
    const startingPosition =
      initialLat != null && initialLng != null
        ? { lat: Number(initialLat), lng: Number(initialLng) }
        : null;
    const center = startingPosition ?? DEFAULT_LOCATION;
    const map = L.map(mapId, { zoomControl: true, scrollWheelZoom: !readOnly }).setView(center, startingPosition ? 16 : 12);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const marker = L.marker(center, { icon: markerIcon(), draggable: !readOnly }).addTo(map);
    markerRef.current = marker;
    if (!startingPosition) marker.setOpacity(0);
    if (!readOnly) {
      marker.on("dragend", () => { const point = marker.getLatLng(); applyPosition(point.lat, point.lng); });
      map.on("click", ({ latlng }) => { marker.setOpacity(1); applyPosition(latlng.lat, latlng.lng, true); });
    }
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(map.getContainer());
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    if (autoLocate && !startingPosition && !readOnly) locate();
    return () => { window.clearTimeout(timer); resize.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null; accuracyRef.current = null; };
  }, [applyPosition, autoLocate, initialLat, initialLng, locate, mapId, markerIcon, readOnly]);

  useEffect(() => { if (position) markerRef.current?.setOpacity(1); }, [position]);

  const googleUrl = position ? `https://www.google.com/maps?q=${position.lat},${position.lng}` : null;
  return (
    <div className="location-picker">
      {latitudeName && <input type="hidden" name={latitudeName} value={position?.lat ?? ""} />}
      {longitudeName && <input type="hidden" name={longitudeName} value={position?.lng ?? ""} />}
      <div id={mapId} className="location-map" />
      <div className="location-map-actions">
        {!readOnly && <button type="button" className="button ghost" onClick={locate} disabled={locating}><LocateFixed />{locating ? t("locating") : t("useCurrent")}</button>}
        {position && <code dir="ltr">{position.lat.toFixed(6)}, {position.lng.toFixed(6)}</code>}
        {showGoogleLink && googleUrl && <a className="button ghost" href={googleUrl} target="_blank" rel="noreferrer">{t("openGoogle")}</a>}
      </div>
      {message && <p className="location-help">{message}</p>}
      {resolving && <small className="location-hint">{t("resolvingAddress")}</small>}
      {!readOnly && <small className="location-hint">{t("dragHint")}</small>}
    </div>
  );
}
