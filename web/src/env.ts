import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Where the Express API lives. The browser never calls it directly — only
  // this app's route handlers do, server-side.
  API_BASE_URL: z.url(),
});

export type WebEnv = z.infer<typeof schema>;

export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid web environment:\n${issues}`);
  }

  return result.data;
}

export const webEnv = (): WebEnv => loadWebEnv(process.env);
