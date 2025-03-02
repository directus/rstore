export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', async (event) => {
    const header = getHeader(event, 'x-fake-delay')
    if (header) {
      await wait(Number.parseInt(header))
    }
  })
})
