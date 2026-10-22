import { defineComponent, h } from 'vue'

/** Presentation-only iframe; application bootstrap owns instrumentation and relay lifetime. */
export const RstoreDevtoolsPanel = defineComponent({
  name: 'RstoreDevtoolsPanel',
  props: {
    /** Explicit inspector asset URL, separate from relay origin. */
    src: { type: String, required: true },
    /** Unmount iframe when hidden so Devframe closes its viewer connection. */
    visible: { type: Boolean, default: true },
    /** Accessible iframe title. */
    title: { type: String, default: 'RStore devtools' },
  },
  setup: props => () => props.visible
    ? h('iframe', { src: props.src, title: props.title, style: { width: '100%', height: '100%', border: '0' } })
    : null,
})
