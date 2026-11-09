<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const tipeLembaga = ref('SMK')

// ================================================================
// STATE BUKA/TUTUP ACCORDION (GLOBAL)
// useState menyimpan state di level aplikasi Nuxt, jadi tidak ter-reset
// walaupun <Navbar /> dibuat ulang setiap kali pindah halaman.
// ================================================================
const isBukuIndukOpen = useState<boolean>('sidebar-buku-induk', () => false)
const isPeminjamanOpen = useState<boolean>('sidebar-peminjaman', () => false)
const isMailingLabelOpen = useState<boolean>('sidebar-mailing-label', () => false)

// Penanda bahwa state sudah dipulihkan dari localStorage (cukup sekali per sesi aplikasi)
const isSidebarRestored = useState<boolean>('sidebar-restored', () => false)
const STORAGE_KEY = 'inventaris_sidebar_open'

// Prefix path untuk setiap menu induk.
// '/' (Daftar Inventaris) dicek persis, karena semua path diawali '/'.
const BUKU_INDUK_EXACT = ['/']
const BUKU_INDUK_PREFIX = ['/mutasi', '/dihibahkan', '/lelang_musnahkan', '/rekapitulasi', '/Master_Barang', '/perbandingan_harga']
const PEMINJAMAN_PREFIX = ['/peminjaman_barang', '/peminjaman_ruangan']
const MAILING_LABEL_PREFIX = ['/mailing_label']

const matchPrefix = (path: string, prefixes: string[]) =>
    prefixes.some(p => path === p || path.startsWith(p + '/'))

// Hanya MEMBUKA menu yang cocok dengan URL, tidak pernah menutup menu lain
const openMenuForPath = (path: string) => {
    if (BUKU_INDUK_EXACT.includes(path) || matchPrefix(path, BUKU_INDUK_PREFIX)) {
        isBukuIndukOpen.value = true
    }
    if (matchPrefix(path, PEMINJAMAN_PREFIX)) {
        isPeminjamanOpen.value = true
    }
    if (matchPrefix(path, MAILING_LABEL_PREFIX)) {
        isMailingLabelOpen.value = true
    }
}

// Pulihkan status dari localStorage (opsional, agar tetap terbuka setelah refresh)
const restoreFromStorage = () => {
    if (isSidebarRestored.value) return
    isSidebarRestored.value = true
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (saved && typeof saved === 'object') {
            if (saved.bukuInduk) isBukuIndukOpen.value = true
            if (saved.peminjaman) isPeminjamanOpen.value = true
            if (saved.mailingLabel) isMailingLabelOpen.value = true
        }
    } catch {
        // localStorage tidak tersedia / data rusak: abaikan
    }
}

// Simpan setiap perubahan buka/tutup ke localStorage
watch([isBukuIndukOpen, isPeminjamanOpen, isMailingLabelOpen], ([bukuInduk, peminjaman, mailingLabel]) => {
    if (!isSidebarRestored.value) return // jangan menimpa data sebelum dipulihkan
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bukuInduk, peminjaman, mailingLabel }))
    } catch {
        // abaikan jika localStorage tidak tersedia
    }
})

// Saat pindah halaman: buka menu yang sesuai, menu lain dibiarkan apa adanya
watch(() => route.path, (path) => openMenuForPath(path))

onMounted(() => {
    // Ambil data tipe lembaga dari cookie jika diperlukan untuk logika lain
    const cookieTipeLembaga = useCookie("tipe_lembaga").value
    if (cookieTipeLembaga) {
        tipeLembaga.value = cookieTipeLembaga
    }

    restoreFromStorage()
    openMenuForPath(route.path)
})
</script>

<template>
    <aside class="sidebar-light">
        <!-- BRANDING / LOGO -->
        <div class="brand-section">
            <h2 class="app-title">Buku Induk Barang</h2>
        </div>

        <!-- NAVIGATION MENU -->
        <nav class="nav-menu">
            
            <!-- GROUP: BUKU INDUK (Memiliki Sub-Menu) -->
            <div class="nav-group">
                <!-- Tombol Induk -->
                <button 
                    class="nav-link parent-btn" 
                    :class="{ 'active-parent': isBukuIndukOpen }" 
                    @click="isBukuIndukOpen = !isBukuIndukOpen"
                >
                    <div class="nav-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        Buku Induk
                    </div>
                    <!-- Icon Panah (Chevron) -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon" :class="{ 'rotate': isBukuIndukOpen }">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                <!-- Daftar Sub-Menu -->
                <div v-show="isBukuIndukOpen" class="sub-menu">
                    <NuxtLink to="/" class="sub-link" exact-active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Daftar Inventaris
                    </NuxtLink>

                    <NuxtLink to="/rekapitulasi" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Rekapitulasi
                    </NuxtLink>

                    <NuxtLink to="/Master_Barang" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Kode Barang
                    </NuxtLink>
                    <NuxtLink to="/perbandingan_harga" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Perbandingan Harga
                    </NuxtLink>
                </div>
            </div>

            <!-- GROUP: PEMINJAMAN (Memiliki Sub-Menu) -->
            <div class="nav-group">
                <!-- Tombol Induk -->
                <button 
                    class="nav-link parent-btn" 
                    :class="{ 'active-parent': isPeminjamanOpen }" 
                    @click="isPeminjamanOpen = !isPeminjamanOpen"
                >
                    <div class="nav-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        Peminjaman
                    </div>
                    <!-- Icon Panah (Chevron) -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon" :class="{ 'rotate': isPeminjamanOpen }">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                <!-- Daftar Sub-Menu -->
                <div v-show="isPeminjamanOpen" class="sub-menu">
                    <NuxtLink to="/peminjaman_barang" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Barang
                    </NuxtLink>

                    <NuxtLink to="/peminjaman_ruangan" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Ruangan
                    </NuxtLink>
                </div>
            </div>

            <!-- GROUP: MAILING LABEL -->
            <div class="nav-group">
                <!-- Tombol Induk -->
                <button 
                    class="nav-link parent-btn" 
                    :class="{ 'active-parent': isMailingLabelOpen }" 
                    @click="isMailingLabelOpen = !isMailingLabelOpen"
                >
                    <div class="nav-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                        </svg>
                        Mailing Label
                    </div>
                    <!-- Icon Panah (Chevron) -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon" :class="{ 'rotate': isMailingLabelOpen }">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                <!-- Daftar Sub-Menu -->
                <div v-show="isMailingLabelOpen" class="sub-menu">
                    <NuxtLink to="/mailing_label" class="sub-link" exact-active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Buat Label
                    </NuxtLink>

                    <NuxtLink to="/mailing_label/template" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Template Label
                    </NuxtLink>

                    <NuxtLink to="/mailing_label/document" class="sub-link" active-class="active-sub-link">
                        <span class="sub-dot"></span>
                        Dokumen Hasil
                    </NuxtLink>
                </div>
            </div>

        </nav>
    </aside>
</template>

<style scoped>
/* RESET DASAR */
* {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* SIDEBAR LAYOUT (GAYA KACA NEONAV) */
.sidebar-light {
    width: 250px;
    height: 100vh;
    flex-shrink: 0;
    overflow-y: auto;
    position: relative;
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding: 24px 16px;
    background: rgba(255, 255, 255, 0.12) !important;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-right: 1px solid rgba(255, 255, 255, 0.25) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    transition: all 250ms ease;
}

/* Custom Scrollbar Kaca untuk Sidebar */
.sidebar-light::-webkit-scrollbar {
    width: 6px;
}
.sidebar-light::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 10px;
}
.sidebar-light::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
}

/* BRANDING SECTION */
.brand-section {
    margin-bottom: 24px;
    padding-left: 12px;
}

.app-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #ffffff; 
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
}

/* NAVIGATION MENU */
.nav-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1; 
}

.nav-group {
    display: flex;
    flex-direction: column;
}

/* STYLING LINK & TOMBOL NAVIGASI DEFAULT (BENTUK PILL) */
.nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: 100px;
    text-decoration: none;
    color: #ffffff; 
    font-size: 14px;
    font-weight: 600;
    border: 1px solid transparent;
    transition: all 200ms ease;
}

.nav-left {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ffffff;
}

.nav-icon {
    color: #ffffff;
}

/* RESET BUTTON STYLES UNTUK MENU INDUK */
.parent-btn {
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
}

.nav-link:hover, .parent-btn:hover {
    background-color: rgba(255, 255, 255, 0.14);
    color: #ffffff;
}

/* STYLE KETIKA MENU UTAMA AKTIF (KACA TERANG BENTUK PILL) */
.active-link,
.active-parent {
    background-color: rgba(255, 255, 255, 0.28) !important; 
    color: #ffffff !important; 
    font-weight: 700 !important;
    border: 1px solid rgba(255, 255, 255, 0.35) !important;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}

.active-link .nav-icon {
    color: #ffffff;
}

/* STYLE ICON CHEVRON PADA MENU INDUK */
.chevron-icon {
    transition: transform 0.3s ease;
    color: rgba(255, 255, 255, 0.9);
}

.chevron-icon.rotate {
    transform: rotate(180deg);
}

/* --- STYLING SUB-MENU --- */
.sub-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 20px;
    margin-top: 4px;
}

.sub-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.92);
    font-weight: 500;
    text-decoration: none;
    border-radius: 100px;
    border: 1px solid transparent;
    transition: all 200ms ease;
}

.sub-link:hover {
    color: #ffffff;
    background-color: rgba(255, 255, 255, 0.14);
}

/* Bulat Kecil / Dot untuk Sub Menu */
.sub-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.6);
    transition: all 200ms ease;
}

/* Style Sub Menu Jika Sedang Aktif (Pill Kaca + Titik Putih/Teal Terang) */
.active-sub-link {
    color: #ffffff !important;
    font-weight: 700 !important;
    background-color: rgba(255, 255, 255, 0.28) !important;
    border: 1px solid rgba(255, 255, 255, 0.35) !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

.active-sub-link .sub-dot {
    background-color: #22c08a;
    box-shadow: 0 0 10px rgba(34, 192, 138, 0.9);
    transform: scale(1.4);
}

</style>
