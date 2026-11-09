<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import type { CustomTemplate, CustomTemplateField } from '~/types/customTemplate'
import type { ParsedLabelItem } from '~/utils/xlsxParser'

const props = withDefaults(defineProps<{
    template: CustomTemplate
    item?: ParsedLabelItem | null
    showBorderCut?: boolean
    mode?: 'preview' | 'card' | 'print'
}>(), {
    item: null,
    showBorderCut: true,
    mode: 'preview'
})

// Item data fallback untuk preview jika data item belum di-bind
const resolvedItem = computed(() => {
    if (props.item) return props.item
    return {
        noInv: '02.06.01.0001.26',
        nama_barang: 'Laptop Asus ExpertBook B1',
        kode_barang: '02.06.01',
        no_urut: '0001',
        ruang: 'Lab Komputer',
        asal_dana: 'BOS / Yayasan',
        tahun: '2026',
        lembaga: 'SMA'
    }
})

// Fungsi mengganti placeholder dengan data aktual dan disanitasi
const renderFieldText = (rawText: string) => {
    if (!rawText) return ''
    const it = resolvedItem.value
    const replaced = rawText
        .replace(/\{\{no_inv\}\}/gi, it.noInv || '')
        .replace(/\{\{nama_barang\}\}/gi, it.nama_barang || '')
        .replace(/\{\{lokasi\}\}/gi, it.ruang || '')
        .replace(/\{\{asal_dana\}\}/gi, it.asal_dana || '')
        .replace(/\{\{tahun\}\}/gi, it.tahun || '')
        .replace(/\{\{lembaga\}\}/gi, it.lembaga || 'SMA')
    
    // Sanitasi keamanan
    return typeof window !== 'undefined' ? DOMPurify.sanitize(replaced) : replaced
}

const isBarcodeField = (field: CustomTemplateField) => {
    return field.key === 'barcode' || field.text.includes('{{barcode}}')
}

const isQrCodeField = (field: CustomTemplateField) => {
    return field.key === 'qrcode' || field.text.includes('{{qrcode}}')
}
</script>

<template>
    <div 
        class="custom-label-renderer"
        :class="[
            `mode-${mode}`,
            { 'with-border': showBorderCut && mode !== 'card' }
        ]"
        :style="mode !== 'card' ? {
            width: `${template.labelWidthMm}mm`,
            height: `${template.labelHeightMm}mm`,
            minHeight: `${template.labelHeightMm}mm`
        } : {}"
    >
        <div class="custom-label-body">
            <template v-for="(field, fIdx) in template.fields" :key="fIdx">
                <!-- 1. BARCODE -->
                <div v-if="isBarcodeField(field)" class="field-barcode" :style="{ textAlign: field.align || 'center' }">
                    <svg viewBox="0 0 100 20" preserveAspectRatio="none" class="barcode-svg">
                        <rect x="2" y="0" width="2" height="20" fill="#000" />
                        <rect x="6" y="0" width="1" height="20" fill="#000" />
                        <rect x="9" y="0" width="3" height="20" fill="#000" />
                        <rect x="14" y="0" width="1" height="20" fill="#000" />
                        <rect x="17" y="0" width="2" height="20" fill="#000" />
                        <rect x="21" y="0" width="4" height="20" fill="#000" />
                        <rect x="27" y="0" width="1" height="20" fill="#000" />
                        <rect x="30" y="0" width="2" height="20" fill="#000" />
                        <rect x="34" y="0" width="3" height="20" fill="#000" />
                        <rect x="39" y="0" width="1" height="20" fill="#000" />
                        <rect x="42" y="0" width="3" height="20" fill="#000" />
                        <rect x="47" y="0" width="2" height="20" fill="#000" />
                        <rect x="51" y="0" width="1" height="20" fill="#000" />
                        <rect x="54" y="0" width="4" height="20" fill="#000" />
                        <rect x="60" y="0" width="2" height="20" fill="#000" />
                        <rect x="64" y="0" width="1" height="20" fill="#000" />
                        <rect x="67" y="0" width="3" height="20" fill="#000" />
                        <rect x="72" y="0" width="2" height="20" fill="#000" />
                        <rect x="76" y="0" width="1" height="20" fill="#000" />
                        <rect x="79" y="0" width="3" height="20" fill="#000" />
                        <rect x="84" y="0" width="2" height="20" fill="#000" />
                        <rect x="88" y="0" width="1" height="20" fill="#000" />
                        <rect x="91" y="0" width="3" height="20" fill="#000" />
                        <rect x="96" y="0" width="2" height="20" fill="#000" />
                    </svg>
                </div>

                <!-- 2. QR CODE -->
                <div v-else-if="isQrCodeField(field)" class="field-qrcode" :style="{ textAlign: field.align || 'center' }">
                    <svg viewBox="0 0 33 33" class="qr-svg">
                        <rect width="33" height="33" fill="#ffffff" />
                        <rect x="2" y="2" width="7" height="7" fill="#000000" />
                        <rect x="3" y="3" width="5" height="5" fill="#ffffff" />
                        <rect x="4" y="4" width="3" height="3" fill="#000000" />
                        <rect x="24" y="2" width="7" height="7" fill="#000000" />
                        <rect x="25" y="3" width="5" height="5" fill="#ffffff" />
                        <rect x="26" y="4" width="3" height="3" fill="#000000" />
                        <rect x="2" y="24" width="7" height="7" fill="#000000" />
                        <rect x="3" y="25" width="5" height="5" fill="#ffffff" />
                        <rect x="4" y="26" width="3" height="3" fill="#000000" />
                        <rect x="12" y="3" width="2" height="2" fill="#000" />
                        <rect x="16" y="4" width="2" height="3" fill="#000" />
                        <rect x="19" y="2" width="2" height="2" fill="#000" />
                        <rect x="4" y="12" width="3" height="2" fill="#000" />
                        <rect x="10" y="10" width="3" height="3" fill="#000" />
                        <rect x="15" y="11" width="3" height="2" fill="#000" />
                        <rect x="20" y="12" width="2" height="3" fill="#000" />
                        <rect x="25" y="11" width="3" height="2" fill="#000" />
                        <rect x="11" y="17" width="2" height="3" fill="#000" />
                        <rect x="15" y="16" width="4" height="2" fill="#000" />
                        <rect x="22" y="18" width="3" height="3" fill="#000" />
                        <rect x="12" y="24" width="3" height="2" fill="#000" />
                        <rect x="17" y="23" width="2" height="3" fill="#000" />
                        <rect x="22" y="25" width="4" height="2" fill="#000" />
                    </svg>
                </div>

                <!-- 3. TEKS BIASA -->
                <div 
                    v-else 
                    class="field-text-line"
                    :style="{
                        fontSize: mode === 'card' ? `${Math.max(7, (field.fontSize || 10) * 0.8)}pt` : `${field.fontSize || 10}pt`,
                        fontWeight: field.bold ? '700' : '400',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        textAlign: field.align || 'left'
                    }"
                >
                    {{ renderFieldText(field.text) }}
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.custom-label-renderer {
    background: #ffffff;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    color: #000000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
}

.custom-label-renderer.with-border {
    border: 1px solid #1e293b;
}

.custom-label-body {
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    height: 100%;
    box-sizing: border-box;
    gap: 3px;
}

.mode-card {
    width: 240px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #000000;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.field-text-line {
    line-height: 1.35;
    word-break: break-word;
    color: #000000;
}

.field-barcode {
    width: 100%;
    margin: 3px 0;
}

.barcode-svg {
    width: 90%;
    max-width: 160px;
    height: 16px;
    display: inline-block;
}

.field-qrcode {
    width: 100%;
    margin: 4px 0;
}

.qr-svg {
    width: 32px;
    height: 32px;
    display: inline-block;
}
</style>
