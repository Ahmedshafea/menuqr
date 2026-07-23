import { requestIp } from "@/lib/rate-limit";

export async function verifyTurnstile(request: Request, token: unknown) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is missing");
    return false;
  }

  if (typeof token !== "string") {
    console.error("Invalid token");
    return false;
  }

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);

  // لا ترسل remoteip مؤقتًا

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
    }
  );

  const result = await response.json();

  console.error("Turnstile:", result);

  return result.success === true;
}
