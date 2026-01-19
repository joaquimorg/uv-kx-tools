<template>
  <section
    class="page"
    id="home"
    data-page
    :class="{ active: isActive }"
    :hidden="!isActive"
  >
    <header class="hero">
      <div>
        <p class="eyebrow">UV-K5 TOOLSET (Version 1.0)</p>
        <h1>Tools to manage your radio.</h1>
        <p class="subtitle">
          Connect the radio to backup, restore, firmware update, channel editing and basic settings.
        </p>
        <div class="hero-links">
          <a class="chip-link" href="#channels">Channel editor</a>
          <a class="chip-link" href="#settings">Basic settings</a>
          <a class="chip-link" href="#mirror">Display mirror</a>
          <a class="chip-link" href="#smr">SMR</a>
        </div>
      </div>
      <div class="status-card status-split">
        <div class="status-main">
          <div class="status-top">
            <span
              class="status-dot"
              id="homeStatusDot"
              :data-status="isConnected ? 'connected' : 'disconnected'"
            ></span>
            <span id="connectionLabel">{{ isConnected ? "Connected" : "Disconnected" }}</span>
          </div>
          <p id="deviceInfo" class="muted">{{ deviceInfoText }}</p>
          <div class="status-actions">
            <div class="field-group status-serial">
              <label for="baudSelect">Speed</label>
              <select id="baudSelect" v-model="baud" :disabled="isConnected">
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <button id="connectBtn" class="primary" :disabled="isConnected" @click="connectHome">
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
              id="disconnectBtn"
              class="ghost"
              :disabled="!isConnected"
              @click="disconnectHome"
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
              <div id="firmwareInfo">{{ firmwareLabel }}</div>
            </div>
          </div>
          <div class="status-error status-error-popup" id="homeError" :hidden="!homeError">
            <span class="status-error-text">{{ homeError }}</span>
            <span
              class="status-error-close"
              role="button"
              tabindex="0"
              aria-label="Close error"
              @click="homeError = ''"
              @keydown.enter.prevent="homeError = ''"
              @keydown.space.prevent="homeError = ''"
            >
              X
            </span>
          </div>
        </div>
      </div>
    </header>

    <section class="panel-grid">
      <section class="panel">
        <h2>EEPROM backup</h2>
        <p class="muted">Save the radio's current configuration.</p>
        <div class="field-row">
          <label class="toggle">
            <input type="checkbox" id="backupCalib" v-model="backupIncludeCal" />
            <span>Include calibration</span>
          </label>
        </div>
        <button id="backupBtn" :disabled="!isConnected" @click="backupEeprom">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </span>
          Backup EEPROM
        </button>
        <div class="progress" :class="{ active: backupProgressVisible }">
          <div class="progress-label">
            <span>Progress</span>
            <span id="backupPct">{{ formatPercent(backupProgress) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="backupFill" :style="{ width: `${backupProgress}%` }"></div>
          </div>
        </div>
        <p class="hint" id="backupHint">The file will be downloaded as .bin.</p>
      </section>

      <section class="panel">
        <h2>Restore EEPROM</h2>
        <p class="muted">Restore a backup file to the radio.</p>
        <div class="field-row">
          <label class="toggle">
            <input type="checkbox" id="restoreCalib" v-model="restoreIncludeCal" />
            <span>Include calibration</span>
          </label>
        </div>
        <div class="field-row">
          <input ref="restoreFileInput" type="file" id="restoreFile" accept=".bin" />
        </div>
        <button id="restoreBtn" :disabled="!isConnected" @click="restoreEeprom">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M12 21V9" />
              <path d="M7 14l5-5 5 5" />
              <path d="M4 4h16" />
            </svg>
          </span>
          Restore EEPROM
        </button>
        <div class="progress" :class="{ active: restoreProgressVisible }">
          <div class="progress-label">
            <span>Progress</span>
            <span id="restorePct">{{ formatPercent(restoreProgress) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="restoreFill" :style="{ width: `${restoreProgress}%` }"></div>
          </div>
        </div>
      </section>

      <section class="panel firmware-panel">
        <h2>Firmware</h2>
        <p class="hint">For UV-K5/K6/5R</p>
        <p class="muted">Select the packed firmware to install on the radio.</p>
        <div class="field-row">
          <label class="toggle">
            <input type="radio" name="firmwareSource" value="local" v-model="firmwareSource" />
            <span>Local file</span>
          </label>
          <label class="toggle">
            <input type="radio" name="firmwareSource" value="github" v-model="firmwareSource" />
            <span>joaquim.org UV-Kx Firmware</span>
          </label>
        </div>
        <div class="field-row" id="firmwareLocalRow" :class="{ 'is-disabled': useGithubFirmware }">
          <input
            ref="firmwareFileInput"
            type="file"
            id="firmwareFile"
            accept=".bin,.hex"
            :disabled="useGithubFirmware"
          />
        </div>
        <p class="hint">Put the radio in boot mode before starting.</p>
        <button id="flashBtn" class="primary" @click="flashFirmware">
          <span class="btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M13 2L3 14h6l-2 8 10-12h-6l2-8z" />
            </svg>
          </span>
          Program firmware
        </button>
        <div class="progress" :class="{ active: flashProgressVisible }">
          <div class="progress-label">
            <span>Progress</span>
            <span id="flashPct">{{ formatPercent(flashProgress) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="flashFill" :style="{ width: `${flashProgress}%` }"></div>
          </div>
        </div>
      </section>
    </section>

    <section class="panel log-panel">
      <div class="log-header">
        <h2>Operations log</h2>
        <button id="clearLogBtn" class="ghost small" @click="clearLog">
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
      <div id="logOutput" class="log-output" aria-live="polite">
        <div v-for="entry in logEntries" :key="entry.id" :data-tone="entry.tone">
          {{ entry.text }}
        </div>
      </div>
    </section>

    <section class="panel warning-card" aria-live="polite">
      <h2>Warning</h2>
      <p class="warning-text">
        Use these tools at your own risk. I am not responsible for any damage, loss, or failures
        caused to radios.
      </p>
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
  deviceInfoText,
  baud,
  firmwareLabel,
  homeError,
  connectHome,
  disconnectHome,
  backupIncludeCal,
  backupEeprom,
  backupProgress,
  backupProgressVisible,
  restoreIncludeCal,
  restoreEeprom,
  restoreProgress,
  restoreProgressVisible,
  firmwareSource,
  useGithubFirmware,
  firmwareFileInput,
  restoreFileInput,
  flashFirmware,
  flashProgress,
  flashProgressVisible,
  logEntries,
  clearLog,
  formatPercent,
} = app;

const isActive = computed(() => activePage.value === "home");
</script>
