import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UpNext · Une chose à la fois",
    short_name: "UpNext",
    description:
      "Tes tâches, ton temps, à ton rythme. Un espace pour organiser tes journées étudiantes.",
    lang: "fr-FR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf8f4",
    theme_color: "#436447",
    categories: ["productivity", "education"],
    icons: [
      {
        src: "/icons/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
