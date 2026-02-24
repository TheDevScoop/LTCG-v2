import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { PRIVY_ENABLED } from "@/lib/auth/privyEnv";
import { isDiscordActivityFrame } from "@/lib/clientPlatform";

const PRIVY_APP_ID = ((import.meta.env.VITE_PRIVY_APP_ID as string | undefined) ?? "").trim();

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) {
    return <>{children}</>;
  }

  // Discord Activities run inside a restrictive CSP sandbox (discordsays.com proxy).
  // Privy's embedded wallet flow uses hidden iframes + external RPC hosts; disable it
  // for Activities so auth/gameplay can proceed without being blocked by frame-src/CSP.
  const disableEmbeddedWallets = typeof window !== "undefined" && isDiscordActivityFrame();

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "telegram", "discord"],
        ...(disableEmbeddedWallets
          ? {}
          : {
              embeddedWallets: {
                solana: { createOnLogin: "users-without-wallets" },
              },
            }),
        appearance: {
          theme: "dark",
          accentColor: "#ffcc00",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

