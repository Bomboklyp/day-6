<script setup lang="ts">
import type { ApiUser, UpdateRequestBody } from "../../shared/types/api";
import type { WorkflowRequest, RequestStatus } from "~/types/workflow";
import { allowedStatuses } from "#shared/utils/permissions";
import { statuses } from "#shared/utils/request-options";
import { apiErrorMessage } from "~/utils/api";
const props = defineProps<{
  open: boolean;
  mode: "assign" | "status" | "resolve" | "close";
  request: WorkflowRequest;
  users: ApiUser[];
  initialAssignee?: string;
}>();
const emit = defineEmits<{ close: [] }>();
const { user } = useAuth(),
  { updateRequest } = useRequestActions();
const busy = ref(false),
  error = ref("");
const draft = reactive({
  assignee: "",
  status: "in_progress" as RequestStatus,
  reason: "",
  resolution: "",
  comment: "",
});
const agents = computed(() =>
  props.users.filter((person) => person.role === "Agent"),
);
const choices = computed(() =>
  allowedStatuses(props.request.status, user.value!.role).filter(
    (status) => !["assigned", "resolved", "closed"].includes(status),
  ),
);
const titles = {
  assign: "Назначить исполнителя",
  status: "Изменить статус",
  resolve: "Зафиксировать решение",
  close: "Закрыть заявку",
};
const hints = {
  assign: "Выберите активного сотрудника.",
  status: "Доступные действия зависят от текущего статуса.",
  resolve: "Результат обязателен для статуса «Решена».",
  close: "Укажите причину ручного закрытия.",
};
watch(
  () => props.open,
  (open) => {
    if (open) {
      error.value = "";
      draft.assignee =
        props.initialAssignee ||
        agents.value.find((person) => person.is_active)?.id ||
        "";
      draft.status = choices.value[0] ?? props.request.status;
      draft.reason = "";
      draft.resolution = "";
      draft.comment = "";
    }
  },
);
async function submit() {
  if (busy.value) return;
  error.value = "";
  const input: UpdateRequestBody = {};
  if (props.mode === "assign") {
    if (!draft.assignee) {
      error.value = "Выберите исполнителя.";
      return;
    }
    input.assignee_id = draft.assignee;
    input.comment = draft.comment;
  } else if (props.mode === "resolve") {
    if (!draft.resolution.trim()) {
      error.value = "Опишите результат решения.";
      return;
    }
    input.status = "resolved";
    input.resolution = draft.resolution;
  } else if (props.mode === "close") {
    if (!draft.reason.trim()) {
      error.value = "Укажите причину ручного закрытия.";
      return;
    }
    input.status = "closed";
    input.reason = draft.reason;
  } else {
    if (draft.status === "waiting" && !draft.reason.trim()) {
      error.value = "Укажите причину ожидания.";
      return;
    }
    input.status = draft.status;
    input.reason = draft.reason;
  }
  busy.value = true;
  try {
    await updateRequest(props.request.id, input);
    emit("close");
  } catch (cause: unknown) {
    error.value = apiErrorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AppModal :open="open" :title="titles[mode]" @close="!busy && emit('close')">
    <form class="form-stack" novalidate @submit.prevent="submit">
      <p class="muted">{{ hints[mode] }}</p>
      <template v-if="mode === 'assign'">
        <label class="field"
          ><span>Исполнитель</span
          ><select
            v-model="draft.assignee"
            aria-label="Исполнитель"
            :disabled="busy"
          >
            <option value="">Не назначен</option>
            <option
              v-for="person in agents"
              :key="person.id"
              :value="person.id"
              :disabled="!person.is_active"
            >
              {{ person.name }}{{ person.is_active ? "" : " · деактивирован" }}
            </option>
          </select></label
        >
        <label class="field"
          ><span>Комментарий</span
          ><input
            v-model="draft.comment"
            maxlength="2000"
            :disabled="busy"
            aria-label="Комментарий"
        ></label>
      </template>
      <template v-else-if="mode === 'status'">
        <label class="field"
          ><span>Текущий статус</span
          ><input
            :value="
              statuses.find((item) => item.value === request.status)?.label
            "
            readonly
        ></label>
        <label class="field"
          ><span>Новый статус</span
          ><select
            v-model="draft.status"
            aria-label="Новый статус"
            :disabled="busy"
          >
            <option v-for="status in choices" :key="status" :value="status">
              {{ statuses.find((item) => item.value === status)?.label }}
            </option>
          </select></label
        >
        <label v-if="draft.status === 'waiting'" class="field"
          ><span>Причина ожидания</span
          ><textarea
            v-model="draft.reason"
            maxlength="3000"
            :disabled="busy"
            aria-label="Причина ожидания"
          />
        </label>
      </template>
      <label v-else-if="mode === 'resolve'" class="field"
        ><span>Результат решения</span
        ><textarea
          v-model="draft.resolution"
          maxlength="3000"
          :disabled="busy"
          aria-label="Результат решения"
        />
      </label>
      <label v-else class="field"
        ><span>Причина закрытия</span
        ><textarea
          v-model="draft.reason"
          maxlength="3000"
          :disabled="busy"
          aria-label="Причина закрытия"
        />
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="modal-footer">
        <button
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="emit('close')"
        >
          Отмена</button
        ><button class="button button-primary" type="submit" :disabled="busy">
          {{
            busy
              ? "Сохраняем…"
              : mode === "assign"
                ? "Назначить"
                : mode === "resolve"
                  ? "Отправить решение"
                  : mode === "close"
                    ? "Закрыть заявку"
                    : "Сохранить"
          }}
        </button>
      </div>
    </form>
  </AppModal>
</template>
