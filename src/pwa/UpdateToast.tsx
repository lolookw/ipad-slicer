import { Show, type JSX } from 'solid-js';
import { Button } from '../ui';

export interface UpdateToastLabels { message: string; update: string; dismiss: string }
export interface UpdateToastProps {
  open: boolean;
  labels: UpdateToastLabels;
  onAccept(): void;
  onDismiss(): void;
}

/** Presentational, dismissible "a new version is ready" toast. Accepting defers while the engine is busy (the container decides that; see `register.ts`'s `createUpdateGate`). */
export function UpdateToast(props: UpdateToastProps): JSX.Element {
  return (
    <Show when={props.open}>
      <div class="update-toast" role="status">
        <p>{props.labels.message}</p>
        <div class="update-toast-actions">
          <Button variant="primary" onClick={() => props.onAccept()}>{props.labels.update}</Button>
          <Button variant="ghost" onClick={() => props.onDismiss()}>{props.labels.dismiss}</Button>
        </div>
      </div>
    </Show>
  );
}
