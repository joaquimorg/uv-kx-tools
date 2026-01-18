<template>
  <div
    id="settingsModal"
    class="modal-overlay"
    :class="{ active: settingsModalVisible }"
    :aria-hidden="(!settingsModalVisible).toString()"
  >
    <div class="modal-card">
      <h2 id="settingsModalTitle">{{ settingsModalTitle }}</h2>
      <p id="settingsModalMessage" class="muted">{{ settingsModalMessage }}</p>
      <div class="progress active">
        <div class="progress-label">
          <span>Progress</span>
          <span id="settingsModalPct">{{ formatPercent(settingsProgress) }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="settingsModalFill" :style="{ width: `${settingsProgress}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from "vue";
import { AppStateKey } from "../state/appStateKey.js";

const app = inject(AppStateKey);
if (!app) {
  throw new Error("App state not provided.");
}

const { settingsModalVisible, settingsModalTitle, settingsModalMessage, settingsProgress, formatPercent } = app;
</script>
