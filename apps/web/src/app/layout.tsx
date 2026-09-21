import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "UpNext · Une chose à la fois", template: "%s · UpNext" },
  description:
    "Tes tâches, ton temps, à ton rythme. Un espace pour organiser tes journées étudiantes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
