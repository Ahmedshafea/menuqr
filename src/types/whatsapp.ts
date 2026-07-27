export type WhatsAppLanguage = "ar" | "en" | (string & {});

export type CustomerNotificationType =
  | "order_received" | "order_accepted" | "order_preparing" | "order_ready"
  | "order_out_for_delivery" | "order_delivered" | "order_cancelled"
  | "payment_successful" | "payment_failed";

export type RestaurantNotificationType =
  | "new_order" | "order_cancelled" | "customer_paid" | "subscription_expiring"
  | "subscription_expired" | "new_customer_message";

export type WhatsAppNotificationType = CustomerNotificationType | RestaurantNotificationType;

export type TemplateVariable = string | number;

export interface SendTemplateInput {
  to: string;
  templateName: string;
  variables?: TemplateVariable[];
  language?: WhatsAppLanguage;
  components?: WhatsAppTemplateComponent[];
  notificationType?: WhatsAppNotificationType | "otp";
}

export interface WhatsAppTemplateComponent {
  type: "body" | "header" | "button";
  sub_type?: "url" | "quick_reply" | "copy_code";
  index?: string;
  parameters: Array<{ type: "text"; text: string }>;
}

export interface WhatsAppApiResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        messages?: Array<{ id: string; type?: string; timestamp?: string }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed" | "deleted";
          timestamp?: string;
          errors?: Array<{ code?: number; title?: string }>;
        }>;
        event?: string;
        message_template_id?: string;
        message_template_name?: string;
        message_template_status?: string;
      };
    }>;
  }>;
}

