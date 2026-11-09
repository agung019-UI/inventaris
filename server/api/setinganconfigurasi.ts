import defaultData from '../data/dataconfigurasi.json'

export default defineEventHandler(async (event) => {
  const method = getMethod(event).toUpperCase()
  const storage = useStorage('data')

  // GET: Mengambil data konfigurasi saat ini
  if (method === 'GET') {
    const config = (await storage.getItem('dataconfigurasi.json')) || defaultData
    return {
      status: 200,
      success: true,
      data: config
    }
  }

  // POST atau PUT: Memperbarui data konfigurasi
  if (method === 'POST' || method === 'PUT') {
    const body = await readBody(event)
    if (!body || typeof body !== 'object') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Request body konfigurasi tidak valid.'
      })
    }

    // Buang field template_aktif dan updated_at dari body sebelum digabung, agar tidak masuk ke dataconfigurasi
    const { template_aktif, updated_at, ...cleanBody } = body

    const current: any = (await storage.getItem('dataconfigurasi.json')) || defaultData
    const updated = {
      ...current,
      ...cleanBody,
      aplikasi: {
        ...(current.aplikasi || {}),
        ...(cleanBody.aplikasi || {})
      },
      laporan: {
        ...(current.laporan || {}),
        ...(cleanBody.laporan || {})
      },
      updatedAt: new Date().toISOString()
    }

    await storage.setItem('dataconfigurasi.json', updated)

    return {
      status: 200,
      success: true,
      message: 'Konfigurasi berhasil disimpan.',
      data: updated
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: `Method ${method} tidak diizinkan.`
  })
})
