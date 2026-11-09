<script setup lang="ts">
defineProps<{
    title: string
    subtitle?: string
}>()
</script>

<template>
    <div class="header-container">
        <div class="header-text">
            <h1 class="page-title">{{ title }}</h1>
            <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.actions || $slots.default" class="header-actions">
            <slot name="actions">
                <slot />
            </slot>
        </div>
    </div>
</template>

<style scoped>
.header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 20px 28px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    margin-bottom: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    box-sizing: border-box;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 50;
    transition: all 250ms ease;
}

.header-text {
    flex: 1;
    min-width: 0;
}

.page-title {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.3;
    margin: 0;
    color: #ffffff;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    word-break: break-word;
}

.subtitle {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.85);
    margin: 4px 0 0 0;
    word-break: break-word;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
}

/* Standarisasi semua tombol aksi & kontrol di dalam header slot */
:deep(button),
:deep(.btn),
:deep(.btn-submit),
:deep(.btn-primary) {
    height: 40px;
    box-sizing: border-box;
    padding: 0 22px;
    font-size: 14px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    border-radius: 100px;
    background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 6px 18px rgba(255, 90, 90, 0.45);
    cursor: pointer;
    transition: transform 250ms ease, box-shadow 250ms ease, background 250ms ease;
}

:deep(button:hover:not(:disabled)),
:deep(.btn:hover:not(:disabled)),
:deep(.btn-submit:hover:not(:disabled)),
:deep(.btn-primary:hover:not(:disabled)) {
    transform: translateY(-2px);
    background: linear-gradient(135deg, #ff7b7b 0%, #ff3b3b 100%);
    box-shadow: 0 8px 24px rgba(255, 90, 90, 0.65);
}

:deep(.btn-secondary),
:deep(.btn-export),
:deep(.btn-print),
:deep(.btn-back),
:deep(.btn-outline) {
    height: 40px;
    box-sizing: border-box;
    padding: 0 20px;
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.20);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    transition: all 250ms ease;
}

:deep(.btn-secondary:hover:not(:disabled)),
:deep(.btn-back:hover:not(:disabled)),
:deep(.btn-outline:hover:not(:disabled)) {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.32);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
}

/* Override khusus tombol export / Cetak PDF: Warna koral tetap, hapus semua shadow dan glow */
:deep(.btn-export) {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%) !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.35) !important;
    border-radius: 100px !important;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}
:deep(.btn-export:hover:not(:disabled)) {
    transform: translateY(-2px);
    background: linear-gradient(135deg, #ff7b7b 0%, #ff3b3b 100%) !important;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}
:deep(.btn-export:focus),
:deep(.btn-export:focus-visible),
:deep(.btn-export:active) {
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
    outline: none;
}
:deep(.btn-export:disabled) {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
    box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
}

:deep(.search-container) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
}

/* KOTAK LEMBAGA DI PAGE HEADER */
:deep(.filter-group-header) {
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

:deep(.filter-group-header label) {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
    margin: 0;
}

:deep(.filter-group-header select),
:deep(.filter-group-header .select-box),
:deep(.filter-group-header .highlight-select) {
    height: 34px;
    background: rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.40);
    border-radius: 10px;
    color: #ffffff;
    font-size: 13.5px;
    font-weight: 700;
    padding: 0 12px;
    outline: none;
    cursor: pointer;
}

:deep(.filter-group-header select option) {
    background: #1e293b;
    color: #ffffff;
}

:deep(input.search-box),
:deep(input.input-box),
:deep(input.search-input),
:deep(select.select-box),
:deep(select.highlight-select) {
    height: 40px;
    box-sizing: border-box;
    padding: 0 18px;
    font-size: 14px;
    border-radius: 100px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #ffffff;
    outline: none;
    transition: all 200ms ease;
}

:deep(input.search-box::placeholder),
:deep(input.input-box::placeholder),
:deep(input.search-input::placeholder) {
    color: rgba(255, 255, 255, 0.65);
}

:deep(input.search-box:focus),
:deep(input.input-box:focus),
:deep(select.select-box:focus) {
    background: rgba(255, 255, 255, 0.32);
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
}

/* Responsif: Layar sempit (< 768px) */
@media (max-width: 768px) {
    .header-container {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
        padding: 18px 20px;
    }

    .header-text {
        width: 100%;
    }

    .header-actions {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
    }

    .header-actions > *,
    :deep(button),
    :deep(.btn),
    :deep(.search-container),
    :deep(.filter-group-header),
    :deep(input.search-box),
    :deep(select.select-box) {
        width: 100%;
    }
}
</style>
