const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

type DevelopmentDatabaseEnvironment = Partial<Record<
  | "NODE_ENV"
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "LOCAL_DATABASE_PROJECT_REF"
  | "PRODUCTION_DATABASE_PROJECT_REF",
  string
>>;

function projectRefFromPostgresUrl(value: string, variable: "DATABASE_URL" | "DIRECT_URL") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`LOCAL_DATABASE_TARGET_REJECTED: ${variable} is not a valid URL`);
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error(`LOCAL_DATABASE_TARGET_REJECTED: ${variable} must use PostgreSQL`);

  const usernameMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]{20})$/);
  const directHostMatch = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  const ref = usernameMatch?.[1] ?? directHostMatch?.[1];
  if (!ref)
    throw new Error(`LOCAL_DATABASE_TARGET_REJECTED: ${variable} does not identify a Supabase project`);
  return ref;
}

function projectRefFromSupabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (url.protocol !== "https:" || !match)
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: NEXT_PUBLIC_SUPABASE_URL does not identify a Supabase project");
  return match[1];
}

export function assertAuthorizedDevelopmentDatabaseTarget(
  environment: DevelopmentDatabaseEnvironment = process.env,
) {
  if (environment.NODE_ENV !== "development") return;

  const authorizedLocal = environment.LOCAL_DATABASE_PROJECT_REF?.trim();
  const production = environment.PRODUCTION_DATABASE_PROJECT_REF?.trim();
  if (!authorizedLocal || !PROJECT_REF_PATTERN.test(authorizedLocal))
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: LOCAL_DATABASE_PROJECT_REF is required");
  if (!production || !PROJECT_REF_PATTERN.test(production))
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: PRODUCTION_DATABASE_PROJECT_REF is required");
  if (authorizedLocal === production)
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: the authorized local project cannot be Production");

  const databaseUrl = environment.DATABASE_URL;
  const directUrl = environment.DIRECT_URL;
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  if (!databaseUrl || !directUrl || !supabaseUrl)
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: local database and Supabase URLs are required");

  const targets = [
    projectRefFromPostgresUrl(databaseUrl, "DATABASE_URL"),
    projectRefFromPostgresUrl(directUrl, "DIRECT_URL"),
    projectRefFromSupabaseUrl(supabaseUrl),
  ];
  if (targets.some((target) => target === production))
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: a local target resolves to Production");
  if (targets.some((target) => target !== authorizedLocal))
    throw new Error("LOCAL_DATABASE_TARGET_REJECTED: local targets do not match the authorized project");
}
