import { render } from 'solid-js/web';
import { App } from './App';
import '../ui/tokens.css';
import './app.css';

const root = document.querySelector('#root');
if (!root) throw new Error('App root element #root is missing');

render(() => <App />, root as HTMLElement);
