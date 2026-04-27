declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options: { data: Buffer | Uint8Array });
    getText(): Promise<{ text: string; total: number }>;
    destroy(): Promise<void>;
  }
  export default PDFParse;
}
