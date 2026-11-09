// ================================================================
// UTIL HARGA BERSAMA (dipakai total_aset, rekapitulasi, perbandingan_harga)
// Nuxt meng-auto-import file di app/utils, tetapi tetap boleh di-import eksplisit.
// ================================================================

/**
 * Mengubah string harga dari Google Sheets menjadi angka rupiah bulat.
 * Kebal format: "Rp 150.000", "Rp 150.000,00", "Rp150,000.00", "150000", " 1.250.000 ".
 * Bagian desimal (pemisah . atau , yang diikuti 1–2 digit di akhir) dibuang (dibulatkan ke bawah),
 * sedangkan pemisah yang diikuti 3 digit dianggap pemisah ribuan.
 * Nilai kosong, "-", atau non-angka menghasilkan 0.
 */
export const parsePrice = (priceStr: any): number => {
    if (priceStr === null || priceStr === undefined) return 0
    if (typeof priceStr === 'number') return Number.isFinite(priceStr) ? Math.trunc(priceStr) : 0

    // Sisakan hanya digit dan pemisah
    let str: string = String(priceStr).trim().replace(/[^0-9.,]/g, '')
    if (!str) return 0

    // Buang bagian desimal di akhir: ",00" / ".00" / ",5"
    str = str.replace(/[.,]\d{1,2}$/, '')

    // Sisanya: semua pemisah adalah pemisah ribuan
    const cleanStr = str.replace(/[^0-9]/g, '')
    return parseInt(cleanStr, 10) || 0
}

/** Format rupiah Indonesia, mis. 1250000 -> "Rp 1.250.000" */
export const formatRupiah = (angka: number): string => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(angka || 0)
}

/** Format persen 1 desimal gaya Indonesia, mis. 12.345 -> "12,3%" */
export const formatPercent = (value: number, withSign = false): string => {
    const abs = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value))
    const sign = withSign ? (value > 0 ? '+' : value < 0 ? '−' : '') : (value < 0 ? '−' : '')
    return `${sign}${abs}%`
}

