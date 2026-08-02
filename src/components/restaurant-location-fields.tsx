"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LocationField from "@/components/map/LocationField";

type LocationValue = {
  address: string;
  governorate: string;
  city: string;
  district: string;
  area: string;
  street: string;
  postalCode: string;
};

export function RestaurantLocationFields({
  initial,
  latitude,
  longitude,
}: {
  initial: LocationValue;
  latitude: number | null;
  longitude: number | null;
}) {
  const t = useTranslations("branches");
  const maps = useTranslations("maps");
  const [value, setValue] = useState(initial);
  const set = (key: keyof LocationValue, next: string) =>
    setValue((current) => ({ ...current, [key]: next }));

  return (
    <div className="settings-grid structured-location-fields">
      <label className="full">
        {t("address")}
        <textarea
          name="address"
          required
          minLength={3}
          value={value.address}
          onChange={(event) => set("address", event.target.value)}
        />
      </label>
      <label>
        {t("governorate")}
        <input name="governorate" required value={value.governorate} onChange={(event) => set("governorate", event.target.value)} />
      </label>
      <label>
        {t("city")}
        <input name="city" required value={value.city} onChange={(event) => set("city", event.target.value)} />
      </label>
      <label>
        {t("district")}
        <input name="district" required value={value.district} onChange={(event) => set("district", event.target.value)} />
      </label>
      <label>
        {t("area")}
        <input name="area" required value={value.area} onChange={(event) => set("area", event.target.value)} />
      </label>
      <label>
        {t("street")}
        <input name="street" required value={value.street} onChange={(event) => set("street", event.target.value)} />
      </label>
      <label>
        {t("postalCode")}
        <input name="postalCode" value={value.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
      </label>
      <div className="full restaurant-location-field">
        <h3>{maps("title")}</h3>
        <LocationField
          initialLat={latitude}
          initialLng={longitude}
          latitudeName="latitude"
          longitudeName="longitude"
          autoLocate
          showGoogleLink
          onAddressResolved={(address, details) =>
            setValue((current) => ({
              address,
              governorate: details.governorate ?? current.governorate,
              city: details.city ?? current.city,
              district: details.district ?? current.district,
              area: details.area ?? current.area,
              street: details.street ?? current.street,
              postalCode: details.postalCode ?? current.postalCode,
            }))
          }
        />
      </div>
    </div>
  );
}
