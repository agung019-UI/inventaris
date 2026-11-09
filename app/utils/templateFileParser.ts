// app/utils/templateFileParser.ts
// Client-side parser for .xlsx, .docx, and .pdf template files.
// Menggunakan API browser native (DecompressionStream, DOMParser, DataView, TextDecoder).
// Menghasilkan struktur JSON CustomTemplate tanpa menyimpan HTML mentah.

import type { CustomTemplate, CustomTemplateField } from '~/types/customTemplate'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

// Helper uncompress ZIP (DOCX dan XLSX adalah arsip ZIP)
async function unzipZip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const files: Record<string, Uint8Array> = {}
    let offset = 0

    while (offset < buf.byteLength - 4) {
        const sig = view.getUint32(offset, true)
        if (sig === 0x04034b50) { // Local file header
            const method = view.getUint16(offset + 8, true)
            const compSize = view.getUint32(offset + 18, true)
            const nameLen = view.getUint16(offset + 26, true)
            const extraLen = view.getUint16(offset + 28, true)
            const name = new TextDecoder().decode(buf.slice(offset + 30, offset + 30 + nameLen))
            const dataStart = offset + 30 + nameLen + extraLen
            const dataEnd = dataStart + compSize
            const compData = buf.slice(dataStart, dataEnd)

            if (method === 0) {
                files[name] = compData
            } else if (method === 8) { // Deflate
                const ds = new DecompressionStream('deflate-raw')
                const writer = ds.writable.getWriter()
                writer.write(compData)
                writer.close()
                const chunks: Uint8Array[] = []
                const reader = ds.readable.getReader()
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    if (value) chunks.push(value)
                }
                const total = chunks.reduce((acc, c) => acc + c.length, 0)
                const out = new Uint8Array(total)
                let pos = 0
                for (const c of chunks) {
                    out.set(c, pos)
                    pos += c.length
                }
                files[name] = out
            }
            offset = dataEnd
        } else {
            offset++
        }
    }
    return files
}

// Inisialisasi key field otomatis dari teks jika belum memiliki {{tag}}
function inferKeyFromText(text: string): { key: string; text: string } {
    const upper = text.toUpperCase()
    
    // Sudah mengandung placeholder baku
    if (text.includes('{{no_inv}}')) return { key: 'no_inv', text }
    if (text.includes('{{nama_barang}}')) return { key: 'nama_barang', text }
    if (text.includes('{{lokasi}}')) return { key: 'lokasi', text }
    if (text.includes('{{asal_dana}}')) return { key: 'asal_dana', text }
    if (text.includes('{{tahun}}')) return { key: 'tahun', text }
    if (text.includes('{{lembaga}}')) return { key: 'lembaga', text }
    if (text.includes('{{barcode}}')) return { key: 'barcode', text }
    if (text.includes('{{qrcode}}')) return { key: 'qrcode', text }

    // Deteksi konteks kata kunci label sekolah
    if (upper.includes('NO INV') || upper.includes('INVENTARIS')) {
        return { key: 'no_inv', text: 'NO INV : {{no_inv}}' }
    }
    if (upper.includes('LOKASI') || upper.includes('RUANG')) {
        return { key: 'lokasi', text: 'LOKASI : {{lokasi}}' }
    }
    if (upper.includes('ASAL DANA') || upper.includes('DANA')) {
        return { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}' }
    }
    if (upper.includes('TAHUN') || upper.includes('THN')) {
        return { key: 'tahun', text: 'TAHUN : {{tahun}}' }
    }
    if (upper.includes('BUDHI WARMAN') || upper.includes('SEKOLAH') || upper.includes('SMA') || upper.includes('SMK')) {
        return { key: 'lembaga', text: text.trim() }
    }
    if (upper.includes('BARANG') || upper.includes('NAMA')) {
        return { key: 'nama_barang', text: '{{nama_barang}}' }
    }

    return { key: 'custom', text: text.trim() }
}

// ============================================================================
// 1. DOCX PARSER (.docx)
// ============================================================================
async function parseDocx(buf: Uint8Array, fileName: string): Promise<Partial<CustomTemplate>> {
    const files = await unzipZip(buf)
    const docXmlBytes = files['word/document.xml']
    if (!docXmlBytes) {
        throw new Error('File Word (.docx) tidak valid atau rusak (word/document.xml tidak ditemukan).')
    }

    const xmlStr = new TextDecoder().decode(docXmlBytes)
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlStr, 'application/xml')

    const tableEls = Array.from(doc.getElementsByTagNameNS('*', 'tbl'))
    let detectedCols = 2
    let detectedRows = 4
    const fields: CustomTemplateField[] = []

    if (tableEls.length > 0) {
        // Ambil tabel pertama sebagai representasi kisi label
        const tbl = tableEls[0]!
        const trEls = Array.from(tbl.getElementsByTagNameNS('*', 'tr'))
        detectedRows = Math.max(1, Math.min(12, trEls.length))

        if (trEls.length > 0) {
            const firstRowCells = Array.from(trEls[0]!.getElementsByTagNameNS('*', 'tc'))
            // Hitung kolom yang berisi teks (abaikan kolom jarak kosong jika ada)
            const filledCells = firstRowCells.filter(cell => {
                const textContent = cell.textContent || ''
                return textContent.trim().length > 0
            })
            detectedCols = Math.max(1, Math.min(12, filledCells.length || firstRowCells.length))
        }

        // Ambil isi dari cell pertama yang memiliki teks sebagai model satu label
        let sampleCell: Element | null = null
        for (const tr of trEls) {
            for (const tc of Array.from(tr.getElementsByTagNameNS('*', 'tc'))) {
                if ((tc.textContent || '').trim().length > 0) {
                    sampleCell = tc
                    break
                }
            }
            if (sampleCell) break
        }

        if (sampleCell) {
            const pEls = Array.from(sampleCell.getElementsByTagNameNS('*', 'p'))
            for (const p of pEls) {
                const jcEl = p.getElementsByTagNameNS('*', 'jc')[0]
                const jcVal = jcEl?.getAttributeNS('*', 'val') || jcEl?.getAttribute('w:val') || 'left'
                const align: 'left' | 'center' | 'right' = jcVal === 'center' ? 'center' : (jcVal === 'right' ? 'right' : 'left')

                let lineText = ''
                let isBold = false
                let isItalic = false
                let fontSize = 10

                const rEls = Array.from(p.getElementsByTagNameNS('*', 'r'))
                for (const r of rEls) {
                    const tEls = Array.from(r.getElementsByTagNameNS('*', 't'))
                    for (const t of tEls) {
                        lineText += t.textContent || ''
                    }

                    if (r.getElementsByTagNameNS('*', 'b').length > 0) isBold = true
                    if (r.getElementsByTagNameNS('*', 'i').length > 0) isItalic = true

                    const szEl = r.getElementsByTagNameNS('*', 'sz')[0]
                    if (szEl) {
                        const val = parseInt(szEl.getAttributeNS('*', 'val') || szEl.getAttribute('w:val') || '20', 10)
                        if (!isNaN(val) && val > 0) {
                            fontSize = Math.round(val / 2) // half-points to pt
                        }
                    }
                }

                if (lineText.trim()) {
                    const inferred = inferKeyFromText(lineText.trim())
                    fields.push({
                        key: inferred.key,
                        text: inferred.text,
                        fontSize,
                        bold: isBold,
                        italic: isItalic,
                        align
                    })
                }
            }
        }
    }

    // Jika tidak ada tabel terdeteksi, ambil paragraf langsung dari dokumen
    if (fields.length === 0) {
        const pEls = Array.from(doc.getElementsByTagNameNS('*', 'p'))
        for (const p of pEls.slice(0, 10)) {
            const text = (p.textContent || '').trim()
            if (text) {
                const inferred = inferKeyFromText(text)
                fields.push({
                    key: inferred.key,
                    text: inferred.text,
                    fontSize: 10,
                    bold: text.includes('SMA') || text.includes('INV'),
                    align: text.includes('SMA') ? 'center' : 'left'
                })
            }
        }
    }

    // Jika tetap kosong, beri default fields label
    if (fields.length === 0) {
        fields.push(
            { key: 'lembaga', text: 'SMA BUDHI WARMAN II JAKARTA', fontSize: 11, bold: true, align: 'center' },
            { key: 'no_inv', text: 'NO INV : {{no_inv}}', fontSize: 10, bold: true, align: 'left' },
            { key: 'lokasi', text: 'LOKASI : {{lokasi}}', fontSize: 10, align: 'left' },
            { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}', fontSize: 10, align: 'left' },
            { key: 'tahun', text: 'TAHUN : {{tahun}}', fontSize: 10, align: 'left' }
        )
    }

    // Hitung ukuran label di kertas A4 (210 x 297 mm)
    const gapXMm = 6
    const gapYMm = 6
    const marginMm = 8
    const labelWidthMm = Math.round(((210 - (marginMm * 2) - ((detectedCols - 1) * gapXMm)) / detectedCols) * 10) / 10
    const labelHeightMm = Math.round(((297 - (marginMm * 2) - ((detectedRows - 1) * gapYMm)) / detectedRows) * 10) / 10

    const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\s-]/g, '').trim()
    const name = cleanBaseName.length > 0 ? `Label ${cleanBaseName}` : `Label Word (${detectedCols} x ${detectedRows})`

    return {
        name,
        source: 'docx',
        paper: 'A4',
        cols: detectedCols,
        rows: detectedRows,
        perPage: detectedCols * detectedRows,
        labelWidthMm: Math.max(20, Math.min(210, labelWidthMm)),
        labelHeightMm: Math.max(15, Math.min(297, labelHeightMm)),
        gapXMm,
        gapYMm,
        marginMm,
        fields
    }
}

// ============================================================================
// 2. XLSX PARSER (.xlsx)
// ============================================================================
async function parseXlsx(buf: Uint8Array, fileName: string): Promise<Partial<CustomTemplate>> {
    const files = await unzipZip(buf)
    const wbBytes = files['xl/workbook.xml']
    if (!wbBytes) {
        throw new Error('File Excel (.xlsx) tidak valid atau rusak (xl/workbook.xml tidak ditemukan).')
    }

    // Shared strings
    const sharedStrings: string[] = []
    const ssBytes = files['xl/sharedStrings.xml']
    if (ssBytes) {
        const ssXml = new DOMParser().parseFromString(new TextDecoder().decode(ssBytes), 'application/xml')
        for (const si of Array.from(ssXml.getElementsByTagNameNS('*', 'si'))) {
            let s = ''
            for (const t of Array.from(si.getElementsByTagNameNS('*', 't'))) {
                s += t.textContent || ''
            }
            sharedStrings.push(s)
        }
    }

    // Sheet 1
    const sheetBytes = files['xl/worksheets/sheet1.xml'] || Object.entries(files).find(([k]) => k.startsWith('xl/worksheets/sheet'))?.[1]
    if (!sheetBytes) {
        throw new Error('Tidak ada sheet yang dapat dibaca di file Excel.')
    }

    const sheetXml = new DOMParser().parseFromString(new TextDecoder().decode(sheetBytes), 'application/xml')
    const rowEls = Array.from(sheetXml.getElementsByTagNameNS('*', 'row'))

    const rawRows: string[][] = []
    for (const r of rowEls.slice(0, 30)) {
        const rArr: string[] = []
        for (const c of Array.from(r.getElementsByTagNameNS('*', 'c'))) {
            const t = c.getAttribute('t')
            let val = ''
            if (t === 's') {
                const idx = parseInt(c.getElementsByTagNameNS('*', 'v')[0]?.textContent || '-1', 10)
                val = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx]! : ''
            } else {
                val = c.getElementsByTagNameNS('*', 'v')[0]?.textContent || ''
            }
            if (val.trim()) rArr.push(val.trim())
        }
        if (rArr.length) rawRows.push(rArr)
    }

    const fields: CustomTemplateField[] = []
    let detectedCols = 2
    let detectedRows = 4

    // Cari baris-baris pertama sebagai field satu label
    for (const row of rawRows) {
        for (const cellText of row) {
            if (fields.length < 8 && !fields.some(f => f.text === cellText)) {
                const inferred = inferKeyFromText(cellText)
                fields.push({
                    key: inferred.key,
                    text: inferred.text,
                    fontSize: 10,
                    bold: cellText.toUpperCase().includes('SMA') || cellText.toUpperCase().includes('INV'),
                    align: cellText.toUpperCase().includes('SMA') ? 'center' : 'left'
                })
            }
        }
    }

    if (fields.length === 0) {
        fields.push(
            { key: 'lembaga', text: 'SMA BUDHI WARMAN II JAKARTA', fontSize: 11, bold: true, align: 'center' },
            { key: 'no_inv', text: 'NO INV : {{no_inv}}', fontSize: 10, bold: true, align: 'left' },
            { key: 'lokasi', text: 'LOKASI : {{lokasi}}', fontSize: 10, align: 'left' },
            { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}', fontSize: 10, align: 'left' },
            { key: 'tahun', text: 'TAHUN : {{tahun}}', fontSize: 10, align: 'left' }
        )
    }

    const gapXMm = 6
    const gapYMm = 6
    const marginMm = 8
    const labelWidthMm = Math.round(((210 - (marginMm * 2) - ((detectedCols - 1) * gapXMm)) / detectedCols) * 10) / 10
    const labelHeightMm = Math.round(((297 - (marginMm * 2) - ((detectedRows - 1) * gapYMm)) / detectedRows) * 10) / 10

    const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\s-]/g, '').trim()
    const name = cleanBaseName.length > 0 ? `Label ${cleanBaseName}` : `Label Excel (${detectedCols} x ${detectedRows})`

    return {
        name,
        source: 'xlsx',
        paper: 'A4',
        cols: detectedCols,
        rows: detectedRows,
        perPage: detectedCols * detectedRows,
        labelWidthMm: Math.max(20, Math.min(210, labelWidthMm)),
        labelHeightMm: Math.max(15, Math.min(297, labelHeightMm)),
        gapXMm,
        gapYMm,
        marginMm,
        fields
    }
}

// ============================================================================
// 3. PDF PARSER (.pdf - teks berbasis string)
// ============================================================================
async function parsePdf(buf: Uint8Array, fileName: string): Promise<Partial<CustomTemplate>> {
    // Cari stream teks di dalam PDF berbasis teks
    const textContent = new TextDecoder('latin1').decode(buf)
    const matches: string[] = []

    // Pola umum teks PDF: (Teks Di Sini) Tj atau [(Teks 1) 10 (Teks 2)] TJ
    const tjRegex = /\(([^)]+)\)\s*Tj/g
    let match: RegExpExecArray | null
    while ((match = tjRegex.exec(textContent)) !== null) {
        if (match[1]?.trim()) matches.push(match[1].trim())
    }

    const fields: CustomTemplateField[] = []
    const uniqueMatches = Array.from(new Set(matches))

    for (const t of uniqueMatches.slice(0, 10)) {
        const inferred = inferKeyFromText(t)
        fields.push({
            key: inferred.key,
            text: inferred.text,
            fontSize: 10,
            bold: t.toUpperCase().includes('SMA') || t.toUpperCase().includes('INV'),
            align: t.toUpperCase().includes('SMA') ? 'center' : 'left'
        })
    }

    if (fields.length === 0) {
        fields.push(
            { key: 'lembaga', text: 'SMA BUDHI WARMAN II JAKARTA', fontSize: 11, bold: true, align: 'center' },
            { key: 'no_inv', text: 'NO INV : {{no_inv}}', fontSize: 10, bold: true, align: 'left' },
            { key: 'lokasi', text: 'LOKASI : {{lokasi}}', fontSize: 10, align: 'left' },
            { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}', fontSize: 10, align: 'left' },
            { key: 'tahun', text: 'TAHUN : {{tahun}}', fontSize: 10, align: 'left' }
        )
    }

    const detectedCols = 2
    const detectedRows = 4
    const gapXMm = 6
    const gapYMm = 6
    const marginMm = 8
    const labelWidthMm = 92
    const labelHeightMm = 67

    const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\s-]/g, '').trim()
    const name = cleanBaseName.length > 0 ? `Label ${cleanBaseName}` : `Label PDF (${detectedCols} x ${detectedRows})`

    return {
        name,
        source: 'pdf',
        paper: 'A4',
        cols: detectedCols,
        rows: detectedRows,
        perPage: detectedCols * detectedRows,
        labelWidthMm,
        labelHeightMm,
        gapXMm,
        gapYMm,
        marginMm,
        fields
    }
}

// ============================================================================
// EXPORT FUNGSI UTAMA: parseTemplateFile
// ============================================================================
export async function parseTemplateFile(file: File): Promise<Partial<CustomTemplate>> {
    if (!file) throw new Error('File belum dipilih.')

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Ukuran file melebihi batas maksimal 5 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`)
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'docx', 'pdf'].includes(ext)) {
        throw new Error('Format file tidak didukung. Mohon gunakan file .xlsx, .docx, atau .pdf.')
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    switch (ext) {
        case 'docx':
            return await parseDocx(bytes, file.name)
        case 'xlsx':
            return await parseXlsx(bytes, file.name)
        case 'pdf':
            return await parsePdf(bytes, file.name)
        default:
            throw new Error(`Format file .${ext} belum didukung.`)
    }
}

