export type Awaitable<T> = T | Promise<T>

export type HybridPromise<T> = Promise<T> & T

type Primitive = null | undefined | string | number | boolean | symbol | bigint

type IsEqual<T1, T2> = T1 extends T2
  ? (<G>() => G extends T1 ? 1 : 2) extends <G>() => G extends T2 ? 1 : 2
      ? true
      : false
  : false

interface File extends Blob {
  readonly lastModified: number
  readonly name: string
}

interface FileList {
  readonly length: number
  item: (index: number) => File | null
  [index: number]: File
}

type BrowserNativeObject = Date | FileList | File

type IsTuple<T extends ReadonlyArray<any>> = number extends T['length']
  ? false
  : true

type TupleKeys<T extends ReadonlyArray<any>> = Exclude<keyof T, keyof any[]>

type AnyIsEqual<T1, T2> = T1 extends T2
  ? IsEqual<T1, T2> extends true
    ? true
    : never
  : never

type PathImpl<K extends string | number, V, TraversedTypes> = V extends
| Primitive
| BrowserNativeObject
  ? `${K}`
  : true extends AnyIsEqual<TraversedTypes, V>
    ? `${K}`
    : `${K}` | `${K}.${PathInternal<V, TraversedTypes | V>}`

type ArrayKey = number

type PathInternal<T, TraversedTypes = T> = T extends ReadonlyArray<infer V>
  ? IsTuple<T> extends true
    ? {
        [K in TupleKeys<T>]-?: PathImpl<K & string, T[K], TraversedTypes>;
      }[TupleKeys<T>]
    : PathImpl<ArrayKey, V, TraversedTypes>
  : {
      [K in keyof T]-?: PathImpl<K & string, T[K], TraversedTypes>;
    }[keyof T]

export type Path<T> = T extends any ? PathInternal<T> : never

export type PathValue<T, P extends Path<T>> = PathValueImpl<
  T,
  P
>

type PathValueImpl<T, P extends string> = T extends any
  ? P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? PathValueImpl<T[K], R>
      : K extends `${ArrayKey}`
        ? T extends ReadonlyArray<infer V>
          ? PathValueImpl<V, R>
          : never
        : never
    : P extends keyof T
      ? T[P]
      : P extends `${ArrayKey}`
        ? T extends ReadonlyArray<infer V>
          ? V
          : never
        : never
  : never
