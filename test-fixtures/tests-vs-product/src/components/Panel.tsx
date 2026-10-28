import { formatTitle } from '../utils/format';
export function Panel(props: { state: string }) {
  return formatTitle(props.state);
}
