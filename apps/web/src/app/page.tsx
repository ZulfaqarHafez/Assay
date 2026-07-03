import HomeClient from "./HomeClient";
import { getWorkspaceBoot } from "@/lib/serverApi";
import type { WorkspaceBoot } from "@/types/assay";

export const dynamic = "force-dynamic";

async function loadInitialBoot(): Promise<WorkspaceBoot | null> {
  try {
    return await getWorkspaceBoot();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const initialBoot = await loadInitialBoot();
  return <HomeClient initialBoot={initialBoot} />;
}
