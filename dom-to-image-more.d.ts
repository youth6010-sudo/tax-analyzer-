declare module 'dom-to-image-more' {
  export type DomToImageOptions = {
    filter?: (node: Node) => boolean;
    bgcolor?: string;
    width?: number;
    height?: number;
    style?: Record<string, string>;
    quality?: number;
    scale?: number;
    cacheBust?: boolean;
    imagePlaceholder?: string;
    copyDefaultStyles?: boolean;
    onclone?: (cloned: HTMLElement) => void | Promise<void>;
    adjustClonedNode?: (node: Node, clone: Node, after: boolean) => Node;
  };

  export type DomToImageApi = {
    toSvg: (node: HTMLElement, options?: DomToImageOptions) => Promise<string>;
    toPng: (node: HTMLElement, options?: DomToImageOptions) => Promise<string>;
    toJpeg: (node: HTMLElement, options?: DomToImageOptions) => Promise<string>;
    toBlob: (node: HTMLElement, options?: DomToImageOptions) => Promise<Blob>;
    toPixelData: (node: HTMLElement, options?: DomToImageOptions) => Promise<Uint8ClampedArray>;
    toCanvas: (node: HTMLElement, options?: DomToImageOptions) => Promise<HTMLCanvasElement>;
  };

  const domtoimage: DomToImageApi;
  export default domtoimage;
}
