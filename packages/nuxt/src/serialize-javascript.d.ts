declare module 'serialize-javascript' {
  interface SerializeOptions {
    unsafe?: boolean
    ignoreFunction?: boolean
    space?: string | number
    isJSON?: boolean
  }

  export default function serialize(value: any, options?: SerializeOptions): string
}
