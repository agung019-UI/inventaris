<script setup>
import { computed } from 'vue'

const props = defineProps({
    width: { type: [String, Number], default: '100%' },
    height: { type: [String, Number], default: '14px' },
    radius: { type: [String, Number], default: '6px' },
    circle: { type: Boolean, default: false }
})

const toCss = (v) => (typeof v === 'number' ? `${v}px` : v)

const boxStyle = computed(() => {
    if (props.circle) {
        const size = toCss(props.width !== '100%' ? props.width : props.height !== '14px' ? props.height : '40px')
        return {
            width: size,
            height: size,
            borderRadius: '50%'
        }
    }
    return {
        width: toCss(props.width),
        height: toCss(props.height),
        borderRadius: toCss(props.radius)
    }
})
</script>

<template>
    <span class="skeleton-box" :style="boxStyle" aria-hidden="true"></span>
</template>
