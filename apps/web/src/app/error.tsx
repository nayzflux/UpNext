"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-content-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Une petite interruption</h1>
      <p className="text-muted-foreground">
        Impossible de charger cet espace. Vérifie ta connexion, puis réessaie.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
