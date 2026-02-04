<template>
  <section
    class="page"
    id="channels"
    data-page
    :class="{ active: isActive }"
    :hidden="!isActive"
  >
    <header class="page-head">
      <div>
        <p class="eyebrow">UV-K5 TOOLSET</p>
        <h1>Channel editor</h1>
        <p class="subtitle">Put the radio in normal mode to read and write memory channels.</p>
        <div class="hero-links">
          <a class="chip-link" href="#home">Back to tools</a>
        </div>
      </div>

      <section class="status-card status-split">
        <div class="status-main">
          <div class="status-top">
            <span
              class="status-dot"
              id="channelsStatusDot"
              :data-status="isConnected ? 'connected' : 'disconnected'"
            ></span>
            <span id="channelsStatusLabel">{{ isConnected ? "Connected" : "Disconnected" }}</span>
          </div>
          <p id="channelsDeviceInfo" class="muted">{{ deviceInfoText }}</p>
          <div class="status-actions">
            <div class="field-group status-serial">
              <label for="channelsBaudSelect">Speed</label>
              <select id="channelsBaudSelect" v-model="baud" :disabled="isConnected">
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <button
              id="channelsConnect"
              class="primary"
              :disabled="isConnected"
              @click="connectChannels"
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
              id="channelsDisconnect"
              class="ghost"
              :disabled="!isConnected"
              @click="disconnectChannels"
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
              <div id="channelsFirmware">{{ firmwareLabel }}</div>
            </div>
          </div>
        </div>
      </section>
    </header>

    <section class="panel channel-panel">
      <div class="channel-actions">
        <div class="action-group">
          <button
            id="readChannelsBtn"
            class="primary"
            :disabled="channelsBusy || !isConnected"
            @click="readChannels"
          >
            <span class="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </span>
            Read from device
          </button>
          <button
            id="writeChannelsBtn"
            :disabled="channelsBusy || !isConnected || !channelsCanEdit"
            @click="writeChannels"
          >
            <span class="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M12 21V9" />
                <path d="M7 14l5-5 5 5" />
                <path d="M4 4h16" />
              </svg>
            </span>
            Write to device
          </button>
        </div>
        <div class="action-group">
          <button
            id="exportCsvBtn"
            class="ghost small"
            :disabled="channelsBusy || !channelsCanEdit"
            @click="exportCsv"
          >
            <span class="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </span>
            Export CSV
          </button>
          <button
            id="importCsvBtn"
            class="ghost small"
            :disabled="channelsBusy || !channelsCanEdit"
            @click="triggerImportCsv"
          >
            <span class="btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M12 21V9" />
                <path d="M7 14l5-5 5 5" />
                <path d="M4 4h16" />
              </svg>
            </span>
            Import CSV
          </button>
          <input ref="importCsvInput" type="file" accept=".csv" hidden @change="handleImportCsv" />
        </div>
        <div class="action-group channel-search">
          <label class="search-field">
            <input id="channelSearch" type="text" placeholder="Search name or freq" v-model="channelSearch" />
            <span
              id="channelSearchClear"
              class="action-icon search-clear"
              role="button"
              aria-label="Clear search"
              tabindex="0"
              @click="clearChannelSearch"
              @keydown.enter.prevent="clearChannelSearch"
              @keydown.space.prevent="clearChannelSearch"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M6 6l12 12" />
                <path d="M18 6l-12 12" />
              </svg>
            </span>
          </label>
          <div class="muted" id="channelSearchCount">{{ channelSearchCount }}</div>
        </div>
      </div>

      <div class="channel-status">
        <span
          id="channelStatus"
          :class="{
            'status-error': channelStatusTone === 'error',
            'status-warning': channelStatusTone === 'warning',
          }"
        >
          {{ channelStatus }}
        </span>
        <div class="progress" id="channelProgress" :class="{ active: channelProgressVisible }">
          <div class="progress-label">
            <span>Progress&nbsp;</span>
            <span id="channelPct">{{ formatPercent(channelProgress) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="channelFill" :style="{ width: `${channelProgress}%` }"></div>
          </div>
        </div>
      </div>

      <div class="table-wrap" ref="channelTableWrap">
        <table class="channel-table">
          <thead>
            <tr>
              <th>CH</th>
              <th>Name</th>
              <th>RX Freq</th>
              <th>Duplex</th>
              <th>Offset</th>
              <th>Power</th>
              <th>Mode</th>
              <th>RX Tone Type</th>
              <th>RX Tone</th>
              <th>TX Tone Type</th>
              <th>TX Tone</th>
              <th>Step</th>
              <th>Reverse</th>
              <th>Busy</th>
              <th>TX Lock</th>
              <th>PTTID</th>
              <th>Scanlist</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="channelBody">
            <tr
              v-for="(channel, index) in channels"
              :key="channel.number"
              :class="{ 'row-match': channelMatchInfo.flags[index] }"
              :data-first-match="channelMatchInfo.firstMatchIndex === index ? 'true' : null"
              :ref="(el) => setChannelRowRef(el, index)"
            >
              <td>{{ channel.number }}</td>
              <td>
                <input
                  type="text"
                  maxlength="10"
                  :value="channel.name"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'name', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :value="formatFreq(channel.rxFreqHz)"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'rxFreq', $event.target.value)"
                />
              </td>
              <td>
                <select
                  :value="channel.duplex"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'duplex', $event.target.value)"
                >
                  <option value=""></option>
                  <option value="+">+</option>
                  <option value="-">-</option>
                </select>
              </td>
              <td>
                <input
                  type="text"
                  :value="formatOffset(channel.offsetHz)"
                  :disabled="!channelsEditable || !channel.duplex"
                  @change="updateChannelField(index, 'offset', $event.target.value)"
                />
              </td>
              <td>
                <select
                  :value="channel.power"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'power', $event.target.value)"
                >
                  <option v-for="power in powerList" :key="power" :value="power">{{ power }}</option>
                </select>
              </td>
              <td>
                <select
                  :value="channel.mode"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'mode', $event.target.value)"
                >
                  <option v-for="mode in modeList" :key="mode" :value="mode">{{ mode }}</option>
                </select>
              </td>
              <td>
                <select
                  :value="channel.rxToneType"
                  :disabled="!channelsEditable"
                  @change="updateToneType(index, 'rxToneType', $event.target.value)"
                >
                  <option v-for="type in toneTypeList" :key="type" :value="type">{{ type }}</option>
                </select>
              </td>
              <td>
                <select
                  :value="channel.rxTone"
                  :disabled="!channelsEditable || toneOptions(channel.rxToneType).length === 0"
                  @change="updateChannelField(index, 'rxTone', $event.target.value)"
                >
                  <option v-for="tone in toneOptions(channel.rxToneType)" :key="tone" :value="tone">
                    {{ tone }}
                  </option>
                </select>
              </td>
              <td>
                <select
                  :value="channel.txToneType"
                  :disabled="!channelsEditable"
                  @change="updateToneType(index, 'txToneType', $event.target.value)"
                >
                  <option v-for="type in toneTypeList" :key="type" :value="type">{{ type }}</option>
                </select>
              </td>
              <td>
                <select
                  :value="channel.txTone"
                  :disabled="!channelsEditable || toneOptions(channel.txToneType).length === 0"
                  @change="updateChannelField(index, 'txTone', $event.target.value)"
                >
                  <option v-for="tone in toneOptions(channel.txToneType)" :key="tone" :value="tone">
                    {{ tone }}
                  </option>
                </select>
              </td>
              <td>
                <select
                  :value="String(channel.step)"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'step', $event.target.value)"
                >
                  <option v-for="step in steps" :key="step" :value="String(step)">{{ step }}</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  :checked="channel.reverse"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'reverse', $event.target.checked)"
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  :checked="channel.busy"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'busy', $event.target.checked)"
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  :checked="channel.txLock"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'txLock', $event.target.checked)"
                />
              </td>
              <td>
                <select
                  :value="channel.pttid"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'pttid', $event.target.value)"
                >
                  <option v-for="pttid in pttidList" :key="pttid" :value="pttid">{{ pttid }}</option>
                </select>
              </td>
              <td>
                <select
                  :value="String(channel.scanlist)"
                  :disabled="!channelsEditable"
                  @change="updateChannelField(index, 'scanlist', $event.target.value)"
                >
                  <option v-for="(label, idx) in scanlistList" :key="label" :value="String(idx)">
                    {{ label }}
                  </option>
                </select>
              </td>
              <td class="row-actions">
                <span
                  class="action-icon"
                  data-action="insert"
                  data-tooltip="Insert blank line below"
                  aria-label="Insert"
                  :data-disabled="channelsEditable ? null : 'true'"
                  @click="insertChannel(index)"
                  @pointerover="showTooltip($event, 'Insert blank line below')"
                  @pointerout="hideTooltip"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </span>
                <span
                  class="action-icon"
                  data-action="remove"
                  data-tooltip="Remove"
                  aria-label="Remove"
                  :data-disabled="channelsEditable ? null : 'true'"
                  @click="removeChannel(index)"
                  @pointerover="showTooltip($event, 'Remove')"
                  @pointerout="hideTooltip"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                  </svg>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
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
  deviceInfoText,
  baud,
  firmwareLabel,
  channelsBusy,
  channelsCanEdit,
  channelsError,
  channelStatus,
  channelStatusTone,
  channelProgress,
  channelProgressVisible,
  channelSearch,
  channelSearchCount,
  channelMatchInfo,
  channelsEditable,
  channels,
  channelRowRefs,
  channelTableWrap,
  powerList,
  modeList,
  toneTypeList,
  steps,
  scanlistList,
  pttidList,
  formatPercent,
  formatFreq,
  formatOffset,
  updateChannelField,
  updateToneType,
  toneOptions,
  readChannels,
  writeChannels,
  exportCsv,
  triggerImportCsv,
  handleImportCsv,
  importCsvInput,
  insertChannel,
  removeChannel,
  clearChannelSearch,
  connectChannels,
  disconnectChannels,
  showTooltip,
  hideTooltip,
} = app;

const isActive = computed(() => activePage.value === "channels");
const setChannelRowRef = (el, index) => {
  channelRowRefs.value[index] = el;
};
</script>
