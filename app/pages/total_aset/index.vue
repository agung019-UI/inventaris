<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import SkeletonBox from '~/components/SkeletonBox.vue'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'
import { parsePrice } from '~/utils/price'

// --- PASTIKAN URL INI SAMA DENGAN URL DEPLOY TERBARU ANDA ---
const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

const isLoading = ref(true)
const showSkeleton = useSkeletonDelay(isLoading, 150)

// State penampung data dari masing-masing lembaga
const dataSMA = ref<any[]>([])
const dataSMK = ref<any[]>([])
const dataYAYASAN = ref<any[]>([])

const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
}

// Fungsi Fetch Paralel: Tarik data ketiga lembaga sekaligus
const fetchAllData = async () => {
    isLoading.value = true
    try {
        const [resSMA, resSMK, resYAYASAN] = await Promise.all([
            fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=SMA`),
            fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=SMK`),
            fetch(`${GOOGLE_SCRIPT_URL}?action=inventaris&lembaga=YAYASAN`)
        ])

        const [jsonSMA, jsonSMK, jsonYAYASAN] = await Promise.all([
            resSMA.json(), resSMK.json(), resYAYASAN.json()
        ])

        dataSMA.value = jsonSMA.status === 200 ? jsonSMA.datas : []
        dataSMK.value = jsonSMK.status === 200 ? jsonSMK.datas : []
        dataYAYASAN.value = jsonYAYASAN.status === 200 ? jsonYAYASAN.datas : []
        
    } catch (error) {
        console.error("Error fetching data:", error)
        toast("Terjadi kesalahan koneksi saat memuat rekap data", { type: "error" })
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    fetchAllData()
})

// ================================================================
// PERBAIKAN LOGIKA 2: FUNGSI KALKULATOR UTAMA PER LEMBAGA
// ================================================================
const calculateStats = (dataArray: any[]) => {
    let totalAsetGross = 0
    let totalLelangMusnah = 0
    let totalHibah = 0
    let totalMutasi = 0 // Tambahan Mutasi

    dataArray.forEach(item => {
        const namaBarang = String(item.namaBarang || item.nama_barang || '').trim().toUpperCase()
        const noUrut = String(item.noUrutBarang || item.no_urut_barang || item.jb_k || '').trim()
        
        // Memastikan baris tersebut adalah barang asli, BUKAN Sub-Judul (0000)
        const isNotHeader = noUrut !== '' && noUrut !== '-' && noUrut !== '0000' && noUrut !== '000' && noUrut !== '0'
        
        // Memastikan bukan Header Tabel Atas
        const isValidName = !namaBarang.includes('BUKU INDUK') && !namaBarang.includes('JAKARTA') && namaBarang !== ''

        if (isNotHeader && isValidName) {
            
            // Jangan kalikan dengan Qty. Di Buku Induk, kolom harga adalah nilai mutlak perolehan baris tersebut.
            const nilaiItem = parsePrice(item.harga || item.Harga)

            // Akumulasi ke Total Aset (Kotor/Gross)
            totalAsetGross += nilaiItem

            // Cek klasifikasi status aset untuk pemotongan
            const status = String(item.status || item.Status || '').toLowerCase().trim()
            if (status.includes('lelang') || status.includes('musnah')) {
                totalLelangMusnah += nilaiItem
            } else if (status.includes('hibah')) {
                totalHibah += nilaiItem
            } else if (status.includes('mutasi')) {
                totalMutasi += nilaiItem
            }
        }
    })

    // Jumlah Total (Netto) = Total Aset - (Lelang/Musnah + Hibah + Mutasi)
    const jumlahTotalNet = totalAsetGross - totalLelangMusnah - totalHibah - totalMutasi

    return {
        lelangMusnah: totalLelangMusnah,
        hibah: totalHibah,
        mutasi: totalMutasi,
        totalAset: totalAsetGross,
        jumlahTotal: jumlahTotalNet
    }
}

// MENGHITUNG STATISTIK MASING-MASING LEMBAGA
const statsSMA = computed(() => calculateStats(dataSMA.value))
const statsSMK = computed(() => calculateStats(dataSMK.value))
const statsYAYASAN = computed(() => calculateStats(dataYAYASAN.value))

// MENGHITUNG GRAND TOTAL GLOBAL
const grandTotalRealTime = computed(() => statsSMA.value.jumlahTotal + statsSMK.value.jumlahTotal + statsYAYASAN.value.jumlahTotal)
const grandTotalAset = computed(() => statsSMA.value.totalAset + statsSMK.value.totalAset + statsYAYASAN.value.totalAset)

</script>

<template>
    <div class="app-layout">
        <Navbar />

        <main class="dashboard-container">
            <PageHeader
                title="Total Aset Budhi Warman II"
                subtitle="Akumulasi estimasi nilai aset dan rekapitulasi total SMA, SMK, dan Yayasan."
            />

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <div :aria-busy="isLoading ? 'true' : 'false'">
                <span v-if="isLoading" class="sr-only">Mengkalkulasi Nilai Aset SMA, SMK, dan Yayasan...</span>

                <!-- SKELETON TOTAL ASET -->
                <div v-if="isLoading && showSkeleton" class="content-wrapper" aria-hidden="true">
                    <div class="summary-grid-3">
                        <div v-for="i in 3" :key="i" class="summary-card">
                            <div class="card-header" style="background-color: #f1f5f9; display: flex; justify-content: center;">
                                <SkeletonBox width="100px" height="16px" radius="4px" />
                            </div>
                            <table class="summary-table">
                                <tbody>
                                    <tr v-for="r in 5" :key="r" :class="{ 'bg-cyan': r === 4, 'bg-yellow': r === 5 }">
                                        <td style="padding: 10px 15px;"><SkeletonBox :width="(45 + (r * 7)) + '%'" height="14px" radius="4px" /></td>
                                        <td class="text-right" style="padding: 10px 15px;"><SkeletonBox width="110px" height="14px" radius="4px" style="margin-left: auto;" /></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="grand-total-section">
                        <div class="grand-total-box">
                            <div class="gt-header bg-yellow">
                                <h3>TOTAL ASET REAL TIME (NETTO)</h3>
                            </div>
                            <div class="gt-body" style="display: flex; justify-content: center; padding: 25px 20px;">
                                <SkeletonBox width="260px" height="34px" radius="6px" />
                            </div>
                        </div>

                        <div class="grand-total-box mt-4">
                            <div class="gt-header bg-cyan">
                                <h3>TOTAL ASET AWAL (BRUTO)</h3>
                            </div>
                            <div class="gt-body" style="display: flex; justify-content: center; padding: 25px 20px;">
                                <SkeletonBox width="260px" height="34px" radius="6px" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- KONTEN ASLI KETIKA TIDAK LOADING -->
                <div v-else-if="!isLoading" class="content-wrapper">
                
                <!-- GRID 3 KOLOM UNTUK SMA, SMK, YAYASAN -->
                <div class="summary-grid-3">
                    
                    <!-- KARTU SMA -->
                    <div class="summary-card">
                        <div class="card-header header-sma">SMA BW II</div>
                        <table class="summary-table">
                            <tbody>
                                <tr>
                                    <td>Lelang/Musnahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsSMA.lelangMusnah) }}</td>
                                </tr>
                                <tr>
                                    <td>Dihibahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsSMA.hibah) }}</td>
                                </tr>
                                <!-- Penambahan Row Dimutasi di Tampilan -->
                                <tr>
                                    <td>Dimutasi</td>
                                    <td class="text-right">{{ formatRupiah(statsSMA.mutasi) }}</td>
                                </tr>
                                <tr class="row-total-aset bg-cyan">
                                    <td>Total Aset</td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsSMA.totalAset) }}</strong></td>
                                </tr>
                                <tr class="row-jumlah-total bg-yellow">
                                    <td><strong>JUMLAH TOTAL</strong></td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsSMA.jumlahTotal) }}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- KARTU SMK -->
                    <div class="summary-card">
                        <div class="card-header header-smk">SMK BW II</div>
                        <table class="summary-table">
                            <tbody>
                                <tr>
                                    <td>Lelang/Musnahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsSMK.lelangMusnah) }}</td>
                                </tr>
                                <tr>
                                    <td>Dihibahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsSMK.hibah) }}</td>
                                </tr>
                                <tr>
                                    <td>Dimutasi</td>
                                    <td class="text-right">{{ formatRupiah(statsSMK.mutasi) }}</td>
                                </tr>
                                <tr class="row-total-aset bg-cyan">
                                    <td>Total Aset</td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsSMK.totalAset) }}</strong></td>
                                </tr>
                                <tr class="row-jumlah-total bg-yellow">
                                    <td><strong>JUMLAH TOTAL</strong></td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsSMK.jumlahTotal) }}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- KARTU YAYASAN -->
                    <div class="summary-card">
                        <div class="card-header header-yayasan">YAYASAN BW II</div>
                        <table class="summary-table">
                            <tbody>
                                <tr>
                                    <td>Lelang/Musnahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsYAYASAN.lelangMusnah) }}</td>
                                </tr>
                                <tr>
                                    <td>Dihibahkan</td>
                                    <td class="text-right">{{ formatRupiah(statsYAYASAN.hibah) }}</td>
                                </tr>
                                <tr>
                                    <td>Dimutasi</td>
                                    <td class="text-right">{{ formatRupiah(statsYAYASAN.mutasi) }}</td>
                                </tr>
                                <tr class="row-total-aset bg-cyan">
                                    <td>Total Aset</td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsYAYASAN.totalAset) }}</strong></td>
                                </tr>
                                <tr class="row-jumlah-total bg-yellow">
                                    <td><strong>JUMLAH TOTAL</strong></td>
                                    <td class="text-right"><strong>{{ formatRupiah(statsYAYASAN.jumlahTotal) }}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>

                <!-- GRAND TOTAL SECTION -->
                <div class="grand-total-section">
                    
                    <div class="grand-total-box">
                        <div class="gt-header bg-yellow">
                            <h3>TOTAL ASET REAL TIME (NETTO)</h3>
                        </div>
                        <div class="gt-body">
                            <h1>{{ formatRupiah(grandTotalRealTime) }}</h1>
                        </div>
                    </div>

                    <div class="grand-total-box mt-4">
                        <div class="gt-header bg-cyan">
                            <h3>TOTAL ASET AWAL (BRUTO)</h3>
                        </div>
                        <div class="gt-body">
                            <h1>{{ formatRupiah(grandTotalAset) }}</h1>
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
.app-layout { display: flex; min-height: 100vh; background-color: #f1f5f9; }
.dashboard-container { flex: 1; padding: 40px; --page-pad: 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: calc(100% - 250px); overflow-x: hidden; }



.text-center { text-align: center; }
.text-right { text-align: right; }
.mt-4 { margin-top: 30px; }



@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* GRID 3 KOLOM */
.summary-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 50px; }
@media (max-width: 1100px) { .summary-grid-3 { grid-template-columns: 1fr; } }

.summary-card { background: white; border: 1px solid #000; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }

.card-header { padding: 12px; text-align: center; font-weight: bold; border-bottom: 1px solid #000; font-size: 15px; }
.header-sma { background-color: #22c55e; color: black; } /* Hijau */
.header-smk { background-color: #ef4444; color: white; } /* Merah */
.header-yayasan { background-color: #3b82f6; color: white; } /* Biru */

.summary-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.summary-table td { padding: 10px 15px; border: 1px solid #000; color: #000; }

/* WARNA HIGHLIGHT SEPERTI DI EXCEL */
.bg-cyan { background-color: #06b6d4 !important; color: black !important; }
.bg-yellow { background-color: #fde047 !important; color: black !important; }

/* GRAND TOTAL BOXES */
.grand-total-section { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }

.grand-total-box { width: 100%; max-width: 500px; border: 2px solid #000; background: white; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.gt-header { padding: 12px; border-bottom: 2px solid #000; }
.gt-header h3 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
.gt-body { padding: 25px 20px; background-color: #f8fafc; }
.gt-body h1 { margin: 0; font-size: 32px; font-weight: 900; color: #000; }
</style>