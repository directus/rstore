/** Development-only hosting options; credentials never appear in discovery metadata. */
export interface RstoreDevtoolsViteOptions {
  /** Inspector mount relative to application base. Defaults to /__rstore/. */
  base?: string
  /** Sidecar binding host when no shared HTTP server exists. */
  host?: string
  /** Explicit extra viewer origins. Wildcards are unsupported. */
  allowedOrigins?: readonly string[]
  /** Explicit Node producer credentials. Browser token is independently minted. */
  clientAuthTokens?: string[]
  /** Private SSR producer credentials; never returned from bootstrap. */
  ssrAuthTokens?: string[]
  /** Explicit built inspector directory for workspace development. */
  clientDir?: string
  /** Notify host after actual listening origin becomes available. */
  onReady?: (info: { baseURL: string, base: string }) => void
  /** Framework host application base; defaults to Vite application base. */
  applicationBase?: string
  /** Framework-owned HTTP listener when Vite uses middleware mode. */
  server?: import('node:http').Server
  /** Actual framework listening origin; resolved lazily. */
  origin?: () => string
}
