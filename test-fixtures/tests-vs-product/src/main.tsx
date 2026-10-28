import { Panel } from './components/Panel';
import { loadState } from './store/state';
export const App = () => Panel({ state: loadState() });
