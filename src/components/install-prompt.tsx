// src/components/install-prompt.tsx
'use client'

import { useState, useEffect } from 'react'
import { Share, PlusSquare, X, Smartphone } from 'lucide-react'

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // 1. เช็คว่าโหลดแบบ App อยู่หรือเปล่า
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone)
    
    // 2. เช็คว่าเคยกดปิดไปหรือยัง
    const hasSeenPrompt = localStorage.getItem('hasSeenInstallPrompt')

    // 3. เช็คว่าเป็นเครื่อง iOS (iPhone/iPad) เท่านั้น
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)

    // 🌟 โชว์ Popup เฉพาะเมื่อ: ยังไม่ติดตั้ง + ยังไม่เคยปิด + เป็น iOS
    if (!isStandalone && !hasSeenPrompt && isIOSDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('hasSeenInstallPrompt', 'true')
  }

  // ถ้า showPrompt เป็น false (รวมถึงพวก Android/PC ด้วย) จะไม่แสดงอะไรเลย
  if (!showPrompt) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        
        {/* Close Button */}
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/20 rounded-[1.2rem] flex items-center justify-center mb-4">
            <Smartphone className="w-8 h-8 text-orange-500" />
          </div>
          
          <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">
            Install CatHunt App!
          </h3>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-6">
            Add to your home screen for a smoother experience, faster camera access, and one-tap launching.
          </p>

          {/* Instructions (ดีไซน์ที่แก้ไขแล้ว โชว์เฉพาะ iOS) */}
          <div className="w-full bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-5 text-left border border-zinc-100 dark:border-zinc-800">
            <ol className="space-y-4 text-base font-bold text-zinc-900 dark:text-white">
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-300 mr-4">1</span>
                  Share
                </div>
                <Share className="w-6 h-6 text-blue-500" />
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-300 mr-4">2</span>
                  Add to Home Screen
                </div>
                <PlusSquare className="w-6 h-6 text-zinc-900 dark:text-white" />
              </li>
            </ol>
          </div>

          <button 
            onClick={handleDismiss}
            className="w-full mt-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 h-14 rounded-2xl font-black text-sm active:scale-95 transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}