export const PRIVY_ENABLED = Boolean(
  ((import.meta.env.VITE_PRIVY_APP_ID as string | undefined) ?? "").trim(),
);

