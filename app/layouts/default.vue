<script setup lang="ts">
const { persistenceAvailable, profile, hydrate } = useWorkflow();
onMounted(hydrate);
</script>
<template>
  <div
    class="app-shell"
    :class="{ 'density-compact': profile.density === 'compact' }"
  >
    <a class="skip-link" href="#main-content">Перейти к содержимому</a
    ><AppHeader />
    <main id="main-content" class="main-content" tabindex="-1">
      <p v-if="!persistenceAvailable" class="form-error" role="status">
        Хранилище браузера недоступно. Изменения сохранятся до перезагрузки.
      </p>
      <slot />
    </main>
    <LazyAppToast />
  </div>
</template>
