export async function verifyTurnstile(request: Request, token: unknown) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error(
      JSON.stringify({
        level: "error",
        context: "turnstile",
        message: "TURNSTILE_SECRET_KEY is missing",
      }),
    );
    return false;
  }
  if (typeof token !== "string" || !token) return false;

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) body.append("remoteip", forwarded);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
