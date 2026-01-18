<template>
  <div
    v-if="tooltip.visible"
    class="action-tooltip"
    :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
  >
    {{ tooltip.text }}
  </div>
</template>

<script setup>
import { inject } from "vue";
import { AppStateKey } from "../state/appStateKey.js";

const app = inject(AppStateKey);
if (!app) {
  throw new Error("App state not provided.");
}

const { tooltip } = app;
</script>
