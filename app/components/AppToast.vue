<script setup lang="ts">
const { toast } = useToast();
const ui = useRequestUiStore();
const route = useRoute();
const { undoLastChange } = useRequestActions();
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite" aria-atomic="true">
    <div v-if="ui.undo && !route.path.startsWith('/requests')" class="toast">
      <span>Изменение заявки #{{ ui.undo.id }} сохранено</span
      ><button
        class="button button-secondary"
        :disabled="!!ui.pending[ui.undo.id]"
        @click="undoLastChange"
      >
        Отменить изменение
      </button>
    </div>
    <Transition name="toast"
      ><div v-if="toast" :key="toast.id" class="toast">
        <span class="toast-check"><AppIcon name="check" :size="18" /></span
        ><span>{{ toast.message }}</span
        ><button
          class="icon-button"
          aria-label="Закрыть уведомление"
          @click="toast = null"
        >
          <AppIcon name="close" :size="16" />
        </button></div
    ></Transition>
  </div>
</template>
