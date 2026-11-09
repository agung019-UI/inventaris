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

const STORAGE_KEY = 'templates_custom.json'
const MAX_TEMPLATES = 20
const MAX_JSON_SIZE_BYTES = 200 * 1024 // 200 KB

function validateTemplatePayload(item: any, isUpdate = false) {
  if (!item || typeof item !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Payload template tidak valid.' })
  }

  if (!item.id || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(item.id)) {
    throw createError({ statusCode: 400, statusMessage: 'ID template harus berupa format slug alfanumerik.' })
  }

  if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nama template wajib diisi.' })
  }

  const cols = Number(item.cols)
  const rows = Number(item.rows)
  if (isNaN(cols) || cols < 1 || cols > 12) {
    throw createError({ statusCode: 400, statusMessage: 'Jumlah kolom harus antara 1 sampai 12.' })
  }
  if (isNaN(rows) || rows < 1 || rows > 12) {
    throw createError({ statusCode: 400, statusMessage: 'Jumlah baris harus antara 1 sampai 12.' })
  }

  const width = Number(item.labelWidthMm)
  const height = Number(item.labelHeightMm)
  if (isNaN(width) || width < 10 || width > 215) {
    throw createError({ statusCode: 400, statusMessage: 'Lebar label harus antara 10 mm sampai 215 mm.' })
  }
  if (isNaN(height) || height < 10 || height > 300) {
    throw createError({ statusCode: 400, statusMessage: 'Tinggi label harus antara 10 mm sampai 300 mm.' })
  }

  if (!Array.isArray(item.fields) || item.fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Template harus memiliki minimal 1 field.' })
  }

  const cleanFields: CustomTemplateField[] = item.fields.map((f: any) => ({
    key: String(f.key || 'custom').trim(),
    text: String(f.text || '').slice(0, 500),
    fontSize: typeof f.fontSize === 'number' ? f.fontSize : 10,
    bold: Boolean(f.bold),
    italic: Boolean(f.italic),
    align: ['left', 'center', 'right'].includes(f.align) ? f.align : 'left',
    x: typeof f.x === 'number' ? f.x : undefined,
    y: typeof f.y === 'number' ? f.y : undefined,
    w: typeof f.w === 'number' ? f.w : undefined,
    h: typeof f.h === 'number' ? f.h : undefined
  }))

  const cleanTemplate: CustomTemplate = {
    id: item.id.trim(),
    name: item.name.trim().slice(0, 100),
    source: ['xlsx', 'docx', 'pdf'].includes(item.source) ? item.source : 'docx',
    paper: item.paper || 'A4',
    cols,
    rows,
    perPage: cols * rows,
    labelWidthMm: Math.round(width * 10) / 10,
    labelHeightMm: Math.round(height * 10) / 10,
    gapXMm: typeof item.gapXMm === 'number' ? Math.max(0, item.gapXMm) : 4,
    gapYMm: typeof item.gapYMm === 'number' ? Math.max(0, item.gapYMm) : 4,
    marginMm: typeof item.marginMm === 'number' ? Math.max(0, item.marginMm) : 8,
    fields: cleanFields,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  return cleanTemplate
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event).toUpperCase()
  const storage = useStorage('data')

  // Ambil daftar template kustom dari storage
  const getCustomTemplates = async (): Promise<CustomTemplate[]> => {
    const data = await storage.getItem<CustomTemplate[]>(STORAGE_KEY)
    return Array.isArray(data) ? data : []
  }

  // GET: Daftar semua template kustom
  if (method === 'GET') {
    const templates = await getCustomTemplates()
    return {
      status: 200,
      success: true,
      data: templates
    }
  }

  // POST: Tambah template kustom baru
  if (method === 'POST') {
    const body = await readBody(event)
    const newTemplate = validateTemplatePayload(body, false)

    const list = await getCustomTemplates()
    if (list.length >= MAX_TEMPLATES) {
      throw createError({
        statusCode: 400,
        statusMessage: `Batas maksimal ${MAX_TEMPLATES} template kustom telah tercapai. Hapus template lama terlebih dahulu.`
      })
    }

    if (list.some((t) => t.id === newTemplate.id)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Template dengan ID "${newTemplate.id}" sudah ada.`
      })
    }

    const updatedList = [...list, newTemplate]
    const jsonStr = JSON.stringify(updatedList)
    if (Buffer.byteLength(jsonStr, 'utf8') > MAX_JSON_SIZE_BYTES) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Ukuran total penyimpanan template kustom melebihi batas 200 KB.'
      })
    }

    await storage.setItem(STORAGE_KEY, updatedList)

    return {
      status: 200,
      success: true,
      message: 'Template kustom berhasil ditambahkan.',
      data: newTemplate
    }
  }

  // PUT: Perbarui template kustom yang ada
  if (method === 'PUT') {
    const body = await readBody(event)
    const updatedTemplate = validateTemplatePayload(body, true)

    const list = await getCustomTemplates()
    const index = list.findIndex((t) => t.id === updatedTemplate.id)
    if (index === -1) {
      throw createError({
        statusCode: 404,
        statusMessage: `Template kustom dengan ID "${updatedTemplate.id}" tidak ditemukan.`
      })
    }

    list[index] = {
      ...list[index],
      ...updatedTemplate,
      createdAt: list[index].createdAt || updatedTemplate.createdAt
    }

    const jsonStr = JSON.stringify(list)
    if (Buffer.byteLength(jsonStr, 'utf8') > MAX_JSON_SIZE_BYTES) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Ukuran total penyimpanan template kustom melebihi batas 200 KB.'
      })
    }

    await storage.setItem(STORAGE_KEY, list)

    return {
      status: 200,
      success: true,
      message: 'Template kustom berhasil diperbarui.',
      data: list[index]
    }
  }

  // DELETE: Hapus template kustom berdasarkan ID
  if (method === 'DELETE') {
    const query = getQuery(event)
    const id = query.id as string

    if (!id || typeof id !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Parameter query ?id= wajib disertakan.'
      })
    }

    const list = await getCustomTemplates()
    const filtered = list.filter((t) => t.id !== id)

    if (filtered.length === list.length) {
      throw createError({
        statusCode: 404,
        statusMessage: `Template kustom dengan ID "${id}" tidak ditemukan.`
      })
    }

    await storage.setItem(STORAGE_KEY, filtered)

    // Cek jika template yang dihapus sedang aktif di setingan
    const savedSetting = await storage.getItem<any>('setingan.json')
    if (savedSetting && savedSetting.template_aktif === id) {
      await storage.setItem('setingan.json', {
        template_aktif: 'resmi_bw',
        updated_at: new Date().toISOString()
      })
    }

    return {
      status: 200,
      success: true,
      message: 'Template kustom berhasil dihapus.',
      data: { deletedId: id, resetToDefault: savedSetting?.template_aktif === id }
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: `Method ${method} tidak diizinkan.`
  })
})

