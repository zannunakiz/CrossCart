/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Set to true only if deploying to a platform without Next.js image optimisation
    // (e.g. a plain Node server without Vercel). On Vercel this should be false.
    unoptimized: false,
  },
  experimental: {
    serverActions: {
      /*
       * The QR image of a store travels to the `uploadStoreQr` Server Action as
       * `multipart/form-data` (the action refuses anything over 2 MB). The
       * default cap is 1 MB, and the limit applies to the RAW body — boundaries,
       * part headers and field metadata included — so 3 MB leaves the required
       * headroom without letting a huge body reach the action at all.
       *
       * This is a backstop behind the browser check (`lib/quickstore/upload.ts`
       * refuses an oversized file while it is still local), so the user meets
       * our "max 2 MB" sentence instead of the framework's own 413 text.
       */
      bodySizeLimit: '3mb',
    },
  },
}

export default nextConfig
