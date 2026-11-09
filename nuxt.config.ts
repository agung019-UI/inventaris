function getNitroStorageConfig(): Record<string, any> {
  // 1. Serverless dengan Upstash Redis REST (Cocok untuk Vercel, Netlify, atau platform serverless lainnya)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      driver: 'upstash',
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    }
  }

  // 2. Netlify Blobs (jika di-deploy di Netlify dan mengaktifkan blobs)
  if (process.env.NETLIFY && process.env.USE_NETLIFY_BLOBS === 'true') {
    return {
      driver: 'netlify-blobs',
      name: 'data'
    }
  }

  // 3. Cloudflare KV Binding (khusus Cloudflare Pages / Workers)
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_KV_BINDING) {
    return {
      driver: 'cloudflare-kv-binding',
      binding: process.env.CLOUDFLARE_KV_BINDING || 'STORAGE_KV'
    }
  }

  // 4. Default Lokal / VPS: File System Storage
  return {
    driver: 'fs',
    base: './.data/kv'
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  serverDir: 'app/server',
  nitro: {
    storage: {
      data: getNitroStorageConfig()
    }
  },
  css: ['~/assets/css/skeleton.css', '~/assets/css/layout.css']
})
