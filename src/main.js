import { createApp } from "vue";
import App from "./App.vue";
import Toast, { POSITION } from "vue-toastification";
import "vue-toastification/dist/index.css";
import "./styles.css";

const app = createApp(App);
app.use(Toast, {
  position: POSITION.TOP_CENTER,
  timeout: false,
  closeOnClick: false,
  hideProgressBar: true,
  draggable: true,
});
app.mount("#app");
