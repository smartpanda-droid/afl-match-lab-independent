# Cloudflare Pages deployment settings

Use these settings when the GitHub repository is available:

| Setting | Value |
|---|---|
| Framework preset | None |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |

## Deployment policy during parallel test

1. Deploy to a Cloudflare Pages preview/parallel hostname first.
2. Do not point the existing production domain at this project.
3. Do not stop the existing ChatGPT Site scheduler.
4. Compare 9023 at T-4h, every 30-minute sync, T-30 final lock, and T+8 settlement.
5. Only consider cutover after the independent chain completes without material mismatch or workflow failure.

## Security

`public/config.js` contains only a Supabase **publishable** browser key. Never add a service-role key, Vault secret, or private database credential to Cloudflare Pages environment variables or source files for this frontend.
