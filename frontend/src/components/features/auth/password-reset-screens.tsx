"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

import { AuthAlert, AuthField, AuthHeading, AuthIcon, authInput, authPrimary, authSecondary, PasswordChecklist, PasswordInput } from "@/components/features/auth/auth-parts";
import { AuthFrame } from "@/components/features/auth/auth-screen";
import { useAction } from "@/hooks/useAction";
import { ErrorCodes, isApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { forgotSchema, newPasswordSchema, type ForgotValues, type NewPasswordValues } from "@/lib/validators";
import { useForgotPasswordMutation, usePasswordResetLinkQuery, useResetPasswordMutation } from "@/store/api/auth";

/** The page "Forgot password?" opens: ask for a link. The answer is the same whether or not the address has an account. */
export function ForgotPasswordScreen() {
  const run = useAction();
  const [ask] = useForgotPasswordMutation();
  const [sent, setSent] = useState<{ email: string; message: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const submit = handleSubmit(async (values) => {
    setProblem(null);
    const email = values.email.trim();
    const outcome = await run(ask({ email }), { setError, fields: ["email"], quiet: true });
    if (!outcome.ok) {
      if (outcome.error.fieldErrors.length === 0) setProblem(outcome.error.message);
      return;
    }
    setSent({ email, message: outcome.data.message });
  });

  if (sent) {
    return (
      <AuthFrame>
        <div className="flex flex-col gap-[18px]">
          <AuthIcon tone="ok" name="check" />
          <AuthHeading title="Check your email" text={sent.message} />
          <AuthAlert tone="info" icon="mail" role="status">
            If <strong>{sent.email}</strong> belongs to an active account, the link is on its way and works for 30 minutes. It can take a minute to arrive; look in spam too.
          </AuthAlert>
          <Link href="/" className={authSecondary}>
            Back to sign in
          </Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
        <AuthHeading title="Forgot your password?" text="Enter the email you sign in with and we'll send you a link to choose a new one." />
        {problem ? (
          <AuthAlert tone="err" icon="alert" role="alert">
            {problem}
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
            {...register("email", { onChange: () => setProblem(null) })}
          />
        </AuthField>
        <button type="submit" disabled={isSubmitting} className={authPrimary}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/" className="text-primary-soft-foreground">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

type LinkProblem = "expired" | "used" | "invalid";

function problemOf(error: unknown): LinkProblem | null {
  if (!isApiError(error)) return null;
  if (error.errorCode === ErrorCodes.PASSWORD_RESET_EXPIRED) return "expired";
  if (error.errorCode === ErrorCodes.PASSWORD_RESET_USED) return "used";
  if (error.errorCode === ErrorCodes.PASSWORD_RESET_INVALID || error.status === 404) return "invalid";
  return null;
}

/** What the person sees when the link cannot be used: what happened, and the one thing to do next. */
function LinkProblemPanel({ problem }: { problem: LinkProblem }) {
  const router = useRouter();
  if (problem === "expired") {
    return (
      <div className="flex flex-col gap-[18px]">
        <AuthIcon tone="warn" name="clock" />
        <AuthHeading title="This reset link has expired" text="Reset links work for 30 minutes and once. Ask for a new one and use it straight away." />
        <button type="button" onClick={() => router.push("/forgot-password")} className={authPrimary}>
          Request a new link
        </button>
        <button type="button" onClick={() => router.push("/")} className={authSecondary}>
          Back to sign in
        </button>
      </div>
    );
  }
  if (problem === "used") {
    return (
      <div className="flex flex-col gap-[18px]">
        <AuthIcon tone="info" name="user" />
        <AuthHeading title="This link was already used" text="A reset link only works once. If your password was changed, sign in with the new one. If you still can't sign in, ask for a new link." />
        <button type="button" onClick={() => router.push("/")} className={authPrimary}>
          Go to sign in
        </button>
        <button type="button" onClick={() => router.push("/forgot-password")} className={authSecondary}>
          Request a new link
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[18px]">
      <AuthIcon tone="err" name="alert" />
      <AuthHeading title="This link isn't valid" text="It may have been copied incompletely, or the account can't be reset. Open the link straight from your email, or ask for a new one." />
      <button type="button" onClick={() => router.push("/forgot-password")} className={authPrimary}>
        Request a new link
      </button>
      <button type="button" onClick={() => router.push("/")} className={authSecondary}>
        Back to sign in
      </button>
    </div>
  );
}

/** The page the emailed link opens: check the link, then let the person choose a new password. */
export function ResetPasswordScreen({ token }: { token: string }) {
  const lookup = usePasswordResetLinkQuery(token);

  let body: ReactNode;
  if (lookup.isLoading) {
    body = (
      <div aria-busy="true" aria-label="Checking your reset link" className="flex flex-col gap-3">
        <div className="skel h-8 w-2/3" />
        <div className="skel h-[42px]" />
        <div className="skel h-[42px]" />
      </div>
    );
  } else if (lookup.data) {
    body = <ResetForm token={token} expiresAt={lookup.data.expiresAt} />;
  } else {
    const problem = problemOf(lookup.error);
    body = problem ? (
      <LinkProblemPanel problem={problem} />
    ) : (
      <div className="flex flex-col gap-[18px]">
        <AuthIcon tone="err" name="alert" />
        <AuthHeading title="We couldn't check this link" text={isApiError(lookup.error) ? lookup.error.message : "Try again in a moment."} />
        <button type="button" onClick={() => void lookup.refetch()} className={authPrimary}>
          Try again
        </button>
      </div>
    );
  }
  return <AuthFrame>{body}</AuthFrame>;
}

function ResetForm({ token, expiresAt }: { token: string; expiresAt: string }) {
  const run = useAction();
  const router = useRouter();
  const [reset] = useResetPasswordMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<LinkProblem | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" }, mode: "onChange" });
  const password = watch("password");
  const until = new Date(expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const submit = handleSubmit(async (values) => {
    setProblem(null);
    const outcome = await run(reset({ token, password: values.password }), { setError, fields: ["password"], quiet: true });
    if (!outcome.ok) {
      // The link may have been used or may have expired between opening the page and sending the form.
      const gone = problemOf(outcome.error);
      if (gone) setLinkProblem(gone);
      else if (outcome.error.fieldErrors.length === 0) setProblem(outcome.error.message);
      return;
    }
    setDone(true);
  });

  if (linkProblem) return <LinkProblemPanel problem={linkProblem} />;
  if (done) {
    return (
      <div className="flex flex-col gap-[18px]">
        <AuthIcon tone="ok" name="check" />
        <AuthHeading title="Password changed" text="You were signed out of every device. Sign in with your new password. We also sent you an email to confirm the change." />
        <button type="button" onClick={() => router.replace("/")} className={authPrimary}>
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <AuthHeading title="Choose a new password" text={`This link works once and until ${until}.`} />
      {problem ? (
        <AuthAlert tone="err" icon="alert" role="alert">
          {problem}
        </AuthAlert>
      ) : null}
      <AuthField id="reset-password" label="New password" error={errors.password?.message}>
        <PasswordInput id="reset-password" autoComplete="new-password" invalid={Boolean(errors.password)} {...register("password", { onChange: () => setProblem(null) })} />
      </AuthField>
      <AuthField id="reset-confirm" label="Confirm new password" error={errors.confirm?.message}>
        <input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm) || undefined}
          aria-describedby={errors.confirm ? "reset-confirm-err" : undefined}
          className={cn(authInput, errors.confirm && "border-danger")}
          {...register("confirm")}
        />
      </AuthField>
      <PasswordChecklist value={password} />
      <button type="submit" disabled={isSubmitting} className={authPrimary}>
        {isSubmitting ? "Saving…" : "Change password"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/" className="text-primary-soft-foreground">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
