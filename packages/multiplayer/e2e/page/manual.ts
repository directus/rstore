/**
 * Manual E5 mode (`index.html?manual`): controls for a person testing IME
 * input on a device. Editor A is the one to type into with the IME; editor B
 * plays a remote typist in the same paragraph.
 */
export function mountManualControls(collab: Window['collab']) {
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;font:14px sans-serif'
  const result = document.createElement('pre')
  result.style.cssText = 'white-space:pre-wrap;font:13px monospace'
  let typing = false
  let typed = 0

  const button = (label: string, action: () => unknown) => {
    const element = document.createElement('button')
    element.textContent = label
    element.style.cssText = 'font-size:16px;padding:8px 12px'
    element.addEventListener('click', () => action())
    bar.append(element)
    return element
  }

  button('Reset', async () => {
    typing = false
    typed = 0
    await collab.reset(Date.now() % 1_000_000)
    result.textContent = 'Reset. Tap editor A and compose.'
  })
  /** B types one uppercase letter every ~400 ms while the typist is on. */
  const typeNext = async () => {
    if (typing) {
      await collab.session().typeInB(String.fromCharCode(65 + (typed++ % 26)), 400)
      void typeNext()
    }
  }
  const toggle = button('Remote typist: off', () => {
    typing = !typing
    toggle.textContent = `Remote typist: ${typing ? 'on' : 'off'}`
    void typeNext()
  })
  button('Check', async () => {
    await collab.session().settled()
    const docs = collab.session().docs()
    const same = JSON.stringify(docs.a) === JSON.stringify(docs.server) && JSON.stringify(docs.b) === JSON.stringify(docs.server)
    result.textContent = `${same ? 'CONVERGED' : 'DIVERGED'}\nremote letters typed: ${typed}\ncompositions: ${docs.stats.compositions}, remote edits during a composition: ${docs.stats.remoteWhileComposing}\nA: ${docs.textA}`
  })
  document.body.prepend(bar, result)
}
