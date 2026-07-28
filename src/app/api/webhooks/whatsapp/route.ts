// Meta-compatible public alias. Keep the original `/api/whatsapp/webhook`
// endpoint working for existing environments while accepting the conventional
// `/api/webhooks/whatsapp` callback configured in Meta Business Manager.
export const runtime = "nodejs";
export { GET, POST } from "@/app/api/whatsapp/webhook/route";
