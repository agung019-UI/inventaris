import { ref, watch, unref, onBeforeUnmount, type Ref } from 'vue'

/**
 * useSkeletonDelay(isLoading, delay = 150)
 * Mengembalikan ref `showSkeleton` yang baru bernilai true jika loading berlangsung lebih dari `delay` ms.
 * Jika data datang lebih cepat (< 150ms), skeleton tidak ditampilkan sama sekali untuk mencegah kedipan.
 * Membersihkan timer saat komponen di-unmount.
 */
export function useSkeletonDelay(source: Ref<boolean> | (() => boolean), delay = 150) {
    const showSkeleton = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = () => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    watch(
        () => (typeof source === 'function' ? source() : unref(source)),
        (loading) => {
            clear()
            if (loading) {
                timer = setTimeout(() => {
                    showSkeleton.value = true
                }, delay)
            } else {
                showSkeleton.value = false
            }
        },
        { immediate: true }
    )

    onBeforeUnmount(clear)
    return showSkeleton
}

