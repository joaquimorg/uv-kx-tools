<template>
  <section
    class="page"
    id="smr"
    data-page
    :class="{ active: isActive }"
    :hidden="!isActive"
  >
    <header class="hero">
      <div>
        <p class="eyebrow">UV-K5 TOOLSET</p>
        <h1>SMR</h1>
        <p class="subtitle">Short message radio for sending and receiving SMS frames.</p>
        <p class="subtitle">Select the message app in the radio (F+M) to use this tool.</p>
        <div class="hero-links">
          <a class="chip-link" href="#home">Back to tools</a>
        </div>
      </div>
      <section class="status-card status-split smr-status">
        <div class="status-main">
          <div class="status-top">
            <span
              class="status-dot"
              id="smrStatusDot"
              :data-status="isConnected ? 'connected' : 'disconnected'"
            ></span>
            <span id="smrStatusTitle">{{ smrStatusTitle }}</span>
          </div>
          <p class="muted" id="smrStatusSubtitle">{{ smrStatusSubtitle }}</p>
          <div class="status-actions">
            <div class="field-group status-serial">
              <label for="smrBaudSelect">Speed</label>
              <select id="smrBaudSelect" v-model="baud" :disabled="isConnected">
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <button id="smrConnect" class="primary" :disabled="smrIsAttached" @click="connectSmr">
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
              id="smrDisconnect"
              class="ghost"
              :disabled="!smrIsAttached"
              @click="disconnectSmr"
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
              <div id="smrFirmware">{{ firmwareLabel }}</div>
            </div>
          </div>
          <div class="status-error status-error-popup" id="smrError" :hidden="!smrError">
            <span class="status-error-text">{{ smrError }}</span>
            <span
              class="status-error-close"
              role="button"
              tabindex="0"
              aria-label="Close error"
              @click="smrError = ''"
              @keydown.enter.prevent="smrError = ''"
              @keydown.space.prevent="smrError = ''"
            >
              X
            </span>
          </div>
        </div>
      </section>
    </header>

    <section class="panel sms-panel">
      <div class="log-header">
        <h2>Messages</h2>
        <button id="smsClear" class="ghost small" @click="clearSmrLog">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 14h10l1-14" />
            </svg>
          </span>
          Clear
        </button>
      </div>
      <div id="smsLog" class="log-output sms-log" aria-live="polite">
        <div
          v-for="entry in smrLog"
          :key="entry.id"
          class="sms-entry"
          :data-direction="entry.direction"
          :data-tone="entry.tone"
          :class="{ 'sms-ack': entry.ack }"
        >
          <span class="sms-label">{{ entry.label }}</span>
          <span class="sms-text">{{ entry.message }}</span>
          <span v-if="entry.meta" class="sms-meta">{{ entry.meta }}</span>
        </div>
      </div>
      <div class="sms-compose">
        <input
          id="smsInput"
          type="text"
          maxlength="30"
          placeholder="Type a message"
          v-model="smrMessage"
          :disabled="!smrIsAttached"
          @keydown.enter.prevent="sendSmrMessage"
        />
        <span id="smsCount" class="sms-count" aria-live="polite">{{ smrRemaining }} left</span>
        <button id="smsSend" class="primary" :disabled="!smrIsAttached" @click="sendSmrMessage">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M4 12h16" />
              <path d="M14 5l7 7-7 7" />
            </svg>
          </span>
          Send
        </button>
      </div>
      <p class="hint">Use Enter to send.</p>
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
  smrError,
  smrStatusTitle,
  smrStatusSubtitle,
  smrIsAttached,
  smrLog,
  smrMessage,
  smrRemaining,
  sendSmrMessage,
  clearSmrLog,
  connectSmr,
  disconnectSmr,
} = app;

const isActive = computed(() => activePage.value === "smr");
</script>
