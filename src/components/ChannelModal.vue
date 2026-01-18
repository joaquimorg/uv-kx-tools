<template>
  <div
    id="channelModal"
    class="modal-overlay"
    :class="{ active: channelModalVisible }"
    :aria-hidden="(!channelModalVisible).toString()"
  >
    <div class="modal-card">
      <h2 id="modalTitle">{{ channelModalTitle }}</h2>
      <p id="modalMessage" class="muted">{{ channelModalMessage }}</p>
      <div class="progress active">
        <div class="progress-label">
          <span>Progress</span>
          <span id="modalPct">{{ formatPercent(channelProgress) }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="modalFill" :style="{ width: `${channelProgress}%` }"></div>
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

const { channelModalVisible, channelModalTitle, channelModalMessage, channelProgress, formatPercent } = app;
</script>
