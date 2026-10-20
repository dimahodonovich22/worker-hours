import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
// Оформление Liquid Glass — подключается последним, поверх базовых стилей.
import './glass.css';

// Позицию прокрутки ленты приложение помнит само (при переходах между экранами);
// браузерное восстановление после перезагрузки открывало бы ленту не на текущей неделе.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
