import process from 'node:process'

/** Playwright connection variables can route tests to an unrelated browser. */
const remoteConnectionVariables = [
  'PW_TEST_CONNECT_WS_ENDPOINT',
  'PW_TEST_CONNECT_HEADERS',
  'PW_TEST_CONNECT_EXPOSE_NETWORK',
] as const

/** Reject remote-browser routing before starting any server or test process. */
export function assertLocalBrowserEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const configured = remoteConnectionVariables.filter(name => environment[name])
  if (configured.length) {
    throw new Error(`Browser tests require local Chromium; unset ${configured.join(', ')}.`)
  }
}
