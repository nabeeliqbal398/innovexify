import type { Metadata } from "next";

import { WorkspacePage } from "@/components/features/workspace/workspace-page";
import { PATH_ROLE, ROLE_LABEL } from "@/constants/vocab";

interface PageProps {
  params: { role: string; slug?: string[] };
}

export function generateMetadata({ params }: PageProps): Metadata {
  const role = PATH_ROLE[params.role];
  return { title: role ? `${ROLE_LABEL[role]} workspace` : "Not found" };
}

export default function RoleWorkspace({ params }: PageProps) {
  return <WorkspacePage rolePath={params.role} slug={params.slug ?? []} />;
}
