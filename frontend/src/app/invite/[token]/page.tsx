import type { Metadata } from "next";

import { InviteScreen } from "@/components/features/auth/auth-screen";

export const metadata: Metadata = { title: "Accept your invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return <InviteScreen token={(await params).token} />;
}
