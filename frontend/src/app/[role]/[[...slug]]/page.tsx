import type { Metadata } from "next";

import { WorkspacePage } from "@/components/features/workspace/workspace-page";
import { PATH_ROLE, ROLE_LABEL } from "@/constants/vocab";

interface PageProps {
  params: Promise<{ role: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const role = PATH_ROLE[(await params).role];
  return { title: role ? `${ROLE_LABEL[role]} workspace` : "Not found" };
}

export default async function RoleWorkspace({ params }: PageProps) {
  const { role, slug } = await params;
  return <WorkspacePage rolePath={role} slug={slug ?? []} />;
}
