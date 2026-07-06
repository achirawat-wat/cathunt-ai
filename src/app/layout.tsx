// src/app/layout.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import BottomNav from '@/components/bottom-nav'
import InstallPrompt from '@/components/install-prompt'
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading, setUser, setProfile, setLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  // 1. ระบบเช็ค Auth
  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(data)
    }

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        setUser(null)
      }
      setLoading(false)
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. ระบบ Route Guard
  useEffect(() => {
    if (loading) return 

    // 🛡️ กำหนดหน้าอนุญาตสำหรับคนที่ยังไม่ล็อกอิน
    const publicRoutes = ['/', '/login']
    const isPublicRoute = publicRoutes.includes(pathname)

    if (!user && !isPublicRoute) {
      // ถ้าไม่ได้ล็อกอิน และเข้าหน้าแปลกๆ -> เตะกลับหน้าแรก
      router.push('/')
    } else if (user && isPublicRoute) {
      // ถ้าล็อกอินแล้ว แต่เผลอเปิดมาหน้าแรกหรือหน้า Login -> พาไปหน้า Feed
      router.push('/feed')
    }
  }, [user, loading, pathname, router])

  // ซ่อน BottomNav เฉพาะหน้าที่ไม่อยากให้โชว์
  const hideBottomNavRoutes = ['/', '/login']
  const shouldShowBottomNav = !hideBottomNavRoutes.includes(pathname)

  return (
    <html lang="en">
      <body className="flex justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="relative flex h-screen w-full max-w-[500px] flex-col bg-white shadow-xl dark:bg-zinc-900 border-x border-zinc-200 dark:border-zinc-800 overflow-hidden">
          
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {children}
            <InstallPrompt />
          </div>

          {shouldShowBottomNav && <BottomNav />}
          
        </div>
      </body>
    </html>
  );
}