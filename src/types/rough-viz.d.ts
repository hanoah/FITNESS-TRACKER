declare module 'rough-viz' {
  export class Bar {
    constructor(opts: {
      element: HTMLElement | string
      data: { labels: string[]; values: number[] }
      title?: string
      width?: number
      height?: number
      roughness?: number
      color?: string
    })
    remove?(): void
  }
  export class Line {
    constructor(opts: unknown)
  }
}
