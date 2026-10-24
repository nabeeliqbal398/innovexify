"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
import { ROLE_PATH } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { isApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { establishSession } from "@/lib/session";
import { loginSchema, newPasswordSchema, type LoginValues, type NewPasswordValues } from "@/lib/validators";
import { useAcceptInvitationMutation, useInvitationQuery, useLoginMutation } from "@/store/api/auth";
import { sessionActions } from "@/store/sessionSlice";

const PANEL_POINTS = [
  "See progress on every project and task",
  "Upload documents and track their review",
  "Message your administrator directly",
];

/** Left brand panel and the right column every sign-in page shares. */
export function AuthFrame({ children }: { children: ReactNode }) {
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
        <p className="relative z-10 text-xs text-sidebar-muted">Access is by invitation only. Need help? Contact your administrator.</p>
      </section>
      <section className="flex flex-[1_1_520px] flex-col items-center justify-center gap-5 px-6 py-10 max-[860px]:px-4 max-[860px]:py-7">
        <div className="flex w-[min(400px,100%)] animate-rise flex-col gap-[18px]">{children}</div>
      </section>
    </div>
  );
}

/** The sign-in page. Someone who is already signed in goes straight to their workspace. */
export function AuthScreen() {
  const router = useRouter();
  const status = useAppSelector((s) => s.session.status);
  const user = useAppSelector((s) => s.session.user);

  useEffect(() => {
    if (status === "authenticated" && user) router.replace(`/${ROLE_PATH[user.role]}`);
  }, [status, user, router]);

  if (status === "booting" || status === "authenticated") {
    return (
      <AuthFrame>
        <div aria-busy="true" aria-label="Checking your session" className="flex flex-col gap-3">
          <div className="skel h-8 w-1/2" />
          <div className="skel h-[42px]" />
          <div className="skel h-[42px]" />
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame>
      <LoginForm />
    </AuthFrame>
  );
}

function LoginForm() {
  const dispatch = useAppDispatch();
  const run = useAction();
  const notice = useAppSelector((s) => s.session.notice);
  const [login] = useLoginMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  // The "your session ended" notice is shown once.
  useEffect(() => {
    if (notice) return () => void dispatch(sessionActions.noticeShown());
    return undefined;
  }, [notice, dispatch]);

  const submit = handleSubmit(async (values) => {
    setProblem(null);
    const outcome = await run(login({ email: values.email.trim(), password: values.password }), { setError, fields: ["email", "password"], quiet: true });
    if (!outcome.ok) {
      if (outcome.error.fieldErrors.length === 0) setProblem(outcome.error.message);
      resetField("password");
      return;
    }
    try {
      await establishSession(dispatch, outcome.data.accessToken);
    } catch (e) {
      setProblem(isApiError(e) ? e.message : "We signed you in but couldn't load your account. Try again.");
      return;
    }
    // AuthScreen sends a signed-in person to their workspace.
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeading title="Sign in" text="Use the email your invitation was sent to." />
      {notice ? (
        <AuthAlert tone="warn" icon="lock" role="status">
          {notice}
        </AuthAlert>
      ) : null}
      {problem ? (
        <AuthAlert tone="err" icon="alert" role="alert">
          {problem}
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
          {...register("email", { onChange: () => setProblem(null) })}
        />
      </AuthField>
      <AuthField
        id="login-password"
        label="Password"
        error={errors.password?.message}
        aside={
          <Link href="/forgot-password" className="text-sm text-primary-soft-foreground">
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          {...register("password", { onChange: () => setProblem(null) })}
        />
      </AuthField>
      <button type="submit" disabled={isSubmitting} className={authPrimary}>
        {isSubmitting ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** The page an invitation link opens: check the link, then let the person choose a password. */
export function InviteScreen({ token }: { token: string }) {
  const lookup = useInvitationQuery(token);
  const router = useRouter();

  let body: ReactNode;
  if (lookup.isLoading) {
    body = (
      <div aria-busy="true" aria-label="Checking your invitation" className="flex flex-col gap-3">
        <div className="skel h-8 w-2/3" />
        <div className="skel h-[42px]" />
        <div className="skel h-[42px]" />
      </div>
    );
  } else if (lookup.data) {
    body = <AcceptForm token={token} email={lookup.data.email} invitedBy={lookup.data.invitedBy} caseNumber={lookup.data.caseNumber} expiresAt={lookup.data.expiresAt} />;
  } else {
    const code = isApiError(lookup.error) ? lookup.error.errorCode : "";
    const status = isApiError(lookup.error) ? lookup.error.status : 0;
    if (code === "INVITATION_EXPIRED") {
      body = (
        <div className="flex flex-col gap-[18px]">
          <AuthIcon tone="warn" name="clock" />
          <AuthHeading title="This invitation has expired" text="Invitation links work for 7 days. Ask the person who invited you to send a new one." />
          <button type="button" onClick={() => router.push("/")} className={authSecondary}>
            Back to sign in
          </button>
        </div>
      );
    } else if (code === "INVITATION_USED") {
      body = (
        <div className="flex flex-col gap-[18px]">
          <AuthIcon tone="info" name="user" />
          <AuthHeading title="You've already set up your account" text="This invitation link has been used. Sign in with your email and password instead." />
          <button type="button" onClick={() => router.push("/")} className={authPrimary}>
            Go to sign in
          </button>
        </div>
      );
    } else if (code === "INVITATION_INVALID" || status === 404) {
      body = (
        <div className="flex flex-col gap-[18px]">
          <AuthIcon tone="err" name="alert" />
          <AuthHeading
            title="This link isn't valid"
            text="It may have been copied incompletely. Open the link straight from your invitation email, or contact the person who invited you."
          />
          <button type="button" onClick={() => router.push("/")} className={authSecondary}>
            Back to sign in
          </button>
        </div>
      );
    } else {
      body = (
        <div className="flex flex-col gap-[18px]">
          <AuthIcon tone="err" name="alert" />
          <AuthHeading title="We couldn't check this invitation" text={isApiError(lookup.error) ? lookup.error.message : "Try again in a moment."} />
          <button type="button" onClick={() => void lookup.refetch()} className={authPrimary}>
            Try again
          </button>
        </div>
      );
    }
  }
  return <AuthFrame>{body}</AuthFrame>;
}

function AcceptForm({
  token,
  email,
  invitedBy,
  caseNumber,
  expiresAt,
}: {
  token: string;
  email: string;
  invitedBy: string | null;
  caseNumber: string | null;
  expiresAt: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const run = useAction();
  const [accept] = useAcceptInvitationMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" }, mode: "onChange" });
  const password = watch("password");
  const expires = new Date(expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  const submit = handleSubmit(async (values) => {
    setProblem(null);
    const outcome = await run(accept({ token, password: values.password }), { setError, fields: ["password"], quiet: true });
    if (!outcome.ok) {
      if (outcome.error.fieldErrors.length === 0) setProblem(outcome.error.message);
      return;
    }
    try {
      await establishSession(dispatch, outcome.data.accessToken);
    } catch {
      setProblem("Your account is ready, but we couldn't sign you in. Go to the sign-in page and use your new password.");
      return;
    }
    router.replace("/");
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthAlert tone="info" icon="mail">
        <>
          Invitation for <strong>{email}</strong>
          {caseNumber ? (
            <>
              {" "}
              · Case <span className="mono">{caseNumber}</span>
            </>
          ) : null}{" "}
          · expires {expires}
        </>
      </AuthAlert>
      <AuthHeading
        title="Welcome to Innovexify"
        text={invitedBy ? `${invitedBy} invited you. Set a password to finish.` : "You've been invited. Set a password to finish."}
      />
      {problem ? (
        <AuthAlert tone="err" icon="alert" role="alert">
          {problem}
        </AuthAlert>
      ) : null}
      <AuthField id="set-password" label="Create password" error={errors.password?.message}>
        <PasswordInput id="set-password" autoComplete="new-password" invalid={Boolean(errors.password)} {...register("password")} />
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
      <button type="submit" disabled={isSubmitting} className={authPrimary}>
        {isSubmitting ? "Creating your account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/" className="text-primary-soft-foreground">
          Sign in
        </Link>
      </p>
    </form>
  );
}
