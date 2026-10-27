import React from 'react';
import { createRoot } from 'react-dom/client';
import NyagoCargoPortal from './NyagoCargoPortal.jsx';
import './index.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NyagoCargoPortal />
  </React.StrictMode>
);
