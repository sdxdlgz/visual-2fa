import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Visual 2FA",
    short_name: "V2FA",
    description: "私人、加密、自托管的 2FA 验证器保险库",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1214",
    theme_color: "#0b1214",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
