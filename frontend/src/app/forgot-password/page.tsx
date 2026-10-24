import type { Metadata } from "next";

import { ForgotPasswordScreen } from "@/components/features/auth/password-reset-screens";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
