
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// إخفاء شاشة التحميل فور بدء التنفيذ
if (typeof (window as any).hideAppLoader === 'function') {
    (window as any).hideAppLoader();
} else {
    const el = document.getElementById('app-loader');
    if (el) el.remove();
}
