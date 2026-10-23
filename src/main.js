import { createApp } from 'vue';
import 'xfina-ui/style.css';
import './style.css';

// Every Labs page mounts one component into #app: `mount(Component)`.
export function mount(component) {
  createApp(component).mount('#app');
}
