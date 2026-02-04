<template>
  <section
    class="page"
    id="settings"
    data-page
    :class="{ active: isActive }"
    :hidden="!isActive"
  >
    <header class="page-head">
      <div>
        <p class="eyebrow">UV-K5 TOOLSET</p>
        <h1>Basic settings</h1>
        <p class="subtitle">Read and adjust core radio settings in normal mode.</p>
        <div class="hero-links">
          <a class="chip-link" href="#home">Back to tools</a>
        </div>
      </div>

      <section class="status-card status-split">
        <div class="status-main">
          <div class="status-top">
            <span
              class="status-dot"
              id="settingsStatusDot"
              :data-status="isConnected ? 'connected' : 'disconnected'"
            ></span>
            <span id="settingsStatusLabel">{{ isConnected ? "Connected" : "Disconnected" }}</span>
          </div>
          <p id="settingsDeviceInfo" class="muted">{{ deviceInfoText }}</p>
          <div class="status-actions">
            <div class="field-group status-serial">
              <label for="settingsBaudSelect">Speed</label>
              <select id="settingsBaudSelect" v-model="baud" :disabled="isConnected">
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
            <button
              id="settingsConnect"
              class="primary"
              :disabled="isConnected"
              @click="connectSettings"
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
              id="settingsDisconnect"
              class="ghost"
              :disabled="!isConnected"
              @click="disconnectSettings"
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
              <div id="settingsFirmware">{{ firmwareLabel }}</div>
            </div>
          </div>
        </div>
      </section>
    </header>

    <section class="panel settings-panel" id="settingsPanel" :class="{ 'is-locked': !settingsEditable }">
      <div class="channel-actions">
        <div class="action-group">
          <button
            id="readSettingsBtn"
            class="primary"
            :disabled="settingsBusy || !isConnected"
            @click="readSettings"
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
            id="writeSettingsBtn"
            :disabled="settingsBusy || !isConnected || !settingsCanEdit"
            @click="writeSettings"
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
        <div class="action-group"></div>
      </div>

      <div class="channel-status">
        <span
          id="settingsStatus"
          :class="{
            'status-error': settingsStatusTone === 'error',
            'status-warning': settingsStatusTone === 'warning',
          }"
        >
          {{ settingsStatus }}
        </span>
        <div class="progress" id="settingsProgress" :class="{ active: settingsProgressVisible }">
          <div class="progress-label">
            <span>Progress&nbsp;</span>
            <span id="settingsPct">{{ formatPercent(settingsProgress) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="settingsFill" :style="{ width: `${settingsProgress}%` }"></div>
          </div>
        </div>
      </div>

      <div class="settings-grid">
        <section class="settings-zone">
          <h3>F4HWN settings</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Define power value when user selection is selected (SetPwr)</span>
              <select id="setPwr" v-model="settingsForm.setPwr" :disabled="!settingsEditable">
                <option v-for="item in setLowList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>PTT key operating mode (SetPtt)</span>
              <select id="setPtt" v-model="settingsForm.setPtt" :disabled="!settingsEditable">
                <option v-for="item in setPttList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>TX timeout indicator (SetTot)</span>
              <select id="setTot" v-model="settingsForm.setTot" :disabled="!settingsEditable">
                <option v-for="item in setTotEotList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>End of transmission indicator (SetEot)</span>
              <select id="setEot" v-model="settingsForm.setEot" :disabled="!settingsEditable">
                <option v-for="item in setTotEotList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Contrast level (SetCtr)</span>
              <select id="setContrast" v-model="settingsForm.setContrast" :disabled="!settingsEditable">
                <option v-for="item in contrastList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Invert display (SetInv)</span>
              <select id="setInv" v-model="settingsForm.setInv" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Lock PTT when keypad is locked (SetLck)</span>
              <select id="setLck" v-model="settingsForm.setLck" :disabled="!settingsEditable">
                <option v-for="item in setLckList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>S-meter display style (SetMet)</span>
              <select id="setMet" v-model="settingsForm.setMet" :disabled="!settingsEditable">
                <option v-for="item in setMetList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Display text style (SetGui)</span>
              <select id="setGui" v-model="settingsForm.setGui" :disabled="!settingsEditable">
                <option v-for="item in setMetList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Set timer (SetTmr)</span>
              <select id="setTmr" v-model="settingsForm.setTmr" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Set off timer (SetOff)</span>
              <select id="setOff" v-model="settingsForm.setOff" :disabled="!settingsEditable">
                <option v-for="item in setOffTmrList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Set NFM (SetNFM)</span>
              <select id="setNfm" v-model="settingsForm.setNfm" :disabled="!settingsEditable">
                <option v-for="item in setNfmList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="settings-zone">
          <h3>General settings</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Squelch (Sql)</span>
              <select id="squelch" v-model="settingsForm.squelch" :disabled="!settingsEditable">
                <option v-for="item in squelchList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>RX mode (RX MODE)</span>
              <select id="rxMode" v-model="settingsForm.rxMode" :disabled="!settingsEditable">
                <option v-for="item in rxModeList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>One-key call channel (1 Call)</span>
              <select id="callChannel" v-model="settingsForm.callChannel" :disabled="!settingsEditable">
                <option v-for="item in callChannelList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Auto lock keypad after delay (KeyLck)</span>
              <select id="autoKeypad" v-model="settingsForm.autoKeypad" :disabled="!settingsEditable">
                <option v-for="item in autoKeypadLockList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Max TX timeout (TxTOut)</span>
              <select id="txTimeout" v-model="settingsForm.txTimeout" :disabled="!settingsEditable">
                <option v-for="item in talkTimeList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Battery saver (BatSav)</span>
              <select id="batSave" v-model="settingsForm.batSave" :disabled="!settingsEditable">
                <option v-for="item in batSaveList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Battery type</span>
              <select id="batteryType" v-model="settingsForm.batteryType" :disabled="!settingsEditable">
                <option v-for="item in batteryTypeList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Scan resume mode (ScnRev)</span>
              <select id="scanResume" v-model="settingsForm.scanResume" :disabled="!settingsEditable">
                <option v-for="item in scanResumeList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>AM reception fix (AM Fix)</span>
              <select id="amFix" v-model="settingsForm.amFix" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="settings-zone">
          <h3>Display settings</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Battery text (BatTxt)</span>
              <select id="batText" v-model="settingsForm.batText" :disabled="!settingsEditable">
                <option v-for="item in batTxtList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Mic bar (MicBar)</span>
              <select id="micBar" v-model="settingsForm.micBar" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Channel display mode (CH DISP)</span>
              <select id="chDisp" v-model="settingsForm.chDisp" :disabled="!settingsEditable">
                <option v-for="item in channelDispList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Power-on display (POnMsg)</span>
              <select id="pOnMsg" v-model="settingsForm.pOnMsg" :disabled="!settingsEditable">
                <option v-for="item in welcomeList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Message line 1 (12 chars) also used in SMR for station identification</span>
              <input id="logo1" type="text" maxlength="12" v-model="settingsForm.logo1" :disabled="!settingsEditable" />
            </label>
            <label class="settings-field">
              <span>Message line 2 (12 chars)</span>
              <input id="logo2" type="text" maxlength="12" v-model="settingsForm.logo2" :disabled="!settingsEditable" />
            </label>
          </div>
        </section>

        <section class="settings-zone">
          <h3>Backlight settings</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Backlight time (BLTime)</span>
              <select id="backlightTime" v-model="settingsForm.backlightTime" :disabled="!settingsEditable">
                <option v-for="item in backlightList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Minimum backlight level (BLMin)</span>
              <select id="blMin" v-model="settingsForm.blMin" :disabled="!settingsEditable">
                <option v-for="item in backlightLevelList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Maximum backlight level (BLMax)</span>
              <select id="blMax" v-model="settingsForm.blMax" :disabled="!settingsEditable">
                <option v-for="item in backlightLevelList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Backlight on TX/RX (BLTxRx)</span>
              <select id="blTxRx" v-model="settingsForm.blTxRx" :disabled="!settingsEditable">
                <option v-for="item in backlightTxRxList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="settings-zone">
          <h3>Audio settings</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Mic gain (Mic)</span>
              <select id="micGain" v-model="settingsForm.micGain" :disabled="!settingsEditable">
                <option v-for="item in micGainList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Keypad beep (Beep)</span>
              <select id="beep" v-model="settingsForm.beep" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>End of transmission beep (Roger)</span>
              <select id="roger" v-model="settingsForm.roger" :disabled="!settingsEditable">
                <option v-for="item in rogerList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Squelch tail elimination (STE)</span>
              <select id="ste" v-model="settingsForm.ste" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Repeater squelch tail elimination (RP STE)</span>
              <select id="rpSte" v-model="settingsForm.rpSte" :disabled="!settingsEditable">
                <option v-for="item in rteList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="settings-zone">
          <h3>Radio state</h3>
          <div class="settings-fields">
            <label class="settings-field">
              <span>Main VFO (TX VFO)</span>
              <select id="txVfo" v-model="settingsForm.txVfo" :disabled="!settingsEditable">
                <option v-for="item in txVfoList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Keypad locked</span>
              <select id="keypadLock" v-model="settingsForm.keypadLock" :disabled="!settingsEditable">
                <option v-for="item in setOffOnList" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>
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
  settingsError,
  settingsStatus,
  settingsStatusTone,
  settingsProgress,
  settingsProgressVisible,
  settingsForm,
  settingsEditable,
  settingsCanEdit,
  settingsBusy,
  readSettings,
  writeSettings,
  connectSettings,
  disconnectSettings,
  setLowList,
  setPttList,
  setTotEotList,
  setOffOnList,
  setLckList,
  setMetList,
  setNfmList,
  squelchList,
  rxModeList,
  callChannelList,
  autoKeypadLockList,
  talkTimeList,
  batSaveList,
  batteryTypeList,
  scanResumeList,
  batTxtList,
  micGainList,
  rogerList,
  rteList,
  welcomeList,
  channelDispList,
  backlightList,
  backlightLevelList,
  backlightTxRxList,
  txVfoList,
  contrastList,
  formatPercent,
} = app;

const isActive = computed(() => activePage.value === "settings");
</script>
