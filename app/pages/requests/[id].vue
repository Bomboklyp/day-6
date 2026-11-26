<script setup lang="ts">
import type { RequestPriority } from "~/types/workflow";
import { priorities } from "~/utils/requests";
import { useRequestUiStore } from "~/stores/requestUi";
import { apiErrorMessage, apiErrorStatus } from "~/utils/api";
import { allowedStatuses, isStaff } from "#shared/utils/permissions";
const route = useRoute();
const { user } = useAuth();
const { request, users, error, pending, refresh, response } = useRequest(() =>
  String(route.params.id),
);
if (import.meta.server) {
  await response;
  if (apiErrorStatus(error.value) === 404)
    throw createError({
      statusCode: 404,
      statusMessage: "Request not found",
      data: { entity: "request" },
    });
}
const { updateRequest } = useRequestActions();
const ui = useRequestUiStore();
const busy = computed(() => !!ui.pending[Number(route.params.id)]);
const staff = computed(() => !!user.value && isStaff(user.value.role));
const editable = computed(() => request.value?.status !== "closed");
const priorityLabel = computed(
  () =>
    priorities.find((item) => item.value === request.value?.priority)?.label,
);
const nextStatuses = computed(() =>
  request.value && user.value
    ? allowedStatuses(request.value.status, user.value.role)
    : [],
);
const canChangeStatus = computed(() =>
  nextStatuses.value.some(
    (status) => !["assigned", "resolved", "closed"].includes(status),
  ),
);
const modal = ref<"assign" | "status" | "resolve" | "close">("status");
const modalOpen = ref(false);
const selectedAssignee = ref("");
function open(mode: typeof modal.value) {
  modal.value = mode;
  modalOpen.value = true;
}
function date(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
    .format(new Date(value))
    .replace(" \u0432 ", ", ");
}
useHead(() => ({ title: (request.value?.title ?? "Заявка") + " — WorkFlow" }));
async function priority(event: Event) {
  if (!request.value || busy.value) return;
  try {
    await updateRequest(request.value.id, {
      priority: (event.target as HTMLSelectElement).value as RequestPriority,
    });
  } catch {}
}
</script>
<template>
  <div class="page-stack request-detail-page" :aria-busy="pending">
    <NuxtLink to="/requests" class="button button-tertiary align-start"
      >← К списку заявок</NuxtLink
    >
    <RequestDetailLoading v-if="pending" />
    <ErrorContent v-else-if="apiErrorStatus(error) === 404" />
    <RequestState
      v-else-if="error"
      state="error"
      title="Не удалось загрузить заявку"
      :message="apiErrorMessage(error)"
      @retry="refresh"
    />
    <template v-else-if="request">
      <h1>{{ request.title }}</h1>
      <RequestFeedback :request-id="request.id" @refresh="refresh" />
      <p class="page-subtitle">
        #{{ request.id }} · Создана {{ date(request.createdAt) }}
      </p>
      <div class="detail-badges">
        <StatusBadge :status="request.status" /><PriorityBadge
          :priority="request.priority"
        />
      </div>
      <div class="detail-columns">
        <div class="detail-main">
          <section class="panel stack-16">
            <h2>Описание проблемы</h2>
            <p>{{ request.description }}</p>
          </section>
          <section v-if="request.resolution" class="panel stack-16">
            <h2>Результат решения</h2>
            <p>{{ request.resolution }}</p>
          </section>
          <RequestComments :request="request" />
          <section class="panel stack-16">
            <h2>История заявки</h2>
            <RequestTimeline :events="request.timeline" />
          </section>
        </div>
        <section class="panel parameter-panel stack-16">
          <h2>Параметры</h2>
          <span class="parameter-label">Клиент</span>
          <p class="parameter-value">{{ request.client }}</p>
          <span class="parameter-label">Категория</span>
          <p class="parameter-value">{{ request.category }}</p>
          <label v-if="staff && editable" class="field field-tight"
            ><span>Исполнитель</span
            ><select
              v-model="selectedAssignee"
              aria-label="Исполнитель"
              :disabled="!staff || !editable || busy"
            >
              <option value="">{{ request.assignee.name }}</option>
              <option
                v-for="person in users.filter((item) => item.role === 'Agent')"
                :key="person.id"
                :value="person.id"
                :disabled="!person.is_active"
              >
                {{ person.name
                }}{{ person.is_active ? "" : " · деактивирован" }}
              </option>
            </select></label
          >
          <template v-else
            ><span class="parameter-label">Исполнитель</span>
            <p class="parameter-value">{{ request.assignee.name }}</p></template
          >
          <label v-if="staff && editable" class="field field-tight"
            ><span>Приоритет</span
            ><select
              aria-label="Приоритет"
              :value="request.priority"
              :disabled="busy"
              @change="priority"
            >
              <option
                v-for="item in priorities"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </select></label
          >
          <template v-else
            ><span class="parameter-label">Приоритет</span>
            <p class="parameter-value">
              {{ priorityLabel }}
            </p></template
          >
          <span class="parameter-label">Срок решения</span>
          <p class="deadline">
            {{ request.dueAt ? date(request.dueAt) : "Не указан" }}
          </p>
          <button
            v-if="staff && editable"
            class="button button-primary"
            :disabled="busy"
            @click="open('assign')"
          >
            Назначить исполнителя
          </button>
          <button
            v-if="canChangeStatus"
            class="button button-primary"
            :disabled="busy"
            @click="open('status')"
          >
            Изменить статус
          </button>
          <button
            v-if="nextStatuses.includes('resolved')"
            class="button button-secondary"
            :disabled="busy"
            @click="open('resolve')"
          >
            Зафиксировать решение
          </button>
          <button
            v-if="
              nextStatuses.includes('closed') && request.status === 'resolved'
            "
            class="button button-secondary"
            :disabled="busy"
            @click="open('close')"
          >
            Закрыть заявку
          </button>
        </section>
      </div>
      <RequestActionModal
        :open="modalOpen"
        :mode="modal"
        :request="request"
        :users="users"
        :initial-assignee="selectedAssignee"
        @close="modalOpen = false"
      />
    </template>
  </div>
</template>
