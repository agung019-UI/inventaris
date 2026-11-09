const DEFAULT_TEMPLATES = ['resmi_bw', 'standard', 'compact', 'qrcode', 'tomjerry103', 'sma_bw2'] as const
const DEFAULT_TEMPLATE_AKTIF = 'resmi_bw'

export default defineEventHandler(async (event) => {
  const method = getMethod(event).toUpperCase()
  const storage = useStorage('data')

  // Ambil daftar valid ID: template bawaan + template kustom yang tersimpan
  const getValidTemplateIds = async (): Promise<string[]> => {
    const customList = await storage.getItem<any[]>('templates_custom.json')
    const customIds = Array.isArray(customList) ? customList.map((t) => t.id) : []
    return [...DEFAULT_TEMPLATES, ...customIds]
  }

  // GET: Mengambil data setingan saat ini
  if (method === 'GET') {
    const validTemplates = await getValidTemplateIds()
    const saved = await storage.getItem<any>('setingan.json')
    const template_aktif = (saved && validTemplates.includes(saved.template_aktif))
      ? saved.template_aktif
      : DEFAULT_TEMPLATE_AKTIF
    const updated_at = saved?.updated_at || new Date().toISOString()

    return {
      status: 200,
      success: true,
      data: {
        template_aktif,
        updated_at
      }
    }
  }

  // POST atau PUT: Memperbarui template_aktif
  if (method === 'POST' || method === 'PUT') {
    const body = await readBody(event)
    const validTemplates = await getValidTemplateIds()

    if (!body || typeof body !== 'object' || !body.template_aktif || !validTemplates.includes(body.template_aktif)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Template tidak valid. Pilihan yang tersedia: ${validTemplates.join(', ')}.`
      })
    }

    const updated = {
      template_aktif: String(body.template_aktif),
      updated_at: new Date().toISOString()
    }

    await storage.setItem('setingan.json', updated)

    return {
      status: 200,
      success: true,
      message: 'Setingan template berhasil disimpan.',
      data: updated
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: `Method ${method} tidak diizinkan.`
  })
})
