'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Camera, Cat, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export default function BottomNav() {
  const pathname = usePathname()
  const { user } = useAuthStore()

  if (!user || pathname === '/login') return null

  const navItems = [
    { label: 'Feed', href: '/feed', icon: Home },
    { label: 'Explore', href: '/map', icon: Map },
    { label: 'Hunt', href: '/hunt', icon: Camera, isPrimary: true },
    { label: 'Cats', href: '/cats', icon: Cat },
    { label: 'Profile', href: '/profile', icon: User },
  ]

  return (
    // เปลี่ยนจากติดขอบล่าง เป็นแบบลอย (Floating) ห่างจากขอบล่าง 6 (24px) และมีระยะซ้าย-ขวา
    <div className="absolute bottom-6 w-full px-6 z-[999]">
      {/* กรอบ Round Square ของ Navbar */}
      <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/95 px-2 backdrop-blur-xl border border-zinc-100 shadow-2xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-none">
        
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          // ปุ่ม Hunt ปรับเป็น Round Square เหมือนกัน
          if (item.isPrimary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className="flex h-16 w-16 -translate-y-5 items-center justify-center rounded-[1.5rem] bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 ring-[6px] ring-white dark:bg-white dark:text-zinc-900 dark:ring-zinc-950 dark:shadow-white/10">
                  <Icon className="h-7 w-7" />
                </div>
              </Link>
            )
          }

          // ปุ่มปกติ
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center space-y-1 w-[3.5rem] active:scale-95 transition-transform ${
                isActive 
                  ? 'text-orange-500' 
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span className="text-[9px] font-bold tracking-wider uppercase">
                {item.label}
              </span>
            </Link>
          )
        })}

      </div>
    </div>
  )
}