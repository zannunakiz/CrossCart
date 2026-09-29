/**
 * Jest — unit + RBAC tests only (all pure mocks, no real DB).
 *
 *  - `tests/unit/**` → npm run test:unit  (domain logic: cashier, checkout, list…)
 *  - `tests/rbac/**` → npm run test:rbac  (permission matrix + guarded actions)
 *
 * ts-jest compiles the sources with CommonJS so Jest can load the app's
 * ESM-style TypeScript directly, and the `@/*` path alias of tsconfig is
 * mirrored in moduleNameMapper.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
          esModuleInterop: true,
        },
      },
    ],
  },
  clearMocks: true,
};
