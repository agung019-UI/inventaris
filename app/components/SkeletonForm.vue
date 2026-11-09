<script setup>
import { computed } from 'vue'
import SkeletonBox from './SkeletonBox.vue'

const props = defineProps({
    fields: { type: Number, default: 6 },
    columns: { type: Number, default: 2 },
    showButton: { type: Boolean, default: true }
})

// Deterministik label & input widths
const fieldList = computed(() =>
    Array.from({ length: props.fields }, (_, i) => ({
        labelWidth: `${28 + ((i * 13) % 25)}%`,
        inputHeight: 40
    }))
)
</script>

<template>
    <div class="skeleton-form" aria-hidden="true">
        <div class="skeleton-fields" :style="{ gridTemplateColumns: `repeat(${columns}, 1fr)` }">
            <div v-for="(f, i) in fieldList" :key="i" class="skeleton-form-group">
                <SkeletonBox :width="f.labelWidth" height="12px" radius="4px" style="margin-bottom: 8px;" />
                <SkeletonBox width="100%" :height="f.inputHeight" radius="8px" />
            </div>
        </div>
        <div v-if="showButton" class="skeleton-form-actions">
            <SkeletonBox width="100%" height="44px" radius="8px" />
        </div>
    </div>
</template>

<style scoped>
.skeleton-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
}
.skeleton-fields {
    display: grid;
    gap: 16px;
}
@media (max-width: 768px) {
    .skeleton-fields {
        grid-template-columns: 1fr !important;
    }
}
.skeleton-form-group {
    display: flex;
    flex-direction: column;
}
.skeleton-form-actions {
    margin-top: 8px;
}
</style>

