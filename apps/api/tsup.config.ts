import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  dts: false,
  noExternal: [/^@disc-foundation\//],
  external: ['@prisma/client', 'fastify', 'zod'],
});
