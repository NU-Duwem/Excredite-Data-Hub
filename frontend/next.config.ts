import type { NextConfig } from "next";

// ⚠️ DEV_MASTER_PASSWORD is a development-only master password (utils/devMaster.ts).
// Refuse to build or start a production server while it is set, so it can never be
// deployed by accident. REMOVE IT FROM .env.local BEFORE DEPLOYMENT.
if (process.env.NODE_ENV === 'production' && process.env.DEV_MASTER_PASSWORD) {
  throw new Error(
    '\n\n⚠️  DEV_MASTER_PASSWORD is set. It is for development only.\n' +
      '    Remove it from frontend/.env.local (and any hosting settings) before building or deploying.\n' +
      '    See "Before deployment" in README.md.\n',
  );
}

const nextConfig: NextConfig = {
  // Load these with Node at runtime instead of bundling them: the PDF reader
  // has an optional 'canvas' dependency (only for drawing pages, not reading
  // text) that webpack otherwise fails to resolve, and the embedding model
  // library ships native binaries.
  serverExternalPackages: ['pdfjs-dist', '@huggingface/transformers', 'onnxruntime-node'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
