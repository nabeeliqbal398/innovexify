import type { Metadata } from "next";

import { ResetPasswordScreen } from "@/components/features/auth/password-reset-screens";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return <ResetPasswordScreen token={(await params).token} />;
}
