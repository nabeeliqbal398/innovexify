import type { Metadata } from "next";

import { InviteScreen } from "@/components/features/auth/auth-screen";

export const metadata: Metadata = { title: "Accept your invitation" };

export default function InvitePage({ params }: { params: { token: string } }) {
  return <InviteScreen token={params.token} />;
}
