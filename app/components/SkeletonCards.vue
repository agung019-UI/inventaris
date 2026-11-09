<script setup>
import { computed } from 'vue'
import SkeletonBox from './SkeletonBox.vue'

// Meniru kartu ringkasan (.stat-card): label kecil + angka besar.
const props = defineProps({
    count: { type: Number, default: 4 },
    gridClass: { type: String, default: '' },
    cardClass: { type: String, default: '' },
    cardHeight: { type: [String, Number], default: 84 }
})

const minHeight = computed(() => (typeof props.cardHeight === 'number' ? `${props.cardHeight}px` : props.cardHeight))

const widths = computed(() =>
    Array.from({ length: props.count }, (_, i) => ({
        title: `${45 + ((i * 17) % 35)}%`,
        value: `${35 + ((i * 23) % 30)}%`
    }))
)
</script>

<template>
    <div :class="['skeleton-cards', gridClass]" aria-hidden="true">
        <div v-for="(w, i) in widths" :key="i" :class="['skeleton-card', cardClass]" :style="{ minHeight }">
            <div class="skeleton-card-info">
                <SkeletonBox :width="w.title" height="11px" radius="4px" />
                <SkeletonBox :width="w.value" height="24px" class="skeleton-card-value" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.skeleton-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 15px;
}
.skeleton-card {
    background: var(--glass-bg, rgba(255, 255, 255, 0.65));
    backdrop-filter: blur(var(--glass-blur, 10px));
    -webkit-backdrop-filter: blur(var(--glass-blur, 10px));
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.55));
    border-radius: 12px;
    padding: 16px;
    box-shadow: var(--glass-shadow);
    border-left: 5px solid rgba(226, 232, 240, 0.7);
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
}
.skeleton-card-info {
    flex: 1;
    min-width: 0;
}
.skeleton-card-value {
    margin: 8px 0 2px 0;
}
</style>
