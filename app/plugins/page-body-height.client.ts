// Mengisi CSS variable --page-body-h pada setiap elemen .page-body
// dengan tinggi area scroll-nya (px). Dipakai oleh layout.css supaya
// wrapper tabel setinggi area isi dan header kolom tabel menempel
// tepat di bawah page header. Tidak ada perubahan logika halaman.
export default defineNuxtPlugin(() => {
    const observed = new Set<HTMLElement>()

    const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const el = entry.target as HTMLElement
            el.style.setProperty('--page-body-h', `${el.clientHeight}px`)
        }
    })

    let scheduled = false
    const scan = () => {
        scheduled = false
        // Lepas elemen yang sudah tidak ada (pindah halaman)
        for (const el of observed) {
            if (!el.isConnected) {
                ro.unobserve(el)
                observed.delete(el)
            }
        }
        document.querySelectorAll<HTMLElement>('.page-body').forEach((el) => {
            if (!observed.has(el)) {
                observed.add(el)
                ro.observe(el)
            }
        })
    }

    const schedule = () => {
        if (scheduled) return
        scheduled = true
        requestAnimationFrame(scan)
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
    schedule()
})

