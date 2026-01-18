<template>
  <footer class="footer">
    <span>
      Copyright {{ currentYear }}
      <a href="https://www.joaquim.org" target="_blank" rel="noopener">joaquim.org</a>
    </span>
    <span aria-hidden="true">&bull;</span>
    <span class="footer-note">
      Tools intended for use with firmware
      <a href="https://github.com/joaquimorg/UV-KX-firmware" target="_blank" rel="noopener"
        >github.com/joaquimorg/UV-KX-firmware</a
      >
    </span>
    <span class="footer-note">
      Web tool for other models and different firmware use
      <a href="https://spm81.github.io/Multi-UVTools" target="_blank" rel="noopener"
        >spm81.github.io/Multi-UVTools</a
      >
    </span>
  </footer>
</template>

<script setup>
import { inject } from "vue";
import { AppStateKey } from "../state/appStateKey.js";

const app = inject(AppStateKey);
if (!app) {
  throw new Error("App state not provided.");
}

const { currentYear } = app;
</script>
