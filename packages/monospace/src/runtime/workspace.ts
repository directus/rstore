/**
 * Options identifying a Monospace workspace. Monospace renamed projects to
 * workspaces; the API path segment (`/api/{workspace}`) is unchanged.
 */
export interface MonospaceWorkspaceOptions {
  /**
   * Monospace workspace identifier.
   */
  workspace?: string

  /**
   * Monospace workspace identifier.
   *
   * @deprecated Use `workspace` instead.
   */
  project?: string
}

/**
 * Resolves the workspace identifier, falling back to the deprecated
 * `project` option.
 */
export function resolveMonospaceWorkspace(options: MonospaceWorkspaceOptions): string | undefined {
  return options.workspace ?? options.project
}
