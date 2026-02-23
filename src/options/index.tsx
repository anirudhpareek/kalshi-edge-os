import React from 'react';
import ReactDOM from 'react-dom/client';
import Options from './Options';
import '../ui/styles/app.css';

const root = document.getElementById('options-root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>
  );
}
