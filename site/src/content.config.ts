import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Extra frontmatter every page may carry. `lastVerified` and `verifiedWith` drive the
// Verified badge under the title; `status` puts a pill next to it; `verifiedSource` is the
// link the badge points at (RESEARCH.md by default).
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        status: z.enum(['testnet', 'mainnet', 'verified', 'stale', 'draft', 'pending']).optional(),
        statusLabel: z.string().optional(),
        lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        verifiedWith: z.array(z.string()).optional(),
        verifiedSource: z.object({ label: z.string(), href: z.string() }).optional(),
      }),
    }),
  }),
};
