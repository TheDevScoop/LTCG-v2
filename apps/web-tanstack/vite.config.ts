import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rollupInvalidAnnotationMessage =
  'contains an annotation that Rollup cannot interpret due to the position of the comment'

const knownInvalidAnnotationPackages = [
  '/node_modules/@privy-io/react-auth/',
  '/node_modules/ox/_esm/',
]

function isKnownThirdPartyInvalidAnnotationWarning(warning: {
  code?: string
  message?: string
  id?: string
  loc?: { file?: string }
}) {
  if (warning.code !== 'INVALID_ANNOTATION') return false
  if (!warning.message?.includes(rollupInvalidAnnotationMessage)) return false

  const source = warning.id ?? warning.loc?.file ?? ''
  if (knownInvalidAnnotationPackages.some((pkg) => source.includes(pkg))) {
    return true
  }
  return knownInvalidAnnotationPackages.some((pkg) => warning.message?.includes(pkg))
}

export default defineConfig({
  server: {
    port: 3334,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined

          if (id.includes('/node_modules/@walletconnect/')) return 'vendor-privy'
          if (id.includes('/node_modules/@reown/')) return 'vendor-privy'
          if (id.includes('/node_modules/@wagmi/')) return 'vendor-privy'
          if (id.includes('/node_modules/viem/')) return 'vendor-privy'
          if (id.includes('/node_modules/ox/')) return 'vendor-privy'
          if (id.includes('/node_modules/@base-org/account/')) return 'vendor-privy'
          if (id.includes('/node_modules/mipd/')) return 'vendor-privy'

          if (id.includes('/node_modules/@privy-io/')) return 'vendor-privy'

          if (id.includes('/node_modules/three/')) return 'vendor-three'
          if (id.includes('/node_modules/@react-three/')) return 'vendor-three'

          if (id.includes('/node_modules/framer-motion/')) return 'vendor-motion'
          if (id.includes('/node_modules/posthog-js/')) return 'vendor-posthog'
          if (id.includes('/node_modules/@sentry/')) return 'vendor-sentry'
          if (id.includes('/node_modules/convex/')) return 'vendor-convex'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor-react'
          return undefined
        },
      },
      onwarn(warning, warn) {
        if (isKnownThirdPartyInvalidAnnotationWarning(warning)) return
        warn(warning)
      },
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
  ],
})
