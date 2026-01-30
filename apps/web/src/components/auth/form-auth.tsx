"use client";

import { useForm } from "@tanstack/react-form";
import { Key } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getLastUsedLoginMethod, signIn, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { GitHub, Google } from "../icons";
import Loader from "../loader";

type lastMethodType = "github" | "google" | "magicLink" | "passkey" | "email";

export function FormAuth({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const lastMethod = getLastUsedLoginMethod();
  const { isPending } = useSession();

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await signIn.magicLink(
        { email: value.email },
        {
          onSuccess: () => {
            toast.success("Magic link sent to your email");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  const handlePasskeySignIn = async () => {
    try {
      await signIn.passkey({
        autoFill: true,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Successfully signed in with Passkey");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      });
    } catch (error) {
      // Handle error silently or log it
      console.error("Passkey sign-in error:", error);
    }
  };

  const handleSocialSignIn = async (provider: "google" | "github") => {
    try {
      await signIn.social(
        {
          provider,
          callbackURL: window.location.href,
        },
        {
          onSuccess: () => {
            toast.success(`Successfully signed in with ${provider}`);
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    } catch (error) {
      console.error(`${provider} sign-in error:`, error);
    }
  };

  const renderLastUsedBadge = (method: lastMethodType) => {
    if (lastMethod !== method) return null;

    return (
      <span className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
        Last used
      </span>
    );
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      data-slot="form-auth"
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-2xl">Login to your account</h1>
          <p className="text-balance text-muted-foreground text-sm">
            Enter your email below to login to your account
          </p>
        </div>

        <Field>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  autoCorrect="off"
                  className={
                    field.state.meta.errors.length > 0
                      ? "border-red-500 focus:border-red-500"
                      : ""
                  }
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="email"
                  value={field.state.value}
                />
                {field.state.meta.errors.map((error) => (
                  <FieldError key={error?.message}>{error?.message}</FieldError>
                ))}
              </div>
            )}
          </form.Field>
        </Field>

        <Field>
          {/* Magic Link Button */}
          <form.Subscribe>
            {(state) => (
              <Button
                className="relative"
                disabled={!state.canSubmit || state.isSubmitting}
                type="submit"
                variant="outline"
              >
                Send magic link
                {renderLastUsedBadge("magicLink")}
              </Button>
            )}
          </form.Subscribe>

          {/* Passkey Button */}
          <Button
            aria-describedby="passkey-description"
            className="relative w-full"
            onClick={handlePasskeySignIn}
            type="button"
            variant="outline"
          >
            <Key className="mr-2 size-4" />
            Sign in with Passkey
            {renderLastUsedBadge("passkey")}
          </Button>
          <span className="sr-only" id="passkey-description">
            Sign in with your passkey for quick and secure access
          </span>
        </Field>

        <FieldSeparator>Or continue with</FieldSeparator>

        <Field>
          {/* GitHub Button */}
          <Button
            aria-describedby="github-description"
            className="relative w-full"
            disabled={isPending}
            onClick={() => handleSocialSignIn("github")}
            type="button"
            variant="outline"
          >
            <GitHub className="mr-2 size-5" />
            Sign in with GitHub
            {renderLastUsedBadge("github")}
          </Button>
          <span className="sr-only" id="github-description">
            Sign in with your GitHub account
          </span>
        </Field>

        <Field>
          {/* Google Button */}
          <Button
            aria-describedby="google-description"
            className="relative w-full"
            disabled={isPending}
            onClick={() => handleSocialSignIn("google")}
            type="button"
            variant="outline"
          >
            <Google className="mr-2 size-5" />
            Sign in with Google
            {renderLastUsedBadge("google")}
          </Button>
          <span className="sr-only" id="google-description">
            Sign in with your Google account
          </span>
        </Field>

        <FieldDescription className="text-center">
          By continuing, you agree to our{" "}
          <a
            className="underline underline-offset-4 hover:text-primary"
            href="/terms"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            className="underline underline-offset-4 hover:text-primary"
            href="/privacy"
          >
            Privacy Policy
          </a>
          .
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
