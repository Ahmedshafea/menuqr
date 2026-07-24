type Hours = { dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean };

export function cairoDayAndTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const weekday = parts.find(part => part.type === "weekday")?.value;
  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { day: dayMap[weekday ?? "Mon"] ?? 0, time: `${parts.find(part => part.type === "hour")?.value ?? "00"}:${parts.find(part => part.type === "minute")?.value ?? "00"}` };
}

export function isRestaurantOpen(hours: Hours[], date = new Date()) {
  const current = cairoDayAndTime(date); const today = hours.find(item => item.dayOfWeek === current.day);
  if (!today || today.isClosed || !today.opensAt || !today.closesAt) return false;
  if (today.opensAt <= today.closesAt) return current.time >= today.opensAt && current.time < today.closesAt;
  return current.time >= today.opensAt || current.time < today.closesAt;
}

export function minutesUntilClosing(hours: Hours[], date = new Date()) {
  const current = cairoDayAndTime(date);
  const today = hours.find((item) => item.dayOfWeek === current.day);
  if (!today || today.isClosed || !today.opensAt || !today.closesAt || !isRestaurantOpen(hours, date))
    return null;
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const now = toMinutes(current.time);
  let close = toMinutes(today.closesAt);
  if (close <= toMinutes(today.opensAt) && now >= toMinutes(today.opensAt)) close += 24 * 60;
  return close - now;
}
