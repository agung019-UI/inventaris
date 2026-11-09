<script setup>
import { computed } from 'vue'
import SkeletonBox from './SkeletonBox.vue'

const props = defineProps({
    rows: { type: Number, default: 8 },
    cols: { type: Number, default: 6 },
    headers: { type: Array, default: () => [] },
    colWidths: { type: Array, default: () => [] },
    rowHeight: { type: [String, Number], default: 41 },
    headerHeight: { type: [String, Number], default: 41 },
    tableClass: { type: String, default: '' }
})

const toCss = (v) => (typeof v === 'number' ? `${v}px` : v)

const effectiveCols = computed(() => (props.headers && props.headers.length > 0 ? props.headers.length : props.cols))

// Deterministik berbasis indeks (0..1)
const seeded = (r, c) => {
    const x = Math.sin((r + 1) * 12.9898 + (c + 1) * 78.233) * 43758.5453
    return x - Math.floor(x)
}

const headerWidths = computed(() =>
    Array.from({ length: effectiveCols.value }, (_, c) => `${45 + Math.round(seeded(0, c + 31) * 35)}%`)
)

const cellWidths = computed(() =>
    Array.from({ length: props.rows }, (_, r) =>
        Array.from({ length: effectiveCols.value }, (_, c) => `${38 + Math.round(seeded(r + 1, c) * 48)}%`)
    )
)
</script>

<template>
    <table :class="['skeleton-table', tableClass]" aria-hidden="true">
        <colgroup v-if="colWidths.length">
            <col v-for="c in effectiveCols" :key="'col-' + c" :style="{ width: toCss(colWidths[c - 1]) }" />
        </colgroup>
        <thead>
            <tr :style="{ height: toCss(headerHeight) }">
                <th v-for="(h, c) in (headers && headers.length ? headers : headerWidths)" :key="'h-' + c">
                    <template v-if="headers && headers.length">
                        {{ h }}
                    </template>
                    <SkeletonBox v-else :width="h" height="12px" />
                </th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="(row, r) in cellWidths" :key="'r-' + r" :style="{ height: toCss(rowHeight) }">
                <td v-for="(w, c) in row" :key="'c-' + r + '-' + c">
                    <SkeletonBox :width="w" height="12px" />
                </td>
            </tr>
        </tbody>
    </table>
</template>

<style scoped>
.skeleton-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: transparent;
}
.skeleton-table th,
.skeleton-table td {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.6);
    border-right: 1px solid rgba(226, 232, 240, 0.6);
    vertical-align: middle;
    box-sizing: border-box;
}
.skeleton-table th {
    background: var(--glass-bg-table-th, rgba(248, 250, 252, 0.85));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #475569;
    font-weight: 700;
}
.skeleton-table tr:hover {
    background-color: transparent;
}
</style>
