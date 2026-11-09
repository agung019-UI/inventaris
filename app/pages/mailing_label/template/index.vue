<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import LabelRenderer from '~/components/LabelRenderer.vue'
import { parseTemplateFile } from '~/utils/templateFileParser'
import type { CustomTemplate, CustomTemplateField } from '~/types/customTemplate'

const activeTemplate = ref('resmi_bw')
const isSaving = ref(false)
const isLoadingTemplates = ref(false)
const customTemplates = ref<CustomTemplate[]>([])

// Template bawaan sistem
const defaultTemplates = [
    {
        id: 'resmi_bw',
        name: 'Label Resmi Budhi Warman II (92 x 67 mm)',
        desc: 'Format resmi kartu identitas barang inventaris dengan logo sekolah, nama instansi, dan tabel informasi lengkap.',
        paper: 'Kertas Stiker A4 (210 x 297 mm) - 2 kolom x 4 baris (8 label/lembar)',
        fields: ['Logo Sekolah', 'Nama Lembaga', 'No Inventaris', 'Lokasi / Ruang', 'Asal Dana', 'Tahun Perolehan'],
        isCustom: false
    },
    {
        id: 'standard',
        name: 'Label Standar A4 (62 x 38 mm)',
        desc: 'Ukuran ideal untuk stiker inventaris aset kantor, CPU, printer, meja, dan lemari dengan barcode.',
        paper: 'Kertas Stiker A4 (210 x 297 mm) - 3 kolom x 7 baris (21 label/lembar)',
        fields: ['Logo BW II', 'Nama Instansi', 'Nama Barang', 'Kode Inventaris', 'Barcode Batang'],
        isCustom: false
    },
    {
        id: 'compact',
        name: 'Label Ringkas / Mini (46 x 26 mm)',
        desc: 'Ukuran kompak cocok untuk perangkat kecil seperti mouse, adaptor, monitor, dan kabel.',
        paper: 'Kertas Stiker A4 - 4 kolom x 10 baris (40 label/lembar)',
        fields: ['Nama Barang Singkat', 'Kode & No Urut', 'Ruangan', 'Tahun'],
        isCustom: false
    },
    {
        id: 'qrcode',
        name: 'Label QR Code Kotak (62 x 33 mm)',
        desc: 'Format modern berbasis scan QR Code untuk audit cepat menggunakan kamera smartphone.',
        paper: 'Kertas Stiker A4 - 3 kolom x 8 baris (24 label/lembar)',
        fields: ['QR Code Aset', 'Nama Barang', 'Kode Aset', 'Ruang', 'Tahun'],
        isCustom: false
    },
    {
        id: 'tomjerry103',
        name: 'Label Tom & Jerry No. 103 (64 x 32 mm)',
        desc: 'Format template khusus kertas label stiker Tom & Jerry tipe 103 (12 label per pack).',
        paper: 'Ukuran Kertas Tom & Jerry No. 103 (2 kolom x 6 baris, 12 label)',
        fields: ['Header Lembaga', 'Kode Barang', 'Nama Barang', 'Ruangan'],
        isCustom: false
    },
    {
        id: 'sma_bw2',
        name: 'Label Identitas SMA BW II (2 x 4)',
        desc: 'Format kartu identitas barang inventaris resmi tanpa logo (2 kolom x 4 baris, 8 label/lembar A4).',
        paper: 'Kertas Stiker A4 (210 x 297 mm) - 2 kolom x 4 baris (8 label/lembar)',
        fields: ['Judul Lembaga', 'No Inventaris', 'Lokasi / Ruang', 'Asal Dana', 'Tahun Perolehan'],
        isCustom: false
    }
]

// Modal & Form State untuk Tambah / Edit Template
const showModal = ref(false)
const modalStep = ref<1 | 2 | 3>(1)
const isEditing = ref(false)
const isSubmitting = ref(false)
const isParsingFile = ref(false)
const isDragging = ref(false)
const uploadError = ref<string | null>(null)
const selectedFileName = ref('')

// Modal konfirmasi hapus
const showDeleteConfirm = ref(false)
const templateToDelete = ref<CustomTemplate | null>(null)
const isDeleting = ref(false)

const templateForm = reactive<CustomTemplate>({
    id: '',
    name: '',
    source: 'docx',
    paper: 'A4',
    cols: 2,
    rows: 4,
    perPage: 8,
    labelWidthMm: 92,
    labelHeightMm: 67,
    gapXMm: 6,
    gapYMm: 6,
    marginMm: 8,
    fields: [],
    createdAt: ''
})

// Opsi placeholder kunci standar
const placeholderOptions = [
    { key: 'no_inv', label: 'No Inventaris ({{no_inv}})' },
    { key: 'nama_barang', label: 'Nama Barang ({{nama_barang}})' },
    { key: 'lokasi', label: 'Lokasi / Ruang ({{lokasi}})' },
    { key: 'asal_dana', label: 'Asal Dana ({{asal_dana}})' },
    { key: 'tahun', label: 'Tahun ({{tahun}})' },
    { key: 'lembaga', label: 'Nama Lembaga ({{lembaga}})' },
    { key: 'barcode', label: 'Barcode Batang ({{barcode}})' },
    { key: 'qrcode', label: 'QR Code ({{qrcode}})' },
    { key: 'custom', label: 'Teks Kustom Lainnya' }
]

// Fetch data template kustom dari server
const fetchCustomTemplates = async () => {
    isLoadingTemplates.value = true
    try {
        const res = await $fetch<{ status: number; success: boolean; data: CustomTemplate[] }>('/api/template')
        if (res && res.success && Array.isArray(res.data)) {
            customTemplates.value = res.data
        }
    } catch (e) {
        console.error('Gagal mengambil daftar template kustom:', e)
    } finally {
        isLoadingTemplates.value = false
    }
}

// Ambil template aktif saat halaman dibuka
const fetchActiveTemplate = async () => {
    try {
        const res = await $fetch<{ status: number; success: boolean; data: { template_aktif: string } }>('/api/setingan')
        if (res?.data?.template_aktif) {
            activeTemplate.value = res.data.template_aktif
        }
    } catch (error) {
        console.error('Gagal mengambil template aktif:', error)
    }
}

onMounted(() => {
    fetchActiveTemplate()
    fetchCustomTemplates()
})

// Pilih template aktif
const selectTemplate = async (id: string, name?: string) => {
    if (isSaving.value) return
    const prevTemplate = activeTemplate.value
    activeTemplate.value = id
    isSaving.value = true
    try {
        const res = await $fetch<{ status: number; success: boolean; data: { template_aktif: string } }>('/api/setingan', {
            method: 'POST',
            body: { template_aktif: id }
        })
        if (res?.success) {
            activeTemplate.value = id
            const displayName = name || id
            toast(`Template "${displayName}" berhasil disimpan sebagai template aktif!`, { type: 'success' })
        } else {
            activeTemplate.value = prevTemplate
            toast('Gagal menyimpan template aktif.', { type: 'error' })
        }
    } catch (error: any) {
        activeTemplate.value = prevTemplate
        console.error('Gagal menyimpan template:', error)
        toast(error?.data?.statusMessage || 'Gagal menyimpan template aktif ke server.', { type: 'error' })
    } finally {
        isSaving.value = false
    }
}

// Buka Modal Tambah Baru
const openAddModal = () => {
    isEditing.value = false
    modalStep.value = 1
    uploadError.value = null
    selectedFileName.value = ''
    templateForm.id = ''
    templateForm.name = ''
    templateForm.source = 'docx'
    templateForm.paper = 'A4'
    templateForm.cols = 2
    templateForm.rows = 4
    templateForm.perPage = 8
    templateForm.labelWidthMm = 92
    templateForm.labelHeightMm = 67
    templateForm.gapXMm = 6
    templateForm.gapYMm = 6
    templateForm.marginMm = 8
    templateForm.fields = [
        { key: 'lembaga', text: 'SMA BUDHI WARMAN II JAKARTA', fontSize: 11, bold: true, align: 'center' },
        { key: 'no_inv', text: 'NO INV : {{no_inv}}', fontSize: 10, bold: true, align: 'left' },
        { key: 'lokasi', text: 'LOKASI : {{lokasi}}', fontSize: 10, bold: false, align: 'left' },
        { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}', fontSize: 10, bold: false, align: 'left' },
        { key: 'tahun', text: 'TAHUN : {{tahun}}', fontSize: 10, bold: false, align: 'left' }
    ]
    templateForm.createdAt = ''
    showModal.value = true
}

// Buka Modal Edit
const openEditModal = (tpl: CustomTemplate) => {
    isEditing.value = true
    modalStep.value = 2 // Langsung ke langkah edit hasil deteksi
    uploadError.value = null
    selectedFileName.value = `${tpl.name} (${tpl.source.toUpperCase()})`

    templateForm.id = tpl.id
    templateForm.name = tpl.name
    templateForm.source = tpl.source
    templateForm.paper = tpl.paper || 'A4'
    templateForm.cols = tpl.cols || 2
    templateForm.rows = tpl.rows || 4
    templateForm.perPage = tpl.perPage || (tpl.cols * tpl.rows)
    templateForm.labelWidthMm = tpl.labelWidthMm || 92
    templateForm.labelHeightMm = tpl.labelHeightMm || 67
    templateForm.gapXMm = tpl.gapXMm ?? 6
    templateForm.gapYMm = tpl.gapYMm ?? 6
    templateForm.marginMm = tpl.marginMm ?? 8
    templateForm.fields = JSON.parse(JSON.stringify(tpl.fields || []))
    templateForm.createdAt = tpl.createdAt || new Date().toISOString()
    showModal.value = true
}

// Handler Upload File di Langkah 1
const handleFileSelected = async (file: File | undefined | null) => {
    if (!file) return
    uploadError.value = null
    isParsingFile.value = true

    try {
        selectedFileName.value = file.name
        const parsed = await parseTemplateFile(file)

        // Generate Slug ID
        const cleanBase = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '_')
        const slug = cleanBase.slice(0, 18) || 'template'
        templateForm.id = `kustom_${slug}_${Date.now()}`
        templateForm.name = parsed.name || `Template ${file.name.replace(/\.[^/.]+$/, '')}`
        templateForm.source = parsed.source || 'docx'
        templateForm.paper = parsed.paper || 'A4'
        templateForm.cols = parsed.cols || 2
        templateForm.rows = parsed.rows || 4
        templateForm.perPage = (parsed.cols || 2) * (parsed.rows || 4)
        templateForm.labelWidthMm = parsed.labelWidthMm || 92
        templateForm.labelHeightMm = parsed.labelHeightMm || 67
        templateForm.gapXMm = parsed.gapXMm ?? 6
        templateForm.gapYMm = parsed.gapYMm ?? 6
        templateForm.marginMm = parsed.marginMm ?? 8
        templateForm.fields = parsed.fields && parsed.fields.length > 0 ? parsed.fields : [
            { key: 'lembaga', text: 'SMA BUDHI WARMAN II JAKARTA', fontSize: 11, bold: true, align: 'center' },
            { key: 'no_inv', text: 'NO INV : {{no_inv}}', fontSize: 10, bold: true, align: 'left' },
            { key: 'lokasi', text: 'LOKASI : {{lokasi}}', fontSize: 10, align: 'left' },
            { key: 'asal_dana', text: 'ASAL DANA : {{asal_dana}}', fontSize: 10, align: 'left' },
            { key: 'tahun', text: 'TAHUN : {{tahun}}', fontSize: 10, align: 'left' }
        ]
        templateForm.createdAt = new Date().toISOString()

        toast(`File "${file.name}" berhasil dibaca! Silakan periksa hasil deteksi layout.`, { type: 'success' })
        modalStep.value = 2
    } catch (err: any) {
        console.error('Gagal parsing template file:', err)
        uploadError.value = err?.message || 'Gagal membaca isi berkas template.'
        toast(uploadError.value, { type: 'error' })
    } finally {
        isParsingFile.value = false
    }
}

const onFileInputChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    handleFileSelected(input.files?.[0])
    input.value = ''
}

const onDropUpload = (e: DragEvent) => {
    isDragging.value = false
    handleFileSelected(e.dataTransfer?.files?.[0])
}

// Field editor helpers
const addField = () => {
    templateForm.fields.push({
        key: 'custom',
        text: 'Teks Kustom',
        fontSize: 10,
        bold: false,
        italic: false,
        align: 'left'
    })
}

const removeField = (index: number) => {
    if (templateForm.fields.length <= 1) {
        toast('Minimal harus menyisakan 1 elemen field.', { type: 'warning' })
        return
    }
    templateForm.fields.splice(index, 1)
}

// Perbarui perPage saat cols / rows diedit
const updateGridDimensions = () => {
    const cols = Math.max(1, Math.min(12, Number(templateForm.cols) || 1))
    const rows = Math.max(1, Math.min(12, Number(templateForm.rows) || 1))
    templateForm.cols = cols
    templateForm.rows = rows
    templateForm.perPage = cols * rows
}

// Simpan Template (Langkah 3)
const submitTemplate = async () => {
    if (!templateForm.name.trim()) {
        toast('Nama template wajib diisi.', { type: 'warning' })
        modalStep.value = 2
        return
    }

    if (templateForm.fields.length === 0) {
        toast('Template harus memiliki minimal 1 field data.', { type: 'warning' })
        modalStep.value = 2
        return
    }

    isSubmitting.value = true
    try {
        const method = isEditing.value ? 'PUT' : 'POST'
        const res = await $fetch<{ status: number; success: boolean; message: string; data: CustomTemplate }>('/api/template', {
            method,
            body: templateForm
        })

        if (res?.success) {
            toast(res.message || 'Template kustom berhasil disimpan!', { type: 'success' })
            showModal.value = false
            await fetchCustomTemplates()
        } else {
            toast('Gagal menyimpan template kustom ke server.', { type: 'error' })
        }
    } catch (err: any) {
        console.error('Error simpan template:', err)
        toast(err?.data?.statusMessage || 'Gagal menyimpan template kustom.', { type: 'error' })
    } finally {
        isSubmitting.value = false
    }
}

// Konfirmasi Hapus Template Kustom
const confirmDelete = (tpl: CustomTemplate) => {
    templateToDelete.value = tpl
    showDeleteConfirm.value = true
}

const deleteCustomTemplate = async () => {
    if (!templateToDelete.value) return
    isDeleting.value = true
    const targetId = templateToDelete.value.id

    try {
        const res = await $fetch<{ status: number; success: boolean; message: string; template_aktif_reset: boolean }>(`/api/template?id=${targetId}`, {
            method: 'DELETE'
        })

        if (res?.success) {
            toast(`Template "${templateToDelete.value.name}" berhasil dihapus.`, { type: 'success' })
            if (res.template_aktif_reset || activeTemplate.value === targetId) {
                activeTemplate.value = 'resmi_bw'
                toast('Template aktif dikembalikan ke Resmi Budhi Warman II.', { type: 'info' })
            }
            showDeleteConfirm.value = false
            templateToDelete.value = null
            await fetchCustomTemplates()
        } else {
            toast('Gagal menghapus template.', { type: 'error' })
        }
    } catch (err: any) {
        console.error('Error delete template:', err)
        toast(err?.data?.statusMessage || 'Gagal menghapus template.', { type: 'error' })
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <div class="app-layout">
        <Navbar class="no-print" />
        <main class="dashboard-container">
            <!-- HEADER CONTAINER -->
            <PageHeader
                title="Katalog Template Desain Label"
                subtitle="Pilihan model layout stiker bawaan dan tambah template kustom dari file Excel (.xlsx), Word (.docx), atau PDF."
            >
                <div class="header-action-group">
                    <button @click="openAddModal" class="btn btn-emerald">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        + Tambah Template
                    </button>
                    <NuxtLink to="/mailing_label" class="btn btn-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Kembali ke Buat Label
                    </NuxtLink>
                </div>
            </PageHeader>

            <!-- AREA ISI -->
            <div class="page-body">

                <!-- GRID TEMPLATE -->
                <div class="template-grid">

                    <!-- 1. TEMPLATE BAWAAN SISTEM -->
                    <div 
                        v-for="tpl in defaultTemplates" 
                        :key="tpl.id"
                        class="template-card"
                        :class="{ 'card-active': activeTemplate === tpl.id }"
                    >
                        <div class="card-header">
                            <div class="badge-tag" :class="{ 'tag-active': activeTemplate === tpl.id }">
                                {{ activeTemplate === tpl.id ? 'Template Aktif' : 'Tersedia' }}
                            </div>
                            <h3 class="card-title">{{ tpl.name }}</h3>
                            <p class="card-desc">{{ tpl.desc }}</p>
                        </div>

                        <!-- PREVIEW BOX BAWAAN -->
                        <div class="preview-area">
                            <!-- Preview Resmi Budhi Warman II -->
                            <div v-if="tpl.id === 'resmi_bw'" class="label-mockup mock-resmi">
                                <div class="mock-resmi-top">
                                    <img src="/images/logo.png" alt="Logo" class="mock-logo" />
                                    <div class="mock-resmi-titles">
                                        <div class="mock-resmi-title">SMA BUDHI WARMAN II</div>
                                        <div class="mock-resmi-sub">KARTU IDENTITAS BARANG</div>
                                    </div>
                                </div>
                                <div class="mock-divider"></div>
                                <div class="mock-table-row">
                                    <span class="mock-k">NO INV</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v"><strong>02.06.01.0001.26</strong></span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">LOKASI</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">R. Lab Komputer</span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">ASAL DANA</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">BOS / Yayasan</span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">TAHUN</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">2026</span>
                                </div>
                            </div>

                            <!-- Preview Standar Barcode -->
                            <div v-else-if="tpl.id === 'standard'" class="label-mockup mock-standard">
                                <div class="mockup-header">
                                    <span class="mock-instansi">SMA BUDHI WARMAN II</span>
                                    <span class="mock-year">2026</span>
                                </div>
                                <div class="mock-content">
                                    <span class="mock-name">LAPTOP ASUS B1</span>
                                    <span class="mock-code">02.06.01.0001.26</span>
                                    <span class="mock-room">R. LAB KOMPUTER</span>
                                </div>
                                <div class="mockup-footer">
                                    <div class="barcode-lines">
                                        <span>||||||||||||||||||||||||||||||||</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Preview Compact -->
                            <div v-else-if="tpl.id === 'compact'" class="label-mockup mock-compact">
                                <div class="mock-instansi-sm">SMA BUDHI WARMAN II</div>
                                <div class="mock-name-sm">LAPTOP ASUS B1</div>
                                <div class="mock-code-sm"><strong>02.06.01.0001.26</strong></div>
                                <div class="mock-room-sm">R. LAB · 2026</div>
                            </div>

                            <!-- Preview QR Code -->
                            <div v-else-if="tpl.id === 'qrcode'" class="label-mockup mock-qr-wrap">
                                <div class="mock-qr-icon">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 2h4v4h-4v-4zm-4-2h2v2h-2v-2zm2-2h4v2h-4v-2zm-2 6h2v2h-2v-2z"/>
                                    </svg>
                                </div>
                                <div class="mock-qr-details">
                                    <span class="mock-name">LAPTOP ASUS B1</span>
                                    <span class="mock-code">02.06.01.0001.26</span>
                                    <span class="mock-room">R. LAB KOMPUTER · 2026</span>
                                </div>
                            </div>

                            <!-- Preview Tom & Jerry 103 -->
                            <div v-else-if="tpl.id === 'tomjerry103'" class="label-mockup mock-tj">
                                <div class="mock-instansi">SMA BUDHI WARMAN II JAKARTA</div>
                                <div class="mock-code-lg">02.06.01.0001.26</div>
                                <div class="mock-name">LAPTOP ASUS B1</div>
                                <div class="mock-room">Lokasi: R. LAB KOMPUTER</div>
                            </div>

                            <!-- Preview SMA BW 2 (2 x 4) -->
                            <div v-else class="label-mockup mock-sma-bw2">
                                <div class="mock-sma-bw2-header">SMA BUDHI WARMAN II JAKARTA</div>
                                <div class="mock-sma-bw2-divider"></div>
                                <div class="mock-table-row">
                                    <span class="mock-k">NO INV</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v"><strong>02.06.01.0001.26</strong></span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">LOKASI</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">R. Lab Komputer</span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">ASAL DANA</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">BOS / Yayasan</span>
                                </div>
                                <div class="mock-table-row">
                                    <span class="mock-k">TAHUN</span>
                                    <span class="mock-c">:</span>
                                    <span class="mock-v">2026</span>
                                </div>
                            </div>
                        </div>

                        <!-- SPECS INFO -->
                        <div class="card-details">
                            <div class="detail-item">
                                <span class="detail-label">Spesifikasi Kertas:</span>
                                <span class="detail-value">{{ tpl.paper }}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Elemen Informasi:</span>
                                <div class="tags-container">
                                    <span v-for="(f, i) in tpl.fields" :key="i" class="field-tag">{{ f }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="card-actions">
                            <button 
                                @click="selectTemplate(tpl.id, tpl.name)"
                                class="btn-select"
                                :class="{ 'btn-selected': activeTemplate === tpl.id }"
                                :disabled="isSaving"
                            >
                                {{ activeTemplate === tpl.id ? '✓ Digunakan Saat Ini' : 'Gunakan Template Ini' }}
                            </button>
                        </div>
                    </div>

                    <!-- 2. TEMPLATE KUSTOM (DARI USER) -->
                    <div 
                        v-for="tpl in customTemplates" 
                        :key="tpl.id"
                        class="template-card card-custom"
                        :class="{ 'card-active': activeTemplate === tpl.id }"
                    >
                        <div class="card-header">
                            <div class="custom-badge-row">
                                <span class="badge-custom">Kustom ({{ tpl.source.toUpperCase() }})</span>
                                <span class="badge-tag" :class="{ 'tag-active': activeTemplate === tpl.id }">
                                    {{ activeTemplate === tpl.id ? 'Template Aktif' : 'Tersedia' }}
                                </span>
                            </div>
                            <h3 class="card-title">{{ tpl.name }}</h3>
                            <p class="card-desc">
                                Template kustom {{ tpl.cols }} kolom x {{ tpl.rows }} baris ({{ tpl.perPage }} label/lembar). Ukuran label {{ tpl.labelWidthMm }} x {{ tpl.labelHeightMm }} mm.
                            </p>
                        </div>

                        <!-- PREVIEW BOX TEMPLATE KUSTOM -->
                        <div class="preview-area preview-custom-wrap">
                            <LabelRenderer :template="tpl" mode="card" />
                        </div>

                        <!-- SPECS INFO KUSTOM -->
                        <div class="card-details">
                            <div class="detail-item">
                                <span class="detail-label">Spesifikasi Kertas & Grid:</span>
                                <span class="detail-value">{{ tpl.paper || 'A4' }} · {{ tpl.cols }} Kolom x {{ tpl.rows }} Baris ({{ tpl.perPage }} label/lembar)</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Elemen Terdeteksi:</span>
                                <div class="tags-container">
                                    <span v-for="(f, fi) in tpl.fields" :key="fi" class="field-tag tag-custom-field">
                                        {{ f.key }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- CARD ACTIONS KUSTOM: PILIH, EDIT, HAPUS -->
                        <div class="card-actions-custom">
                            <button 
                                @click="selectTemplate(tpl.id, tpl.name)"
                                class="btn-select"
                                :class="{ 'btn-selected': activeTemplate === tpl.id }"
                                :disabled="isSaving"
                            >
                                {{ activeTemplate === tpl.id ? '✓ Digunakan Saat Ini' : 'Gunakan Template Ini' }}
                            </button>
                            <div class="custom-manage-btns">
                                <button @click="openEditModal(tpl)" class="btn-manage btn-manage-edit" title="Edit Template">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    Edit
                                </button>
                                <button @click="confirmDelete(tpl)" class="btn-manage btn-manage-del" title="Hapus Template">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- ============================================================ -->
        <!-- MODAL 3 LANGKAH: TAMBAH / EDIT TEMPLATE KUSTOM -->
        <!-- ============================================================ -->
        <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
            <div class="modal-dialog">
                <!-- MODAL HEADER -->
                <div class="modal-header">
                    <div>
                        <h2 class="modal-title">
                            {{ isEditing ? 'Edit Template Kustom' : 'Tambah Template Label Baru' }}
                        </h2>
                        <p class="modal-subtitle">
                            Buat layout label fleksibel langsung dari berkas Excel (.xlsx), Word (.docx), atau PDF teks.
                        </p>
                    </div>
                    <button class="modal-close-btn" @click="showModal = false">&times;</button>
                </div>

                <!-- STEPPER INDICATOR -->
                <div class="modal-stepper">
                    <div class="step-item" :class="{ 'step-active': modalStep === 1, 'step-done': modalStep > 1 }">
                        <span class="step-number">1</span>
                        <span class="step-label">Unggah File</span>
                    </div>
                    <div class="step-divider" :class="{ 'divider-active': modalStep > 1 }"></div>
                    <div class="step-item" :class="{ 'step-active': modalStep === 2, 'step-done': modalStep > 2 }">
                        <span class="step-number">2</span>
                        <span class="step-label">Hasil Deteksi & Edit</span>
                    </div>
                    <div class="step-divider" :class="{ 'divider-active': modalStep > 2 }"></div>
                    <div class="step-item" :class="{ 'step-active': modalStep === 3 }">
                        <span class="step-number">3</span>
                        <span class="step-label">Simpan</span>
                    </div>
                </div>

                <!-- MODAL BODY -->
                <div class="modal-body">
                    <!-- ======================================== -->
                    <!-- LANGKAH 1: UNGGAH BERKAS -->
                    <!-- ======================================== -->
                    <div v-if="modalStep === 1" class="step-container">
                        <div 
                            class="upload-dropzone"
                            :class="{ 'dropzone-dragover': isDragging, 'dropzone-loading': isParsingFile }"
                            @dragover.prevent="isDragging = true"
                            @dragleave.prevent="isDragging = false"
                            @drop.prevent="onDropUpload"
                        >
                            <div v-if="isParsingFile" class="loading-state">
                                <div class="spinner"></div>
                                <p class="loading-text">Sedang membaca dan menganalisis struktur template...</p>
                            </div>
                            <div v-else class="dropzone-idle">
                                <div class="upload-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                </div>
                                <h3 class="dropzone-heading">Tarik & Lepas File Template ke Sini</h3>
                                <p class="dropzone-subheading">
                                    Mendukung format Microsoft Word (<code>.docx</code>), Excel (<code>.xlsx</code>), atau PDF (<code>.pdf</code>) berbasis teks. Maksimal 5 MB.
                                </p>
                                <label class="btn btn-primary btn-upload-label">
                                    <span>Pilih File dari Komputer</span>
                                    <input type="file" accept=".docx,.xlsx,.pdf" class="file-hidden" @change="onFileInputChange" />
                                </label>
                            </div>
                        </div>

                        <div v-if="uploadError" class="alert-error">
                            <strong>Gagal membaca file:</strong> {{ uploadError }}
                        </div>

                        <!-- LINK CONTOH BERKAS -->
                        <div class="sample-downloads-box">
                            <h4 class="sample-title">Belum punya format? Unduh contoh template siap pakai:</h4>
                            <div class="sample-links">
                                <a href="/templates/contoh_template_label.docx" download class="sample-btn">
                                    <span class="file-badge badge-docx">DOCX</span>
                                    <span>Unduh Contoh Word (.docx)</span>
                                </a>
                                <a href="/templates/contoh_template_label.xlsx" download class="sample-btn">
                                    <span class="file-badge badge-xlsx">XLSX</span>
                                    <span>Unduh Contoh Excel (.xlsx)</span>
                                </a>
                                <a href="/templates/contoh_template_label.pdf" download class="sample-btn">
                                    <span class="file-badge badge-pdf">PDF</span>
                                    <span>Unduh Contoh PDF (.pdf)</span>
                                </a>
                            </div>
                            <p class="sample-hint">
                                Tip: Format label menggunakan placeholder standar: <code>&#123;&#123;no_inv&#125;&#125;</code>, <code>&#123;&#123;nama_barang&#125;&#125;</code>, <code>&#123;&#123;lokasi&#125;&#125;</code>, <code>&#123;&#123;asal_dana&#125;&#125;</code>, <code>&#123;&#123;tahun&#125;&#125;</code>, <code>&#123;&#123;lembaga&#125;&#125;</code>, <code>&#123;&#123;barcode&#125;&#125;</code>, <code>&#123;&#123;qrcode&#125;&#125;</code>.
                            </p>
                        </div>
                    </div>

                    <!-- ======================================== -->
                    <!-- LANGKAH 2: HASIL DETEKSI & EDIT -->
                    <!-- ======================================== -->
                    <div v-else-if="modalStep === 2" class="step-container step-edit-grid">
                        <!-- KOLOM KIRI: FORM PENGATURAN & FIELD -->
                        <div class="editor-col-left">
                            <div class="section-box">
                                <h4 class="section-title">1. Informasi & Ukuran Kertas</h4>
                                <div class="form-row">
                                    <div class="form-group flex-2">
                                        <label>Nama Template:</label>
                                        <input v-model="templateForm.name" type="text" class="input-text" placeholder="Misal: Stiker Meja & Kursi SMA BW II" />
                                    </div>
                                    <div class="form-group flex-1">
                                        <label>Ukuran Kertas:</label>
                                        <input v-model="templateForm.paper" type="text" class="input-text" placeholder="A4" />
                                    </div>
                                </div>

                                <div class="form-row-4">
                                    <div class="form-group">
                                        <label>Kolom:</label>
                                        <input v-model.number="templateForm.cols" type="number" min="1" max="12" class="input-text" @input="updateGridDimensions" />
                                    </div>
                                    <div class="form-group">
                                        <label>Baris:</label>
                                        <input v-model.number="templateForm.rows" type="number" min="1" max="12" class="input-text" @input="updateGridDimensions" />
                                    </div>
                                    <div class="form-group">
                                        <label>Lebar Label (mm):</label>
                                        <input v-model.number="templateForm.labelWidthMm" type="number" step="0.5" min="10" max="210" class="input-text" />
                                    </div>
                                    <div class="form-group">
                                        <label>Tinggi Label (mm):</label>
                                        <input v-model.number="templateForm.labelHeightMm" type="number" step="0.5" min="10" max="297" class="input-text" />
                                    </div>
                                </div>

                                <div class="form-row-3">
                                    <div class="form-group">
                                        <label>Jarak Kolom (mm):</label>
                                        <input v-model.number="templateForm.gapXMm" type="number" step="0.5" min="0" max="50" class="input-text" />
                                    </div>
                                    <div class="form-group">
                                        <label>Jarak Baris (mm):</label>
                                        <input v-model.number="templateForm.gapYMm" type="number" step="0.5" min="0" max="50" class="input-text" />
                                    </div>
                                    <div class="form-group">
                                        <label>Margin Kertas (mm):</label>
                                        <input v-model.number="templateForm.marginMm" type="number" step="0.5" min="0" max="50" class="input-text" />
                                    </div>
                                </div>
                            </div>

                            <!-- DAFTAR FIELD TERDETEKSI -->
                            <div class="section-box">
                                <div class="section-header-row">
                                    <h4 class="section-title">2. Elemen Baris & Placeholder Data</h4>
                                    <button @click="addField" class="btn btn-sm btn-outline">+ Tambah Baris</button>
                                </div>

                                <div class="fields-list-editor">
                                    <div 
                                        v-for="(field, fIdx) in templateForm.fields" 
                                        :key="fIdx"
                                        class="field-editor-item"
                                    >
                                        <div class="field-item-top">
                                            <select v-model="field.key" class="select-field-key">
                                                <option v-for="opt in placeholderOptions" :key="opt.key" :value="opt.key">
                                                    {{ opt.label }}
                                                </option>
                                            </select>

                                            <div class="field-style-controls">
                                                <div class="font-size-wrap">
                                                    <label>Font:</label>
                                                    <input v-model.number="field.fontSize" type="number" min="6" max="28" class="input-pt" />
                                                    <span>pt</span>
                                                </div>

                                                <label class="toggle-bold" :class="{ 'is-bold': field.bold }">
                                                    <input type="checkbox" v-model="field.bold" />
                                                    <span>B</span>
                                                </label>

                                                <select v-model="field.align" class="select-align">
                                                    <option value="left">Kiri</option>
                                                    <option value="center">Tengah</option>
                                                    <option value="right">Kanan</option>
                                                </select>

                                                <button @click="removeField(fIdx)" class="btn-del-field" title="Hapus baris">
                                                    &times;
                                                </button>
                                            </div>
                                        </div>

                                        <div class="field-item-text">
                                            <input 
                                                v-model="field.text" 
                                                type="text" 
                                                class="input-field-text" 
                                                placeholder="Contoh: NO INV : {{no_inv}} atau teks judul"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- KOLOM KANAN: LIVE PREVIEW INTERAKTIF -->
                        <div class="editor-col-right">
                            <div class="preview-sticky-box">
                                <div class="preview-box-header">
                                    <h4>Pratinjau Langsung (Ukuran Asli)</h4>
                                    <span class="preview-dimension-badge">
                                        {{ templateForm.labelWidthMm }} x {{ templateForm.labelHeightMm }} mm
                                    </span>
                                </div>
                                <div class="live-preview-stage">
                                    <LabelRenderer 
                                        :template="templateForm" 
                                        mode="preview"
                                        :show-border-cut="true"
                                    />
                                </div>
                                <div class="preview-hints">
                                    <small>Label ditampilkan dengan data sampel inventaris sekolah. Perubahan teks atau ukuran font di sebelah kiri langsung terlihat di sini.</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ======================================== -->
                    <!-- LANGKAH 3: SIMPAN & KONFIRMASI -->
                    <!-- ======================================== -->
                    <div v-else class="step-container step-summary">
                        <div class="summary-card">
                            <div class="summary-check-icon">✓</div>
                            <h3 class="summary-heading">Konfirmasi Penyimpanan Template</h3>
                            <p class="summary-sub">Template akan disimpan secara permanen dan dapat langsung dipilih di katalog serta halaman Buat Label.</p>

                            <div class="summary-grid">
                                <div class="summary-item">
                                    <span class="sum-k">Nama Template:</span>
                                    <span class="sum-v"><strong>{{ templateForm.name }}</strong></span>
                                </div>
                                <div class="summary-item">
                                    <span class="sum-k">Sumber Berkas:</span>
                                    <span class="sum-v text-uppercase">{{ templateForm.source }}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="sum-k">Susunan Lembar:</span>
                                    <span class="sum-v">{{ templateForm.cols }} kolom x {{ templateForm.rows }} baris ({{ templateForm.perPage }} label per lembar A4)</span>
                                </div>
                                <div class="summary-item">
                                    <span class="sum-k">Dimensi Label:</span>
                                    <span class="sum-v">{{ templateForm.labelWidthMm }} mm x {{ templateForm.labelHeightMm }} mm</span>
                                </div>
                                <div class="summary-item">
                                    <span class="sum-k">Jumlah Elemen Field:</span>
                                    <span class="sum-v">{{ templateForm.fields.length }} field terpasang</span>
                                </div>
                            </div>

                            <div class="summary-preview-center">
                                <LabelRenderer :template="templateForm" mode="card" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MODAL FOOTER CONTROLS -->
                <div class="modal-footer">
                    <div class="footer-left">
                        <button v-if="modalStep === 2 && !isEditing" @click="modalStep = 1" class="btn btn-outline">
                            &larr; Ganti File
                        </button>
                        <button v-if="modalStep === 3" @click="modalStep = 2" class="btn btn-outline">
                            &larr; Edit Kembali
                        </button>
                    </div>
                    <div class="footer-right">
                        <button @click="showModal = false" class="btn btn-outline">Batal</button>
                        <button v-if="modalStep === 2" @click="modalStep = 3" class="btn btn-primary">
                            Lanjut ke Simpan &rarr;
                        </button>
                        <button v-if="modalStep === 3" @click="submitTemplate" class="btn btn-emerald" :disabled="isSubmitting">
                            {{ isSubmitting ? 'Menyimpan...' : (isEditing ? 'Perbarui Template' : 'Simpan Template') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============================================================ -->
        <!-- MODAL KONFIRMASI HAPUS TEMPLATE -->
        <!-- ============================================================ -->
        <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="showDeleteConfirm = false">
            <div class="modal-dialog modal-dialog-sm">
                <div class="modal-header">
                    <h3 class="modal-title text-danger">Hapus Template Kustom?</h3>
                    <button class="modal-close-btn" @click="showDeleteConfirm = false">&times;</button>
                </div>
                <div class="modal-body">
                    <p>
                        Apakah Anda yakin ingin menghapus template <strong>"{{ templateToDelete?.name }}"</strong>?
                    </p>
                    <p class="delete-warning-note">
                        Jika template ini saat ini sedang digunakan sebagai template aktif, sistem akan secara otomatis mengembalikan setingan template aktif ke <strong>Resmi Budhi Warman II</strong>.
                    </p>
                </div>
                <div class="modal-footer">
                    <button @click="showDeleteConfirm = false" class="btn btn-outline">Batal</button>
                    <button @click="deleteCustomTemplate" class="btn btn-danger" :disabled="isDeleting">
                        {{ isDeleting ? 'Menghapus...' : 'Ya, Hapus Template' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
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

.header-action-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

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
    text-decoration: none;
    transition: all 0.2s ease;
}

.btn-primary {
    background: #2563eb;
    color: #ffffff;
}

.btn-primary:hover {
    background: #1d4ed8;
}

.btn-emerald {
    background: #059669;
    color: #ffffff;
}

.btn-emerald:hover {
    background: #047857;
}

.btn-danger {
    background: #dc2626;
    color: #ffffff;
}

.btn-danger:hover {
    background: #b91c1c;
}

.btn-outline {
    background: #ffffff !important;
    border: 1px solid #cbd5e1 !important;
    color: #334155 !important;
}

.btn-outline:hover {
    background: #f1f5f9 !important;
    border-color: #94a3b8 !important;
    color: #0f172a !important;
}

.modal-dialog .btn-outline,
.modal-footer .btn-outline {
    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;
    color: #334155 !important;
}

.modal-dialog .btn-outline:hover,
.modal-footer .btn-outline:hover {
    background: #e2e8f0 !important;
    border-color: #94a3b8 !important;
    color: #0f172a !important;
}

.btn-sm {
    padding: 5px 10px;
    font-size: 12px;
}

/* TEMPLATE GRID */
.template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 24px;
}

.template-card {
    background: #ffffff;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    transition: all 0.2s ease;
}

.template-card:hover {
    border-color: #93c5fd;
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.08);
}

.card-custom {
    border-color: #cbd5e1;
    background: #ffffff;
}

.card-active {
    border-color: #2563eb !important;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2) !important;
}

.custom-badge-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.badge-tag {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: #f1f5f9;
    color: #64748b;
}

.tag-active {
    background: #dbeafe;
    color: #1d4ed8;
}

.badge-custom {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: #f3e8ff;
    color: #7e22ce;
}

.card-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 6px 0;
}

.card-desc {
    font-size: 13px;
    color: #64748b;
    margin: 0;
    line-height: 1.4;
    min-height: 38px;
}

/* PREVIEW AREA */
.preview-area {
    margin: 18px 0;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    padding: 18px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 140px;
}

.preview-custom-wrap {
    background: #f1f5f9;
}

.label-mockup {
    background: #ffffff;
    border: 1px solid #000000;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    box-sizing: border-box;
}

/* Mockup Resmi Budhi Warman II */
.mock-resmi {
    width: 240px;
    padding: 10px;
    font-family: Arial, sans-serif;
    color: #000;
}

.mock-resmi-top {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mock-logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
}

.mock-resmi-titles {
    flex: 1;
    text-align: center;
}

.mock-resmi-title {
    font-size: 9.5px;
    font-weight: 800;
}

.mock-resmi-sub {
    font-size: 7.5px;
    font-weight: 700;
    color: #444;
}

.mock-divider {
    height: 1px;
    background: #000;
    margin: 6px 0;
}

.mock-table-row {
    display: flex;
    font-size: 9px;
    line-height: 1.35;
}

.mock-k { width: 55px; font-weight: bold; }
.mock-c { width: 10px; text-align: center; font-weight: bold; }
.mock-v { flex: 1; }

/* Mockup Standar Barcode */
.mock-standard {
    width: 220px;
    padding: 10px;
    font-family: Arial, sans-serif;
}

.mockup-header {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    font-weight: bold;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
}

.mock-content {
    margin: 6px 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mock-name { font-size: 9px; font-weight: bold; }
.mock-code { font-size: 9px; font-weight: 800; color: #1e293b; }
.mock-room { font-size: 7.5px; color: #475569; }

.barcode-lines {
    font-size: 11px;
    letter-spacing: -1px;
    text-align: center;
    color: #000;
    font-weight: 900;
}

/* Mockup Compact */
.mock-compact {
    width: 170px;
    padding: 6px 8px;
    font-family: Arial, sans-serif;
}

.mock-instansi-sm { font-size: 7px; font-weight: bold; border-bottom: 0.5px solid #000; padding-bottom: 1px; }
.mock-name-sm { font-size: 8px; font-weight: 600; margin-top: 3px; }
.mock-code-sm { font-size: 8.5px; }
.mock-room-sm { font-size: 6.5px; color: #444; margin-top: 2px; }

/* Mockup QR */
.mock-qr-wrap {
    width: 220px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: Arial, sans-serif;
}

.mock-qr-icon { color: #000; }
.mock-qr-details { display: flex; flex-direction: column; gap: 2px; }

/* Mockup TJ 103 */
.mock-tj {
    width: 210px;
    padding: 8px 10px;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.mock-code-lg { font-size: 10px; font-weight: bold; }

/* Mockup SMA BW 2 */
.mock-sma-bw2 {
    width: 240px;
    padding: 10px;
    font-family: Arial, sans-serif;
    color: #000;
}

.mock-sma-bw2-header {
    font-size: 9.5px;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.3px;
}

.mock-sma-bw2-divider {
    height: 1.5px;
    background: #000;
    margin: 6px 0;
}

/* CARD DETAILS */
.card-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid #f1f5f9;
    padding-top: 14px;
    margin-bottom: 16px;
}

.detail-item {
    font-size: 12px;
}

.detail-label {
    font-weight: 600;
    color: #475569;
    display: block;
    margin-bottom: 4px;
}

.detail-value {
    color: #0f172a;
    font-weight: 500;
}

.tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.field-tag {
    background: #f1f5f9;
    color: #334155;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11px;
}

.tag-custom-field {
    background: #ede9fe;
    color: #5b21b6;
    font-family: monospace;
}

/* BUTTON SELECT */
.btn-select {
    width: 100%;
    padding: 10px 16px;
    border-radius: 100px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    transition: all 0.25s ease;
}

.btn-select:hover {
    background: #e2e8f0;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.btn-selected {
    background: linear-gradient(135deg, #1f7a8c, #22c08a) !important;
    color: #ffffff !important;
    border-color: rgba(255, 255, 255, 0.45) !important;
    box-shadow: 0 4px 14px rgba(34, 192, 138, 0.45);
}

.btn-selected:hover {
    background: linear-gradient(135deg, #2596ab, #29d79c) !important;
    box-shadow: 0 6px 20px rgba(34, 192, 138, 0.6) !important;
}

.card-actions-custom {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.custom-manage-btns {
    display: flex;
    gap: 8px;
}

.btn-manage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    transition: all 0.15s ease;
}

.btn-manage-edit {
    color: #2563eb;
}

.btn-manage-edit:hover {
    background: #eff6ff;
    border-color: #93c5fd;
}

.btn-manage-del {
    color: #dc2626;
}

.btn-manage-del:hover {
    background: #fef2f2;
    border-color: #fca5a5;
}

/* ============================================================ */
/* MODAL STYLES */
/* ============================================================ */
.modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    box-sizing: border-box;
}

.modal-dialog {
    background: #ffffff;
    width: 100%;
    max-width: 960px;
    max-height: 90vh;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.modal-dialog-sm {
    max-width: 480px;
}

.modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.modal-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px 0;
}

.modal-subtitle {
    font-size: 13px;
    color: #64748b;
    margin: 0;
}

.modal-close-btn {
    background: transparent;
    border: none;
    font-size: 24px;
    color: #94a3b8;
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 6px;
}

.modal-close-btn:hover {
    color: #0f172a;
    background: #f1f5f9;
}

/* STEPPER */
.modal-stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px 24px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
}

.step-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
}

.step-number {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #e2e8f0;
    color: #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
}

.step-active {
    color: #2563eb;
}

.step-active .step-number {
    background: #2563eb;
    color: #ffffff;
}

.step-done {
    color: #059669;
}

.step-done .step-number {
    background: #10b981;
    color: #ffffff;
}

.step-divider {
    width: 50px;
    height: 2px;
    background: #e2e8f0;
    margin: 0 12px;
}

.divider-active {
    background: #10b981;
}

/* MODAL BODY */
.modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
}

/* LANGKAH 1: UPLOAD */
.upload-dropzone {
    border: 2px dashed #93c5fd;
    background: #f0f7ff;
    border-radius: 12px;
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
}

.upload-dropzone:hover, .dropzone-dragover {
    border-color: #2563eb;
    background: #e0f2fe;
}

.dropzone-heading {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    margin: 12px 0 6px 0;
}

.dropzone-subheading {
    font-size: 13px;
    color: #64748b;
    margin: 0 auto 20px auto;
    max-width: 500px;
}

.btn-upload-label {
    position: relative;
    overflow: hidden;
}

.file-hidden {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    cursor: pointer;
}

.loading-state {
    padding: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #bfdbfe;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.alert-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    margin-top: 16px;
}

/* SAMPLE DOWNLOADS */
.sample-downloads-box {
    margin-top: 24px;
    padding: 16px;
    background: #f8fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.sample-title {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
    margin: 0 0 12px 0;
}

.sample-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.sample-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #1e293b;
    text-decoration: none;
    transition: all 0.15s ease;
}

.sample-btn:hover {
    border-color: #94a3b8;
    background: #f1f5f9;
}

.file-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
}

.badge-docx { background: #dbeafe; color: #1e40af; }
.badge-xlsx { background: #dcfce7; color: #166534; }
.badge-pdf { background: #fee2e2; color: #991b1b; }

.sample-hint {
    font-size: 11.5px;
    color: #64748b;
    margin: 12px 0 0 0;
    line-height: 1.5;
}

/* LANGKAH 2: EDIT GRID */
.step-edit-grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 24px;
}

.section-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
}

.section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.section-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 12px 0;
}

.section-header-row .section-title {
    margin: 0;
}

.form-row {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
}

.form-row-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 12px;
}

.form-row-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.form-group label {
    display: block;
    font-size: 11.5px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 4px;
}

.input-text {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 13px;
    color: #0f172a;
    box-sizing: border-box;
}

.input-text:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.fields-list-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 4px;
}

.field-editor-item {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field-item-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.select-field-key {
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: #ffffff;
    max-width: 170px;
}

.field-style-controls {
    display: flex;
    align-items: center;
    gap: 6px;
}

.font-size-wrap {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: #475569;
}

.input-pt {
    width: 44px;
    padding: 3px 5px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 11px;
    text-align: center;
}

.toggle-bold {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    background: #ffffff;
    color: #334155;
}

.toggle-bold input { display: none; }
.toggle-bold.is-bold { background: #1e293b; color: #ffffff; border-color: #1e293b; }

.select-align {
    padding: 3px 6px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 11px;
    background: #ffffff;
}

.btn-del-field {
    background: transparent;
    border: none;
    color: #ef4444;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
}

.btn-del-field:hover {
    background: #fee2e2;
}

.input-field-text {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    box-sizing: border-box;
}

/* LIVE PREVIEW STICKY */
.preview-sticky-box {
    position: sticky;
    top: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
}

.preview-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.preview-box-header h4 {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
}

.preview-dimension-badge {
    background: #dbeafe;
    color: #1e40af;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
}

.live-preview-stage {
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    overflow: auto;
}

.preview-hints {
    margin-top: 10px;
    color: #64748b;
    line-height: 1.4;
}

/* LANGKAH 3: SUMMARY */
.step-summary {
    max-width: 600px;
    margin: 0 auto;
}

.summary-card {
    text-align: center;
}

.summary-check-icon {
    width: 48px;
    height: 48px;
    background: #d1fae5;
    color: #059669;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
    margin: 0 auto 12px auto;
}

.summary-heading {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 6px 0;
}

.summary-sub {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 20px 0;
}

.summary-grid {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
}

.summary-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
}

.sum-k { color: #64748b; }
.sum-v { color: #0f172a; font-weight: 600; }
.text-uppercase { text-transform: uppercase; }

.summary-preview-center {
    display: flex;
    justify-content: center;
    padding: 12px 0;
}

/* MODAL FOOTER */
.modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.footer-right {
    display: flex;
    gap: 10px;
}

.delete-warning-note {
    font-size: 12.5px;
    color: #64748b;
    background: #fffbeb;
    border: 1px solid #fef3c7;
    padding: 10px 12px;
    border-radius: 6px;
    margin-top: 12px;
    line-height: 1.4;
}

.text-danger { color: #dc2626 !important; }
</style>
