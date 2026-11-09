<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import SkeletonTable from '~/components/SkeletonTable.vue'
import LabelRenderer from '~/components/LabelRenderer.vue'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'
import { readXlsxWorkbook, parseSheetToLabels, type ParsedSheet, type ParsedLabelItem } from '~/utils/xlsxParser'
import type { CustomTemplate } from '~/types/customTemplate'

const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

// ---------- STATE SUMBER DATA ----------
const activeSourceTab = ref<'database' | 'excel'>('database')
const selectedLembaga = ref('SMA')
const lembagaOptions = ['SMA', 'SMK', 'SMP', 'YAYASAN']

// Database state
const rawDbItems = ref<any[]>([])
const isDbLoading = ref(false)
const showDbSkeleton = useSkeletonDelay(isDbLoading, 150)
const dbSearchQuery = ref('')
const selectedItemIds = ref<Set<string>>(new Set())

// Excel state
const fileName = ref('')
const sheets = ref<ParsedSheet[]>([])
const selectedSheetName = ref('')
const isReadingExcel = ref(false)
const isDragging = ref(false)
const excelLabels = ref<ParsedLabelItem[]>([])

// ---------- TEMPLATE & PENGATURAN LABEL ----------
type TemplateType = 'resmi_bw' | 'standard' | 'compact' | 'qrcode' | 'tomjerry103' | 'sma_bw2' | string

export type TemplateOptionItem = {
    id: string
    name: string
    desc: string
    cols: number
    rows: number
    perPage: number
    isCustom?: boolean
    customData?: CustomTemplate
}

const templateOptions: TemplateOptionItem[] = [
    { id: 'resmi_bw', name: 'Resmi Budhi Warman II', desc: 'Format resmi kartu identitas barang (2 kolom x 4 baris, 8 label/lembar)', cols: 2, rows: 4, perPage: 8, isCustom: false },
    { id: 'standard', name: 'Standar A4 Barcode', desc: 'Format stiker barcode standar (3 kolom x 7 baris, 21 label/lembar)', cols: 3, rows: 7, perPage: 21, isCustom: false },
    { id: 'compact', name: 'Ringkas / Mini', desc: 'Format kecil untuk barang mini/kabel (4 kolom x 10 baris, 40 label/lembar)', cols: 4, rows: 10, perPage: 40, isCustom: false },
    { id: 'qrcode', name: 'QR Code Kotak', desc: 'Format modern scan QR (3 kolom x 8 baris, 24 label/lembar)', cols: 3, rows: 8, perPage: 24, isCustom: false },
    { id: 'tomjerry103', name: 'Tom & Jerry 103', desc: 'Format khusus kertas label T&J No. 103 (2 kolom x 6 baris, 12 label)', cols: 2, rows: 6, perPage: 12, isCustom: false },
    { id: 'sma_bw2', name: 'Label Identitas SMA BW II', desc: 'Format stiker identitas resmi 2 x 4 tanpa logo (2 kolom x 4 baris, 8 label/lembar)', cols: 2, rows: 4, perPage: 8, isCustom: false },
]

const customTemplatesList = ref<CustomTemplate[]>([])

const allTemplateOptions = computed<TemplateOptionItem[]>(() => {
    const list: TemplateOptionItem[] = [...templateOptions]
    customTemplatesList.value.forEach(ct => {
        list.push({
            id: ct.id,
            name: ct.name,
            desc: `Template kustom (${ct.cols} kolom x ${ct.rows} baris, ${ct.perPage} label/lembar)`,
            cols: ct.cols,
            rows: ct.rows,
            perPage: ct.perPage,
            isCustom: true,
            customData: ct
        })
    })
    return list
})

const selectedTemplate = ref<string>('resmi_bw')
const customHeaderTitle = ref('')
const showLogo = ref(true)
const showBorderCut = ref(true)

// Range & pagination preview
const previewPage = ref(1)
const rangeFrom = ref(1)
const rangeTo = ref(100)

// Export state
const isExportingPDF = ref(false)
const printContainerRef = ref<HTMLElement | null>(null)

// ---------- COMPUTED DATA ----------
const currentTemplateMeta = computed(() => {
    return allTemplateOptions.value.find(t => t.id === selectedTemplate.value) || allTemplateOptions.value[0] || templateOptions[0]
})

const labelsPerPage = computed(() => currentTemplateMeta.value.perPage)

// Normalisasi data dari DB ke format standar label
const dbLabels = computed<ParsedLabelItem[]>(() => {
    const list: ParsedLabelItem[] = []
    rawDbItems.value.forEach((item, index) => {
        const noUrut = String(item.noUrutBarang || item.no_urut_barang || item.jb_k || index + 1).trim()
        const upper = (item.nama_barang || item.master_namaBarang || '').toUpperCase()

        // Filter header baris
        if (!upper || upper.includes('BUKU INDUK') || upper.includes('JAKARTA')) return

        const kode = String(item.master_kodeBarang || item.kode_barang || '-').trim()
        const tahun = String(item.tahun_pembuatan || item.tahun || '2026').trim()
        const thShort = tahun.length >= 2 ? tahun.slice(-2) : '26'
        const noInv = item.no_inventaris || `${kode.replace(/\s+/g, '.')}.${String(noUrut).padStart(4, '0')}.${thShort}`

        list.push({
            noInv,
            nama_barang: item.nama_barang || item.master_namaBarang || `Barang #${noUrut}`,
            kode_barang: kode,
            no_urut: String(noUrut),
            ruang: item.ruang || item.lokasi || '-',
            asal_dana: item.sumber_dana || item.asal_dana || 'BOS / Yayasan',
            tahun: tahun || '2026',
            lembaga: selectedLembaga.value
        })
    })
    return list
})

// Item DB yang lolos filter pencarian
const filteredDbLabels = computed(() => {
    const q = dbSearchQuery.value.trim().toLowerCase()
    if (!q) return dbLabels.value
    return dbLabels.value.filter(item => {
        return item.nama_barang.toLowerCase().includes(q) ||
               item.kode_barang.toLowerCase().includes(q) ||
               item.noInv.toLowerCase().includes(q) ||
               item.ruang.toLowerCase().includes(q)
    })
})

// Active labels: tergantung tab yang aktif
const activeDataset = computed<ParsedLabelItem[]>(() => {
    if (activeSourceTab.value === 'database') {
        if (selectedItemIds.value.size === 0) {
            return filteredDbLabels.value
        }
        return filteredDbLabels.value.filter(item => selectedItemIds.value.has(item.noInv))
    } else {
        return excelLabels.value
    }
})

const totalActiveLabels = computed(() => activeDataset.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalActiveLabels.value / labelsPerPage.value)))

// Label untuk halaman pratinjau saat ini (diisi null jika slot di halaman terakhir kosong)
const currentPreviewLabels = computed(() => {
    const start = (previewPage.value - 1) * labelsPerPage.value
    const slice = activeDataset.value.slice(start, start + labelsPerPage.value)
    const result: (ParsedLabelItem | null)[] = [...slice]
    while (result.length < labelsPerPage.value) {
        result.push(null)
    }
    return result
})

// Judul instansi untuk header stiker
const displayHeaderTitle = computed(() => {
    if (customHeaderTitle.value.trim()) return customHeaderTitle.value.trim()
    return `${selectedLembaga.value} BUDHI WARMAN II JAKARTA`
})

// ---------- FETCH DARI DATABASE ----------
const fetchDatabaseItems = async () => {
    isDbLoading.value = true
    rawDbItems.value = []
    selectedItemIds.value.clear()
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=${selectedLembaga.value}`, { method: 'GET' })
        const json = await res.json()
        if (json.status === 200 && Array.isArray(json.data)) {
            rawDbItems.value = json.data
            // Secara default pilih semua
            json.data.forEach((item: any, idx: number) => {
                const noUrut = item.noUrutBarang || item.no_urut_barang || item.jb_k || idx + 1
                const kode = item.master_kodeBarang || item.kode_barang || 'INV'
                const th = String(item.tahun_pembuatan || '26').slice(-2)
                const noInv = item.no_inventaris || `${String(kode).replace(/\s+/g, '.')}.${String(noUrut).padStart(4, '0')}.${th}`
                selectedItemIds.value.add(noInv)
            })
            toast(`Berhasil memuat ${rawDbItems.value.length} data inventaris ${selectedLembaga.value}`, { type: 'success' })
        } else {
            rawDbItems.value = []
            toast(json.message || 'Tidak ada data ditemukan', { type: 'info' })
        }
    } catch (e) {
        console.error('Fetch error:', e)
        toast('Gagal menghubungi server inventaris. Anda juga dapat menggunakan tab Upload Excel.', { type: 'error' })
    } finally {
        isDbLoading.value = false
        previewPage.value = 1
    }
}

// Checkbox selection helpers
const isAllSelected = computed(() => {
    return filteredDbLabels.value.length > 0 && filteredDbLabels.value.every(i => selectedItemIds.value.has(i.noInv))
})

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        selectedItemIds.value.clear()
    } else {
        filteredDbLabels.value.forEach(i => selectedItemIds.value.add(i.noInv))
    }
}

const toggleItemSelect = (noInv: string) => {
    if (selectedItemIds.value.has(noInv)) {
        selectedItemIds.value.delete(noInv)
    } else {
        selectedItemIds.value.add(noInv)
    }
}

const applyRangeSelection = () => {
    const from = Math.max(1, Number(rangeFrom.value) || 1)
    const to = Math.min(filteredDbLabels.value.length, Number(rangeTo.value) || filteredDbLabels.value.length)
    selectedItemIds.value.clear()
    for (let i = from - 1; i < to; i++) {
        const item = filteredDbLabels.value[i]
        if (item) selectedItemIds.value.add(item.noInv)
    }
    toast(`${selectedItemIds.value.size} label terpilih dari range ${from} - ${to}`, { type: 'info' })
}

// ---------- BACA FILE EXCEL (.xlsx) ----------
const handleFileUpload = async (file: File | undefined | null) => {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
        toast('Format file harus berupa Excel (.xlsx)', { type: 'error' })
        return
    }
    isReadingExcel.value = true
    try {
        const buf = await file.arrayBuffer()
        const parsedSheets = await readXlsxWorkbook(buf)
        if (!parsedSheets.length) throw new Error('File tidak memiliki sheet yang dapat dibaca.')
        sheets.value = parsedSheets
        fileName.value = file.name

        // Pilih sheet yang memiliki data label
        let chosen = parsedSheets.find(s => parseSheetToLabels(s.rows, selectedLembaga.value, s.name).length > 0) || parsedSheets[0]
        selectedSheetName.value = chosen.name
        excelLabels.value = parseSheetToLabels(chosen.rows, selectedLembaga.value, chosen.name)
        toast(`File ${file.name} berhasil dibaca (${excelLabels.value.length} label)`, { type: 'success' })
    } catch (e: any) {
        console.error('Excel parse error:', e)
        sheets.value = []
        fileName.value = ''
        excelLabels.value = []
        toast(e?.message || 'Gagal membaca isi file Excel', { type: 'error' })
    } finally {
        isReadingExcel.value = false
        previewPage.value = 1
    }
}

const onFilePick = (e: Event) => {
    const input = e.target as HTMLInputElement
    handleFileUpload(input.files?.[0])
    input.value = ''
}

const onDropFile = (e: DragEvent) => {
    isDragging.value = false
    handleFileUpload(e.dataTransfer?.files?.[0])
}

watch(selectedSheetName, () => {
    const s = sheets.value.find(item => item.name === selectedSheetName.value)
    if (s) {
        excelLabels.value = parseSheetToLabels(s.rows, selectedLembaga.value, s.name)
        previewPage.value = 1
    }
})

// ---------- AKSI CETAK & EXPORT ----------
const printDirect = () => {
    if (totalActiveLabels.value === 0) {
        toast('Tidak ada label untuk dicetak', { type: 'warning' })
        return
    }
    window.print()
}

const saveAndOpenDocument = () => {
    if (totalActiveLabels.value === 0) {
        toast('Pilih minimal 1 label sebelum membuka dokumen hasil', { type: 'warning' })
        return
    }
    const payload = {
        template: selectedTemplate.value,
        lembaga: selectedLembaga.value,
        headerTitle: displayHeaderTitle.value,
        showLogo: showLogo.value,
        showBorderCut: showBorderCut.value,
        createdAt: new Date().toISOString(),
        items: activeDataset.value,
        customTemplateData: currentTemplateMeta.value.isCustom ? currentTemplateMeta.value.customData : null
    }
    try {
        localStorage.setItem('inventaris_label_payload', JSON.stringify(payload))
        navigateTo('/mailing_label/document')
    } catch (e) {
        console.error('Storage error:', e)
        toast('Gagal menyimpan payload ke localStorage', { type: 'error' })
    }
}

const exportPDF = async () => {
    if (totalActiveLabels.value === 0) {
        toast('Tidak ada label untuk diunduh', { type: 'warning' })
        return
    }
    if (!printContainerRef.value) return

    isExportingPDF.value = true
    toast('Menyiapkan file PDF label stiker...', { type: 'info' })

    try {
        const html2pdfModule: any = await import('html2pdf.js')
        const html2pdf: any = html2pdfModule.default || html2pdfModule
        const opt = {
            margin: [8, 8, 8, 8],
            filename: `Label_Inventaris_${selectedLembaga.value}_${selectedTemplate.value}_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }

        await html2pdf().set(opt).from(printContainerRef.value).save()
        toast('File PDF label berhasil diunduh!', { type: 'success' })
    } catch (e) {
        console.error('PDF error:', e)
        toast('Gagal mengekspor PDF', { type: 'error' })
    } finally {
        isExportingPDF.value = false
    }
}

// Watchers & Mounted
watch(selectedLembaga, () => {
    if (activeSourceTab.value === 'database') {
        fetchDatabaseItems()
    }
})

// Ambil template kustom dari server
const fetchCustomTemplates = async () => {
    try {
        const res = await $fetch<{ status: number; success: boolean; data: CustomTemplate[] }>('/api/template')
        if (res && res.success && Array.isArray(res.data)) {
            customTemplatesList.value = res.data
        }
    } catch (e) {
        console.error('Gagal memuat template kustom:', e)
    }
}

// Ambil template aktif sebagai nilai awal selectedTemplate
const fetchActiveTemplate = async () => {
    try {
        const res = await $fetch<{ status: number; success: boolean; data: { template_aktif: string } }>('/api/setingan')
        if (res?.data?.template_aktif) {
            selectedTemplate.value = res.data.template_aktif
        }
    } catch (e) {
        console.error('Gagal memuat template aktif:', e)
    }
}

onMounted(async () => {
    await fetchCustomTemplates()
    await fetchActiveTemplate()
    fetchDatabaseItems()
})
</script>

<template>
    <div class="app-layout">
        <Navbar class="no-print" />
        <main class="dashboard-container">
            <!-- HEADER HALAMAN -->
            <PageHeader
                class="no-print"
                title="Mailing Label & Stiker Inventaris"
                subtitle="Buat, pratinjau, dan cetak label inventaris resmi ke kertas stiker A4 / Tom & Jerry langsung dari sistem."
            >
                <NuxtLink to="/mailing_label/template" class="btn btn-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    Katalog Template
                </NuxtLink>
                <button @click="saveAndOpenDocument" class="btn btn-primary" :disabled="totalActiveLabels === 0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Buka Dokumen Cetak
                </button>
            </PageHeader>

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <!-- TABS SUMBER DATA -->
            <div class="card source-card no-print">
                <div class="tabs-header">
                    <button
                        class="tab-btn"
                        :class="{ 'tab-active': activeSourceTab === 'database' }"
                        @click="activeSourceTab = 'database'"
                    >
                        <span class="tab-icon">🏢</span>
                        Ambil dari Database Inventaris
                    </button>
                    <button
                        class="tab-btn"
                        :class="{ 'tab-active': activeSourceTab === 'excel' }"
                        @click="activeSourceTab = 'excel'"
                    >
                        <span class="tab-icon">📁</span>
                        Upload File Excel (.xlsx)
                    </button>
                </div>

                <!-- ISI TAB DATABASE -->
                <div v-if="activeSourceTab === 'database'" class="tab-body">
                    <div class="filter-toolbar">
                        <div class="toolbar-left">
                            <div class="control-group">
                                <label>Lembaga:</label>
                                <select v-model="selectedLembaga" class="select-box" :disabled="isDbLoading">
                                    <option v-for="l in lembagaOptions" :key="l" :value="l">{{ l }}</option>
                                </select>
                            </div>

                            <div class="control-group search-group">
                                <input
                                    v-model="dbSearchQuery"
                                    type="text"
                                    class="search-input"
                                    placeholder="Cari nama barang, kode, ruangan..."
                                    :disabled="isDbLoading"
                                />
                            </div>
                        </div>

                        <div class="toolbar-right">
                            <span class="badge-selection">
                                <strong>{{ selectedItemIds.size }}</strong> dari {{ filteredDbLabels.length }} barang terpilih
                            </span>
                            <button @click="toggleSelectAll" class="btn btn-sm btn-outline">
                                {{ isAllSelected ? 'Batalkan Semua' : 'Pilih Semua' }}
                            </button>
                        </div>
                    </div>

                    <!-- Range Selector Cepat -->
                    <div class="range-selector-bar">
                        <span class="range-label">Pilih Berdasarkan Range No:</span>
                        <input v-model.number="rangeFrom" type="number" min="1" class="range-input" placeholder="Dari" />
                        <span>s/d</span>
                        <input v-model.number="rangeTo" type="number" min="1" class="range-input" placeholder="Sampai" />
                        <button @click="applyRangeSelection" class="btn btn-sm btn-primary">Terapkan Range</button>
                    </div>

                    <!-- Tabel Skeleton / Data -->
                    <div class="table-container" :aria-busy="isDbLoading">
                        <SkeletonTable
                            v-if="isDbLoading && showDbSkeleton"
                            :rows="6"
                            :cols="5"
                            :headers="['Pilih', 'No. Inv', 'Nama Barang', 'Lokasi/Ruang', 'Asal Dana']"
                        />
                        <div v-else-if="filteredDbLabels.length === 0" class="empty-state">
                            <p>Tidak ada data inventaris yang cocok.</p>
                        </div>
                        <table v-else class="data-table">
                            <thead>
                                <tr>
                                    <th width="50" class="text-center">
                                        <input
                                            type="checkbox"
                                            :checked="isAllSelected"
                                            @change="toggleSelectAll"
                                            title="Pilih Semua"
                                        />
                                    </th>
                                    <th>No. Inventaris</th>
                                    <th>Nama Barang</th>
                                    <th>Lokasi / Ruangan</th>
                                    <th>Asal Dana</th>
                                    <th>Tahun</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="item in filteredDbLabels.slice(0, 50)"
                                    :key="item.noInv"
                                    :class="{ 'row-selected': selectedItemIds.has(item.noInv) }"
                                    @click="toggleItemSelect(item.noInv)"
                                >
                                    <td class="text-center" @click.stop>
                                        <input
                                            type="checkbox"
                                            :checked="selectedItemIds.has(item.noInv)"
                                            @change="toggleItemSelect(item.noInv)"
                                        />
                                    </td>
                                    <td><span class="code-badge">{{ item.noInv }}</span></td>
                                    <td><strong>{{ item.nama_barang }}</strong></td>
                                    <td>{{ item.ruang }}</td>
                                    <td>{{ item.asal_dana }}</td>
                                    <td>{{ item.tahun }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-if="filteredDbLabels.length > 50" class="table-footer-info">
                            Menampilkan 50 item teratas dari total {{ filteredDbLabels.length }} data. Semua data yang dicentang tetap masuk ke dalam cetakan.
                        </div>
                    </div>
                </div>

                <!-- ISI TAB EXCEL -->
                <div v-else class="tab-body">
                    <div
                        class="dropzone-box"
                        :class="{ 'dropzone-active': isDragging }"
                        @dragover.prevent="isDragging = true"
                        @dragleave.prevent="isDragging = false"
                        @drop.prevent="onDropFile"
                    >
                        <div class="dropzone-content">
                            <div class="dropzone-icon">📊</div>
                            <h3 class="dropzone-title">Tarik & Lepas File Excel (.xlsx) di sini</h3>
                            <p class="dropzone-sub">Atau klik tombol di bawah untuk memilih file dari komputer Anda</p>
                            <label class="btn btn-primary btn-file">
                                <span>Pilih File Excel</span>
                                <input type="file" accept=".xlsx" class="file-hidden" @change="onFilePick" />
                            </label>
                            <p class="dropzone-hint">
                                Mendukung file berformat stiker sekolah seperti: <code>LABELING BARANG SMA 2026.xlsx</code>
                            </p>
                        </div>
                    </div>

                    <!-- Informasi Sheet Terbaca -->
                    <div v-if="sheets.length > 0" class="excel-info-card">
                        <div class="excel-meta">
                            <div>
                                <span class="meta-label">File:</span> <strong>{{ fileName }}</strong>
                            </div>
                            <div class="sheet-picker">
                                <span class="meta-label">Pilih Sheet:</span>
                                <select v-model="selectedSheetName" class="select-box select-sm">
                                    <option v-for="s in sheets" :key="s.name" :value="s.name">{{ s.name }} ({{ s.rows.length }} baris)</option>
                                </select>
                            </div>
                            <span class="badge-success">{{ excelLabels.length }} Label Siap Dicetak</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PENGATURAN TEMPLATE & KERTAS -->
            <div class="card settings-card no-print">
                <div class="card-title-row">
                    <h3 class="settings-title">Model Layout & Pengaturan Kertas Stiker</h3>
                    <div class="template-chips">
                        <button
                            v-for="tpl in allTemplateOptions"
                            :key="tpl.id"
                            class="chip-btn"
                            :class="{ 'chip-active': selectedTemplate === tpl.id, 'chip-kustom': tpl.isCustom }"
                            @click="selectedTemplate = tpl.id; previewPage = 1"
                        >
                            <span v-if="tpl.isCustom" class="chip-badge-tag">Kustom</span>
                            {{ tpl.name }} ({{ tpl.perPage }}/lembar)
                        </button>
                    </div>
                </div>

                <div class="settings-grid">
                    <div class="control-group">
                        <label>Judul Header Stiker:</label>
                        <input
                            v-model="customHeaderTitle"
                            type="text"
                            class="search-input"
                            :placeholder="displayHeaderTitle"
                        />
                    </div>
                    <div class="toggles-row">
                        <label class="toggle-checkbox">
                            <input type="checkbox" v-model="showLogo" />
                            <span>Tampilkan Logo Instansi</span>
                        </label>
                        <label class="toggle-checkbox">
                            <input type="checkbox" v-model="showBorderCut" />
                            <span>Garis Batas Potong</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- AREA PRATINJAU A4 VUE & TOMBOL CETAK -->
            <div class="preview-section no-print">
                <div class="preview-header">
                    <div class="preview-title-box">
                        <h3>Pratinjau Lembar Stiker A4</h3>
                        <span class="preview-badge">
                            Halaman {{ previewPage }} dari {{ totalPages }} (Total {{ totalActiveLabels }} Label)
                        </span>
                    </div>

                    <div class="preview-actions">
                        <div class="pagination-controls">
                            <button
                                class="btn btn-sm btn-outline"
                                :disabled="previewPage <= 1"
                                @click="previewPage--"
                            >
                                ◀ Sebelumnya
                            </button>
                            <span class="page-indicator">{{ previewPage }} / {{ totalPages }}</span>
                            <button
                                class="btn btn-sm btn-outline"
                                :disabled="previewPage >= totalPages"
                                @click="previewPage++"
                            >
                                Berikutnya ▶
                            </button>
                        </div>

                        <button @click="printDirect" class="btn btn-primary" :disabled="totalActiveLabels === 0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                            Print Langsung
                        </button>
                        <button @click="exportPDF" class="btn btn-secondary" :disabled="totalActiveLabels === 0 || isExportingPDF">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            {{ isExportingPDF ? 'Mengunduh...' : 'Download PDF' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- ELEMEN LEMBAR A4 VUE (TAMPIL DI LAYAR PRATINJAU & DI CETAK PRINT) -->
            <div class="print-wrapper" ref="printContainerRef">
                <!-- Tampilan Pratinjau di Layar: Hanya menampilkan halaman aktif saat ini -->
                <div 
                    class="a4-sheet screen-preview" 
                    :class="!currentTemplateMeta.isCustom ? `template-${selectedTemplate}` : 'template-custom-grid'"
                    :style="currentTemplateMeta.isCustom && currentTemplateMeta.customData ? {
                        gridTemplateColumns: `repeat(${currentTemplateMeta.cols}, ${currentTemplateMeta.customData.labelWidthMm}mm)`,
                        gridAutoRows: `${currentTemplateMeta.customData.labelHeightMm}mm`,
                        gap: `${currentTemplateMeta.customData.gapYMm}mm ${currentTemplateMeta.customData.gapXMm}mm`,
                        justifyContent: 'center'
                    } : {}"
                >
                    <div
                        v-for="(item, idx) in currentPreviewLabels"
                        :key="idx"
                        class="label-cell"
                        :class="{ 'cell-empty': !item, 'with-border': showBorderCut }"
                    >
                        <template v-if="item">
                            <!-- TEMPLATE 0: TEMPLATE KUSTOM (DARI FILE UPLOAD) -->
                            <LabelRenderer 
                                v-if="currentTemplateMeta.isCustom && currentTemplateMeta.customData"
                                :template="currentTemplateMeta.customData"
                                :item="item"
                                :show-border-cut="showBorderCut"
                                mode="preview"
                            />

                            <!-- TEMPLATE 1: RESMI BUDHI WARMAN II (2 Kolom x 4 Baris = 8 label) -->
                            <div v-else-if="selectedTemplate === 'resmi_bw'" class="label-resmi-bw">
                                <div class="resmi-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="school-logo" />
                                    <div class="resmi-header-text">
                                        <div class="resmi-instansi">{{ displayHeaderTitle }}</div>
                                        <div class="resmi-sub">KARTU IDENTITAS BARANG</div>
                                    </div>
                                </div>
                                <div class="resmi-divider"></div>
                                <table class="resmi-table">
                                    <tbody>
                                        <tr>
                                            <td class="resmi-label">NO INV</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val"><strong>{{ item.noInv }}</strong></td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">LOKASI</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.ruang }}</td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">ASAL DANA</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.asal_dana }}</td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">TAHUN</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.tahun }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- TEMPLATE 2: STANDAR A4 BARCODE (3 Kolom x 7 Baris = 21 label) -->
                            <div v-else-if="selectedTemplate === 'standard'" class="label-standard">
                                <div class="std-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                    <span class="std-title">{{ displayHeaderTitle }}</span>
                                </div>
                                <div class="std-name">{{ item.nama_barang }}</div>
                                <div class="std-code">{{ item.noInv }}</div>
                                <div class="std-meta">Ruang: {{ item.ruang }} | Th: {{ item.tahun }}</div>
                                <!-- Vector SVG Barcode tajam -->
                                <div class="std-barcode">
                                    <svg viewBox="0 0 100 22" preserveAspectRatio="none" class="barcode-svg">
                                        <rect x="2" y="0" width="2" height="20" fill="#000" />
                                        <rect x="6" y="0" width="1" height="20" fill="#000" />
                                        <rect x="9" y="0" width="3" height="20" fill="#000" />
                                        <rect x="14" y="0" width="1" height="20" fill="#000" />
                                        <rect x="17" y="0" width="2" height="20" fill="#000" />
                                        <rect x="21" y="0" width="4" height="20" fill="#000" />
                                        <rect x="27" y="0" width="1" height="20" fill="#000" />
                                        <rect x="30" y="0" width="2" height="20" fill="#000" />
                                        <rect x="34" y="0" width="3" height="20" fill="#000" />
                                        <rect x="39" y="0" width="1" height="20" fill="#000" />
                                        <rect x="42" y="0" width="3" height="20" fill="#000" />
                                        <rect x="47" y="0" width="2" height="20" fill="#000" />
                                        <rect x="51" y="0" width="1" height="20" fill="#000" />
                                        <rect x="54" y="0" width="4" height="20" fill="#000" />
                                        <rect x="60" y="0" width="2" height="20" fill="#000" />
                                        <rect x="64" y="0" width="1" height="20" fill="#000" />
                                        <rect x="67" y="0" width="3" height="20" fill="#000" />
                                        <rect x="72" y="0" width="2" height="20" fill="#000" />
                                        <rect x="76" y="0" width="1" height="20" fill="#000" />
                                        <rect x="79" y="0" width="3" height="20" fill="#000" />
                                        <rect x="84" y="0" width="2" height="20" fill="#000" />
                                        <rect x="88" y="0" width="1" height="20" fill="#000" />
                                        <rect x="91" y="0" width="3" height="20" fill="#000" />
                                        <rect x="96" y="0" width="2" height="20" fill="#000" />
                                    </svg>
                                </div>
                            </div>

                            <!-- TEMPLATE 3: RINGKAS / MINI (4 Kolom x 10 Baris = 40 label) -->
                            <div v-else-if="selectedTemplate === 'compact'" class="label-compact">
                                <div class="cpt-instansi">{{ displayHeaderTitle }}</div>
                                <div class="cpt-name">{{ item.nama_barang }}</div>
                                <div class="cpt-code"><strong>{{ item.noInv }}</strong></div>
                                <div class="cpt-footer">{{ item.ruang }} · {{ item.tahun }}</div>
                            </div>

                            <!-- TEMPLATE 4: QR CODE KOTAK (3 Kolom x 8 Baris = 24 label) -->
                            <div v-else-if="selectedTemplate === 'qrcode'" class="label-qrcode">
                                <div class="qr-col-left">
                                    <!-- Vector SVG QR Mock Pattern -->
                                    <svg viewBox="0 0 33 33" class="qr-svg">
                                        <rect width="33" height="33" fill="#ffffff" />
                                        <!-- Top Left Target -->
                                        <rect x="2" y="2" width="7" height="7" fill="#000000" />
                                        <rect x="3" y="3" width="5" height="5" fill="#ffffff" />
                                        <rect x="4" y="4" width="3" height="3" fill="#000000" />
                                        <!-- Top Right Target -->
                                        <rect x="24" y="2" width="7" height="7" fill="#000000" />
                                        <rect x="25" y="3" width="5" height="5" fill="#ffffff" />
                                        <rect x="26" y="4" width="3" height="3" fill="#000000" />
                                        <!-- Bottom Left Target -->
                                        <rect x="2" y="24" width="7" height="7" fill="#000000" />
                                        <rect x="3" y="25" width="5" height="5" fill="#ffffff" />
                                        <rect x="4" y="26" width="3" height="3" fill="#000000" />
                                        <!-- Pattern Pixels -->
                                        <rect x="12" y="3" width="2" height="2" fill="#000" />
                                        <rect x="16" y="4" width="2" height="3" fill="#000" />
                                        <rect x="19" y="2" width="2" height="2" fill="#000" />
                                        <rect x="4" y="12" width="3" height="2" fill="#000" />
                                        <rect x="10" y="10" width="3" height="3" fill="#000" />
                                        <rect x="15" y="11" width="3" height="2" fill="#000" />
                                        <rect x="20" y="12" width="2" height="3" fill="#000" />
                                        <rect x="25" y="11" width="3" height="2" fill="#000" />
                                        <rect x="11" y="17" width="2" height="3" fill="#000" />
                                        <rect x="15" y="16" width="4" height="2" fill="#000" />
                                        <rect x="22" y="18" width="3" height="3" fill="#000" />
                                        <rect x="12" y="24" width="3" height="2" fill="#000" />
                                        <rect x="17" y="23" width="2" height="3" fill="#000" />
                                        <rect x="22" y="25" width="4" height="2" fill="#000" />
                                    </svg>
                                </div>
                                <div class="qr-col-right">
                                    <div class="qr-instansi">{{ displayHeaderTitle }}</div>
                                    <div class="qr-code"><strong>{{ item.noInv }}</strong></div>
                                    <div class="qr-name">{{ item.nama_barang }}</div>
                                    <div class="qr-meta">{{ item.ruang }} | {{ item.tahun }}</div>
                                </div>
                            </div>

                            <!-- TEMPLATE 5: TOM & JERRY 103 (2 Kolom x 6 Baris = 12 label) -->
                            <div v-else-if="selectedTemplate === 'tomjerry103'" class="label-tj103">
                                <div class="tj-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                    <span>{{ displayHeaderTitle }}</span>
                                </div>
                                <div class="tj-body">
                                    <div class="tj-code">{{ item.noInv }}</div>
                                    <div class="tj-name">{{ item.nama_barang }}</div>
                                    <div class="tj-room">Lokasi: {{ item.ruang }}</div>
                                </div>
                            </div>

                            <!-- TEMPLATE 6: SMA BW 2 (2 Kolom x 4 Baris = 8 label, tanpa logo) -->
                            <div v-else class="label-sma-bw2">
                                <div class="sma-bw2-header">
                                    <div class="sma-bw2-instansi">SMA BUDHI WARMAN II JAKARTA</div>
                                </div>
                                <div class="sma-bw2-divider"></div>
                                <table class="sma-bw2-table">
                                    <tbody>
                                        <tr>
                                            <td class="sma-bw2-label">NO INV</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val"><strong>{{ item.noInv }}</strong></td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">LOKASI</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.ruang }}</td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">ASAL DANA</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.asal_dana || 'BOS / Yayasan' }}</td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">TAHUN</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.tahun }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Cetak Print: Render SEMUA Halaman secara beruntun dengan page break -->
                <div class="print-all-pages print-only">
                    <div
                        v-for="p in totalPages"
                        :key="`print-page-${p}`"
                        class="a4-sheet"
                        :class="!currentTemplateMeta.isCustom ? `template-${selectedTemplate}` : 'template-custom-grid'"
                        :style="currentTemplateMeta.isCustom && currentTemplateMeta.customData ? {
                            gridTemplateColumns: `repeat(${currentTemplateMeta.cols}, ${currentTemplateMeta.customData.labelWidthMm}mm)`,
                            gridAutoRows: `${currentTemplateMeta.customData.labelHeightMm}mm`,
                            gap: `${currentTemplateMeta.customData.gapYMm}mm ${currentTemplateMeta.customData.gapXMm}mm`,
                            justifyContent: 'center'
                        } : {}"
                    >
                        <div
                            v-for="(item, idx) in activeDataset.slice((p - 1) * labelsPerPage, p * labelsPerPage)"
                            :key="`print-item-${idx}`"
                            class="label-cell"
                            :class="{ 'with-border': showBorderCut }"
                        >
                            <!-- Template Kustom -->
                            <LabelRenderer 
                                v-if="currentTemplateMeta.isCustom && currentTemplateMeta.customData"
                                :template="currentTemplateMeta.customData"
                                :item="item"
                                :show-border-cut="showBorderCut"
                                mode="print"
                            />

                            <!-- Template Resmi BW -->
                            <div v-else-if="selectedTemplate === 'resmi_bw'" class="label-resmi-bw">
                                <div class="resmi-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="school-logo" />
                                    <div class="resmi-header-text">
                                        <div class="resmi-instansi">{{ displayHeaderTitle }}</div>
                                        <div class="resmi-sub">KARTU IDENTITAS BARANG</div>
                                    </div>
                                </div>
                                <div class="resmi-divider"></div>
                                <table class="resmi-table">
                                    <tbody>
                                        <tr>
                                            <td class="resmi-label">NO INV</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val"><strong>{{ item.noInv }}</strong></td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">LOKASI</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.ruang }}</td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">ASAL DANA</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.asal_dana }}</td>
                                        </tr>
                                        <tr>
                                            <td class="resmi-label">TAHUN</td>
                                            <td class="resmi-colon">:</td>
                                            <td class="resmi-val">{{ item.tahun }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- Template Standard Barcode -->
                            <div v-else-if="selectedTemplate === 'standard'" class="label-standard">
                                <div class="std-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                    <span class="std-title">{{ displayHeaderTitle }}</span>
                                </div>
                                <div class="std-name">{{ item.nama_barang }}</div>
                                <div class="std-code">{{ item.noInv }}</div>
                                <div class="std-meta">Ruang: {{ item.ruang }} | Th: {{ item.tahun }}</div>
                                <div class="std-barcode">
                                    <svg viewBox="0 0 100 22" preserveAspectRatio="none" class="barcode-svg">
                                        <rect x="2" y="0" width="2" height="20" fill="#000" />
                                        <rect x="6" y="0" width="1" height="20" fill="#000" />
                                        <rect x="9" y="0" width="3" height="20" fill="#000" />
                                        <rect x="14" y="0" width="1" height="20" fill="#000" />
                                        <rect x="17" y="0" width="2" height="20" fill="#000" />
                                        <rect x="21" y="0" width="4" height="20" fill="#000" />
                                        <rect x="27" y="0" width="1" height="20" fill="#000" />
                                        <rect x="30" y="0" width="2" height="20" fill="#000" />
                                        <rect x="34" y="0" width="3" height="20" fill="#000" />
                                        <rect x="39" y="0" width="1" height="20" fill="#000" />
                                        <rect x="42" y="0" width="3" height="20" fill="#000" />
                                        <rect x="47" y="0" width="2" height="20" fill="#000" />
                                        <rect x="51" y="0" width="1" height="20" fill="#000" />
                                        <rect x="54" y="0" width="4" height="20" fill="#000" />
                                        <rect x="60" y="0" width="2" height="20" fill="#000" />
                                        <rect x="64" y="0" width="1" height="20" fill="#000" />
                                        <rect x="67" y="0" width="3" height="20" fill="#000" />
                                        <rect x="72" y="0" width="2" height="20" fill="#000" />
                                        <rect x="76" y="0" width="1" height="20" fill="#000" />
                                        <rect x="79" y="0" width="3" height="20" fill="#000" />
                                        <rect x="84" y="0" width="2" height="20" fill="#000" />
                                        <rect x="88" y="0" width="1" height="20" fill="#000" />
                                        <rect x="91" y="0" width="3" height="20" fill="#000" />
                                        <rect x="96" y="0" width="2" height="20" fill="#000" />
                                    </svg>
                                </div>
                            </div>

                            <!-- Template Compact -->
                            <div v-else-if="selectedTemplate === 'compact'" class="label-compact">
                                <div class="cpt-instansi">{{ displayHeaderTitle }}</div>
                                <div class="cpt-name">{{ item.nama_barang }}</div>
                                <div class="cpt-code"><strong>{{ item.noInv }}</strong></div>
                                <div class="cpt-footer">{{ item.ruang }} · {{ item.tahun }}</div>
                            </div>

                            <!-- Template QR Code -->
                            <div v-else-if="selectedTemplate === 'qrcode'" class="label-qrcode">
                                <div class="qr-col-left">
                                    <svg viewBox="0 0 33 33" class="qr-svg">
                                        <rect width="33" height="33" fill="#ffffff" />
                                        <rect x="2" y="2" width="7" height="7" fill="#000000" />
                                        <rect x="3" y="3" width="5" height="5" fill="#ffffff" />
                                        <rect x="4" y="4" width="3" height="3" fill="#000000" />
                                        <rect x="24" y="2" width="7" height="7" fill="#000000" />
                                        <rect x="25" y="3" width="5" height="5" fill="#ffffff" />
                                        <rect x="26" y="4" width="3" height="3" fill="#000000" />
                                        <rect x="2" y="24" width="7" height="7" fill="#000000" />
                                        <rect x="3" y="25" width="5" height="5" fill="#ffffff" />
                                        <rect x="4" y="26" width="3" height="3" fill="#000000" />
                                        <rect x="12" y="3" width="2" height="2" fill="#000" />
                                        <rect x="16" y="4" width="2" height="3" fill="#000" />
                                        <rect x="19" y="2" width="2" height="2" fill="#000" />
                                        <rect x="4" y="12" width="3" height="2" fill="#000" />
                                        <rect x="10" y="10" width="3" height="3" fill="#000" />
                                        <rect x="15" y="11" width="3" height="2" fill="#000" />
                                        <rect x="20" y="12" width="2" height="3" fill="#000" />
                                        <rect x="25" y="11" width="3" height="2" fill="#000" />
                                        <rect x="11" y="17" width="2" height="3" fill="#000" />
                                        <rect x="15" y="16" width="4" height="2" fill="#000" />
                                        <rect x="22" y="18" width="3" height="3" fill="#000" />
                                        <rect x="12" y="24" width="3" height="2" fill="#000" />
                                        <rect x="17" y="23" width="2" height="3" fill="#000" />
                                        <rect x="22" y="25" width="4" height="2" fill="#000" />
                                    </svg>
                                </div>
                                <div class="qr-col-right">
                                    <div class="qr-instansi">{{ displayHeaderTitle }}</div>
                                    <div class="qr-code"><strong>{{ item.noInv }}</strong></div>
                                    <div class="qr-name">{{ item.nama_barang }}</div>
                                    <div class="qr-meta">{{ item.ruang }} | {{ item.tahun }}</div>
                                </div>
                            </div>

                            <!-- Template Tom & Jerry 103 -->
                            <div v-else-if="selectedTemplate === 'tomjerry103'" class="label-tj103">
                                <div class="tj-header">
                                    <img v-if="showLogo" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                    <span>{{ displayHeaderTitle }}</span>
                                </div>
                                <div class="tj-body">
                                    <div class="tj-code">{{ item.noInv }}</div>
                                    <div class="tj-name">{{ item.nama_barang }}</div>
                                    <div class="tj-room">Lokasi: {{ item.ruang }}</div>
                                </div>
                            </div>

                            <!-- Template SMA BW 2 (2 x 4) -->
                            <div v-else class="label-sma-bw2">
                                <div class="sma-bw2-header">
                                    <div class="sma-bw2-instansi">SMA BUDHI WARMAN II JAKARTA</div>
                                </div>
                                <div class="sma-bw2-divider"></div>
                                <table class="sma-bw2-table">
                                    <tbody>
                                        <tr>
                                            <td class="sma-bw2-label">NO INV</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val"><strong>{{ item.noInv }}</strong></td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">LOKASI</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.ruang }}</td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">ASAL DANA</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.asal_dana || 'BOS / Yayasan' }}</td>
                                        </tr>
                                        <tr>
                                            <td class="sma-bw2-label">TAHUN</td>
                                            <td class="sma-bw2-colon">:</td>
                                            <td class="sma-bw2-val">{{ item.tahun }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* ================================================================
   LAYOUT UMUM (Sesuai gaya project Nuxt 4 Inventaris)
   ================================================================ */
.app-layout {
    display: flex;
    min-height: 100vh;
    background-color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
}

.dashboard-container {
    flex: 1;
    padding: 30px;
    max-width: 1400px;
    margin: 0 auto;
    box-sizing: border-box;
}



.header-actions {
    display: flex;
    gap: 12px;
}

/* KARTU DAN TABS */
.card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 24px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

.tabs-header {
    display: flex;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
}

.tab-btn {
    padding: 14px 24px;
    background: transparent;
    border: none;
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
    border-bottom: 2px solid transparent;
}

.tab-btn:hover {
    color: #0f172a;
    background: #e2e8f0;
}

.tab-btn.tab-active {
    color: #2563eb;
    background: #ffffff;
    border-bottom: 2px solid #2563eb;
}

.tab-body {
    padding: 20px;
}

/* TOOLBAR & FILTER */
.filter-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 16px;
}

.toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.control-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
}

.select-box {
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    font-size: 13px;
    color: #1e293b;
    cursor: pointer;
    outline: none;
}

.select-box:focus {
    border-color: #3b82f6;
}

.select-sm {
    padding: 6px 10px;
    font-size: 12px;
}

.search-input {
    padding: 8px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 13px;
    min-width: 280px;
    outline: none;
}

.search-input:focus {
    border-color: #3b82f6;
}

.badge-selection {
    font-size: 13px;
    color: #475569;
    background: #f1f5f9;
    padding: 6px 12px;
    border-radius: 6px;
}

.badge-selection strong {
    color: #2563eb;
}

.range-selector-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #f8fafc;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px dashed #cbd5e1;
    margin-bottom: 16px;
    font-size: 13px;
    color: #475569;
}

.range-input {
    width: 80px;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 13px;
}

/* TABEL DATA */
.table-container {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    text-align: left;
}

.data-table th {
    background: #f8fafc;
    color: #475569;
    padding: 10px 14px;
    font-weight: 600;
    border-bottom: 1px solid #e2e8f0;
}

.data-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    cursor: pointer;
}

.data-table tr:hover {
    background: #f8fafc;
}

.row-selected {
    background: #eff6ff !important;
}

.code-badge {
    background: #f1f5f9;
    color: #0f172a;
    padding: 3px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    border: 1px solid #e2e8f0;
}

.table-footer-info {
    padding: 10px 14px;
    font-size: 12px;
    color: #64748b;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
}

.empty-state {
    padding: 40px;
    text-align: center;
    color: #94a3b8;
}

/* DROPZONE EXCEL */
.dropzone-box {
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    background: #f8fafc;
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
}

.dropzone-box:hover, .dropzone-active {
    border-color: #3b82f6;
    background: #eff6ff;
}

.dropzone-icon {
    font-size: 42px;
    margin-bottom: 12px;
}

.dropzone-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 6px 0;
}

.dropzone-sub {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 16px 0;
}

.btn-file {
    position: relative;
    display: inline-block;
    cursor: pointer;
}

.file-hidden {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
}

.dropzone-hint {
    margin: 16px 0 0 0;
    font-size: 12px;
    color: #94a3b8;
}

.dropzone-hint code {
    background: #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    color: #334155;
}

.excel-info-card {
    margin-top: 16px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 14px 18px;
}

.excel-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 13px;
    color: #166534;
}

.meta-label {
    color: #15803d;
    font-weight: 600;
}

.badge-success {
    background: #dcfce7;
    color: #15803d;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 600;
}

/* PENGATURAN TEMPLATE */
.settings-card {
    padding: 20px;
}

.card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 16px;
}

.settings-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
}

.template-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.chip-btn {
    padding: 6px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 20px;
    background: #ffffff;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s ease;
}

.chip-btn:hover {
    border-color: #2563eb;
    color: #2563eb;
}

.chip-btn.chip-active {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
}

.chip-kustom {
    border-color: #c084fc;
}

.chip-badge-tag {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 800;
    margin-right: 4px;
    background: #f3e8ff;
    color: #7e22ce;
    text-transform: uppercase;
}

.chip-btn.chip-active .chip-badge-tag {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.settings-grid {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    border-top: 1px solid #f1f5f9;
    padding-top: 16px;
}

.toggles-row {
    display: flex;
    align-items: center;
    gap: 20px;
}

.toggle-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #475569;
    cursor: pointer;
    user-select: none;
}

/* SECTION PRATINJAU */
.preview-section {
    margin-bottom: 20px;
}

.preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    background: #ffffff;
    padding: 16px 20px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
}

.preview-title-box h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    color: #0f172a;
}

.preview-badge {
    font-size: 12px;
    color: #64748b;
}

.preview-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
}

.page-indicator {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    min-width: 50px;
    text-align: center;
}

/* BUTTONS */
.btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s ease;
    text-decoration: none;
}

.btn-primary {
    background: #2563eb;
    color: #ffffff;
}

.btn-primary:hover {
    background: #1d4ed8;
}

.btn-secondary {
    background: #0f172a;
    color: #ffffff;
}

.btn-secondary:hover {
    background: #1e293b;
}

.btn-outline {
    background: #ffffff !important;
    border: 1px solid #cbd5e1 !important;
    color: #475569 !important;
}

.btn-outline:hover {
    background: #f8fafc !important;
    border-color: #94a3b8 !important;
    color: #0f172a !important;
}

.btn-sm {
    padding: 5px 10px;
    font-size: 12px;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* ================================================================
   LEMBAR A4 CETAK & PRATINJAU (CSS MURNI VUE)
   ================================================================ */
.print-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.a4-sheet {
    background: #ffffff;
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 10mm;
    margin: 0 auto 30px auto;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    border: 1px solid #e2e8f0;
    display: grid;
}

/* GRID PER TEMPLATE */
.template-resmi_bw {
    grid-template-columns: repeat(2, 92mm);
    grid-auto-rows: 67mm;
    gap: 6mm;
    justify-content: center;
}

.template-standard {
    grid-template-columns: repeat(3, 62mm);
    grid-auto-rows: 38mm;
    gap: 4mm;
    justify-content: center;
}

.template-compact {
    grid-template-columns: repeat(4, 46mm);
    grid-auto-rows: 26mm;
    gap: 2mm;
    justify-content: center;
}

.template-qrcode {
    grid-template-columns: repeat(3, 62mm);
    grid-auto-rows: 33mm;
    gap: 3mm;
    justify-content: center;
}

.template-tomjerry103 {
    grid-template-columns: repeat(2, 92mm);
    grid-auto-rows: 44mm;
    gap: 5mm;
    justify-content: center;
}

.template-sma_bw2 {
    grid-template-columns: repeat(2, 92mm);
    grid-auto-rows: 67mm;
    gap: 6mm;
    justify-content: center;
}

/* CELL LABEL */
.label-cell {
    background: #ffffff;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
    border-radius: 4px;
}

.label-cell.with-border {
    border: 1px solid #1e293b;
}

.label-cell.cell-empty {
    border: 1px dashed #e2e8f0;
    background: #fafafa;
}

/* 1. DESAIN RESMI BUDHI WARMAN II (2 x 4) */
.label-resmi-bw {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    color: #000000;
}

.resmi-header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.school-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
}

.resmi-header-text {
    flex: 1;
    text-align: center;
}

.resmi-instansi {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.2;
}

.resmi-sub {
    font-size: 9px;
    font-weight: 700;
    color: #333333;
    margin-top: 2px;
    letter-spacing: 0.5px;
}

.resmi-divider {
    height: 1.5px;
    background: #000000;
    margin: 6px 0;
}

.resmi-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    line-height: 1.35;
}

.resmi-table td {
    padding: 3px 2px;
    vertical-align: top;
}

.resmi-label {
    width: 72px;
    font-weight: 700;
}

.resmi-colon {
    width: 10px;
    text-align: center;
    font-weight: 700;
}

.resmi-val {
    word-break: break-word;
}

/* 2. DESAIN STANDAR A4 BARCODE (3 x 7) */
.label-standard {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 8px;
    box-sizing: border-box;
    font-family: Arial, sans-serif;
    color: #000;
}

.std-header {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
}

.logo-mini {
    width: 14px;
    height: 14px;
    object-fit: contain;
}

.std-title {
    font-size: 8px;
    font-weight: bold;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.std-name {
    font-size: 9px;
    font-weight: bold;
    line-height: 1.2;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.std-code {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
}

.std-meta {
    font-size: 7.5px;
    color: #444;
}

.std-barcode {
    height: 14px;
    display: flex;
    align-items: center;
}

.barcode-svg {
    width: 100%;
    height: 14px;
}

/* 3. DESAIN COMPACT (4 x 10) */
.label-compact {
    height: 100%;
    padding: 4px 6px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: Arial, sans-serif;
    color: #000;
}

.cpt-instansi {
    font-size: 7px;
    font-weight: bold;
    border-bottom: 0.5px solid #000;
    padding-bottom: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cpt-name {
    font-size: 8px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cpt-code {
    font-size: 8.5px;
    font-weight: bold;
}

.cpt-footer {
    font-size: 6.5px;
    color: #333;
}

/* 4. DESAIN QR CODE (3 x 8) */
.label-qrcode {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    box-sizing: border-box;
    font-family: Arial, sans-serif;
    color: #000;
}

.qr-col-left {
    width: 26mm;
    height: 26mm;
    display: flex;
    align-items: center;
    justify-content: center;
}

.qr-svg {
    width: 100%;
    height: 100%;
}

.qr-col-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
}

.qr-instansi {
    font-size: 7.5px;
    font-weight: bold;
    border-bottom: 0.5px solid #000;
    padding-bottom: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.qr-code {
    font-size: 9px;
    font-weight: bold;
    margin-top: 2px;
}

.qr-name {
    font-size: 8px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.qr-meta {
    font-size: 7px;
    color: #444;
}

/* 5. TOM & JERRY 103 (2 x 6) */
.label-tj103 {
    height: 100%;
    padding: 6px 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: Arial, sans-serif;
    color: #000;
}

.tj-header {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    font-size: 8px;
    font-weight: bold;
}

.tj-code {
    font-size: 11px;
    font-weight: bold;
}

.tj-name {
    font-size: 9.5px;
    font-weight: 600;
}

.tj-room {
    font-size: 8px;
    color: #333;
}

/* 6. SMA BW 2 (2 x 4) */
.label-sma-bw2 {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    color: #000000;
    background: #ffffff;
}

.sma-bw2-header {
    text-align: center;
    padding-bottom: 2px;
}

.sma-bw2-instansi {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.25;
}

.sma-bw2-divider {
    height: 1.5px;
    background: #000000;
    margin: 6px 0 8px 0;
}

.sma-bw2-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    line-height: 1.45;
}

.sma-bw2-table td {
    padding: 3px 2px;
    vertical-align: top;
}

.sma-bw2-label {
    width: 80px;
    font-weight: 700;
}

.sma-bw2-colon {
    width: 12px;
    text-align: center;
    font-weight: 700;
}

.sma-bw2-val {
    word-break: break-word;
}

/* ================================================================
   PRINTING CSS RULES (ATURAN CETAK LANGSUNG WINDOW.PRINT)
   ================================================================ */
.print-only {
    display: none;
}

@media print {
    @page {
        size: A4 portrait;
        margin: 5mm;
    }

    body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    .no-print, nav, aside, .header-container, .card, .preview-section {
        display: none !important;
    }

    .app-layout {
        display: block !important;
        background: transparent !important;
    }

    .dashboard-container {
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
    }

    .print-wrapper {
        display: block !important;
    }

    .screen-preview {
        display: none !important;
    }

    .print-only {
        display: block !important;
    }

    .a4-sheet {
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
    }
}
</style>
