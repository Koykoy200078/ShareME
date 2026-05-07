import os from "node:os";
import type { NextConfig } from "next";

// Driven by UNIFIED_API_ORIGIN which dev-all.js sets from root .env PORT
const backendOrigin = process.env.UNIFIED_API_ORIGIN || "http://127.0.0.1:3007";
// Extract just the port number for NEXT_PUBLIC_ exposure to client code
const backendPort = new URL(backendOrigin).port || "3007";
const legacyApiPaths = [
  "/upload-chunk",
  "/upload-status",
  "/files-list",
  "/delete-bulk",
  "/disk-space",
  "/upload-activity",
  "/printers",
  "/print-settings",
  "/print-file",
  "/print-history",
];

function getAllowedDevOrigins() {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);

  const configuredOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of configuredOrigins) {
    origins.add(origin);
  }

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        origins.add(iface.address);
      }
    }
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly anchor Turbopack to this Next.js app directory.
    // Without this, Turbopack detects multiple package-lock.json files and
    // incorrectly uses the repo root (C:\Projects\ShareME) as the workspace
    // root, causing tailwindcss and other sharemeweb deps to not resolve.
    root: __dirname,
  },
  // Expose the backend port to browser-side code.
  // Client hooks (useWebSocket, useUpload) read this to connect directly
  // to the backend without hardcoding the port.
  env: {
    NEXT_PUBLIC_BACKEND_PORT: process.env.NEXT_PUBLIC_BACKEND_PORT || backendPort,
  },
  allowedDevOrigins: getAllowedDevOrigins(),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
      ...legacyApiPaths.map((source) => ({
        source,
        destination: `${backendOrigin}${source}`,
      })),
      {
        source: "/delete/:path*",
        destination: `${backendOrigin}/delete/:path*`,
      },
      {
        source: "/files/:path*",
        destination: `${backendOrigin}/files/:path*`,
      },
      {
        source: "/ws",
        destination: `${backendOrigin}/ws`,
      },
      {
        source: "/ws/:path*",
        destination: `${backendOrigin}/ws/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // Allow the /files/* static assets to be embedded in iframes
        // (required for the PDF preview modal to work)
        source: "/files/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Disposition", value: "inline" },
        ],
      },
    ];
  },
};

export default nextConfig;
