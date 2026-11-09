<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import LabelRenderer from '~/components/LabelRenderer.vue'
import type { CustomTemplate } from '~/types/customTemplate'

const printAreaRef = ref<HTMLElement | null>(null)
const isPrinting = ref(false)

type LabelItem = {
    noInv: string
    nama_barang: string
    kode_barang: string
    no_urut: string
    ruang: string
    asal_dana: string
    tahun: string
    lembaga: string
}

const labelData = ref<{
    template: string
    lembaga: string
    headerTitle?: string
    showLogo?: boolean
    showBorderCut?: boolean
    createdAt: string
    items: LabelItem[]
    customTemplateData?: CustomTemplate | null
}>({
    template: 'resmi_bw',
    lembaga: 'SMA',
    headerTitle: 'SMA BUDHI WARMAN II JAKARTA',
    showLogo: true,
    showBorderCut: true,
    createdAt: new Date().toISOString(),
    items: [],
    customTemplateData: null
})

const itemsPerPage = computed(() => {
    if (labelData.value.customTemplateData) {
        return labelData.value.customTemplateData.perPage || (labelData.value.customTemplateData.cols * labelData.value.customTemplateData.rows)
    }
    switch (labelData.value.template) {
        case 'resmi_bw': return 8
        case 'standard': return 21
        case 'compact': return 40
        case 'qrcode': return 24
        case 'tomjerry103': return 12
        case 'sma_bw2': return 8
        default: return 8
    }
})

const totalPages = computed(() => {
    const total = labelData.value.items?.length || 0
    return Math.max(1, Math.ceil(total / itemsPerPage.value))
})

const getPageItems = (page: number) => {
    const start = (page - 1) * itemsPerPage.value
    return (labelData.value.items || []).slice(start, start + itemsPerPage.value)
}

onMounted(() => {
    const saved = localStorage.getItem('inventaris_label_payload')
    if (saved) {
        try {
            const parsed = JSON.parse(saved)
            if (parsed && Array.isArray(parsed.items)) {
                labelData.value = {
                    template: parsed.template || 'resmi_bw',
                    lembaga: parsed.lembaga || 'SMA',
                    headerTitle: parsed.headerTitle || `${parsed.lembaga || 'SMA'} BUDHI WARMAN II JAKARTA`,
                    showLogo: parsed.showLogo !== false,
                    showBorderCut: parsed.showBorderCut !== false,
                    createdAt: parsed.createdAt || new Date().toISOString(),
                    items: parsed.items,
                    customTemplateData: parsed.customTemplateData || null
                }
            }
        } catch (e) {
            console.error('Error load label payload:', e)
        }
    }

    // Jika data kosong, sediakan demo sample
    if (!labelData.value.items || labelData.value.items.length === 0) {
        labelData.value = {
            template: 'resmi_bw',
            lembaga: 'SMA',
            headerTitle: 'SMA BUDHI WARMAN II JAKARTA',
            showLogo: true,
            showBorderCut: true,
            createdAt: new Date().toISOString(),
            items: [
                { noInv: '02.06.01.0001.26', nama_barang: 'Laptop Asus ExpertBook B1', kode_barang: '02.06.01', no_urut: '0001', ruang: 'Lab Komputer', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.06.01.0002.26', nama_barang: 'Proyektor Epson EB-X500', kode_barang: '02.06.01', no_urut: '0002', ruang: 'Ruang Aula', asal_dana: 'Yayasan', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.01.02.0003.26', nama_barang: 'Meja Kerja Guru Kayu Jati', kode_barang: '02.01.02', no_urut: '0003', ruang: 'Ruang Guru', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.01.03.0004.26', nama_barang: 'Kursi Putar Hidrolik Kantor', kode_barang: '02.01.03', no_urut: '0004', ruang: 'Ruang TU', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.02.04.0005.26', nama_barang: 'Printer Canon Pixma G2010', kode_barang: '02.02.04', no_urut: '0005', ruang: 'Ruang Kepala Sekolah', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.01.05.0006.26', nama_barang: 'Lemari Arsip Besi 4 Pintu', kode_barang: '02.01.05', no_urut: '0006', ruang: 'Ruang TU', asal_dana: 'Yayasan', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.06.02.0007.26', nama_barang: 'Switch Hub TP-Link 24 Port', kode_barang: '02.06.02', no_urut: '0007', ruang: 'Server TU', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' },
                { noInv: '02.06.03.0008.26', nama_barang: 'UPS APC Smart-UPS 1500VA', kode_barang: '02.06.03', no_urut: '0008', ruang: 'Server TU', asal_dana: 'BOS', tahun: '2026', lembaga: 'SMA' }
            ]
        }
    }
})

const printDirect = () => {
    window.print()
}

const exportPDF = async () => {
    if (!printAreaRef.value) return
    isPrinting.value = true
    toast('Menyiapkan file PDF label...', { type: 'info' })

    try {
        const html2pdfModule: any = await import('html2pdf.js')
        const html2pdf: any = html2pdfModule.default || html2pdfModule

        const opt = {
            margin: [5, 5, 5, 5],
            filename: `Mailing_Label_Inventaris_${labelData.value.lembaga}_${labelData.value.template}_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }

        await html2pdf().set(opt).from(printAreaRef.value).save()
        toast('Dokumen label berhasil diunduh!', { type: 'success' })
    } catch (e) {
        console.error('Gagal cetak PDF:', e)
        toast('Terjadi kesalahan saat membuat PDF', { type: 'error' })
    } finally {
        isPrinting.value = false
    }
}
</script>

<template>
    <div class="app-layout">
        <Navbar class="no-print" />
        <main class="dashboard-container">
            <!-- TOP CONTROLS -->
            <PageHeader
                class="no-print"
                title="Dokumen Hasil Mailing Label"
                :subtitle="`Siap cetak ke kertas label stiker. Terdapat ${labelData.items?.length || 0} label (${labelData.lembaga || 'SMA'} - Template: ${labelData.template || 'resmi_bw'}).`"
            >
                <NuxtLink to="/mailing_label" class="btn btn-outline">&larr; Pilih Ulang Barang</NuxtLink>
                <button @click="printDirect" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print Langsung
                </button>
                <button @click="exportPDF" class="btn btn-secondary" :disabled="isPrinting">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    {{ isPrinting ? 'Mengunduh...' : 'Unduh PDF' }}
                </button>
            </PageHeader>

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <!-- SHEET CONTAINER (RENDER SEMUA HALAMAN) -->
            <div class="print-container" ref="printAreaRef">
                <div 
                    v-for="page in totalPages" 
                    :key="page"
                    class="a4-sheet"
                    :class="!labelData.customTemplateData ? `template-${labelData.template}` : 'template-custom-grid'"
                    :style="labelData.customTemplateData ? {
                        gridTemplateColumns: `repeat(${labelData.customTemplateData.cols}, ${labelData.customTemplateData.labelWidthMm}mm)`,
                        gridAutoRows: `${labelData.customTemplateData.labelHeightMm}mm`,
                        gap: `${labelData.customTemplateData.gapYMm}mm ${labelData.customTemplateData.gapXMm}mm`,
                        justifyContent: 'center'
                    } : {}"
                >
                    <div 
                        v-for="(item, idx) in getPageItems(page)" 
                        :key="idx"
                        class="label-cell"
                        :class="{ 'with-border': labelData.showBorderCut !== false }"
                    >
                        <template v-if="item">
                            <!-- 0. TEMPLATE KUSTOM (DARI FILE UPLOAD) -->
                            <LabelRenderer 
                                v-if="labelData.customTemplateData"
                                :template="labelData.customTemplateData"
                                :item="item"
                                :show-border-cut="labelData.showBorderCut !== false"
                                mode="print"
                            />

                            <!-- 1. TEMPLATE RESMI BUDHI WARMAN II -->
                            <div v-else-if="labelData.template === 'resmi_bw'" class="label-resmi-bw">
                            <div class="resmi-header">
                                <img v-if="labelData.showLogo !== false" src="/images/logo.png" alt="Logo" class="school-logo" />
                                <div class="resmi-header-text">
                                    <div class="resmi-instansi">{{ labelData.headerTitle || 'SMA BUDHI WARMAN II JAKARTA' }}</div>
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
                                        <td class="resmi-val">{{ item.asal_dana || 'BOS' }}</td>
                                    </tr>
                                    <tr>
                                        <td class="resmi-label">TAHUN</td>
                                        <td class="resmi-colon">:</td>
                                        <td class="resmi-val">{{ item.tahun }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- 2. TEMPLATE STANDAR A4 BARCODE -->
                        <div v-else-if="labelData.template === 'standard'" class="label-standard">
                            <div class="std-header">
                                <img v-if="labelData.showLogo !== false" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                <span class="std-title">{{ labelData.headerTitle || 'SMA BUDHI WARMAN II' }}</span>
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

                        <!-- 3. TEMPLATE COMPACT -->
                        <div v-else-if="labelData.template === 'compact'" class="label-compact">
                            <div class="cpt-instansi">{{ labelData.headerTitle || 'SMA BUDHI WARMAN II' }}</div>
                            <div class="cpt-name">{{ item.nama_barang }}</div>
                            <div class="cpt-code"><strong>{{ item.noInv }}</strong></div>
                            <div class="cpt-footer">{{ item.ruang }} · {{ item.tahun }}</div>
                        </div>

                        <!-- 4. TEMPLATE QR CODE -->
                        <div v-else-if="labelData.template === 'qrcode'" class="label-qrcode">
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
                                <div class="qr-instansi">{{ labelData.headerTitle || 'SMA BUDHI WARMAN II' }}</div>
                                <div class="qr-code"><strong>{{ item.noInv }}</strong></div>
                                <div class="qr-name">{{ item.nama_barang }}</div>
                                <div class="qr-meta">{{ item.ruang }} | {{ item.tahun }}</div>
                            </div>
                        </div>

                        <!-- 5. TEMPLATE TOM & JERRY 103 -->
                        <div v-else-if="labelData.template === 'tomjerry103'" class="label-tj103">
                            <div class="tj-header">
                                <img v-if="labelData.showLogo !== false" src="/images/logo.png" alt="Logo" class="logo-mini" />
                                <span>{{ labelData.headerTitle || 'SMA BUDHI WARMAN II' }}</span>
                            </div>
                            <div class="tj-body">
                                <div class="tj-code">{{ item.noInv }}</div>
                                <div class="tj-name">{{ item.nama_barang }}</div>
                                <div class="tj-room">Lokasi: {{ item.ruang }}</div>
                            </div>
                        </div>

                        <!-- 6. TEMPLATE SMA BW 2 (2 x 4) -->
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
            </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
.app-layout {
    display: flex;
    min-height: 100vh;
    background: transparent;
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



.action-buttons {
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

/* ================================================================
   LEMBAR A4
   ================================================================ */
.print-container {
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

/* 1. DESAIN RESMI BUDHI WARMAN II */
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

/* 2. DESAIN STANDAR BARCODE */
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

/* 3. DESAIN COMPACT */
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

/* 4. DESAIN QR CODE */
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

/* 5. TOM & JERRY 103 */
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
   PRINTING RULES
   ================================================================ */
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

    .no-print, nav, aside, .header-container {
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

    .print-container {
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
