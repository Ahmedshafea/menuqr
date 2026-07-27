import "server-only";
import { normalizePdfMenu, type PdfMenuImport } from "@/lib/pdf-menu-import";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const responseSchema = {
  type: "OBJECT",
  required: ["categories"],
  properties: {
    categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["name", "items"],
        properties: {
          name: { type: "STRING" },
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["name", "description", "price", "currency", "image"],
              properties: {
                name: { type: "STRING" },
                description: { type: "STRING" },
                price: { type: "NUMBER" },
                currency: { type: "STRING" },
                image: { type: "STRING", nullable: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

const prompt = `Extract the restaurant menu from this PDF.
Return only data matching the supplied JSON schema.
Rules:
- Detect categories, product names, descriptions, prices, and currency.
- Preserve the language and spelling found in the menu.
- Ignore page numbers, headers, footers, contact details, and decorative text.
- Merge duplicated categories.
- Do not invent missing items, descriptions, prices, currencies, or image URLs.
- Use an empty string for a missing description or currency and null for a missing image.
- A visible price must be returned as a number without currency symbols.
- Preserve the visual category and product order.`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; message?: string; status?: string };
};

export async function extractMenuFromPdf(pdf: Uint8Array): Promise<PdfMenuImport> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("GEMINI_TIMEOUT");
    throw error;
  });
  const result = await response.json().catch(() => null) as GeminiResponse | null;
  if (response.status === 429) {
    const message = result?.error?.message?.toLowerCase() ?? "";
    if (message.includes("prepayment credits are depleted"))
      throw new Error("GEMINI_PREPAY_DEPLETED");
    throw new Error("GEMINI_QUOTA_EXCEEDED");
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      level: "error",
      context: "gemini-menu-import",
      event: "generate_content_failed",
      model: MODEL,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      googleErrorCode: result?.error?.code,
      googleErrorStatus: result?.error?.status,
      googleErrorMessage: result?.error?.message || response.statusText || "Unknown Gemini API error",
      timestamp: new Date().toISOString(),
    }));
    throw new Error("GEMINI_FAILED");
  }
  const text = result?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("EMPTY_AI_RESPONSE");
  try {
    return normalizePdfMenu(JSON.parse(text));
  } catch {
    throw new Error("INVALID_AI_RESPONSE");
  }
}
