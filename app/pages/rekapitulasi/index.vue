<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import SkeletonCards from '~/components/SkeletonCards.vue'
import SkeletonTable from '~/components/SkeletonTable.vue'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'
// Import library html2pdf
import html2pdf from 'html2pdf.js'
import { parsePrice } from '~/utils/price'

// --- PASTIKAN URL INI SAMA DENGAN URL DEPLOY TERBARU ANDA ---
const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

const dataInventaris = ref<any[]>([])
const isLoading = ref(true)
const showSkeleton = useSkeletonDelay(isLoading, 150)
const HEADERS_AKTIF = ['No', 'Kategori / Golongan', 'Kelompok Barang', 'Total Kuantitas', 'Baik/Baru', 'Rusak', 'Estimasi Nilai Total (Gross)']
const HEADERS_KELUAR = ['No', 'Kategori / Golongan', 'Kelompok Barang', 'Total Kuantitas', 'Baik/Baru', 'Rusak', 'Dimutasi', 'Dihibahkan', 'Lelang/Musnah', 'Estimasi Nilai Total (Gross)']
const selectedLembaga = ref('SMA')

// Referensi untuk area yang akan dicetak ke PDF (mencakup semua data)
const reportRef = ref<HTMLElement | null>(null)
const isGeneratingPDF = ref(false)

// Fungsi format dan parsing
const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
}

const fetchBukuIndukData = async () => {
    isLoading.value = true
    dataInventaris.value = []
    
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=${selectedLembaga.value}`, { method: "GET" })
        const result = await res.json()

        if (result.status === 200) {
            dataInventaris.value = result.datas || []
        } else {
            toast(result.message || "Gagal memuat data", { type: "error" })
        }
    } catch (error) {
        console.error("Error fetching data:", error)
        toast("Terjadi kesalahan koneksi", { type: "error" })
    } finally {
        isLoading.value = false
    }
}

watch(selectedLembaga, () => {
    fetchBukuIndukData()
})

onMounted(() => {
    fetchBukuIndukData()
})

// ==============================================================================
// FITUR GENERATE PDF (Diubah ke landscape agar tidak ada kolom terpotong)
// ==============================================================================
const generatePDF = () => {
    if (!reportRef.value) return

    isGeneratingPDF.value = true
    const toastId = toast.loading("Menyiapkan dokumen PDF (Landscape)...")

    const opt = {
        margin:       [10, 10, 15, 10] as [number, number, number, number], // Margin [atas, kanan, bawah, kiri] (mm)
        filename:     `Laporan_Lengkap_Inventaris_${selectedLembaga.value}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true }, 
        jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'landscape' as const }, // Diubah ke landscape
        // Konfigurasi pagebreak agar baris (tr) tidak terpotong
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', '.stat-card', '.section-title-badge'] }
    };

    html2pdf().set(opt).from(reportRef.value).save()
        .then(() => {
            toast.update(toastId, { render: "Berhasil mengunduh PDF!", type: "success", isLoading: false, autoClose: 3000 })
        })
        .catch((err: any) => {
            console.error(err)
            toast.update(toastId, { render: "Gagal memuat PDF", type: "error", isLoading: false, autoClose: 3000 })
        })
        .finally(() => {
            isGeneratingPDF.value = false
        })
}

// ==============================================================================
// FUNGSI HELPER REKAPITULASI DATA (BERDASARKAN MODE: 'aktif' / 'keluar')
// ==============================================================================
const generateRekapByMode = (mode: 'aktif' | 'keluar') => {
    const rekapMap = new Map<string, any>()

    dataInventaris.value.forEach(item => {
        const namaBarang = String(item.namaBarang || item.nama_barang || '').trim().toUpperCase()
        const noUrut = String(item.noUrutBarang || item.no_urut_barang || item.jb_k || '').trim()
        
        const isNotHeader = noUrut !== '' && noUrut !== '-' && noUrut !== '0000' && noUrut !== '000' && noUrut !== '0'
        const isValidName = !namaBarang.includes('BUKU INDUK') && !namaBarang.includes('JAKARTA') && namaBarang !== 'TANAH' && namaBarang !== 'BANGUNAN' && namaBarang !== ''

        if (isNotHeader && isValidName) {
            const status = String(item.status || item.Status || 'aktif').toLowerCase().trim()
            const isAktif = status === 'aktif' || status === 'ada' || status === '' || status === '-'

            if (mode === 'keluar' && isAktif) return; 
            if (mode === 'aktif' && !isAktif) return;

            const rawGol = String(item.gol || item.golongan || '').trim().toUpperCase();
            let golonganNama = String(item.master_golongan || item.golongan || item.gol || 'Tanpa Golongan').trim();
            if (rawGol && golonganNama.charAt(0).toUpperCase() !== rawGol.charAt(0)) {
                golonganNama = rawGol; 
            }

            const fallbackKelompok = namaBarang.split(/[\s\-\/]+/)[0];
            const kelompok = String(item.master_kelompok || item.kelompok || item.kel || fallbackKelompok).trim().toUpperCase();
            
            const key = `${golonganNama} | ${kelompok}`
            
            const qty = 1
            const hargaSatuan = parsePrice(item.harga || item.Harga)
            const totalNilai = qty * hargaSatuan
            const kondisi = String(item.kondisi_barang || item['Kondisi Barang'] || 'baru').toLowerCase()

            const isRusak = kondisi.includes('rusak')
            const isBaik = !isRusak
            
            const isHibah = status.includes('hibah')
            const isLelangMusnah = status.includes('lelang') || status.includes('musnah')
            const isMutasi = status.includes('mutasi')

            if (!rekapMap.has(key)) {
                rekapMap.set(key, {
                    golongan: golonganNama,
                    kelompok: kelompok,
                    total_item: 0,
                    kondisi_baik: 0,
                    kondisi_rusak: 0,
                    status_mutasi: 0,
                    status_hibah: 0,
                    status_lelang_musnah: 0,
                    total_nilai_aset: 0
                })
            }

            const current = rekapMap.get(key)
            current.total_item += qty
            current.total_nilai_aset += totalNilai
            
            if (isBaik) current.kondisi_baik += qty
            if (isRusak) current.kondisi_rusak += qty
            
            if (mode === 'keluar') {
                if (isMutasi) current.status_mutasi += qty
                if (isHibah) current.status_hibah += qty
                if (isLelangMusnah) current.status_lelang_musnah += qty
            }
        }
    })

    return Array.from(rekapMap.values()).sort((a, b) => {
        if (a.golongan === b.golongan) {
            return a.kelompok.localeCompare(b.kelompok)
        }
        return a.golongan.localeCompare(b.golongan)
    })
}

// COMPUTED DATA AKTIF & KELUAR
const rekapDataAktif = computed(() => generateRekapByMode('aktif'))
const rekapDataKeluar = computed(() => generateRekapByMode('keluar'))

const calcGrandTotal = (dataList: any[]) => {
    return dataList.reduce((acc, curr) => {
        acc.total_item += curr.total_item
        acc.kondisi_baik += curr.kondisi_baik
        acc.kondisi_rusak += curr.kondisi_rusak
        acc.status_mutasi += curr.status_mutasi
        acc.status_hibah += curr.status_hibah
        acc.status_lelang_musnah += curr.status_lelang_musnah
        acc.total_nilai_aset += curr.total_nilai_aset
        return acc
    }, {
        total_item: 0, kondisi_baik: 0, kondisi_rusak: 0,
        status_mutasi: 0, status_hibah: 0, status_lelang_musnah: 0, total_nilai_aset: 0
    })
}

const grandTotalAktif = computed(() => calcGrandTotal(rekapDataAktif.value))
const grandTotalKeluar = computed(() => calcGrandTotal(rekapDataKeluar.value))
</script>

<template>
    <div class="app-layout">
        <Navbar />

        <main class="dashboard-container">
            <PageHeader
                title="Laporan Rekapitulasi Inventaris"
                subtitle="Ringkasan total kuantitas, kondisi, dan nilai aset tersedia serta aset keluar berdasarkan Golongan & Kelompok."
            >
                <!-- TOMBOL GENERATE PDF -->
                <button 
                    @click="generatePDF" 
                    class="btn-export" 
                    :disabled="isLoading || isGeneratingPDF || dataInventaris.length === 0">
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

            <div :aria-busy="isLoading ? 'true' : 'false'">
                <span v-if="isLoading" class="sr-only">Menyusun Laporan Rekapitulasi {{ selectedLembaga }}...</span>

                <!-- SKELETON REKAPITULASI -->
                <div v-if="isLoading && showSkeleton" class="pdf-container" style="background-color: white; padding: 20px;" aria-hidden="true">
                    <div class="section-title-badge text-green" style="margin-bottom: 12px; font-weight: 700; font-size: 15px;">
                        A. LAPORAN ASET TERSEDIA (AKTIF)
                    </div>
                    <SkeletonCards :count="3" grid-class="stats-grid" :card-height="84" />
                    <div class="table-section">
                        <div class="table-wrapper">
                            <SkeletonTable :rows="6" :headers="HEADERS_AKTIF" />
                        </div>
                    </div>

                    <div class="section-title-badge text-red" style="margin-top: 35px; margin-bottom: 12px; font-weight: 700; font-size: 15px;">
                        B. LAPORAN ASET KELUAR
                    </div>
                    <SkeletonCards :count="4" grid-class="stats-grid" :card-height="84" />
                    <div class="table-section">
                        <div class="table-wrapper">
                            <SkeletonTable :rows="6" :headers="HEADERS_KELUAR" />
                        </div>
                    </div>
                </div>

                <!-- CONTAINER UTAMA YANG AKAN DI-RENDER MENJADI PDF -->
                <div v-else-if="!isLoading" ref="reportRef" class="pdf-container" style="background-color: white; padding: 20px;">
                
                <!-- HEADER LAPORAN PDF -->
                <div class="pdf-header" style="text-align: center; margin-bottom: 25px;">
                    <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0;">LAPORAN REKAPITULASI INVENTARIS ASET</h2>
                    <h3 style="margin-top: 5px; color: #475569; font-size: 16px;">{{ selectedLembaga === 'YAYASAN' ? 'Yayasan' : selectedLembaga }} Budhi Warman II</h3>
                    <hr style="border: none; border-top: 2px solid #0f172a; margin-top: 15px;" />
                </div>

                <!-- ================= SECTION 1: ASET TERSEDIA (AKTIF) ================= -->
                <div class="report-section-block" style="margin-bottom: 40px;">
                    <div class="section-title-badge text-green" style="margin-bottom: 12px; font-weight: 700; font-size: 15px;">
                        A. LAPORAN ASET TERSEDIA (AKTIF)
                    </div>

                    <!-- SUMMARY CARDS AKTIF -->
                    <div class="stats-grid" style="margin-bottom: 15px;">
                        <div class="stat-card teal">
                            <div class="card-info">
                                <span class="card-title">TOTAL ITEM TERSEDIA</span>
                                <h2 class="card-value">{{ grandTotalAktif.total_item }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                        <div class="stat-card green">
                            <div class="card-info">
                                <span class="card-title">KONDISI BAIK</span>
                                <h2 class="card-value">{{ grandTotalAktif.kondisi_baik }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                        <div class="stat-card red">
                            <div class="card-info">
                                <span class="card-title">KONDISI RUSAK</span>
                                <h2 class="card-value">{{ grandTotalAktif.kondisi_rusak }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                    </div>

                    <!-- TABEL AKTIF -->
                    <div class="table-section">
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th rowspan="2" class="text-center" style="width: 50px;">No</th>
                                        <th rowspan="2" style="width: 180px;">Kategori / Golongan</th>
                                        <th rowspan="2">Kelompok Barang</th>
                                        <th rowspan="2" class="text-center highlight-col" style="width: 110px;">Total<br>Kuantitas</th>
                                        <th colspan="2" class="text-center border-group" style="width: 180px;">Kondisi Fisik</th>
                                        <th rowspan="2" class="text-right" style="width: 180px;">Estimasi Nilai Total (Gross)</th>
                                    </tr>
                                    <tr>
                                        <th class="text-center th-sub">Baik/Baru</th>
                                        <th class="text-center th-sub">Rusak</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="rekapDataAktif.length === 0">
                                        <td colspan="7" class="text-center">Tidak ada data aset tersedia.</td>
                                    </tr>
                                    <tr v-for="(item, index) in rekapDataAktif" :key="index">
                                        <td class="text-center" style="color: #94a3b8;">{{ index + 1 }}</td>
                                        <td><strong>{{ item.golongan }}</strong></td>
                                        <td style="color: #334155;">{{ item.kelompok }}</td>
                                        <td class="text-center highlight-col"><strong>{{ item.total_item }}</strong></td>
                                        <td class="text-center text-green">{{ item.kondisi_baik }}</td>
                                        <td class="text-center text-red">{{ item.kondisi_rusak }}</td>
                                        <td class="text-right"><strong>{{ formatRupiah(item.total_nilai_aset) }}</strong></td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr class="footer-row">
                                        <td colspan="3" class="text-right"><strong>GRAND TOTAL:</strong></td>
                                        <td class="text-center highlight-col"><strong>{{ grandTotalAktif.total_item }}</strong></td>
                                        <td class="text-center"><strong>{{ grandTotalAktif.kondisi_baik }}</strong></td>
                                        <td class="text-center"><strong>{{ grandTotalAktif.kondisi_rusak }}</strong></td>
                                        <td class="text-right"><strong>{{ formatRupiah(grandTotalAktif.total_nilai_aset) }}</strong></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- MEMAKSA PINDAH HALAMAN SAAT DI PRINT KE PDF UNTUK BAGIAN BERIKUTNYA -->
                <div class="html2pdf__page-break"></div>

                <!-- ================= SECTION 2: ASET KELUAR ================= -->
                <div class="report-section-block" style="padding-top: 10px;">
                    <div class="section-title-badge text-red" style="margin-bottom: 12px; font-weight: 700; font-size: 15px;">
                        B. LAPORAN ASET KELUAR
                    </div>

                    <!-- SUMMARY CARDS KELUAR -->
                    <div class="stats-grid" style="margin-bottom: 15px;">
                        <div class="stat-card teal">
                            <div class="card-info">
                                <span class="card-title">TOTAL ITEM KELUAR</span>
                                <h2 class="card-value">{{ grandTotalKeluar.total_item }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                        <div class="stat-card cyan">
                            <div class="card-info">
                                <span class="card-title">DIMUTASI</span>
                                <h2 class="card-value">{{ grandTotalKeluar.status_mutasi }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                        <div class="stat-card purple">
                            <div class="card-info">
                                <span class="card-title">DIHIBAHKAN</span>
                                <h2 class="card-value">{{ grandTotalKeluar.status_hibah }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                        <div class="stat-card orange">
                            <div class="card-info">
                                <span class="card-title">DILELANG / MUSNAH</span>
                                <h2 class="card-value">{{ grandTotalKeluar.status_lelang_musnah }} <span class="unit">Unit</span></h2>
                            </div>
                        </div>
                    </div>

                    <!-- TABEL KELUAR -->
                    <div class="table-section">
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th rowspan="2" class="text-center" style="width: 40px;">No</th>
                                        <th rowspan="2" style="width: 150px;">Kategori / Golongan</th>
                                        <th rowspan="2">Kelompok Barang</th>
                                        <th rowspan="2" class="text-center highlight-col" style="width: 90px;">Total<br>Kuantitas</th>
                                        <th colspan="2" class="text-center border-group" style="width: 140px;">Kondisi Fisik</th>
                                        <th colspan="3" class="text-center border-group" style="width: 240px;">Klasifikasi Aset Keluar</th>
                                        <th rowspan="2" class="text-right" style="width: 160px;">Estimasi Nilai Total (Gross)</th>
                                    </tr>
                                    <tr>
                                        <th class="text-center th-sub">Baik/Baru</th>
                                        <th class="text-center th-sub">Rusak</th>
                                        <th class="text-center th-sub">Dimutasi</th>
                                        <th class="text-center th-sub">Dihibahkan</th>
                                        <th class="text-center th-sub">Lelang/Musnah</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="rekapDataKeluar.length === 0">
                                        <td colspan="10" class="text-center">Tidak ada data aset keluar.</td>
                                    </tr>
                                    <tr v-for="(item, index) in rekapDataKeluar" :key="index">
                                        <td class="text-center" style="color: #94a3b8;">{{ index + 1 }}</td>
                                        <td><strong>{{ item.golongan }}</strong></td>
                                        <td style="color: #334155;">{{ item.kelompok }}</td>
                                        <td class="text-center highlight-col"><strong>{{ item.total_item }}</strong></td>
                                        <td class="text-center text-green">{{ item.kondisi_baik }}</td>
                                        <td class="text-center text-red">{{ item.kondisi_rusak }}</td>
                                        <td class="text-center text-cyan">{{ item.status_mutasi }}</td>
                                        <td class="text-center text-purple">{{ item.status_hibah }}</td>
                                        <td class="text-center text-red">{{ item.status_lelang_musnah }}</td>
                                        <td class="text-right"><strong>{{ formatRupiah(item.total_nilai_aset) }}</strong></td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr class="footer-row">
                                        <td colspan="3" class="text-right"><strong>GRAND TOTAL:</strong></td>
                                        <td class="text-center highlight-col"><strong>{{ grandTotalKeluar.total_item }}</strong></td>
                                        <td class="text-center"><strong>{{ grandTotalKeluar.kondisi_baik }}</strong></td>
                                        <td class="text-center"><strong>{{ grandTotalKeluar.kondisi_rusak }}</strong></td>
                                        <td class="text-center text-cyan-light"><strong>{{ grandTotalKeluar.status_mutasi }}</strong></td>
                                        <td class="text-center text-purple-light"><strong>{{ grandTotalKeluar.status_hibah }}</strong></td>
                                        <td class="text-center text-red-light"><strong>{{ grandTotalKeluar.status_lelang_musnah }}</strong></td>
                                        <td class="text-right"><strong>{{ formatRupiah(grandTotalKeluar.total_nilai_aset) }}</strong></td>
                                    </tr>
                                </tfoot>
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

/* STYLE BUTTON EXPORT */
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

.section-title-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.20);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.30);
    color: #ffffff !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 18px; }
.stat-card {
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 14px !important;
    padding: 16px 20px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06) !important;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: transform 250ms ease, box-shadow 250ms ease;
}
.stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
}
.stat-card.teal { border-left: 4px solid #14b8a6 !important; }
.stat-card.cyan { border-left: 4px solid #06b6d4 !important; }
.stat-card.orange { border-left: 4px solid #f59e0b !important; }
.stat-card.purple { border-left: 4px solid #8b5cf6 !important; }
.stat-card.green { border-left: 4px solid #22c55e !important; }
.stat-card.red { border-left: 4px solid #ef4444 !important; }

.card-info { flex: 1; }
.stat-card .card-title,
.card-info .card-title {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #475569 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    text-shadow: none !important;
}
.stat-card .card-value,
.card-info .card-value {
    font-size: 28px !important;
    font-weight: 800 !important;
    margin: 4px 0 2px 0 !important;
    color: #0f172a !important;
    text-shadow: none !important;
}
.stat-card .unit,
.card-info .unit {
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #334155 !important;
    text-shadow: none !important;
}

.table-section {
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    margin-bottom: 24px;
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

/* Menghindari potongan row tabel saat export pdf */
.data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12.5px; page-break-inside: auto; color: #0f172a; text-shadow: none !important; }
.data-table tr { page-break-inside: avoid; page-break-after: auto; }
.data-table th, .data-table td { padding: 10px 14px; border-bottom: 1px solid rgba(226, 232, 240, 0.7); border-right: 1px solid rgba(226, 232, 240, 0.6); text-shadow: none !important; }
.data-table th { background-color: rgba(241, 245, 249, 0.95); color: #0f172a; font-weight: 700; vertical-align: middle; position: sticky; top: 0; z-index: 10; text-shadow: none !important; }
.data-table td { color: #0f172a; vertical-align: middle; text-shadow: none !important; }
.data-table *,
.table-wrapper * { text-shadow: none !important; }
.data-table tr:hover td { background-color: rgba(224, 242, 254, 0.70); }

.border-group { border-bottom: 1px solid #cbd5e1 !important; }
.th-sub { font-size: 11px !important; background-color: rgba(241, 245, 249, 0.98) !important; color: #334155 !important; font-weight: 700 !important; }
.highlight-col { background-color: rgba(241, 245, 249, 0.5); border-left: 2px solid rgba(203, 213, 225, 0.8) !important; border-right: 2px solid rgba(203, 213, 225, 0.8) !important; }

.footer-row { background-color: #0f172a !important; color: #ffffff !important; page-break-inside: avoid; }
.footer-row td { color: #ffffff !important; border-color: rgba(255, 255, 255, 0.2); font-size: 13.5px; font-weight: 700; padding: 12px 14px; }
.footer-row .highlight-col { background-color: #020617 !important; border-color: rgba(255, 255, 255, 0.2) !important; }

.text-right { text-align: right; }
.text-center { text-align: center; }
.text-green { color: #15803d !important; font-weight: 700; }
.text-red { color: #b91c1c !important; font-weight: 700; }
.text-purple { color: #6d28d9 !important; font-weight: 700; }
.text-cyan { color: #0369a1 !important; font-weight: 700; }

.text-green-light { color: #4ade80 !important; }
.text-red-light { color: #f87171 !important; }
.text-purple-light { color: #c084fc !important; }
.text-cyan-light { color: #22d3ee !important; }
</style>