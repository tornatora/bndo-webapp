declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  export default mammoth;
}

declare module 'html2pdf.js' {
  type Html2PdfChain = {
    set: (opts: Record<string, unknown>) => Html2PdfChain;
    from: (element: HTMLElement) => Html2PdfChain;
    save: () => Promise<void>;
  };
  const html2pdf: () => Html2PdfChain;
  export default html2pdf;
}

