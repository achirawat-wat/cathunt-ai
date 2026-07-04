// src/app/page.tsx
'use client'

import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MapPin, Cat } from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuthStore()

  // ระหว่างโหลดข้อมูล Auth หรือตรวจสอบสถานะ ให้แสดงหน้า Loading
  if (loading || user) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-5 bg-white dark:bg-zinc-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-zinc-900 text-white animate-pulse dark:bg-white dark:text-zinc-900">
          <Cat className="h-8 w-8" />
        </div>
        <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase animate-pulse">
          LOADING...
        </p>
      </div>
    )
  }

  // หน้า Landing Page สำหรับคนที่ยังไม่ได้ล็อกอิน
  return (
    <main className="flex h-full flex-col items-center justify-between p-6 bg-white dark:bg-zinc-950">
      
      {/* Header & Logo */}
      <div className="flex w-full justify-center items-center pt-8">
        <div className="flex items-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <Cat className="h-6 w-6" />
          </div>
          <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
            CatHunt<span className="text-orange-500">.</span>
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center text-center max-w-sm px-4 my-auto space-y-8">
        
        {/* Hero Graphic (Round Square) */}
        <div className="relative">
          <div className="relative flex h-32 w-32 items-center justify-center rounded-[2rem] bg-zinc-50 dark:bg-zinc-900 text-7xl transform rotate-3 shadow-xl shadow-zinc-200/50 dark:shadow-none">
            🐱
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
            Explore your city<br/>through <span className="text-orange-500">cats.</span>
          </h1>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 max-w-[260px] mx-auto leading-relaxed">
            Discover, track, and build a community journal of street cats in the real world.
          </p>
        </div>

        <div className="w-full pt-6">
          <Button asChild className="w-full h-14 rounded-[1rem] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 transition-transform active:scale-[0.98] shadow-lg shadow-zinc-900/20 dark:shadow-white/10">
            <Link href="/login" className="flex items-center justify-center font-black tracking-wide text-base">
              GET STARTED
            </Link>
          </Button>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="w-full pb-6 flex justify-center items-center space-x-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
        <span className="flex items-center"><MapPin className="h-3 w-3 mr-1 text-orange-500" /> Real-world loop</span>
        <span>•</span>
        <span>Community</span>
      </div>

    </main>
  )
}