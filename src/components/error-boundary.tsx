'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// ============================================================
// ERROR BOUNDARY — Prevents white-screen crashes
// ============================================================
// Wraps the entire app. If any component throws during render,
// this boundary catches it and shows a friendly error screen
// instead of a blank white page.
//
// The cashier can retry, which remounts the tree.
// ============================================================

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorId: string | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorId: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Generate a unique error ID for support/debugging
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    return { hasError: true, error, errorId }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for debugging (server logs in production)
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  retry = () => {
    this.setState({ hasError: false, error: null, errorId: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback
        return <Fallback error={this.state.error} retry={this.retry} />
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4" dir="rtl">
          <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-8 shadow-lg text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-gray-900">حدث خطأ غير متوقع</h2>
            <p className="mb-1 text-sm text-gray-600">
              النظام واجه مشكلة. يمكنك المحاولة مرة أخرى.
            </p>
            {this.state.errorId && (
              <p className="mb-4 font-mono text-xs text-gray-400">
                رقم الخطأ: {this.state.errorId}
              </p>
            )}
            <Button onClick={this.retry} className="w-full">
              <RefreshCw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================
// MODULE ERROR BOUNDARY — For individual modules
// ============================================================
// Wraps a single module (e.g. POS, Products). If that module
// crashes, only it shows the error — the rest of the app works.
// ============================================================

export function ModuleErrorBoundary({ children, moduleName }: { children: React.ReactNode; moduleName: string }) {
  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <div className="flex min-h-[400px] items-center justify-center p-4" dir="rtl">
          <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-6 shadow text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">
              خطأ في وحدة {moduleName}
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              حدث خطأ أثناء تحميل هذه الوحدة. يمكنك المحاولة مرة أخرى.
            </p>
            <Button onClick={retry} variant="outline">
              <RefreshCw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
