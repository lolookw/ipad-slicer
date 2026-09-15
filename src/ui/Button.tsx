import { splitProps, type JSX } from 'solid-js';
import './tokens.css';

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'regular' | 'large'; loading?: boolean; icon?: JSX.Element;
};
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'loading', 'icon', 'children', 'disabled', 'class']);
  return <button {...rest} type={props.type ?? 'button'} class={`ui-target ui-button ${local.class ?? ''}`}
    data-variant={local.variant ?? 'primary'} data-size={local.size ?? 'regular'}
    disabled={local.disabled || local.loading} aria-busy={local.loading || undefined}>
    <span aria-hidden="true">{local.loading ? '…' : local.icon}</span>{local.children}
  </button>;
}
