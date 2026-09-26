import { createApp } from 'vue';
import './style.css';
import './labs.css';

// Every Labs page mounts one component into #app: `mount(Component)`.
export function mount(component) {
  createApp(component).mount('#app');
}
