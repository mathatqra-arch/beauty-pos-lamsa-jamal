'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Download, X, Monitor, Smartphone, Chrome, ArrowLeft, Check } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true) {
      setIsInstalled(true)
      return
    }

    // Check if dismissed recently (5 minutes)
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed)
      if (Date.now() - dismissedTime < 5 * 60 * 1000) {
        return
      }
    }

    // Listen for native install prompt (shows install icon in URL bar)
    const handler = (e: Event) => {
      e.preventDefault() // Prevent default browser prompt
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true) // Show our custom banner
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowBanner(false)
    })

    // If no native prompt after 5 seconds, show guide banner
    const timer = setTimeout(() => {
      if (!deferredPrompt && !isInstalled) {
        const dismissed = localStorage.getItem('pwa-install-dismissed')
        if (!dismissed || Date.now() - parseInt(dismissed) > 5 * 60 * 1000) {
          setShowBanner(true)
        }
      }
    }, 5000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Native prompt available — try to use it
      try {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setIsInstalled(true)
        }
        setDeferredPrompt(null)
        setShowBanner(false)
      } catch (e) {
        // prompt() failed — show guide instead
        console.error('[PWA] Install prompt failed:', e)
        setShowGuide(true)
      }
    } else {
      // No native prompt — show step-by-step guide
      setShowGuide(true)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  if (isInstalled || !showBanner) return null

  return (
    <>
      {/* Banner at bottom */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4 no-print">
        <Card className="shadow-2xl border-primary/40 bg-card/95 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm">ثبّت التطبيق على جهازك</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {deferredPrompt
                    ? 'اضغط "تثبيت الآن" لتثبيت التطبيق كبرنامج مستقل'
                    : 'يعمل بدون إنترنت ويظهر كأيقونة على سطح المكتب'}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="h-8 text-xs" onClick={handleInstallClick}>
                    <Download className="w-3.5 h-3.5 ml-1" />
                    {deferredPrompt ? 'تثبيت الآن' : 'كيف أثبّت؟'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleDismiss}>
                    لاحقاً
                  </Button>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleDismiss}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step-by-step installation guide */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              كيف تثبّت التطبيق
            </DialogTitle>
            <DialogDescription>
              ثبّت "لمسة جمال" كتطبيق مستقل يعمل بدون إنترنت
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Chrome / Edge Desktop */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Chrome className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-sm">على الكمبيوتر (Chrome / Edge)</h4>
              </div>
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>اضغط على أيقونة التثبيت <Download className="w-4 h-4 inline mx-1 text-primary" /> في شريط العنوان (يمين عنوان الموقع)</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span>أو من القائمة <span className="font-mono bg-muted px-1 rounded">⋮</span> اختر "تثبيت التطبيق"</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>اضغط "تثبيت" في النافذة المنبثقة</span>
                </li>
              </ol>
            </div>

            {/* Mobile */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-green-500" />
                <h4 className="font-bold text-sm">على الموبايل</h4>
              </div>
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>اضغط على القائمة <span className="font-mono bg-muted px-1 rounded">⋮</span> في المتصفح</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span>اختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق"</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>سيظهر التطبيق كأيقونة على شاشتك</span>
                </li>
              </ol>
            </div>

            {/* Benefits */}
            <div className="bg-primary/5 rounded-lg p-3 space-y-1.5">
              <p className="text-sm font-medium text-primary">مميزات التطبيق المثبت:</p>
              <div className="flex items-center gap-2 text-xs">
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span>يعمل بدون إنترنت بالكامل</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span>يفتح بسرعة من سطح المكتب</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span>بدون شريط المتصفح (شاشة كاملة)</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowGuide(false)}>
              فهمت
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
