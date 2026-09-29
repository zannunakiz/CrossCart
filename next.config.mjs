import { withSentryConfig } from '@sentry/nextjs/config';
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "arkride-solutions",

  project: "cross-cart",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
