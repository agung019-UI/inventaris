<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { toast } from 'vue3-toastify'
import html2pdf from 'html2pdf.js'
import Navbar from '~/components/Navbar.vue'
import SkeletonBox from '~/components/SkeletonBox.vue'
import SkeletonCards from '~/components/SkeletonCards.vue'
import SkeletonTable from '~/components/SkeletonTable.vue'
import { parsePrice, formatRupiah, formatPercent } from '~/utils/price'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'

// --- PASTIKAN URL INI SAMA DENGAN URL DEPLOY TERBARU ANDA ---
const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

// ================================================================
// STATE
// ================================================================
const dataInventaris = ref<any[]>([])
const isLoading = ref(true)
const selectedLembaga = ref('SMA')
const searchQuery = ref('')
const trendFilter = ref<'SEMUA' | 'NAIK' | 'TURUN' | 'TETAP' | 'BARU'>('SEMUA')
const sortBy = ref<'selisih' | 'nama' | 'terbaru'>('selisih')
const hideNonAktif = ref(false) // Sembunyikan Lelang/Musnah/Dihibahkan

const reportRef = ref<HTMLElement | null>(null)
const isGeneratingPDF = ref(false)

// Skeleton baru tampil jika loading > 150 ms (mencegah kedipan)
const showSkeleton = useSkeletonDelay(isLoading, 150)

const TABLE_HEADERS = ['Nama Barang', 'Kode', 'Harga Sebelumnya', 'Harga Terbaru', 'Selisih (Rp)', 'Selisih (%)', 'Tren', 'Jumlah Catatan']
const DETAIL_HEADERS = ['No', 'Tanggal', 'Harga Satuan', 'Harga Baris', 'Qty', 'Ruang', 'Status']

// Lebar kolom dipakai bersama oleh tabel asli & skeleton => tidak ada layout shift
// Jumlah Catatan diberi 13% agar judul kolom tidak terpotong menjadi "Jumlah Ca..."
const COLUMN_WIDTHS = ['21%', '8%', '13%', '13%', '12%', '9%', '11%', '13%']
const ROW_HEIGHT = 41

// ================================================================
// FETCH DATA (satu request per ganti lembaga, hasil diolah via computed)
// ================================================================
let requestSeq = 0

const fetchData = async () => {
    const seq = ++requestSeq
    isLoading.value = true
    dataInventaris.value = [] // jangan tampilkan data lembaga lama selama loading

    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=${selectedLembaga.value}`, { method: "GET" })
        const result = await res.json()
        if (seq !== requestSeq) return // respons usang (lembaga sudah diganti)

        if (result.status === 200) {
            dataInventaris.value = result.datas || []
        } else {
            toast(result.message || "Gagal memuat data inventaris", { type: "error" })
        }
    } catch (error) {
        if (seq !== requestSeq) return
        console.error("Error fetching data:", error)
        toast("Terjadi kesalahan koneksi saat memuat data harga", { type: "error" })
    } finally {
        if (seq === requestSeq) isLoading.value = false
    }
}

watch(selectedLembaga, () => {
    closeDetail()
    fetchData()
})

onMounted(() => {
    fetchData()
    window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ================================================================
// HELPER PARSING
// ================================================================
const normalizeName = (s: any): string =>
    String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

// Ambil nilai field dari item; backend mengirim header asli + versi lowercase,
// jadi cek nama persis dulu, lalu cari key yang mengandung kata kunci.
const findValue = (item: any, exact: string[], contains: string[] = []): string => {
    for (const k of exact) {
        const v = item[k]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    for (const key of Object.keys(item)) {
        const lk = key.toLowerCase()
        if (contains.some(c => lk.includes(c))) {
            const v = item[key]
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
        }
    }
    return ''
}

const BULAN: Record<string, number> = {
    jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
    agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, nop: 11, des: 12, dec: 12
}

const makeTs = (y: number, m: number, d: number): number | null => {
    if (y < 100) y += y < 50 ? 2000 : 1900
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const ts = Date.UTC(y, m - 1, d)
    const check = new Date(ts)
    return check.getUTCDate() === d ? ts : null // tolak 31/02 dsb.
}

// Parse tanggal format Indonesia: dd/mm/yyyy (juga dd-mm-yyyy, dd.mm.yyyy),
// yyyy-mm-dd, "12 Januari 2020", atau hanya tahun "2019".
const parseDate = (raw: string): number | null => {
    const s = String(raw || '').trim()
    if (!s || s === '-') return null
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
    if (m) return makeTs(+m[3]!, +m[2]!, +m[1]!)
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
    if (m) return makeTs(+m[1]!, +m[2]!, +m[3]!)
    m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/)
    if (m) {
        const bln = BULAN[m[2]!.toLowerCase().slice(0, 3)]
        return bln ? makeTs(+m[3]!, bln, +m[1]!) : null
    }
    m = s.match(/\b(19|20)\d{2}\b/)
    if (m) return Date.UTC(+m[0], 0, 1)
    return null
}

const parseQty = (raw: any): number => {
    const n = parseInt(String(raw || '').replace(/[^0-9]/g, ''), 10)
    return n > 0 ? n : 1
}

const isExcludedStatus = (status: string) => /lelang|musnah|hibah/i.test(status)
const isAktifStatus = (status: string) => {
    const s = status.toLowerCase().trim()
    return s === '' || s === '-' || s === 'aktif' || s === 'ada'
}
const statusBadgeClass = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('lelang') || s.includes('musnah')) return 'badge-red'
    if (s.includes('hibah')) return 'badge-purple'
    if (s.includes('mutasi')) return 'badge-yellow'
    if (s.includes('upgrade')) return 'badge-blue'
    return 'badge-gray'
}

// ================================================================
// PENGOLAHAN DATA (semua via computed, tanpa fetch ulang)
// ================================================================
type Trend = 'NAIK' | 'TURUN' | 'TETAP' | 'BARU' | 'KOSONG'

interface PriceRecord {
    idx: number
    nama: string
    tanggalLabel: string
    sumberTanggal: 'pembukuan' | 'penyerahan' | 'tahun' | ''
    ts: number | null
    hargaRaw: string
    hargaBaris: number
    qty: number
    hargaSatuan: number
    valid: boolean
    ruang: string
    status: string
}

interface PriceGroup {
    key: string
    nama: string
    kode: string
    records: PriceRecord[]
    validRecords: PriceRecord[]
    prev: number | null
    latest: number | null
    diffRp: number | null
    diffPct: number | null
    trend: Trend
    min: number | null
    max: number | null
    avg: number | null
    statuses: string[]
}

// 1) Ubah baris Buku Induk -> catatan harga
const records = computed<PriceRecord[]>(() => {
    const list: PriceRecord[] = []
    dataInventaris.value.forEach((item, idx) => {
        const nama = String(item.nama_barang || item.namaBarang || '').trim()
        const upper = nama.toUpperCase()
        const noUrut = String(item.noUrutBarang || item.no_urut_barang || item.jb_k || '').trim()

        // Filter sub-judul & header, sama seperti halaman rekapitulasi / total_aset
        const isNotHeader = noUrut !== '' && noUrut !== '-' && noUrut !== '0000' && noUrut !== '000' && noUrut !== '0'
        const isValidName = upper !== '' && !upper.includes('BUKU INDUK') && !upper.includes('JAKARTA')
        if (!isNotHeader || !isValidName) return

        const status = String(item.status || item.Status || 'Aktif').trim() || 'Aktif'

        // Tanggal: pembukuan -> tgl_penyerahan -> tahun_pembuatan (yang pertama bisa di-parse)
        const candidates: [PriceRecord['sumberTanggal'], string][] = [
            ['pembukuan', findValue(item, ['tanggal_pembukuan', 'tanggal pembukuan', 'Tanggal Pembukuan'], ['pembukuan'])],
            ['penyerahan', findValue(item, ['tgl_penyerahan', 'Tgl Penyerahan/ Perolehan'], ['penyerahan', 'perolehan'])],
            ['tahun', findValue(item, ['tahun_pembuatan', 'tahun pembuatan', 'Tahun Pembuatan'], ['tahun'])]
        ]
        let ts: number | null = null
        let tanggalLabel = '-'
        let sumberTanggal: PriceRecord['sumberTanggal'] = ''
        for (const [src, val] of candidates) {
            const parsed = parseDate(val)
            if (parsed !== null) { ts = parsed; tanggalLabel = val; sumberTanggal = src; break }
        }

        // ASUMSI HARGA SATUAN:
        // Di Buku Induk, kolom "harga" adalah nilai perolehan MUTLAK untuk baris tersebut
        // (total_aset/index.vue menjumlahkan kolom ini apa adanya tanpa dikali qty).
        // Agar konsisten, harga baris dianggap TOTAL untuk seluruh kuantitas baris,
        // sehingga harga satuan = harga baris / kuantitas (kuantitas kosong/0 dianggap 1).
        const hargaRaw = findValue(item, ['harga', 'Harga'], ['harga'])
        const hargaBaris = parsePrice(hargaRaw)
        const qty = parseQty(item.kuantitas || item.Kuantitas)
        const hargaSatuan = hargaBaris > 0 ? Math.round(hargaBaris / qty) : 0

        list.push({
            idx, nama, tanggalLabel, sumberTanggal, ts,
            hargaRaw: hargaRaw || '-',
            hargaBaris, qty, hargaSatuan,
            // Harga kosong, "-", 0, atau non-angka diabaikan dari perhitungan
            valid: hargaSatuan > 0,
            ruang: String(item.ruang || item.Ruang || '').trim() || '-',
            status
        })
    })
    return list
})

// 2) Kelompokkan per barang (kode master + nama ternormalisasi) & hitung tren
const groups = computed<PriceGroup[]>(() => {
    const map = new Map<string, { kode: string, recs: PriceRecord[] }>()
    const kodeByIdx = new Map<number, string>()
    dataInventaris.value.forEach((item, idx) => kodeByIdx.set(idx, String(item.master_kodeBarang || '').trim()))

    records.value.forEach(rec => {
        if (hideNonAktif.value && isExcludedStatus(rec.status)) return
        const kode = kodeByIdx.get(rec.idx) || '-'
        const key = `${kode}|${normalizeName(rec.nama)}`
        if (!map.has(key)) map.set(key, { kode, recs: [] })
        map.get(key)!.recs.push(rec)
    })

    const result: PriceGroup[] = []
    map.forEach(({ kode, recs }, key) => {
        // Urut kronologis; catatan tanpa tanggal valid ditaruh paling awal (tidak dianggap terbaru),
        // urutan baris di sheet dipakai sebagai pemecah seri.
        const sorted = [...recs].sort((a, b) => {
            const ta = a.ts ?? -Infinity
            const tb = b.ts ?? -Infinity
            return ta === tb ? a.idx - b.idx : ta - tb
        })
        const validRecords = sorted.filter(r => r.valid)
        const prices = validRecords.map(r => r.hargaSatuan)
        const latest = prices.length ? prices[prices.length - 1]! : null
        const prev = prices.length >= 2 ? prices[prices.length - 2]! : null

        let trend: Trend = 'KOSONG'
        let diffRp: number | null = null
        let diffPct: number | null = null
        if (latest !== null && prev !== null) {
            diffRp = latest - prev
            diffPct = (diffRp / prev) * 100
            trend = diffRp > 0 ? 'NAIK' : diffRp < 0 ? 'TURUN' : 'TETAP'
        } else if (latest !== null) {
            trend = 'BARU'
        }

        const statuses = [...new Set(sorted.map(r => r.status).filter(s => !isAktifStatus(s)))]

        result.push({
            key,
            nama: sorted[sorted.length - 1]!.nama,
            kode,
            records: sorted,
            validRecords,
            prev, latest, diffRp, diffPct, trend,
            min: prices.length ? Math.min(...prices) : null,
            max: prices.length ? Math.max(...prices) : null,
            avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
            statuses
        })
    })
    return result
})

// 3) Pencarian (dipakai juga oleh kartu ringkasan)
const searchedGroups = computed(() => {
    const q = normalizeName(searchQuery.value)
    if (!q) return groups.value
    return groups.value.filter(g => normalizeName(g.nama).includes(q) || g.kode.toLowerCase().includes(searchQuery.value.trim().toLowerCase()))
})

// 4) Filter tren + sort untuk tabel
const displayedGroups = computed(() => {
    let list = searchedGroups.value
    if (trendFilter.value !== 'SEMUA') list = list.filter(g => g.trend === trendFilter.value)

    const arr = [...list]
    if (sortBy.value === 'nama') {
        arr.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
    } else if (sortBy.value === 'terbaru') {
        arr.sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || a.nama.localeCompare(b.nama, 'id'))
    } else {
        // Selisih terbesar (nilai absolut Rp); barang tanpa pembanding di akhir
        arr.sort((a, b) => Math.abs(b.diffRp ?? -1) - Math.abs(a.diffRp ?? -1) || a.nama.localeCompare(b.nama, 'id'))
    }
    return arr
})

// 5) Kartu ringkasan (mengikuti pencarian & toggle status, tidak terpengaruh filter tren)
const summary = computed(() => {
    let naik = 0, turun = 0, tetap = 0
    let top: PriceGroup | null = null
    searchedGroups.value.forEach(g => {
        if (g.trend === 'NAIK') {
            naik++
            if (!top || (g.diffPct ?? 0) > (top.diffPct ?? 0)) top = g
        } else if (g.trend === 'TURUN') turun++
        else if (g.trend === 'TETAP') tetap++
    })
    return { naik, turun, tetap, top: top as PriceGroup | null }
})

const trendLabel = (t: Trend) => ({
    NAIK: '▲ Naik', TURUN: '▼ Turun', TETAP: '● Tetap', BARU: 'Baru/1 data', KOSONG: 'Tanpa harga'
}[t])

const lembagaLabel = computed(() => selectedLembaga.value === 'YAYASAN' ? 'Yayasan' : selectedLembaga.value)

// ================================================================
// MODAL DETAIL RIWAYAT HARGA
// ================================================================
const selectedKey = ref<string | null>(null)
const selectedGroup = computed(() => groups.value.find(g => g.key === selectedKey.value) || null)
// Data detail dihitung dari data yang sudah diambil; skeleton tampil bila modal terbuka saat data masih dimuat.
const detailLoading = computed(() => !!selectedKey.value && isLoading.value)
const showDetailSkeleton = useDelayedLoading(detailLoading, 150)

const openDetail = (key: string) => { selectedKey.value = key }
function closeDetail() { selectedKey.value = null }
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && selectedKey.value) closeDetail() }

// Mini grafik garis SVG (tanpa library)
const CHART_W = 640
const CHART_H = 200
const PAD = { l: 92, r: 20, t: 18, b: 34 }

const chart = computed(() => {
    const g = selectedGroup.value
    if (!g || g.validRecords.length === 0) return null
    const pts = g.validRecords
    const values = pts.map(p => p.hargaSatuan)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (lo === hi) { const pad = Math.max(1, lo * 0.1); lo -= pad; hi += pad }
    const plotW = CHART_W - PAD.l - PAD.r
    const plotH = CHART_H - PAD.t - PAD.b
    const step = Math.max(1, Math.ceil(pts.length / 8)) // batasi label sumbu X

    const points = pts.map((p, i) => {
        const x = PAD.l + (pts.length === 1 ? plotW / 2 : (i * plotW) / (pts.length - 1))
        const y = PAD.t + (1 - (p.hargaSatuan - lo) / (hi - lo)) * plotH
        const before = i > 0 ? values[i - 1]! : null
        const color = before === null || p.hargaSatuan === before ? '#94a3b8' : p.hargaSatuan > before ? '#dc2626' : '#16a34a'
        return { x, y, color, label: p.tanggalLabel, value: p.hargaSatuan, showLabel: i % step === 0 || i === pts.length - 1 }
    })
    const gridLines = [hi, (hi + lo) / 2, lo].map(v => ({
        y: PAD.t + (1 - (v - lo) / (hi - lo)) * plotH,
        label: formatRupiah(Math.round(v))
    }))
    return { points, gridLines, polyline: points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }
})

// ================================================================
// EXPORT PDF (mengikuti cara rekapitulasi/index.vue)
// ================================================================
const generatePDF = async () => {
    if (!reportRef.value) return
    isGeneratingPDF.value = true
    await nextTick() // tampilkan header khusus PDF sebelum di-capture
    const toastId = toast.loading("Menyiapkan dokumen PDF (Landscape)...")

    const opt = {
        margin:       [10, 10, 15, 10] as [number, number, number, number],
        filename:     `Perbandingan_Harga_${selectedLembaga.value}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'landscape' as const },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', '.stat-card'] }
    }

    html2pdf().set(opt).from(reportRef.value).save()
        .then(() => {
            toast.update(toastId, { render: "Berhasil mengunduh PDF!", type: "success", isLoading: false, autoClose: 3000 })
        })
        .catch((err: any) => {
            console.error(err)
            toast.update(toastId, { render: "Gagal membuat PDF", type: "error", isLoading: false, autoClose: 3000 })
        })
        .finally(() => {
            isGeneratingPDF.value = false
        })
}

const todayLabel = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
</script>

<template>
    <div class="app-layout">
        <Navbar />

        <main class="dashboard-container">
            <PageHeader
                title="Perbandingan Harga Barang"
                subtitle="Bandingkan harga satuan pembelian terbaru dengan pembelian sebelumnya untuk setiap barang."
            >
                <button
                    @click="generatePDF"
                    class="btn-export"
                    :disabled="isLoading || isGeneratingPDF || displayedGroups.length === 0">
                    <svg v-if="!isGeneratingPDF" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span v-if="isGeneratingPDF">Memproses...</span>
                    <span v-else>Cetak PDF (Landscape)</span>
                </button>

                <div class="filter-group-header">
                    <label for="pilihLembaga">Lembaga:</label>
                    <select id="pilihLembaga" v-model="selectedLembaga" class="select-box highlight-select" :disabled="isLoading">
                        <option value="SMA">SMA Budhi Warman II</option>
                        <option value="SMK">SMK Budhi Warman II</option>
                        <option value="YAYASAN">Yayasan Budhi Warman II</option>
                    </select>
                </div>
            </PageHeader>

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <!-- FILTER BAR (tetap nyata saat loading, hanya dinonaktifkan) -->
            <div class="filter-bar">
                <input
                    v-model="searchQuery"
                    type="search"
                    class="input-search"
                    placeholder="Cari nama atau kode barang..."
                    :disabled="isLoading"
                    aria-label="Cari nama barang" />

                <div class="filter-item">
                    <label for="filterTren">Tren:</label>
                    <select id="filterTren" v-model="trendFilter" class="select-box" :disabled="isLoading">
                        <option value="SEMUA">Semua</option>
                        <option value="NAIK">Naik</option>
                        <option value="TURUN">Turun</option>
                        <option value="TETAP">Tetap</option>
                        <option value="BARU">Baru/1 data</option>
                    </select>
                </div>

                <div class="filter-item">
                    <label for="sortBy">Urutkan:</label>
                    <select id="sortBy" v-model="sortBy" class="select-box" :disabled="isLoading">
                        <option value="selisih">Selisih terbesar</option>
                        <option value="nama">Nama barang (A–Z)</option>
                        <option value="terbaru">Harga terbaru (tertinggi)</option>
                    </select>
                </div>

                <label class="toggle-item">
                    <input v-model="hideNonAktif" type="checkbox" :disabled="isLoading" />
                    Sembunyikan Lelang/Musnah/Dihibahkan
                </label>
            </div>

            <!-- KONTEN -->
            <section class="content-area" :aria-busy="isLoading ? 'true' : 'false'">
                <span v-if="isLoading" class="sr-only">Memuat data perbandingan harga...</span>
                <!-- Skeleton (muncul hanya jika loading > 150 ms) -->
                <div v-if="isLoading && showSkeleton" aria-hidden="true">
                    <SkeletonCards :count="4" grid-class="stats-grid" :card-height="84" />
                    <div class="table-section">
                        <div class="table-wrapper">
                            <SkeletonTable :rows="8" :headers="TABLE_HEADERS" :col-widths="COLUMN_WIDTHS" :row-height="ROW_HEIGHT" :header-height="ROW_HEIGHT" />
                        </div>
                    </div>
                </div>

                <!-- Loading < 150 ms: area kosong (data lama tidak ditampilkan) -->
                <div v-else-if="isLoading" class="loading-placeholder"></div>

                <div v-else-if="dataInventaris.length === 0" class="empty-state">
                    <h3>Tidak ada data inventaris</h3>
                    <p>Belum ada data Buku Induk untuk {{ lembagaLabel }}, atau data gagal dimuat. Coba pilih lembaga lain atau muat ulang halaman.</p>
                </div>

                <div v-else ref="reportRef" class="pdf-container">
                    <!-- Header khusus PDF -->
                    <div v-if="isGeneratingPDF" class="pdf-header">
                        <h2>LAPORAN PERBANDINGAN HARGA BARANG</h2>
                        <h3>{{ lembagaLabel }} Budhi Warman II</h3>
                        <p>Dicetak: {{ todayLabel() }} · Filter tren: {{ trendFilter === 'SEMUA' ? 'Semua' : trendFilter }}<span v-if="searchQuery"> · Pencarian: "{{ searchQuery }}"</span></p>
                        <hr />
                    </div>

                    <!-- KARTU RINGKASAN -->
                    <div class="stats-grid">
                        <div class="stat-card red">
                            <div class="card-info">
                                <span class="card-title">Barang Naik</span>
                                <h2 class="card-value">{{ summary.naik }} <span class="unit">Barang</span></h2>
                            </div>
                        </div>
                        <div class="stat-card green">
                            <div class="card-info">
                                <span class="card-title">Barang Turun</span>
                                <h2 class="card-value">{{ summary.turun }} <span class="unit">Barang</span></h2>
                            </div>
                        </div>
                        <div class="stat-card gray">
                            <div class="card-info">
                                <span class="card-title">Harga Tetap</span>
                                <h2 class="card-value">{{ summary.tetap }} <span class="unit">Barang</span></h2>
                            </div>
                        </div>
                        <div class="stat-card orange">
                            <div class="card-info card-info-ellipsis">
                                <span class="card-title">Kenaikan Tertinggi</span>
                                <template v-if="summary.top">
                                    <h2 class="card-value text-red" :title="summary.top.nama">{{ formatPercent(summary.top.diffPct ?? 0, true) }}</h2>
                                    <span class="card-sub" :title="summary.top.nama">{{ summary.top.nama }}</span>
                                </template>
                                <h2 v-else class="card-value">-</h2>
                            </div>
                        </div>
                    </div>

                    <!-- TABEL RINGKASAN -->
                    <div class="table-section">
                        <div v-if="displayedGroups.length === 0" class="empty-state small">
                            <h3>Tidak ada barang yang cocok</h3>
                            <p>Ubah kata kunci pencarian, filter tren, atau toggle status.</p>
                        </div>
                        <div v-else class="table-wrapper">
                            <table class="data-table">
                                <colgroup>
                                    <col v-for="(w, i) in COLUMN_WIDTHS" :key="i" :style="{ width: w }" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th title="Nama Barang">Nama Barang</th>
                                        <th title="Kode">Kode</th>
                                        <th class="text-right" title="Harga Sebelumnya (satuan)">Harga Sebelumnya</th>
                                        <th class="text-right" title="Harga Terbaru (satuan)">Harga Terbaru</th>
                                        <th class="text-right" title="Selisih (Rp)">Selisih (Rp)</th>
                                        <th class="text-right" title="Selisih (%)">Selisih (%)</th>
                                        <th class="text-center" title="Tren">Tren</th>
                                        <th class="text-center" title="Jumlah Catatan">Jumlah Catatan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="g in displayedGroups"
                                        :key="g.key"
                                        class="clickable-row"
                                        tabindex="0"
                                        @click="openDetail(g.key)"
                                        @keydown.enter="openDetail(g.key)">
                                        <td :title="g.nama">
                                            <strong>{{ g.nama }}</strong>
                                            <span v-for="s in g.statuses" :key="s" class="badge" :class="statusBadgeClass(s)">{{ s }}</span>
                                        </td>
                                        <td :title="g.kode">{{ g.kode }}</td>
                                        <td class="text-right">{{ g.prev !== null ? formatRupiah(g.prev) : '-' }}</td>
                                        <td class="text-right"><strong>{{ g.latest !== null ? formatRupiah(g.latest) : '-' }}</strong></td>
                                        <td class="text-right" :class="{ 'text-red': g.trend === 'NAIK', 'text-green': g.trend === 'TURUN' }">
                                            {{ g.diffRp !== null ? (g.diffRp > 0 ? '+' : g.diffRp < 0 ? '−' : '') + formatRupiah(Math.abs(g.diffRp)) : '-' }}
                                        </td>
                                        <td class="text-right" :class="{ 'text-red': g.trend === 'NAIK', 'text-green': g.trend === 'TURUN' }">
                                            {{ g.diffPct !== null ? formatPercent(g.diffPct, true) : '-' }}
                                        </td>
                                        <td class="text-center">
                                            <span class="trend-badge" :class="'trend-' + g.trend.toLowerCase()">{{ trendLabel(g.trend) }}</span>
                                        </td>
                                        <td class="text-center">{{ g.records.length }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>
            </div>
        </main>

        <!-- MODAL DETAIL RIWAYAT HARGA -->
        <div v-if="selectedKey" class="modal-overlay" @click.self="closeDetail">
            <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="detailTitle" :aria-busy="detailLoading ? 'true' : 'false'">
                <div class="modal-header">
                    <div>
                        <h3 id="detailTitle">{{ selectedGroup ? selectedGroup.nama : 'Riwayat Harga' }}</h3>
                        <p v-if="selectedGroup" class="modal-sub">
                            Kode: {{ selectedGroup.kode }} · {{ selectedGroup.records.length }} catatan · {{ selectedGroup.validRecords.length }} harga valid
                        </p>
                    </div>
                    <button class="btn-close" @click="closeDetail" aria-label="Tutup">✕</button>
                </div>

                <!-- Skeleton detail: grafik + 4 baris riwayat -->
                <div v-if="detailLoading && showDetailSkeleton" class="modal-body" aria-hidden="true">
                    <SkeletonBox width="100%" height="200px" radius="8px" />
                    <div class="table-wrapper" style="margin-top: 16px;">
                        <SkeletonTable :rows="4" :headers="DETAIL_HEADERS" :row-height="ROW_HEIGHT" :header-height="ROW_HEIGHT" />
                    </div>
                </div>

                <div v-else-if="detailLoading" class="modal-body modal-placeholder"></div>

                <div v-else-if="!selectedGroup" class="modal-body empty-state small">
                    <p>Data barang tidak ditemukan untuk lembaga ini.</p>
                </div>

                <div v-else class="modal-body">
                    <div class="detail-stats">
                        <div><span>Terendah</span><strong>{{ selectedGroup.min !== null ? formatRupiah(selectedGroup.min) : '-' }}</strong></div>
                        <div><span>Tertinggi</span><strong>{{ selectedGroup.max !== null ? formatRupiah(selectedGroup.max) : '-' }}</strong></div>
                        <div><span>Rata-rata</span><strong>{{ selectedGroup.avg !== null ? formatRupiah(selectedGroup.avg) : '-' }}</strong></div>
                        <div>
                            <span>Tren</span>
                            <strong><span class="trend-badge" :class="'trend-' + selectedGroup.trend.toLowerCase()">{{ trendLabel(selectedGroup.trend) }}</span></strong>
                        </div>
                    </div>

                    <!-- Mini grafik garis SVG -->
                    <div class="chart-box">
                        <svg v-if="chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" width="100%" role="img" :aria-label="`Grafik harga satuan ${selectedGroup.nama}`">
                            <g v-for="(gl, i) in chart.gridLines" :key="'g' + i">
                                <line :x1="PAD.l" :x2="CHART_W - PAD.r" :y1="gl.y" :y2="gl.y" stroke="#e2e8f0" stroke-dasharray="4 4" />
                                <text :x="PAD.l - 8" :y="gl.y + 4" text-anchor="end" font-size="10" fill="#64748b">{{ gl.label }}</text>
                            </g>
                            <polyline v-if="chart.points.length > 1" :points="chart.polyline" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" />
                            <g v-for="(p, i) in chart.points" :key="'p' + i">
                                <circle :cx="p.x" :cy="p.y" r="4.5" :fill="p.color" stroke="#fff" stroke-width="1.5">
                                    <title>{{ p.label }}: {{ formatRupiah(p.value) }}</title>
                                </circle>
                                <text v-if="p.showLabel" :x="p.x" :y="CHART_H - 10" text-anchor="middle" font-size="10" fill="#64748b">{{ p.label }}</text>
                            </g>
                        </svg>
                        <p v-else class="chart-empty">Tidak ada harga valid untuk digambarkan.</p>
                    </div>

                    <!-- Riwayat harga -->
                    <div class="table-wrapper" style="margin-top: 16px;">
                        <table class="data-table detail-table">
                            <thead>
                                <tr>
                                    <th class="text-center" style="width: 44px;">No</th>
                                    <th>Tanggal</th>
                                    <th class="text-right">Harga Satuan</th>
                                    <th class="text-right">Harga Baris</th>
                                    <th class="text-center">Qty</th>
                                    <th>Ruang</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(r, i) in selectedGroup.records" :key="r.idx" :class="{ 'row-invalid': !r.valid }">
                                    <td class="text-center" style="color: #94a3b8;">{{ i + 1 }}</td>
                                    <td>
                                        {{ r.tanggalLabel }}
                                        <span v-if="r.sumberTanggal === 'penyerahan'" class="hint">(tgl penyerahan)</span>
                                        <span v-else-if="r.sumberTanggal === 'tahun'" class="hint">(tahun pembuatan)</span>
                                    </td>
                                    <td class="text-right">
                                        <strong v-if="r.valid">{{ formatRupiah(r.hargaSatuan) }}</strong>
                                        <span v-else class="hint" :title="`Nilai asli: ${r.hargaRaw}`">diabaikan</span>
                                    </td>
                                    <td class="text-right">{{ r.valid ? formatRupiah(r.hargaBaris) : r.hargaRaw }}</td>
                                    <td class="text-center">{{ r.qty }}</td>
                                    <td>{{ r.ruang }}</td>
                                    <td><span class="badge" :class="isAktifStatus(r.status) ? 'badge-green' : statusBadgeClass(r.status)">{{ r.status }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p class="footnote">Harga satuan = kolom harga baris ÷ kuantitas. Harga kosong, "-", 0, atau bukan angka diabaikan dari perhitungan.</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.app-layout { display: flex; min-height: 100vh; background: transparent; }
.dashboard-container { flex: 1; padding: 30px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: calc(100% - 250px); overflow-x: hidden; }

/* KOTAK LEMBAGA DI PAGE HEADER */
.filter-group-header {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.20);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.30);
    border-radius: 14px;
    padding: 6px 14px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}
.filter-group-header label {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
    margin: 0;
}
.highlight-select {
    font-weight: 700;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.40);
    background: rgba(255, 255, 255, 0.25);
    padding: 5px 12px;
    border-radius: 10px;
    outline: none;
    font-size: 13.5px;
    cursor: pointer;
}
.highlight-select option {
    background: #1e293b;
    color: #ffffff;
}

.btn-export {
    display: inline-flex;
    align-items: center;
    background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%) !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.35) !important;
    padding: 0 20px;
    height: 40px;
    border-radius: 100px;
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
    transition: all 0.25s ease;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}
.btn-export:hover:not(:disabled) {
    transform: translateY(-2px);
    background: linear-gradient(135deg, #ff7b7b 0%, #ff3b3b 100%);
    background: linear-gradient(135deg, #ff7b7b 0%, #ff3b3b 100%) !important;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}
.btn-export:focus,
.btn-export:focus-visible,
.btn-export:active {
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
    outline: none;
}
.btn-export:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    opacity: 0.5 !important;
    cursor: not-allowed !important;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}

/* FILTER BAR */
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 16px;
    padding: 14px 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.input-search {
    flex: 1;
    min-width: 220px;
    height: 40px;
    padding: 0 16px;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 100px;
    font-size: 13.5px;
    font-weight: 600;
    outline: none;
    color: #0f172a;
    transition: all 200ms ease;
}
.input-search::placeholder {
    color: #64748b;
    font-weight: 400;
}
.input-search:focus {
    background: #ffffff;
    border-color: #22c08a;
    box-shadow: 0 0 0 3px rgba(34, 192, 138, 0.35);
}
.filter-item {
    display: flex;
    align-items: center;
    gap: 8px;
}
.filter-item label {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.select-box {
    height: 40px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 100px;
    font-size: 13.5px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.88);
    color: #0f172a;
    cursor: pointer;
    outline: none;
    transition: all 200ms ease;
}
.select-box:focus {
    background: #ffffff;
    border-color: #22c08a;
    box-shadow: 0 0 0 3px rgba(34, 192, 138, 0.35);
}
.toggle-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    color: #ffffff;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
}
.filter-bar :disabled, .filter-group-header :disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

/* KONTEN & STATE */
.loading-placeholder { min-height: 480px; }
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 40vh;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    padding: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.empty-state.small {
    min-height: 160px;
    background: transparent;
    border: none;
    box-shadow: none;
}
.empty-state h3 {
    margin: 0 0 8px 0;
    color: #ffffff;
    font-size: 18px;
    font-weight: 800;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.empty-state p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.90);
    max-width: 500px;
    line-height: 1.5;
}

.pdf-container { background-color: transparent; }
.pdf-header { text-align: center; margin-bottom: 16px; }
.pdf-header h2 { font-size: 20px; font-weight: 800; color: #ffffff; margin: 0; }
.pdf-header h3 { margin: 5px 0 0 0; color: rgba(255, 255, 255, 0.90); font-size: 15px; }
.pdf-header p { margin: 6px 0 0 0; color: rgba(255, 255, 255, 0.80); font-size: 11px; }
.pdf-header hr { border: none; border-top: 2px solid rgba(255, 255, 255, 0.5); margin-top: 12px; }

/* KARTU RINGKASAN */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 14px;
    margin-bottom: 20px;
}
.stat-card {
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 16px;
    padding: 16px 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 84px;
    box-sizing: border-box;
    transition: transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease;
}
.stat-card:hover {
    transform: translateY(-4px);
    background: rgba(255, 255, 255, 0.25);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
}
.stat-card.green { border-left: 4px solid #10b981; }
.stat-card.red { border-left: 4px solid #ef4444; }
.stat-card.orange { border-left: 4px solid #f97316; }
.stat-card.gray { border-left: 4px solid #94a3b8; }
.card-info { flex: 1; min-width: 0; }
.card-title {
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.card-value {
    font-size: 28px;
    font-weight: 800;
    margin: 4px 0 2px 0;
    color: #ffffff;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    line-height: 1.1;
}
.card-sub {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.90);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.unit {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.90);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.text-red {
    color: #ff8a80;
    text-shadow: none !important;
}

/* TABEL */
.table-section {
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.table-wrapper {
    background: rgba(255, 255, 255, 0.90);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    overflow-x: auto;
}
.table-wrapper::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.table-wrapper::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.5);
    border-radius: 10px;
}
.data-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 13px;
    table-layout: fixed;
    color: #0f172a;
    text-shadow: none !important;
}
.data-table tr {
    height: 41px;
}
.data-table th, .data-table td {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.7);
    border-right: 1px solid rgba(226, 232, 240, 0.6);
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
    text-shadow: none !important;
}
.data-table th {
    background-color: rgba(241, 245, 249, 0.95);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #0f172a;
    font-weight: 700;
    font-size: 12.5px;
    position: sticky;
    top: 0;
    z-index: 10;
    text-shadow: none !important;
}
.data-table td {
    color: #0f172a;
    text-shadow: none !important;
}
.data-table *,
.detail-table,
.detail-table * {
    text-shadow: none !important;
}
.clickable-row {
    cursor: pointer;
}
.clickable-row:hover, .clickable-row:focus {
    background-color: rgba(224, 242, 254, 0.70);
    outline: none;
}
.clickable-row:focus-visible {
    box-shadow: inset 0 0 0 2px #22c08a;
}

.text-right { text-align: right; }
.text-center { text-align: center; }
.data-table .text-green { color: #15803d !important; font-weight: 700; }
.data-table .text-red { color: #b91c1c !important; font-weight: 700; }

/* BADGE TREN & STATUS */
.trend-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 12px;
    line-height: 15px;
    font-weight: 700;
    white-space: nowrap;
}
.trend-naik { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.trend-turun { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
.trend-tetap { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
.trend-baru { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }
.trend-kosong { background: #f8fafc; color: #475569; border: 1px dashed #cbd5e1; }

.badge { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 100px; font-size: 11px; line-height: 14px; font-weight: 700; vertical-align: middle; }
.badge-red { background: #fee2e2; color: #991b1b; }
.badge-purple { background: #ede9fe; color: #5b21b6; }
.badge-yellow { background: #fef3c7; color: #854d0e; }
.badge-blue { background: #e0f2fe; color: #075985; }
.badge-green { background: #dcfce7; color: #166534; margin-left: 0; }
.badge-gray { background: #f1f5f9; color: #334155; }
td .badge-red, td .badge-purple, td .badge-yellow, td .badge-blue, td .badge-gray { margin-left: 6px; }

/* MODAL */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 15, 30, 0.60);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}
.modal-box {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.8);
    border-radius: 20px;
    width: 100%;
    max-width: 860px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
}
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 18px 24px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.8);
    position: sticky;
    top: 0;
    background: rgba(255, 255, 255, 0.98);
    z-index: 1;
}
.modal-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
.modal-sub { margin: 4px 0 0 0; font-size: 13px; color: #475569; }
.btn-close {
    border: none;
    background: #f1f5f9;
    color: #334155;
    width: 34px;
    height: 34px;
    border-radius: 100px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    transition: all 0.2s;
}
.btn-close:hover { background: #e2e8f0; color: #0f172a; }
.modal-body { padding: 20px 24px 24px; }
.modal-placeholder { min-height: 420px; }

.detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.detail-stats > div { background: rgba(241, 245, 249, 0.9); border: 1px solid rgba(203, 213, 225, 0.8); border-radius: 12px; padding: 12px 14px; }
.detail-stats span { display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
.detail-stats strong { display: block; margin-top: 4px; font-size: 15px; font-weight: 800; color: #0f172a; }

.chart-box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; background: #ffffff; min-height: 200px; box-sizing: border-box; }
.chart-empty { text-align: center; color: #64748b; font-size: 13px; margin: 80px 0; font-weight: 500; }

.detail-table { table-layout: auto; }
.row-invalid td { color: #64748b; background: #f8fafc; }
.hint { font-size: 11px; color: #64748b; font-style: italic; margin-left: 4px; }
.footnote { font-size: 12px; color: #475569; margin: 12px 0 0 0; }
</style>

