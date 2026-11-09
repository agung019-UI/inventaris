export interface CustomTemplateField {
  key: string
  text: string
  x?: number
  y?: number
  w?: number
  h?: number
  fontSize?: number
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface CustomTemplate {
  id: string
  name: string
  source: 'xlsx' | 'docx' | 'pdf'
  paper: string
  cols: number
  rows: number
  perPage: number
  labelWidthMm: number
  labelHeightMm: number
  gapXMm: number
  gapYMm: number
  marginMm: number
  fields: CustomTemplateField[]
  createdAt: string
  updatedAt?: string
}