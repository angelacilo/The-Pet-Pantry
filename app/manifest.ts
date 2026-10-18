import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Pet Pantry",
    short_name: "Pet Pantry",
    description:
      "Order quality pet food, treats, toys, and essentials online from The Pet Pantry.",
    start_url: "/",
    display: "standalone",
    background_color: "#F9D1D9",
    theme_color: "#F9D1D9",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
