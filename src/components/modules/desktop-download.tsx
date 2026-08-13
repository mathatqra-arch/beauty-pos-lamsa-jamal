'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Download, Monitor, Smartphone, Chrome, Terminal, Copy, Check,
  HardDrive, Database, Wifi, WifiOff, Cpu
} from 'lucide-react'
import { toast } from 'sonner'

export function DesktopDownload() {
  const [copied, setCopied] = useState(false)
  const [os, setOs] = useState<string>('')

  useEffect(() => {
    const ua = navigator.userAgent
    if (ua.includes('Windows')) setOs('windows')
    else if (ua.includes('Mac')) setOs('mac')
    else if (ua.includes('Linux')) setOs('linux')
  }, [])

  const commands = `# 1. تثبيت المتطلبات
npm install -g @tauri-apps/cli
npm install

# 2. بناء برنامج الديسكتوب
npm run tauri:build

# 3. ستجد الملف التنفيذي في:
# src-tauri/target/release/bundle/nsis/Lamsa Jamal POS_1.0.0_x64-setup.exe`

  const copyCommands = () => {
    navigator.clipboard.writeText(commands)
    setCopied(true)
    toast.success('تم نسخ الأوامر')
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
          <Monitor className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold">تحميل برنامج الديسكتوب</h1>
        <p className="text-muted-foreground mt-2">
          ثبّت "لمسة جمال" كبرنامج Windows يعمل بدون إنترنت بالكامل
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-primary/20">
          <CardContent className="p-4 text-center">
            <HardDrive className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="font-medium text-sm">قاعدة بيانات محلية</p>
            <p className="text-xs text-muted-foreground mt-1">SQLite على جهازك</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardContent className="p-4 text-center">
            <WifiOff className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="font-medium text-sm">يعمل بدون إنترنت</p>
            <p className="text-xs text-muted-foreground mt-1">كل العمليات محلياً</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardContent className="p-4 text-center">
            <Database className="w-8 h-8 mx-auto text-primary mb-2" />
            <p className="font-medium text-sm">مزامنة تلقائية</p>
            <p className="text-xs text-muted-foreground mt-1">عند عودة الإنترنت</p>
          </CardContent>
        </Card>
      </div>

      {/* Build Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            طريقة بناء البرنامج
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted rounded-lg p-4 font-mono text-xs space-y-2" dir="ltr">
            <p className="text-muted-foreground"># 1. تثبيت المتطلبات</p>
            <p><span className="text-green-600">npm</span> install -g @tauri-apps/cli</p>
            <p><span className="text-green-600">npm</span> install</p>
            <p className="text-muted-foreground mt-2"># 2. بناء برنامج الديسكتوب</p>
            <p><span className="text-green-600">npm</span> run tauri:build</p>
            <p className="text-muted-foreground mt-2"># 3. الملف التنفيذي:</p>
            <p className="text-blue-600">src-tauri/target/release/bundle/nsis/</p>
            <p className="text-blue-600">Lamsa Jamal POS_1.0.0_x64-setup.exe</p>
          </div>

          <Button className="w-full" onClick={copyCommands} variant={copied ? 'default' : 'outline'}>
            {copied ? (
              <><Check className="w-4 h-4 ml-2" />تم النسخ</>
            ) : (
              <><Copy className="w-4 h-4 ml-2" />نسخ الأوامر</>
            )}
          </Button>

          <div className="bg-amber-500/10 p-3 rounded-lg text-sm">
            <p className="font-medium text-amber-700 mb-1">📋 المتطلبات:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Rust</strong> — من <a href="https://rustup.rs" target="_blank" className="text-primary underline">rustup.rs</a></li>
              <li>• <strong>Node.js 18+</strong></li>
              <li>• <strong>Windows:</strong> Visual Studio C++ Build Tools</li>
              <li>• <strong>Mac:</strong> Xcode Command Line Tools</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">مقارنة: متصفح vs ديسكتوب</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm">قاعدة البيانات</span>
              <div className="flex gap-2">
                <Badge variant="outline">متصفح: IndexedDB</Badge>
                <Badge variant="default">ديسكتوب: SQLite</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm">العمل بدون إنترنت</span>
              <div className="flex gap-2">
                <Badge variant="outline">متصفح: جزئي</Badge>
                <Badge variant="default">ديسكتوب: كامل</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm">الطابعة الحرارية</span>
              <div className="flex gap-2">
                <Badge variant="outline">متصفح: window.print</Badge>
                <Badge variant="default">ديسكتوب: ESC/POS مباشر</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm">درج النقود</span>
              <div className="flex gap-2">
                <Badge variant="outline">متصفح: محاكاة</Badge>
                <Badge variant="default">ديسكتوب: تحكم مباشر</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm">التثبيت</span>
              <div className="flex gap-2">
                <Badge variant="outline">متصفح: PWA</Badge>
                <Badge variant="default">ديسكتوب: .exe installer</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current mode */}
      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm font-medium">أنت تعمل الآن في وضع:</p>
              <p className="text-lg font-bold text-primary">
                {typeof window !== 'undefined' && '__TAURI__' in window
                  ? '🖥️ برنامج ديسكتوب'
                  : window?.matchMedia?.('(display-mode: standalone)')?.matches
                    ? '📱 تطبيق مثبت (PWA)'
                    : '🌐 متصفح ويب'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
