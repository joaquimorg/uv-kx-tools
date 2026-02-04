<template>
  <section
    class="page"
    id="mirror"
    data-page
    :class="{ active: isActive }"
    :hidden="!isActive"
  >
    <header class="hero">
      <div>
        <p class="eyebrow">UV-K5 TOOLSET</p>
        <h1>Display mirror</h1>
        <p class="subtitle">Mirror the radio display in real time.</p>
        <div class="hero-links">
          <a class="chip-link" href="#home">Back to tools</a>
        </div>
      </div>

      <section class="status-card status-split mirror-status">
        <div class="status-main">
          <div class="status-top">
            <span
              class="status-dot"
              id="mirrorStatusDot"
              :data-status="isConnected ? 'connected' : 'disconnected'"
            ></span>
            <span id="mirrorStatusTitle">{{ mirrorStatusTitle }}</span>
          </div>
          <p class="muted" id="mirrorStatusSubtitle">{{ mirrorStatusSubtitle }}</p>
          <div class="status-actions">
            <div class="field-group status-serial">
              <label for="mirrorBaudSelect">Speed</label>
              <select id="mirrorBaudSelect" v-model="baud" :disabled="isConnected">
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <button
              id="mirrorConnect"
              class="primary"
              :disabled="mirrorIsAttached"
              @click="connectMirror"
            >
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                  <path d="M12 22v-5" />
                  <path d="M9 8V2" />
                  <path d="M15 8V2" />
                  <path d="M18 8v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
                </svg>
              </span>
              Connect
            </button>
            <button
              id="mirrorDisconnect"
              class="ghost"
              :disabled="!mirrorIsAttached"
              @click="disconnectMirror"
            >
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </span>
              Disconnect
            </button>
          </div>
        </div>
        <div class="status-side">
          <div class="status-meta">
            <div>
              <div class="muted">Firmware</div>
              <div id="mirrorFirmware">{{ firmwareLabel }}</div>
            </div>
          </div>
        </div>
      </section>
    </header>
    <section class="panel mirror-host">
      <div class="mirror-actions">
        <select
          id="mirrorColor"
          aria-label="Screen color"
          v-model="mirrorColor"
          :disabled="!mirrorIsAttached"
        >
          <option value="amber">Amber screen</option>
          <option value="white">White screen</option>
        </select>
        <button class="ghost" id="mirrorToggle" :disabled="!mirrorIsAttached" @click="toggleMirror">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path :d="mirrorToggleIconPath" />
            </svg>
          </span>
          <span class="btn-label">{{ mirrorToggleLabel }}</span>
        </button>
        <button class="ghost" id="mirrorSave" :disabled="!mirrorIsAttached" @click="saveScreenshot">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </span>
          <span class="btn-label">Screen shot</span>
        </button>
      </div>
      <div class="mirror-select"></div>
      <div
        class="lcd-shell"
        id="lcdShell"
        :class="mirrorColor === 'amber' ? 'lcd-amber' : 'lcd-white'"
        ref="mirrorShellRef"
      >
        <canvas ref="mirrorCanvasRef" id="lcdCanvas" width="512" height="256"></canvas>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, inject } from "vue";
import { AppStateKey } from "../state/appStateKey.js";

const app = inject(AppStateKey);
if (!app) {
  throw new Error("App state not provided.");
}

const {
  activePage,
  isConnected,
  baud,
  firmwareLabel,
  mirrorError,
  mirrorStatusTitle,
  mirrorStatusSubtitle,
  mirrorColor,
  mirrorIsAttached,
  mirrorToggleLabel,
  mirrorToggleIconPath,
  toggleMirror,
  connectMirror,
  disconnectMirror,
  saveScreenshot,
  mirrorCanvasRef,
  mirrorShellRef,
} = app;

const isActive = computed(() => activePage.value === "mirror");
</script>
