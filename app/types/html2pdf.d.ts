declare module 'html2pdf.js' {
  export interface Html2PdfOptions {
    margin?: number | [number, number, number, number]
    filename?: string
    image?: { type?: string; quality?: number }
    html2canvas?: Record<string, any>
    jsPDF?: Record<string, any>
    pagebreak?: { mode?: string | string[]; avoid?: string | string[]; before?: string | string[]; after?: string | string[] }
  }

  export interface Html2PdfInstance {
    set(opt: Html2PdfOptions): Html2PdfInstance
    from(element: HTMLElement | null): Html2PdfInstance
    save(): Promise<void>
    output(type?: string): Promise<any>
  }

  export interface Html2PdfCallable {
    (): Html2PdfInstance
    default?: Html2PdfCallable
  }

  const html2pdf: Html2PdfCallable
  export default html2pdf
}
