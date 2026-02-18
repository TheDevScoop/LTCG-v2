/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_CONVEX_URL: string;
    readonly VITE_POSTHOG_KEY: string;
    readonly VITE_POSTHOG_HOST: string;
    readonly VITE_SENTRY_DSN: string;
    readonly VITE_PRIVY_APP_ID: string;
    readonly VITE_DISCORD_CLIENT_ID?: string;
    readonly VITE_DISCORD_URL_MAPPINGS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
