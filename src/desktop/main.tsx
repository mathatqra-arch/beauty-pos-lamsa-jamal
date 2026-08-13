// ============================================================
// DESKTOP ENTRY POINT — TAURI APPLICATION
// ============================================================
// This renders the same React app as Next.js, but without
// the Next.js server. It uses the same components and
// routes them client-side.
// ============================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import '../app/globals.css'

// Import the main page component (which handles auth + routing internally)
import App from './desktop-app'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
