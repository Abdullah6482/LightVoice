export interface PDFSection {
  title: string;
  kind: 'chapter' | 'supplementary';
  startPage: number;
  endPage: number;
  imagePages?: number[];
  text?: string;
}
export interface PDFReport {
  version: number;
  mode: 'chapters' | 'pages';
  pageCount: number;
  imagePages: number[];
  sections: PDFSection[];
  warnings: string[];
}
