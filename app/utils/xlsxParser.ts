// app/utils/xlsxParser.ts
// Pembaca file Excel (.xlsx) client-side tanpa dependensi luar.
// Menggunakan native DecompressionStream('deflate-raw') & DOMParser bawaan browser.

export type ParsedSheet = {
    name: string
    rows: string[][]
}

export type ParsedLabelItem = {
    noInv: string
    nama_barang: string
    kode_barang: string
    no_urut: string
    ruang: string
    asal_dana: string
    tahun: string
    lembaga: string
}

async function unzipXlsx(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
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

const colToIndex = (ref: string): number => {
    const letters = (ref.match(/^[A-Z]+/i)?.[0] ?? 'A').toUpperCase()
    let n = 0
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
    return n - 1
}

export async function readXlsxWorkbook(arrayBuffer: ArrayBuffer): Promise<ParsedSheet[]> {
    const bytes = new Uint8Array(arrayBuffer)
    const files = await unzipXlsx(bytes)

    const wbBytes = files['xl/workbook.xml']
    if (!wbBytes) throw new Error('File bukan file Excel (.xlsx) yang valid.')

    const parser = new DOMParser()
    const wbXml = parser.parseFromString(new TextDecoder().decode(wbBytes), 'application/xml')

    // Relasi workbook
    const relsBytes = files['xl/_rels/workbook.xml.rels']
    const relsMap = new Map<string, string>()
    if (relsBytes) {
        const relsXml = parser.parseFromString(new TextDecoder().decode(relsBytes), 'application/xml')
        const relEls = Array.from(relsXml.getElementsByTagNameNS('*', 'Relationship'))
        for (const r of relEls) {
            relsMap.set(r.getAttribute('Id') || '', r.getAttribute('Target') || '')
        }
    }

    // Shared strings
    const sharedStrings: string[] = []
    const ssBytes = files['xl/sharedStrings.xml']
    if (ssBytes) {
        const ssXml = parser.parseFromString(new TextDecoder().decode(ssBytes), 'application/xml')
        const siEls = Array.from(ssXml.getElementsByTagNameNS('*', 'si'))
        for (const si of siEls) {
            let str = ''
            const tEls = Array.from(si.getElementsByTagNameNS('*', 't'))
            for (const t of tEls) {
                str += t.textContent || ''
            }
            sharedStrings.push(str)
        }
    }

    const sheets: ParsedSheet[] = []
    const sheetEls = Array.from(wbXml.getElementsByTagNameNS('*', 'sheet'))

    for (const s of sheetEls) {
        const name = s.getAttribute('name') || ''
        const state = s.getAttribute('state')
        if (state === 'hidden' || state === 'veryHidden') continue

        const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id') || ''
        let target = relsMap.get(rid) || ''
        if (!target) continue
        target = target.startsWith('/') ? target.slice(1) : (target.startsWith('xl/') ? target : 'xl/' + target)

        const sheetBytes = files[target]
        if (!sheetBytes) continue

        const sheetXml = parser.parseFromString(new TextDecoder().decode(sheetBytes), 'application/xml')
        const rowEls = Array.from(sheetXml.getElementsByTagNameNS('*', 'row'))
        const rows: string[][] = []

        for (const r of rowEls) {
            const rowArr: string[] = []
            const cEls = Array.from(r.getElementsByTagNameNS('*', 'c'))
            for (const c of cEls) {
                const ref = c.getAttribute('r') || ''
                const colIdx = colToIndex(ref)
                const t = c.getAttribute('t')
                let val = ''
                if (t === 's') {
                    const vEl = c.getElementsByTagNameNS('*', 'v')[0]
                    const idx = vEl ? parseInt(vEl.textContent || '0', 10) : -1
                    val = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx]! : ''
                } else if (t === 'inlineStr') {
                    const tEl = c.getElementsByTagNameNS('*', 't')[0]
                    val = tEl ? tEl.textContent || '' : ''
                } else {
                    const vEl = c.getElementsByTagNameNS('*', 'v')[0]
                    val = vEl ? vEl.textContent || '' : ''
                }

                while (rowArr.length < colIdx) rowArr.push('')
                rowArr[colIdx] = val.trim()
            }
            if (rowArr.some(v => v !== '')) {
                rows.push(rowArr)
            }
        }

        sheets.push({ name, rows })
    }

    return sheets
}

// Mengubah baris-baris sheet menjadi LabelData yang standar
export function parseSheetToLabels(rows: string[][], fallbackLembaga = 'SMA', sheetName = ''): ParsedLabelItem[] {
    if (!rows.length) return []

    // Cari baris header
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const line = rows[i]!.map(c => c.toUpperCase()).join(' ')
        if (line.includes('NO INVENTARIS') || line.includes('NAMA BARANG') || line.includes('KODE') || line.includes('BARANG') || line.includes('LOKASI BARANG')) {
            headerRowIdx = i
            break
        }
    }

    if (headerRowIdx === -1) headerRowIdx = 0
    const headers = rows[headerRowIdx]!.map(h => h.toUpperCase().trim())

    const colNoInv = headers.findIndex(h => h.includes('NO INVENTARIS') || h.includes('NO_INV') || h === 'INVENTARIS' || h.includes('INVENTARIS'))
    const colThnInv = headers.findIndex(h => h === 'THN' || h === '.THN' || h.endsWith(' THN') || h.startsWith('THN ') || h === 'TAHUN INV')
    const colNama = headers.findIndex(h => h.includes('NAMA BARANG') || h === 'NAMA' || h.includes('NAMA') || h.includes('BENDA'))
    const colKode = headers.findIndex(h => h.includes('KODE') || h.includes('GOLONGAN'))
    const colNoUrut = headers.findIndex(h => h === 'NO' || h === 'NO.' || h.includes('NO URUT') || h.includes('URUT'))
    const colLokasi = headers.findIndex(h => h.includes('LOKASI BARANG') || h.includes('LOKASI') || h.includes('RUANG') || h.includes('TEMPAT'))
    const colAsalDana = headers.findIndex(h => h.includes('ASAL DANA') || h.includes('ASAL') || h.includes('DANA') || h.includes('PEMBELIAN'))
    const colTahun = headers.findIndex(h => h === 'TAHUN' || h.includes('TAHUN PEMBUATAN') || h.includes('PEROLEHAN'))

    // Nama kategori dari nama sheet (contoh: "LABEL MEJA" -> "MEJA", "AC SPLIT" -> "AC SPLIT")
    const categoryName = sheetName ? sheetName.replace(/^LABEL\s+/i, '').trim() : ''

    const labels: ParsedLabelItem[] = []

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r]!
        if (!row.length || row.every(c => c === '')) continue

        let noInv = colNoInv !== -1 ? (row[colNoInv] || '') : ''
        const thnInv = colThnInv !== -1 ? (row[colThnInv] || '') : ''
        if (noInv && thnInv && !noInv.endsWith(thnInv)) {
            noInv = `${noInv}${thnInv.startsWith('.') ? '' : '.'}${thnInv}`
        }

        const nama = (colNama !== -1 && row[colNama]) 
            ? row[colNama] 
            : (categoryName || (noInv ? `Barang ${noInv}` : ''))
        const kode = colKode !== -1 ? (row[colKode] || '') : (noInv ? noInv.split('.').slice(0, 3).join(' ') : '')
        const noUrut = colNoUrut !== -1 ? (row[colNoUrut] || '') : (row[0] || String(r - headerRowIdx))
        const ruang = colLokasi !== -1 ? (row[colLokasi] || '-') : '-'
        const asalDana = colAsalDana !== -1 ? (row[colAsalDana] || 'BOS / Yayasan') : 'BOS / Yayasan'
        const tahun = colTahun !== -1 ? (row[colTahun] || String(new Date().getFullYear())) : String(new Date().getFullYear())

        // Abaikan jika nama/noInv kosong
        if (!nama && !noInv) continue

        labels.push({
            noInv: noInv || `${kode || 'INV'}.${noUrut}.${tahun.slice(-2)}`,
            nama_barang: nama || `Barang #${noUrut}`,
            kode_barang: kode || '-',
            no_urut: noUrut || '-',
            ruang: ruang || '-',
            asal_dana: asalDana || 'BOS',
            tahun: tahun || '2026',
            lembaga: fallbackLembaga
        })
    }

    return labels
}

