<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import SkeletonTable from '~/components/SkeletonTable.vue'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'

// --- SESUAIKAN URL API ANDA ---
const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

const dataPeminjamanRuangan = ref<any[]>([])
const isLoading = ref(true)
const showSkeleton = useSkeletonDelay(isLoading, 150)
const TABLE_HEADERS = ['No', 'Peminjam / PJ', 'Nama Ruangan', 'Tgl Pinjam', 'Tgl Selesai', 'Status Penggunaan', 'Catatan / Keperluan', 'Aksi']

// Filter State
const filterStatus = ref('all')

// Paginasi
const currentPage = ref(1)
const itemsPerPage = ref(15)

// ==============================================================================
// HELPER TANGGAL (100% TYPE-SAFE)
// ==============================================================================
const getTodayDate = (): string => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const formatSimpleDate = (dateVal: any): string => {
    const str = String(dateVal || '').trim();
    if (!str || str === '-' || str === 'undefined' || str === 'null') return '-';
    
    if (str.includes('T')) {
        const parts = str.split('T');
        const datePart = parts[0] || ''; 
        if (datePart) {
            const dateParts = datePart.split('-');
            if (dateParts.length === 3) return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        }
    }
    
    if (str.includes('-') && str.length === 10) {
        const parts = str.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    
    return str;
}

// ==========================================
// 1. FETCH DATA PEMINJAMAN RUANGAN
// ==========================================
const fetchData = async () => {
    isLoading.value = true
    try {
        const resPeminjaman = await fetch(`${GOOGLE_SCRIPT_URL}?action=peminjaman_ruangan`, { method: "GET" })
        const resultPeminjaman = await resPeminjaman.json()
        if (resultPeminjaman.status === 200) {
            dataPeminjamanRuangan.value = (resultPeminjaman.datas || []).map((v:any, i:number) => ({...v, _tempId: i}))
        }
    } catch (error) {
        toast("Terjadi kesalahan koneksi saat memuat data", { type: "error" })
    } finally {
        isLoading.value = false
    }
}

// ==========================================
// 2. SETUJUI / TOLAK PINJAMAN (Menunggu Konfirmasi -> Disetujui/Ditolak)
// ==========================================
const processPeminjaman = async (item: any, isApproved: boolean) => {
    const actionWord = isApproved ? 'Setujui' : 'Tolak'
    if (!confirm(`${actionWord} pengajuan penggunaan ruangan ${item.nama_ruangan} untuk ${item.peminjam}?`)) return

    try {
        const payload = {
            action: "edit_peminjaman_ruangan",
            no_urut: item.no_urut,
            nama_ruangan: item.nama_ruangan,
            peminjam: item.peminjam,
            tanggal_pinjam: item.tanggal_pinjam,
            tanggal_selesai: item.tanggal_selesai,
            
            // Ubah Status ke Disetujui atau Ditolak
            status_peminjaman: isApproved ? 'Disetujui' : 'Ditolak',
            keterangan: item.keterangan
        }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast(`Pengajuan ruangan berhasil di-${actionWord.toLowerCase()}!`, { type: "success" })
            fetchData()
        } else {
            toast(result.message || `Gagal me-${actionWord.toLowerCase()} pengajuan`, { type: "error" })
        }
    } catch (error) {
        toast("Kesalahan jaringan", { type: "error" })
    }
}

// ==========================================
// 3. KONFIRMASI PENGGUNAAN SELESAI (Disetujui -> Selesai)
// ==========================================
const markAsReturned = async (item: any) => {
    if (!confirm(`Konfirmasi kegiatan di ${item.nama_ruangan} oleh ${item.peminjam} telah selesai?`)) return

    try {
        const todayStr = getTodayDate();
        let tgl = `${todayStr.split('-')[2]}/${todayStr.split('-')[1]}/${todayStr.split('-')[0]}`

        const payload = {
            action: "konfirmasi_peminjaman_ruangan",
            no_urut: item.no_urut,
            tanggal_selesai: tgl, // Update tgl selesai ke hari ini
            keterangan: item.keterangan || '',
            status_peminjaman: 'Selesai'
        }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast("Penggunaan ruangan berhasil diselesaikan!", { type: "success" })
            fetchData()
        } else {
            toast(result.message || "Gagal konfirmasi", { type: "error" })
        }
    } catch (error) {
        toast("Kesalahan jaringan", { type: "error" })
    }
}

// ==========================================
// 4. HAPUS DATA PEMINJAMAN RUANGAN (POST)
// ==========================================
const deleteData = async (item: any) => {
    if (!confirm(`Hapus riwayat peminjaman ruangan atas nama ${item.peminjam} secara permanen?`)) return

    try {
        const payload = { action: "delete_peminjaman_ruangan", no_urut: item.no_urut }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast("Data berhasil dihapus!", { type: "success" })
            fetchData()
        } else {
            toast(result.message || "Gagal menghapus data", { type: "error" })
        }
    } catch (error) {
        toast("Kesalahan koneksi", { type: "error" })
    }
}

// ==========================================
// FILTER DAN PAGINASI
// ==========================================
const filteredPeminjaman = computed(() => {
    let result = [...dataPeminjamanRuangan.value]

    if (filterStatus.value === 'selesai') {
        result = result.filter(item => {
            const s = String(item.status_peminjaman || '').toLowerCase()
            return s.includes('selesai')
        })
    } else if (filterStatus.value === 'belum_selesai') {
        result = result.filter(item => {
            const s = String(item.status_peminjaman || '').toLowerCase()
            return !s.includes('selesai') && !s.includes('ditolak') && !s.includes('batal')
        })
    } else if (filterStatus.value === 'ditolak') {
        result = result.filter(item => {
            const s = String(item.status_peminjaman || '').toLowerCase()
            return s.includes('ditolak') || s.includes('batal')
        })
    }

    return result.reverse() // Tampilkan data terbaru di atas
})

const totalPages = computed(() => Math.ceil(filteredPeminjaman.value.length / itemsPerPage.value))
const paginatedPeminjaman = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value
    const end = start + itemsPerPage.value
    return filteredPeminjaman.value.slice(start, end)
})

// Reset ke halaman 1 setiap kali filter diubah
watch(filterStatus, () => {
    currentPage.value = 1
})

// Fungsi helper status di template
const normalizeStatus = (statusStr: string) => {
    const s = String(statusStr || '').trim().toLowerCase();
    if (s === '-' || s === '') return 'menunggu konfirmasi';
    return s;
}

onMounted(() => { fetchData() })
</script>

<template>
    <div class="app-layout">
        <Navbar />

        <main class="dashboard-container">
            <PageHeader
                title="Manajemen Peminjaman Ruangan"
                subtitle="Kelola perizinan dan penggunaan fasilitas ruangan sekolah."
            />

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <!-- ============================================== -->
            <!-- TABEL DAFTAR PEMINJAMAN RUANGAN                -->
            <!-- ============================================== -->
            <div class="table-section" :aria-busy="isLoading ? 'true' : 'false'">
                <span v-if="isLoading" class="sr-only">Memuat Data Peminjaman Ruangan...</span>
                <!-- Area Filter -->
                <div class="table-controls" style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <div class="filter-group">
                        <label for="filterStatus">Status Penggunaan:</label>
                        <select id="filterStatus" v-model="filterStatus" class="select-box" :disabled="isLoading">
                            <option value="all">Semua Status</option>
                            <option value="belum_selesai">Belum Selesai (Menunggu/Berjalan)</option>
                            <option value="selesai">Selesai</option>
                            <option value="ditolak">Ditolak</option>
                        </select>
                    </div>
                </div>

                <!-- SKELETON TABLE SAAT LOADING -->
                <div v-if="isLoading && showSkeleton" class="table-wrapper">
                    <SkeletonTable :rows="8" :headers="TABLE_HEADERS" table-class="wide-table" />
                </div>

                <!-- TABEL ASLI KETIKA TIDAK LOADING -->
                <div v-else-if="!isLoading" class="table-wrapper">
                        <table class="data-table wide-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px; text-align: center;">No</th>
                                    <th>Peminjam / PJ</th>
                                    <th>Nama Ruangan</th>
                                    <th>Tgl Pinjam</th>
                                    <th>Tgl Selesai</th>
                                    <th style="text-align: center;">Status Penggunaan</th>
                                    <th>Catatan / Keperluan</th>
                                    <th style="text-align: center;">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="filteredPeminjaman.length === 0">
                                    <td colspan="8" class="text-center">Belum ada riwayat peminjaman ruangan dengan status tersebut.</td>
                                </tr>
                                
                                <tr v-for="(item, index) in paginatedPeminjaman" :key="item._tempId">
                                    
                                    <!-- TAMPILAN BARIS NORMAL -->
                                    <td style="text-align: center; color: #64748b;">{{ item.no_urut }}</td>
                                    <td><strong>{{ item.peminjam }}</strong></td>
                                    <td class="sticky-col">{{ item.nama_ruangan }} <br> <span class="kode-kecil" v-if="item.gol">{{ item.gol }} {{ item.kel }} {{ item.sub_kel }}</span></td>
                                    
                                    <td>{{ formatSimpleDate(item.tanggal_pinjam) }}</td>
                                    <td>{{ formatSimpleDate(item.tanggal_selesai) }}</td>
                                    
                                    <!-- TAMPILAN STATUS RUANGAN -->
                                    <td style="text-align: center;">
                                        <span class="status-badge" :class="{
                                            'success': normalizeStatus(item.status_peminjaman) === 'selesai',
                                            'warning': normalizeStatus(item.status_peminjaman) === 'dipinjam' || normalizeStatus(item.status_peminjaman) === 'disetujui',
                                            'info': normalizeStatus(item.status_peminjaman) === 'menunggu konfirmasi',
                                            'danger': normalizeStatus(item.status_peminjaman) === 'ditolak' || normalizeStatus(item.status_peminjaman) === 'batal'
                                        }">
                                            {{ (item.status_peminjaman && item.status_peminjaman !== '-') ? item.status_peminjaman : 'Menunggu Konfirmasi' }}
                                        </span>
                                    </td>
                                    <td>
                                        <span v-if="item.keterangan && item.keterangan !== '-'" class="text-catatan">"{{ item.keterangan }}"</span>
                                        <span v-else class="text-catatan">-</span>
                                    </td>
                                    
                                    <!-- TOMBOL AKSI OTOMATIS -->
                                    <td class="action-cell">
                                        
                                        <!-- JIKA MENUNGGU KONFIRMASI (TOMBOL BIRU & MERAH) -->
                                        <template v-if="normalizeStatus(item.status_peminjaman) === 'menunggu konfirmasi'">
                                            <button @click="processPeminjaman(item, true)" class="btn-action approve-btn" title="Setujui Penggunaan">
                                                Setujui
                                            </button>
                                            <button @click="processPeminjaman(item, false)" class="btn-action reject-btn" title="Tolak Penggunaan">
                                                Tolak
                                            </button>
                                        </template>

                                        <!-- JIKA SEDANG DIGUNAKAN/DISETUJUI (TOMBOL KUNING) -->
                                        <template v-else-if="normalizeStatus(item.status_peminjaman) === 'dipinjam' || normalizeStatus(item.status_peminjaman) === 'disetujui'">
                                            <button @click="markAsReturned(item)" class="btn-action return-btn" title="Konfirmasi Selesai">
                                                Selesaikan
                                            </button>
                                        </template>
                                        
                                        <!-- JIKA SELESAI ATAU DITOLAK -->
                                        <template v-else-if="normalizeStatus(item.status_peminjaman) === 'selesai' || normalizeStatus(item.status_peminjaman) === 'ditolak' || normalizeStatus(item.status_peminjaman) === 'batal'">
                                            <span class="text-muted" style="margin-right: 10px;">
                                                <span v-if="normalizeStatus(item.status_peminjaman) === 'selesai'">✓ Selesai</span>
                                                <span v-else>✕ Ditolak</span>
                                            </span>
                                        </template>
                                        
                                        <!-- Tombol Hapus -->
                                        <button @click="deleteData(item)" class="btn-icon delete-btn" title="Hapus Riwayat">🗑</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="pagination-container" v-if="!isLoading && totalPages > 0">
                        <button class="btn-page" :disabled="currentPage === 1" @click="currentPage--">&laquo; Sebelumnya</button>
                        <span class="page-info">Halaman <strong>{{ currentPage }}</strong> dari {{ totalPages }}</span>
                        <button class="btn-page" :disabled="currentPage === totalPages" @click="currentPage++">Selanjutnya &raquo;</button>
                    </div>
                </div>

            </div>
        </main>
    </div>
</template>

<style scoped>
.app-layout { display: flex; min-height: 100vh; background-color: #f8fafc; }
.dashboard-container { flex: 1; padding: 30px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: calc(100% - 250px); overflow-x: hidden; }



.table-section { background-color: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }

/* STYLE UNTUK FILTER DROPDOWN */
.filter-group { display: flex; align-items: center; gap: 10px; }
.filter-group label { font-size: 13px; font-weight: 600; color: #475569; }
.select-box { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background-color: #fff; color: #334155; font-size: 13px; outline: none; cursor: pointer; min-width: 150px; font-family: inherit; }
.select-box:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }

.table-wrapper { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.data-table th, .data-table td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }
.data-table th { background-color: #f8fafc; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 11px; }
.kode-kecil { font-size: 11px; color: #94a3b8; font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
.text-center { text-align: center; }

/* BADGES UNTUK STATUS */
.status-badge { padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; white-space: nowrap;}
.status-badge.info { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd;} /* Biru: Menunggu Konfirmasi */
.status-badge.warning { background: #fef3c7; color: #d97706; border: 1px solid #fde68a;} /* Kuning: Dipinjam / Disetujui */
.status-badge.success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;} /* Hijau: Selesai */
.status-badge.danger { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;}  /* Merah: Ditolak / Batal */

.text-catatan { font-size: 12px; color: #64748b; font-style: italic; }
.text-muted { color: #94a3b8; font-style: italic; font-weight: 600; white-space: nowrap;}

.sticky-col { position: sticky; left: 0; background-color: #fff; z-index: 5; box-shadow: 2px 0 5px rgba(0,0,0,0.05); font-weight: 600; }

/* ACTION BUTTONS */
.action-cell { display: flex; gap: 8px; justify-content: center; align-items: center; }
.btn-action { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; border: 1px solid transparent; white-space: nowrap;}

/* Tombol Setujui (Biru) */
.approve-btn { background: #eff6ff; color: #3b82f6; border-color: #bfdbfe; }
.approve-btn:hover { background: #3b82f6; color: white; }

/* Tombol Tolak (Merah) */
.reject-btn { background: #fef2f2; color: #ef4444; border-color: #fecaca; }
.reject-btn:hover { background: #ef4444; color: white; }

/* Tombol Kembalikan / Selesaikan (Kuning/Oranye) */
.return-btn { background: #fffbeb; color: #d97706; border-color: #fde68a; }
.return-btn:hover { background: #d97706; color: white; }

.btn-icon { background: none; border: none; font-size: 14px; cursor: pointer; padding: 6px 10px; border-radius: 6px; transition: 0.2s; display: flex; align-items: center; justify-content: center;}
.delete-btn { color: #ef4444; background-color: #fef2f2; }
.delete-btn:hover { background-color: #ef4444; color: white; }



@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.pagination-container { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
.btn-page { background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-page:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
.btn-page:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; border-color: #f1f5f9; }
.page-info { font-size: 13px; color: #64748b; }
</style>