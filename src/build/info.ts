import { z } from "zod";

export const buildInfoSchema = z.object({
  component: z.string().optional(),
  environment: z.string().optional(),
  commit: z.string().nullable(),
  built_at: z.string().nullable(),
  deployed_at: z.string().nullable().optional(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;
export const frontendBuildInfo: BuildInfo = __BUILD_INFO__;

// ブラウザに残った古い bundle と、現在配信中の release を比較できるよう別成果物を読む。
export async function fetchFrontendReleaseInfo(): Promise<BuildInfo | null> {
  try {
    const response = await fetch("/release-info.json", {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return null;
    return buildInfoSchema.parse(await response.json());
  } catch {
    return null;
  }
}
