<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { toast } from 'vue3-toastify'
import Navbar from '~/components/Navbar.vue'
import SkeletonTable from '~/components/SkeletonTable.vue'
import { useSkeletonDelay } from '~/composables/useSkeletonDelay'

// --- SESUAIKAN URL API ANDA ---
const GOOGLE_SCRIPT_URL = "http://127.0.0.1:8000/api/inventaris"

const dataMasterKode = ref<any[]>([])
const isLoading = ref(true)
const showSkeleton = useSkeletonDelay(isLoading, 150)
const TABLE_HEADERS = ['No', 'Kategori / Golongan', 'Gol', 'Kel', 'Sub', 'Kode Referensi', 'Nama Barang / Deskripsi', 'Aksi']
const searchQuery = ref('')

// Modal & Form State
const showModal = ref(false)
const isSubmitting = ref(false)
const jenisTambah = ref('subkelompok') 
const formMaster = ref({
    golongan: '', 
    kelompok: '', 
    nama_barang: '' 
})

// Edit State
const editingItem = ref<any>(null)
const editForm = ref({ nama_barang: '' })
const isSavingEdit = ref(false)

// Paginasi
const currentPage = ref(1)
const itemsPerPage = ref(15)

// ==========================================
// 1. FETCH DATA
// ==========================================
const fetchMasterKode = async () => {
    isLoading.value = true
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=kode_barang`, { method: "GET" })
        const result = await res.json()

        if (result.status === 200 && result.datas) {
            let lastValidGolonganNama = "-";
            let lastValidKelompokNama = "-";

            dataMasterKode.value = result.datas.filter((item: any) => {
                const nama = item["Nama Barang"] || item["nama_barang"] || item["namaBarang"] || "";
                return String(nama).trim() !== ""
            }).map((item: any, index: number) => {
                const golMentah = String(item.Gol || item.gol || "-").trim();
                const kelMentah = String(item.Kel || item.kel || "00").trim().padStart(2, '0');
                const subMentah = String(item["Sub-kel"] || item.sub_kel || item.jb_k || "00").trim().padStart(2, '0');

                // Forward-fill (Mewarisi Kategori Induk)
                let currentGolonganNama = String(item.Golongan || item["Gol Kel"] || "").trim();
                if (currentGolonganNama !== "") lastValidGolonganNama = currentGolonganNama;
                else currentGolonganNama = lastValidGolonganNama;

                let currentKelompokNama = String(item.Kelompok || "").trim();
                if (currentKelompokNama !== "") lastValidKelompokNama = currentKelompokNama;
                else currentKelompokNama = lastValidKelompokNama;

                return {
                    _tempId: index, // ID unik untuk identifikasi baris saat Edit
                    golongan_nama: currentGolonganNama,
                    kelompok_nama: currentKelompokNama,
                    gol_kode: golMentah,
                    kel_kode: kelMentah,
                    sub_kode: subMentah,
                    nama_barang: item["Nama Barang"] || item.nama_barang || item.namaBarang || "-",
                    kode_rakitan: item["Kode Rakitan"] || item.assembledCode || `${golMentah} ${kelMentah} ${subMentah}`
                }
            })
        } else {
            toast(result.message || "Gagal memuat Master Kode", { type: "error" })
        }
    } catch (error) {
        console.error("Error fetching master kode:", error)
        toast("Terjadi kesalahan koneksi", { type: "error" })
    } finally {
        isLoading.value = false
    }
}

// ==========================================
// 2. TAMBAH DATA (POST)
// ==========================================
const submitMasterKode = async () => {
    if (!formMaster.value.golongan || !formMaster.value.nama_barang) {
        return toast("Harap lengkapi Golongan dan Nama Barang!", { type: "warning" })
    }
    if (jenisTambah.value === 'subkelompok' && !formMaster.value.kelompok) {
        return toast("Harap pilih Kelompok Induk terlebih dahulu!", { type: "warning" })
    }

    isSubmitting.value = true
    try {
        const payload = {
            action: "tambah_master_kode",
            jenis_tambah: jenisTambah.value, 
            gol: formMaster.value.golongan,
            kel: formMaster.value.kelompok, 
            nama_barang: formMaster.value.nama_barang
        }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast(`Sukses ditambahkan! Kode: ${result.data_baru.kode_rakitan}`, { type: "success" })
            showModal.value = false
            formMaster.value = { golongan: '', kelompok: '', nama_barang: '' }
            fetchMasterKode()
        } else {
            toast(result.message || "Gagal menyimpan data", { type: "error" })
        }
    } catch (error) {
        toast("Terjadi kesalahan koneksi jaringan", { type: "error" })
    } finally {
        isSubmitting.value = false
    }
}

// ==========================================
// 3. EDIT DATA INLINE (POST)
// ==========================================
const startEditMaster = (item: any) => {
    editingItem.value = item._tempId
    editForm.value = { 
        nama_barang: item.nama_barang 
    }
}

const cancelEditMaster = () => {
    editingItem.value = null
    editForm.value = { nama_barang: '' }
}

const saveEditMaster = async (item: any) => {
    if (!editForm.value.nama_barang) return toast("Nama Barang tidak boleh kosong", { type: "warning" })

    isSavingEdit.value = true
    try {
        const payload = {
            action: "edit_master_kode",
            gol: item.gol_kode,
            kel: item.kel_kode,
            sub: item.sub_kode,
            nama_barang_baru: editForm.value.nama_barang
        }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast("Nama barang berhasil diperbarui!", { type: "success" })
            cancelEditMaster()
            fetchMasterKode()
        } else {
            toast(result.message || "Gagal memperbarui data", { type: "error" })
        }
    } catch (error) {
        toast("Terjadi kesalahan koneksi", { type: "error" })
    } finally {
        isSavingEdit.value = false
    }
}

// ==========================================
// 4. DELETE DATA (POST)
// ==========================================
const deleteMaster = async (item: any) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus referensi "${item.kode_rakitan} - ${item.nama_barang}" secara permanen?`)) return

    try {
        const payload = {
            action: "delete_master_kode",
            gol: item.gol_kode,
            kel: item.kel_kode,
            sub: item.sub_kode
        }

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        })
        const result = await res.json()

        if (result.status === 200) {
            toast("Data master berhasil dihapus!", { type: "success" })
            fetchMasterKode()
        } else {
            toast(result.message || "Gagal menghapus data", { type: "error" })
        }
    } catch (error) {
        toast("Terjadi kesalahan koneksi", { type: "error" })
    }
}

// ==========================================
// DROPDOWN FILTER LOGIC
// ==========================================
const listGolonganUnik = computed(() => {
    const listMap = new Map();
    dataMasterKode.value.forEach(item => {
        if (item.gol_kode && item.gol_kode !== "-") {
            listMap.set(item.gol_kode, `${item.gol_kode} - ${item.golongan_nama}`);
        }
    });
    return Array.from(listMap.entries()).map(([kode, nama]) => ({ kode, nama })).sort((a, b) => a.kode.localeCompare(b.kode));
})

const listKelompokUnik = computed(() => {
    if (!formMaster.value.golongan) return [];
    
    const listMap = new Map();
    dataMasterKode.value.forEach(item => {
        if (item.gol_kode === formMaster.value.golongan && item.kel_kode && item.kel_kode !== "00") {
            const labelKelompok = item.kelompok_nama !== "-" ? item.kelompok_nama : item.nama_barang;
            listMap.set(item.kel_kode, `Kel ${item.kel_kode} - ${labelKelompok}`);
        }
    });
    return Array.from(listMap.entries()).map(([kode, nama]) => ({ kode, nama })).sort((a, b) => a.kode.localeCompare(b.kode));
})

watch(() => formMaster.value.golongan, () => {
    formMaster.value.kelompok = '';
})

// ==========================================
// SEARCH & PAGINASI
// ==========================================
const filteredMasterKode = computed(() => {
    let result = dataMasterKode.value

    if (searchQuery.value.trim() !== '') {
        const query = searchQuery.value.toLowerCase().trim()
        result = result.filter(item => {
            return String(item.nama_barang).toLowerCase().includes(query) || 
                   String(item.kode_rakitan).toLowerCase().includes(query) ||
                   String(item.golongan_nama).toLowerCase().includes(query)
        })
    }

    return result.sort((a, b) => a.kode_rakitan.localeCompare(b.kode_rakitan))
})

const totalPages = computed(() => Math.ceil(filteredMasterKode.value.length / itemsPerPage.value))
const paginatedMasterKode = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value
    const end = start + itemsPerPage.value
    return filteredMasterKode.value.slice(start, end)
})

watch(searchQuery, () => { currentPage.value = 1 })

onMounted(() => { fetchMasterKode() })
</script>

<template>
    <div class="app-layout">
        <Navbar />

        <main class="dashboard-container">
            <PageHeader
                title="Master Kode Barang Inventaris"
                subtitle="Daftar referensi sandi golongan, kelompok, dan nama barang."
            >
                <div class="search-container">
                    <input 
                        type="text" 
                        v-model="searchQuery" 
                        placeholder="🔍 Cari nama barang atau kode..." 
                        class="input-box search-box"
                    />
                </div>
                <button @click="showModal = true" class="btn-submit" :disabled="isLoading">+ Tambah Master Barang</button>
            </PageHeader>

            <!-- AREA ISI: satu-satunya bagian yang scroll -->
            <div class="page-body">

            <!-- MODAL TAMBAH DATA -->
            <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
                <div class="modal-content">
                    <div class="form-header">
                        <h3>Tambah Master Barang Baru</h3>
                        <button @click="showModal = false" class="btn-close" title="Tutup">✕</button>
                    </div>
                    
                    <form @submit.prevent="submitMasterKode" class="data-form">
                        <div class="radio-group mb-4">
                            <label class="radio-label">
                                <input type="radio" v-model="jenisTambah" value="kelompok" name="jenis"> 
                                <span class="radio-text">
                                    <strong>Buat Kategori (Kelompok) Baru</strong>
                                    <small>Contoh: Gol Elektronik -> Buat Kategori Baru "Proyektor"</small>
                                </span>
                            </label>
                            
                            <label class="radio-label">
                                <input type="radio" v-model="jenisTambah" value="subkelompok" name="jenis"> 
                                <span class="radio-text">
                                    <strong>Tambah Varian (Sub) Baru</strong>
                                    <small>Contoh: Kategori Proyektor -> Tambah Varian "Proyektor Laser"</small>
                                </span>
                            </label>
                        </div>

                        <div class="form-group mb-3">
                            <label>Pilih Golongan Utama *</label>
                            <select v-model="formMaster.golongan" required class="input-box">
                                <option value="" disabled>-- Pilih Golongan Utama --</option>
                                <option v-for="gol in listGolonganUnik" :key="gol.kode" :value="gol.kode">{{ gol.nama }}</option>
                            </select>
                        </div>

                        <div class="form-group mb-3" v-if="jenisTambah === 'subkelompok'">
                            <label>Pilih Kelompok Induk (Kategori) *</label>
                            <select v-model="formMaster.kelompok" required class="input-box">
                                <option value="" disabled v-if="!formMaster.golongan">Pilih Golongan terlebih dahulu</option>
                                <option value="" disabled v-else>-- Pilih Kelompok Tempat Varian Berada --</option>
                                <option v-for="kel in listKelompokUnik" :key="kel.kode" :value="kel.kode">{{ kel.nama }}</option>
                            </select>
                        </div>

                        <div class="form-group mb-4">
                            <label>Nama Barang / Deskripsi Baru *</label>
                            <input 
                                type="text" 
                                v-model="formMaster.nama_barang" 
                                placeholder="Contoh: KIPAS ANGIN DINDING" 
                                required 
                                class="input-box" 
                                style="text-transform: uppercase;"
                            />
                            <small style="color: #64748b; margin-top: 5px; display: block;">* Kode angka otomatis dibuatkan secara berurutan.</small>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn-submit w-full" :disabled="isSubmitting || isLoading">
                                <span v-if="isSubmitting">Menyimpan ke Database...</span>
                                <span v-else>Simpan Master Kode Baru</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- TABEL DATA MASTER -->
            <div class="table-section" :aria-busy="isLoading ? 'true' : 'false'">
                <span v-if="isLoading" class="sr-only">Memuat Master Kode Barang...</span>
                <div class="table-info">
                    <h3>Daftar Referensi Kode</h3>
                    <span class="badge-count">Menampilkan {{ isLoading ? '...' : filteredMasterKode.length }} data referensi</span>
                </div>

                <!-- SKELETON TABLE SAAT LOADING -->
                <div v-if="isLoading && showSkeleton" class="table-wrapper mt-4">
                    <SkeletonTable :rows="8" :headers="TABLE_HEADERS" table-class="wide-table" />
                </div>

                <!-- TABEL ASLI KETIKA TIDAK LOADING -->
                <div v-else-if="!isLoading" class="table-wrapper mt-4">
                    <table class="data-table wide-table">
                        <thead>
                            <tr>
                                <th style="width: 60px; text-align: center;">No</th>
                                <th>Kategori / Golongan</th>
                                <th style="text-align: center;">Gol</th>
                                <th style="text-align: center;">Kel</th>
                                <th style="text-align: center;">Sub</th>
                                <th>Kode Referensi</th>
                                <th>Nama Barang / Deskripsi</th>
                                <th style="text-align: center;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="filteredMasterKode.length === 0">
                                <td colspan="8" class="text-center">Data master kode barang tidak ditemukan.</td>
                            </tr>
                            
                            <tr v-for="(item, index) in paginatedMasterKode" :key="item._tempId">
                                
                                <!-- Jika Baris Sedang Di-Edit -->
                                <template v-if="editingItem === item._tempId">
                                    <td style="text-align: center; color:#94a3b8;">{{ (currentPage - 1) * itemsPerPage + index + 1 }}</td>
                                    <td><span class="gol-badge">{{ item.golongan_nama }}</span></td>
                                    <td style="text-align: center; font-weight: bold; color: #3b82f6;">{{ item.gol_kode }}</td>
                                    <td style="text-align: center; font-weight: bold; color: #10b981;">{{ item.kel_kode }}</td>
                                    <td style="text-align: center; font-weight: bold; color: #f59e0b;">{{ item.sub_kode }}</td>
                                    <td><span class="code-badge">{{ item.kode_rakitan }}</span></td>
                                    <td>
                                        <input type="text" v-model="editForm.nama_barang" class="edit-input" style="text-transform: uppercase;" />
                                    </td>
                                    <td class="action-cell">
                                        <button @click="saveEditMaster(item)" :disabled="isSavingEdit" class="btn-icon save-btn" title="Simpan">✓</button>
                                        <button @click="cancelEditMaster" :disabled="isSavingEdit" class="btn-icon cancel-btn" title="Batal">✕</button>
                                    </td>
                                </template>

                                <!-- Tampilan Normal -->
                                <template v-else>
                                    <td style="text-align: center; color:#94a3b8;">{{ (currentPage - 1) * itemsPerPage + index + 1 }}</td>
                                    <td><span class="gol-badge">{{ item.golongan_nama }}</span></td>
                                    <td style="text-align: center; font-weight: bold; color: #3b82f6;">{{ item.gol_kode }}</td>
                                    <td style="text-align: center; font-weight: bold; color: #10b981;">{{ item.kel_kode }}</td>
                                    <td style="text-align: center; font-weight: bold; color: #f59e0b;">{{ item.sub_kode }}</td>
                                    <td><span class="code-badge">{{ item.kode_rakitan }}</span></td>
                                    <td class="sticky-col nama-barang">{{ item.nama_barang }}</td>
                                    <td class="action-cell">
                                        <button @click="startEditMaster(item)" class="btn-icon edit-btn" title="Edit">✎</button>
                                        <button @click="deleteMaster(item)" class="btn-icon delete-btn" title="Hapus">🗑</button>
                                    </td>
                                </template>

                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="pagination-container" v-if="!isLoading && totalPages > 0">
                    <button class="btn-page" :disabled="currentPage === 1" @click="currentPage--">&laquo; Sebelumnya</button>
                    <span class="page-info">Halaman <strong style="color: #0f172a;">{{ currentPage }}</strong> dari {{ totalPages }}</span>
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


.search-container { min-width: 250px; }
.search-box { width: 100%; padding: 10px 16px; border-radius: 30px; border: 1px solid #cbd5e1; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: all 0.2s; }
.search-box:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); outline: none; }

/* MODAL STYLES */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px); }
.modal-content { background: #ffffff; width: 100%; max-width: 500px; border-radius: 12px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); animation: modalIn 0.3s ease-out; border-top: 4px solid #10b981; }
@keyframes modalIn { from { opacity: 0; transform: translateY(-30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
.form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
.form-header h3 { font-size: 18px; font-weight: 700; color: #1e293b; margin: 0; }
.btn-close { background: none; border: none; font-size: 20px; font-weight: bold; color: #94a3b8; cursor: pointer; transition: color 0.2s; padding: 0 8px; }
.btn-close:hover { color: #ef4444; }

.form-group label { font-size: 13px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px; }
.input-box { width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; color: #334155; outline: none; transition: 0.2s; }
.input-box:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
.mb-3 { margin-bottom: 16px; }
.mb-4 { margin-bottom: 24px; }
.w-full { width: 100%; padding: 14px !important; font-size: 16px !important; }

/* RADIO BUTTON CARD */
.radio-group { display: flex; flex-direction: column; gap: 10px; }
.radio-label { display: flex; align-items: flex-start; gap: 12px; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: 0.2s; background: #f8fafc; }
.radio-label:hover { border-color: #94a3b8; }
.radio-label:has(input:checked) { border-color: #10b981; background: #ecfdf5; box-shadow: 0 0 0 1px #10b981; }
.radio-label input { margin-top: 4px; accent-color: #10b981; transform: scale(1.2); }
.radio-text { display: flex; flex-direction: column; gap: 2px; }
.radio-text strong { font-size: 14px; color: #1e293b; }
.radio-text small { font-size: 12px; color: #64748b; line-height: 1.3; }

.btn-submit { background-color: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; }
.btn-submit:hover:not(:disabled) { background-color: #2563eb; }
.btn-submit:disabled { background-color: #94a3b8; cursor: not-allowed; }



@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.table-section { background-color: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
.table-info { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; }
.table-info h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }
.badge-count { font-size: 12px; background-color: #f1f5f9; color: #475569; padding: 6px 12px; border-radius: 20px; font-weight: 600; border: 1px solid #e2e8f0; }

.table-wrapper { overflow-x: auto; max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
.data-table { width: max-content; min-width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.data-table th, .data-table td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.data-table th { background-color: #f8fafc; color: #475569; font-weight: 700; position: sticky; top: 0; z-index: 10; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;}
.data-table td { color: #334155; vertical-align: middle; }
.data-table tr:hover { background-color: #f8fafc; }

.nama-barang { font-weight: 700; color: #0f172a; }
.code-badge { background-color: #f8fafc; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: bold; color: #475569; letter-spacing: 1px; border: 1px solid #cbd5e1; }
.gol-badge { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }

.text-center { text-align: center; color: #94a3b8; padding: 30px !important; font-style: italic; }
.mt-4 { margin-top: 1.5rem; }

.pagination-container { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
.btn-page { background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-page:hover:not(:disabled) { background-color: #f1f5f9; border-color: #94a3b8; }
.btn-page:disabled { background-color: #f8fafc; color: #cbd5e1; cursor: not-allowed; border-color: #f1f5f9; }
.page-info { font-size: 13px; color: #64748b; }

/* INLINE EDIT STYLES */
.edit-input { width: 100%; min-width: 150px; padding: 8px 10px; border: 1px solid #3b82f6; border-radius: 4px; font-size: 13px; outline: none; background-color: #eff6ff; }
.edit-input:focus { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }

.action-cell { display: flex; gap: 8px; justify-content: center; align-items: center;}
.btn-icon { background: none; border: none; font-size: 14px; cursor: pointer; padding: 6px 10px; border-radius: 6px; transition: 0.2s; display: flex; align-items: center; justify-content: center;}
.edit-btn { color: #3b82f6; background-color: #eff6ff; }
.edit-btn:hover { background-color: #3b82f6; color: white; }
.delete-btn { color: #ef4444; background-color: #fef2f2; }
.delete-btn:hover { background-color: #ef4444; color: white; }
.save-btn { color: #10b981; background-color: #ecfdf5; font-weight: bold; }
.save-btn:hover { background-color: #10b981; color: white; }
.cancel-btn { color: #64748b; background-color: #f1f5f9; font-weight: bold;}
.cancel-btn:hover { background-color: #64748b; color: white; }
</style>