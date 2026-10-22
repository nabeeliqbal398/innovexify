"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import {
  AuthAlert,
  AuthField,
  AuthHeading,
  AuthIcon,
  authInput,
  authPrimary,
  authSecondary,
  PasswordChecklist,
  PasswordInput,
} from "@/components/features/auth/auth-parts";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  forgotSchema,
  loginSchema,
  newPasswordSchema,
  otpSchema,
  reauthSchema,
  recoverySchema,
  type ForgotValues,
  type LoginValues,
  type NewPasswordValues,
} from "@/lib/validators";

export const AUTH_SCREENS = [
  { id: "login", label: "Sign in" },
  { id: "forgot", label: "Forgot password" },
  { id: "reset", label: "Reset password" },
  { id: "twofa", label: "2FA" },
  { id: "inviteValid", label: "Invite: valid" },
  { id: "inviteExpired", label: "Invite: expired" },
  { id: "inviteUsed", label: "Invite: used" },
  { id: "inviteInvalid", label: "Invite: invalid" },
  { id: "session", label: "Session expired" },
] as const;

export type AuthScreenId = (typeof AUTH_SCREENS)[number]["id"] | "done";
type DoneKind = "signin" | "invite" | "reset";

const DONE_COPY: Record<DoneKind, { title: string; body: string }> = {
  signin: {
    title: "You're signed in",
    body: "In the real app you'd land on your dashboard now. Pick a workspace to continue.",
  },
  invite: {
    title: "Account created",
    body: "Sofia's account is active (simulated). The case ID is linked and the admin sees the invitation as accepted.",
  },
  reset: {
    title: "Password updated",
    body: "Other sessions were signed out. You can sign in with your new password.",
  },
};

const WORKSPACES = [
  { href: "/client", label: "Open client portal", primary: true },
  { href: "/admin", label: "Open admin console" },
  { href: "/manager", label: "Open manager workspace" },
  { href: "/csr", label: "Open CSR workspace" },
  { href: "/compliance", label: "Open compliance workspace" },
] as const;

const PANEL_POINTS = [
  "See progress on every project and task",
  "Upload documents and track their review",
  "Message your administrator directly",
];

export function AuthScreen({ initial = "login" }: { initial?: AuthScreenId }) {
  const [screen, setScreen] = useState<AuthScreenId>(initial);
  const [done, setDone] = useState<DoneKind>("signin");
  const [resetKey, setResetKey] = useState(0);

  const go = useCallback((next: AuthScreenId, kind?: DoneKind) => {
    if (kind) setDone(kind);
    setScreen(next);
    // Remount the form of the target screen so fields and errors start clean.
    setResetKey((k) => k + 1);
  }, []);

  return (
    <div className="flex min-h-screen flex-wrap bg-background">
      <section
        aria-label="Innovexify"
        className="relative flex flex-[1_1_420px] flex-col justify-between gap-10 overflow-hidden bg-sidebar p-10 text-sidebar-foreground max-[860px]:basis-full max-[860px]:gap-4 max-[860px]:p-6"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[120px] -right-[120px] size-[420px] rounded-full border border-sidebar-hover shadow-[0_0_0_60px_hsl(var(--sidebar-hover)/0.35),0_0_0_120px_hsl(var(--sidebar-hover)/0.18)]"
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="text-xl font-semibold text-white">Innovexify</span>
        </div>
        <div className="relative z-10 flex max-w-[440px] flex-col gap-5 max-[860px]:hidden">
          <h1 className="text-[34px] font-semibold leading-10 tracking-[-0.03em] text-white">
            Your case, your documents and your team, in one private place.
          </h1>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {PANEL_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <Icon name="check" className="text-sidebar-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-sidebar-muted">
          Access is by invitation only. Need help? Contact your administrator.
        </p>
      </section>

      <section className="flex flex-[1_1_520px] flex-col items-center justify-center gap-5 px-6 py-10 max-[860px]:px-4 max-[860px]:py-7">
        <div role="tablist" aria-label="Prototype: choose a screen state" className="flex max-w-[640px] flex-wrap justify-center gap-1">
          {AUTH_SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={screen === s.id}
              onClick={() => go(s.id)}
              className={cn(
                "h-7 cursor-pointer rounded-full border px-2.5 text-xs font-medium",
                screen === s.id ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-neutral hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div key={`${screen}-${resetKey}`} className="flex w-[min(400px,100%)] animate-rise flex-col gap-[18px]">
          {screen === "login" ? <LoginForm onForgot={() => go("forgot")} onSuccess={() => go("twofa")} /> : null}
          {screen === "forgot" ? <ForgotForm onBack={() => go("login")} /> : null}
          {screen === "reset" ? <SetPasswordForm mode="reset" onDone={() => go("done", "reset")} /> : null}
          {screen === "twofa" ? <TwoFactorForm onDone={() => go("done", "signin")} /> : null}
          {screen === "done" ? <DonePanel kind={done} /> : null}
          {screen === "inviteValid" ? <SetPasswordForm mode="invite" onDone={() => go("done", "invite")} /> : null}
          {screen === "inviteExpired" ? <InviteExpired /> : null}
          {screen === "inviteUsed" ? <InviteUsed onLogin={() => go("login")} onForgot={() => go("forgot")} /> : null}
          {screen === "inviteInvalid" ? <InviteInvalid onLogin={() => go("login")} /> : null}
          {screen === "session" ? <SessionExpired onDone={() => go("done", "signin")} onSwitch={() => go("login")} /> : null}
        </div>
      </section>
    </div>
  );
}

function LoginForm({ onForgot, onSuccess }: { onForgot: () => void; onSuccess: () => void }) {
  const [badCreds, setBadCreds] = useState(false);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const submit = handleSubmit(async (values) => {
    setBadCreds(false);
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (values.password === "wrong") {
      setBadCreds(true);
      resetField("password");
      return;
    }
    onSuccess();
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeading title="Sign in" text="Use the email your invitation was sent to." />
      {badCreds ? (
        <AuthAlert tone="err" icon="alert" role="alert">
          That email and password don&apos;t match. Check both and try again.
        </AuthAlert>
      ) : null}
      <AuthField id="login-email" label="Email" error={errors.email?.message}>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={errors.email ? "login-email-err" : undefined}
          className={cn(authInput, errors.email && "border-danger")}
          {...register("email", { onChange: () => setBadCreds(false) })}
        />
      </AuthField>
      <AuthField
        id="login-password"
        label="Password"
        error={errors.password?.message}
        aside={
          <button type="button" onClick={onForgot} className="cursor-pointer border-0 bg-transparent p-0 text-sm text-primary-soft-foreground">
            Forgot password?
          </button>
        }
      >
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          {...register("password", { onChange: () => setBadCreds(false) })}
        />
      </AuthField>
      <button type="submit" disabled={isSubmitting} className={authPrimary}>
        {isSubmitting ? (
          <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : null}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        Demo: any valid email works. Use the password “wrong” to see the error state.
      </p>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  return (
    <form onSubmit={handleSubmit(() => setSent(true))} noValidate className="flex flex-col gap-[18px]">
      <AuthHeading
        title="Reset your password"
        text="Enter your account email and we'll send a reset link that works for 30 minutes."
      />
      {sent ? (
        <AuthAlert tone="ok" icon="check" role="status">
          If an account exists for that email, a reset link is on its way. (Simulated, nothing was sent.)
        </AuthAlert>
      ) : null}
      <AuthField id="forgot-email" label="Email" error={errors.email?.message}>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={errors.email ? "forgot-email-err" : undefined}
          className={cn(authInput, errors.email && "border-danger")}
          {...register("email")}
        />
      </AuthField>
      <button type="submit" className={authPrimary}>
        Send reset link
      </button>
      <button type="button" onClick={onBack} className={authSecondary}>
        Back to sign in
      </button>
    </form>
  );
}

function SetPasswordForm({ mode, onDone }: { mode: "reset" | "invite"; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
    mode: "onChange",
  });
  const password = watch("password");
  const invite = mode === "invite";

  return (
    <form onSubmit={handleSubmit(onDone)} noValidate className="flex flex-col gap-[18px]">
      {invite ? (
        <AuthAlert tone="info" icon="mail">
          <>
            Invitation for <strong>sofia.l@lindqvist.se</strong> · Case <span className="mono">CASE-2026-0051</span> · expires Oct 20
          </>
        </AuthAlert>
      ) : null}
      <AuthHeading
        title={invite ? "Welcome to Innovexify" : "Choose a new password"}
        text={invite ? "Sarah Bennett invited you to your private client portal. Set a password to finish." : "For alex.morgan@northfield.co"}
      />
      <AuthField id="set-password" label={invite ? "Create password" : "New password"}>
        <PasswordInput id="set-password" autoComplete="new-password" {...register("password")} />
      </AuthField>
      <AuthField id="set-confirm" label="Confirm password" error={errors.confirm?.message}>
        <input
          id="set-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm) || undefined}
          aria-describedby={errors.confirm ? "set-confirm-err" : undefined}
          className={cn(authInput, errors.confirm && "border-danger")}
          {...register("confirm")}
        />
      </AuthField>
      <PasswordChecklist value={password} />
      <button type="submit" className={authPrimary}>
        {invite ? "Create account" : "Update password"}
      </button>
      {invite ? (
        <p className="text-sm text-muted-foreground">By continuing you agree to the [YOUR TERMS] and [YOUR PRIVACY POLICY].</p>
      ) : null}
    </form>
  );
}

function TwoFactorForm({ onDone }: { onDone: () => void }) {
  const [recovery, setRecovery] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<{ code: string }>({
    resolver: zodResolver(recovery ? recoverySchema : otpSchema),
    defaultValues: { code: "" },
  });

  const toggle = (): void => {
    setRecovery((r) => !r);
    reset({ code: "" });
  };

  return (
    <form onSubmit={handleSubmit(onDone)} noValidate className="flex flex-col gap-[18px]">
      <AuthIcon tone="brand" name="shield" />
      <AuthHeading title="Two-step verification" text="Enter the 6-digit code from your authenticator app." />
      <AuthField id="otp" label={recovery ? "Recovery code" : "Verification code"} error={errors.code?.message}>
        <input
          id="otp"
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          maxLength={9}
          placeholder={recovery ? "XXXX-XXXX" : "000000"}
          aria-invalid={Boolean(errors.code) || undefined}
          aria-describedby={errors.code ? "otp-err" : undefined}
          className={cn(authInput, "mono h-[52px] text-center text-[22px] tracking-[0.3em]", errors.code && "border-danger")}
          {...register("code", {
            onChange: (e) => {
              const v = String(e.target.value);
              setValue("code", recovery ? v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9) : v.replace(/\D/g, "").slice(0, 6));
            },
          })}
        />
      </AuthField>
      <button type="submit" className={authPrimary}>
        Verify
      </button>
      <p className="text-center text-sm text-muted-foreground">
        {recovery ? "Have your device?" : "Lost your device?"}{" "}
        <button type="button" onClick={toggle} className="cursor-pointer border-0 bg-transparent p-0 text-primary-soft-foreground">
          {recovery ? "Use an authenticator code" : "Use a recovery code"}
        </button>
      </p>
    </form>
  );
}

function DonePanel({ kind }: { kind: DoneKind }) {
  const copy = DONE_COPY[kind];
  return (
    <div className="flex flex-col items-center gap-[18px] text-center">
      <AuthIcon tone="ok" name="check" />
      <h2 className="text-[22px] font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {WORKSPACES.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className={cn(
              "inline-flex h-10 items-center rounded-md border px-4 font-medium no-underline",
              "primary" in w && w.primary
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {w.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function InviteExpired() {
  const [requested, setRequested] = useState(false);
  return (
    <div className="flex flex-col gap-[18px]">
      <AuthIcon tone="warn" name="clock" />
      <AuthHeading
        title="This invitation has expired"
        text="Invitation links work for 7 days. Ask for a new one and we'll let your administrator know."
      />
      {requested ? (
        <AuthAlert tone="ok" icon="check" role="status">
          Request recorded. Your administrator will send a fresh link. (Simulated.)
        </AuthAlert>
      ) : null}
      <button type="button" disabled={requested} onClick={() => setRequested(true)} className={authPrimary}>
        Request a new invitation
      </button>
    </div>
  );
}

function InviteUsed({ onLogin, onForgot }: { onLogin: () => void; onForgot: () => void }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <AuthIcon tone="info" name="user" />
      <AuthHeading
        title="You've already set up your account"
        text="This invitation link has been used. Sign in with your email and password instead."
      />
      <button type="button" onClick={onLogin} className={authPrimary}>
        Go to sign in
      </button>
      <button type="button" onClick={onForgot} className={authSecondary}>
        I forgot my password
      </button>
    </div>
  );
}

function InviteInvalid({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <AuthIcon tone="err" name="alert" />
      <AuthHeading
        title="This link isn't valid"
        text="It may have been copied incompletely. Open the link straight from your invitation email, or contact the person who invited you."
      />
      <button type="button" onClick={onLogin} className={authSecondary}>
        Back to sign in
      </button>
    </div>
  );
}

function SessionExpired({ onDone, onSwitch }: { onDone: () => void; onSwitch: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string }>({ resolver: zodResolver(reauthSchema), defaultValues: { password: "" } });
  return (
    <form onSubmit={handleSubmit(onDone)} noValidate className="flex flex-col gap-[18px]">
      <AuthAlert tone="warn" icon="lock" role="alert">
        Your session timed out after 30 minutes of inactivity.
      </AuthAlert>
      <AuthHeading title="Confirm it's you" text="Signed in as alex.morgan@northfield.co. Unsaved form changes are kept." />
      <AuthField id="reauth-password" label="Password" error={errors.password?.message}>
        <PasswordInput id="reauth-password" autoComplete="current-password" invalid={Boolean(errors.password)} {...register("password")} />
      </AuthField>
      <button type="submit" className={authPrimary}>
        Continue
      </button>
      <button type="button" onClick={onSwitch} className={authSecondary}>
        Sign in as someone else
      </button>
    </form>
  );
}
