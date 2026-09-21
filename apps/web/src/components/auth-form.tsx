"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { ArrowUpRight, Check, Leaf } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/format";

type Mode = "login" | "register" | "forgot" | "reset";
const headings = {
  login: ["Content de te retrouver.", "Un peu de clarté pour la suite de ta journée."],
  register: [
    "Fais de la place dans ta tête.",
    "Crée ton espace et avance une chose à la fois.",
  ],
  forgot: ["On remet les choses en ordre.", "Un lien pour choisir un nouveau mot de passe."],
  reset: ["Un nouveau départ.", "Choisis un mot de passe d’au moins 10 caractères."],
};

function authenticationError(error: { code?: string; status?: number }, fallback: string) {
  if (error.status === 429 || error.code === "TOO_MANY_REQUESTS") {
    return "Trop de tentatives rapprochées. Patiente une minute puis réessaie.";
  }
  if (error.code === "EMAIL_NOT_VERIFIED") {
    return "Confirme ton adresse email avant de te connecter.";
  }
  if (
    error.code === "USER_ALREADY_EXISTS" ||
    error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  ) {
    return "Cette adresse possède déjà un compte. Connecte-toi pour retrouver ton espace.";
  }
  return fallback;
}

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resending, setResending] = useState(false);
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError("");
      setSuccess("");
      try {
        if (mode === "register") {
          const result = await authClient.signUp.email({
            ...value,
            callbackURL: "/aujourdhui",
          });
          if (result.error)
            throw new Error(
              authenticationError(
                result.error,
                "Impossible de créer le compte. Réessaie dans un instant.",
              ),
            );
          setSuccess(
            "Un email de confirmation t’attend. Ouvre son lien pour accéder à ton espace.",
          );
        } else if (mode === "login") {
          const result = await authClient.signIn.email({
            email: value.email,
            password: value.password,
          });
          if (result.error)
            throw new Error(
              authenticationError(result.error, "Adresse email ou mot de passe incorrect."),
            );
          router.push("/aujourdhui");
          router.refresh();
        } else if (mode === "forgot") {
          const result = await authClient.requestPasswordReset({
            email: value.email,
            redirectTo: "/nouveau-mot-de-passe",
          });
          if (result.error)
            throw new Error(
              authenticationError(
                result.error,
                "Impossible d’envoyer le lien. Réessaie dans un instant.",
              ),
            );
          setSuccess(
            "Si cette adresse possède un compte, un lien de réinitialisation vient d’être envoyé.",
          );
        } else {
          const result = await authClient.resetPassword({
            token: token ?? "",
            newPassword: value.password,
          });
          if (result.error)
            throw new Error("Ce lien n’est plus valide. Demande un nouvel email.");
          setSuccess("Ton mot de passe a été modifié. Tu peux maintenant te connecter.");
        }
      } catch (error) {
        setError(errorMessage(error));
      }
    },
  });

  async function resend() {
    setResending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: form.getFieldValue("email"),
        callbackURL: "/aujourdhui",
      });
      if (result.error)
        throw new Error(
          authenticationError(
            result.error,
            "Impossible d’envoyer l’email. Réessaie dans un instant.",
          ),
        );
      setSuccess("Un nouvel email de confirmation a été envoyé.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <ArrowUpRight />
          </span>
          upnext<span className="brand-dot">.</span>
        </Link>
        <div className="auth-story-content">
          <span className="eyebrow">MOINS DANS LA TÊTE, PLUS DE PLACE POUR TOI</span>
          <h1>
            Tes journées,
            <br />à ton rythme.
          </h1>
          <p>
            Un devoir à rendre. Un projet à avancer. Une pause à garder. Trouve une place pour
            ce qui compte.
          </p>
          <div className="auth-note">
            <Leaf className="size-5" />
            <span>Un espace calme pour y voir plus clair.</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">UNE CHOSE À LA FOIS.</span>
      </section>
      <section className="auth-form-area">
        <div className="w-full max-w-sm">
          <p className="eyebrow mb-4">TON ESPACE PERSONNEL</p>
          <h2 className="text-3xl font-semibold tracking-tight">{headings[mode][0]}</h2>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
            {headings[mode][1]}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              {mode === "register" && (
                <form.Field name="name">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="name">Ton prénom</FieldLabel>
                      <Input
                        id="name"
                        required
                        autoComplete="given-name"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="Comment t’appelles-tu ?"
                      />
                    </Field>
                  )}
                </form.Field>
              )}
              {mode !== "reset" && (
                <form.Field name="email">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="email">Adresse email</FieldLabel>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="toi@exemple.fr"
                      />
                    </Field>
                  )}
                </form.Field>
              )}
              {mode !== "forgot" && (
                <form.Field name="password">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={mode === "login" ? 1 : 10}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldDescription>
                        {mode === "register" ? "Au moins 10 caractères." : null}
                      </FieldDescription>
                    </Field>
                  )}
                </form.Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert>
                  <Check />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(pending) => (
                  <Button type="submit" size="lg" disabled={pending}>
                    {pending && <Spinner data-icon="inline-start" />}
                    {mode === "login"
                      ? "Me connecter"
                      : mode === "register"
                        ? "Créer mon espace"
                        : mode === "forgot"
                          ? "Recevoir le lien"
                          : "Modifier mon mot de passe"}
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
          {mode === "login" && (
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link
                href="/mot-de-passe-oublie"
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Mot de passe oublié ?
              </Link>
              {error.includes("Confirme") && (
                <Button variant="outline" disabled={resending} onClick={() => void resend()}>
                  Renvoyer l’email de confirmation
                </Button>
              )}
            </div>
          )}
          <p className="mt-8 text-sm text-muted-foreground">
            {mode === "login" ? "Pas encore d’espace ? " : "Tu as déjà un compte ? "}
            <Link
              className="font-semibold text-primary hover:underline"
              href={mode === "login" ? "/inscription" : "/connexion"}
            >
              {mode === "login" ? "Inscris-toi" : "Connecte-toi"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
