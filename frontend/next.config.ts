import type { NextConfig } from "next";

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
