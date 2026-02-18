import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { PRIVY_ENABLED } from "@/lib/auth/privyEnv";

const PRIVY_APP_ID = ((import.meta.env.VITE_PRIVY_APP_ID as string | undefined) ?? "").trim();

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "telegram", "discord"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
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
