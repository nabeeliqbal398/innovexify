import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter a valid email address.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotValues = z.infer<typeof forgotSchema>;

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

/** Password rules mirrored on the server. They are shown live next to the field. */
export const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "Upper and lowercase letters", test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: "At least one number", test: (v) => /\d/.test(v) },
];

export const newPasswordSchema = z
  .object({
    password: z.string().superRefine((value, ctx) => {
      if (!PASSWORD_RULES.every((r) => r.test(value))) {
        ctx.addIssue({ code: "custom", message: "Use at least 12 characters with upper and lowercase letters and a number." });
      }
    }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") });
export const recoverySchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, "Enter the recovery code, like XXXX-XXXX."),
});

export const reauthSchema = z.object({ password: z.string().min(1, "Enter your password.") });
