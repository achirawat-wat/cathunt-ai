// src/app/login/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { Cat, ArrowLeft, Loader2, CheckCircle2, Sparkles, KeyRound } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('') // 🔐 ใช้เฉพาะตอนสมัคร
  const [isSignUp, setIsSignUp] = useState(false)

  const [loading, setLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const router = useRouter()

  // 🧹 ฟังก์ชันจัดการ Username สดๆ ตอนพิมพ์ (ตัดช่องว่าง, พิมพ์เล็ก, ลบอักขระพิเศษ)
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value
    const formatted = rawValue.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(formatted)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    if (username.length < 3) {
      setErrorMsg('Username must be at least 3 characters.')
      setLoading(false)
      return
    }

    // 🔐 เช็ค Confirm Password เฉพาะตอนสมัครสมาชิก
    if (isSignUp && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      setLoading(false)
      return
    }

    // 🔗 สร้าง Email ปลอมเพื่อให้ตรงกับ Trigger ใน DB (เช่น millbcc@cathunt.local)
    const fakeEmail = `${username}@cathunt.local`

    try {
      if (isSignUp) {
        // 1. 🚀 สมัครสมาชิกใหม่ (ส่งแค่ Email, DB Trigger จะสร้าง Profile ให้เอง!)
        const { error } = await supabase.auth.signUp({
          email: fakeEmail,
          password,
        })
        if (error) throw error

        triggerSuccess('/map') // สมัครเสร็จ ไปหน้าสำรวจแมว

      } else {
        // 2. 🔑 เข้าสู่ระบบปกติ
        const { error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password,
        })
        if (error) throw error

        triggerSuccess('/feed') // ล็อกอินเสร็จ ไปหน้า Feed
      }
    } catch (error: any) {
      // 🛡️ ดักจับ Error ให้อ่านง่ายสำหรับผู้ใช้
      if (error.message.includes('Invalid login credentials')) {
        setErrorMsg('Incorrect username or password.')
      } else if (error.message.includes('User already registered')) {
        setErrorMsg('This username is already taken. Try another!')
      } else {
        setErrorMsg(error.message)
      }
      setLoading(false)
    }
  }

  // ✨ ฟังก์ชันสร้าง Success แอนิเมชันก่อนเปลี่ยนหน้า
  const triggerSuccess = (path: string) => {
    setIsSuccess(true)
    setTimeout(() => {
      router.push(path)
    }, 1000) // หน่วงเวลา 1 วินาทีให้เห็นเครื่องหมายถูก
  }

  // 🔁 สลับโหมด login/signup พร้อมล้างค่าฟอร์มทั้งหมด
  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setErrorMsg('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
  }

  // 🎨 ตัวแปรควบคุมธีมสีตามโหมด: Login = zinc (นิ่ง, น่าเชื่อถือ), Signup = orange (สดใส, ตื่นเต้น)
  const accent = isSignUp
    ? {
        iconBg: 'bg-orange-500 text-white dark:bg-orange-500 dark:text-white',
        iconRotate: '-rotate-3 hover:-rotate-6',
        ring: 'focus-visible:ring-orange-500/50',
        button: 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30',
        blobA: 'bg-orange-500/15',
        blobB: 'bg-orange-300/10 dark:bg-orange-500/10',
        badge: 'bg-orange-500 text-white',
        toggleHover: 'hover:text-orange-500 dark:hover:text-orange-500',
      }
    : {
        iconBg: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
        iconRotate: 'rotate-3 hover:rotate-6',
        ring: 'focus-visible:ring-zinc-900/30 dark:focus-visible:ring-white/30',
        button: 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/20 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:shadow-white/10',
        blobA: 'bg-zinc-400/10 dark:bg-zinc-700/20',
        blobB: 'bg-orange-500/10',
        badge: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
        toggleHover: 'hover:text-orange-500 dark:hover:text-orange-500',
      }

  return (
    <div className="flex h-full flex-col bg-zinc-50 px-6 py-4 dark:bg-zinc-950 relative overflow-hidden">

      {/* 🌟 Background Decorations (วงกลมเบลอๆ พื้นหลัง, สลับสีตามโหมด) */}
      <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${accent.blobA}`}></div>
      <div className={`absolute top-1/2 -right-32 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${accent.blobB}`}></div>

      {/* Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <Link
          href="/"
          className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-white text-zinc-900 shadow-sm border border-zinc-100 active:scale-95 transition-transform dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      {/* 🏷️ Mode badge มุมขวาบน บอกโหมดปัจจุบันชัดๆ */}
      <div className="absolute top-6 right-6 z-10">
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-colors duration-300 ${accent.badge}`}>
          {isSignUp ? 'New Hunter' : 'Sign In'}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center w-full max-w-sm mx-auto z-10 pt-10">

        {/* Header */}
        <div className="mb-10 flex flex-col items-center space-y-5 text-center">
          <div className="relative">
            <div className={`flex h-20 w-20 items-center justify-center rounded-[1.5rem] transform transition-all duration-300 shadow-2xl ${accent.iconBg} ${accent.iconRotate}`}>
              <Cat className="h-10 w-10" />
            </div>
            {isSignUp && (
              <div className="absolute -top-2 -right-2 bg-orange-500 text-white p-1.5 rounded-full animate-bounce shadow-lg shadow-orange-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
              {isSignUp ? 'Join the Hunt' : 'Welcome Back'}
              <span className={isSignUp ? 'text-orange-500' : 'text-orange-500'}>.</span>
            </h1>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {isSignUp ? 'Create your unique hunter ID.' : 'Sign in to continue exploring.'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-[11px] font-black tracking-widest uppercase text-zinc-400 pl-1">
              Hunter ID (Username)
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">@</span>
              <Input
                id="username"
                type="text"
                placeholder="catlover99"
                value={username}
                onChange={handleUsernameChange}
                required
                minLength={3}
                disabled={loading || isSuccess}
                className={`h-14 rounded-[1.2rem] bg-white border border-zinc-100 shadow-sm focus-visible:ring-2 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white text-base pl-9 transition-all font-bold ${accent.ring}`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[11px] font-black tracking-widest uppercase text-zinc-400 pl-1">
              Passcode
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading || isSuccess}
              placeholder="••••••••"
              className={`h-14 rounded-[1.2rem] bg-white border border-zinc-100 shadow-sm focus-visible:ring-2 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white text-base px-4 transition-all ${accent.ring}`}
            />
          </div>

          {/* 🔐 Confirm Password: โผล่มาเฉพาะตอนสมัครสมาชิก */}
          {isSignUp && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label htmlFor="confirmPassword" className="text-[11px] font-black tracking-widest uppercase text-zinc-400 pl-1 flex items-center space-x-1.5">
                <KeyRound className="h-3 w-3" />
                <span>Confirm Passcode</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading || isSuccess}
                placeholder="••••••••"
                className={`h-14 rounded-[1.2rem] bg-white border shadow-sm focus-visible:ring-2 dark:bg-zinc-900 dark:text-white text-base px-4 transition-all ${accent.ring} ${
                  confirmPassword.length > 0 && confirmPassword !== password
                    ? 'border-red-300 dark:border-red-500/50'
                    : 'border-zinc-100 dark:border-zinc-800'
                }`}
              />
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-[11px] text-red-500 font-bold pl-1">Passwords don't match yet</p>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="rounded-[1rem] bg-red-50 border border-red-100 p-3 text-center animate-in fade-in slide-in-from-top-2 dark:bg-red-500/10 dark:border-red-500/20">
              <p className="text-xs text-red-600 font-bold dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          {/* Submit Button (Dynamic State) */}
          <Button
            type="submit"
            disabled={
              loading ||
              isSuccess ||
              !username ||
              !password ||
              (isSignUp && (!confirmPassword || password !== confirmPassword))
            }
            className={`w-full h-14 mt-4 rounded-[1.2rem] font-black tracking-widest text-[11px] uppercase transition-all duration-300 shadow-lg active:scale-[0.98] ${
              isSuccess
                ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30 scale-[0.98]'
                : accent.button
            }`}
          >
            {isSuccess ? (
              <div className="flex items-center justify-center space-x-2 animate-in zoom-in">
                <CheckCircle2 className="h-5 w-5" />
                <span>{isSignUp ? 'ACCOUNT CREATED!' : 'WELCOME BACK!'}</span>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>PROCESSING...</span>
              </div>
            ) : (
              <span>{isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}</span>
            )}
          </Button>
        </form>

        {/* Toggle Sign Up / Sign In */}
        <div className="mt-8 text-center text-sm">
          <span className="text-zinc-500 font-medium">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            type="button"
            disabled={loading || isSuccess}
            onClick={toggleMode}
            className={`font-black text-zinc-900 active:scale-95 inline-block transition-transform dark:text-white ml-1 disabled:opacity-50 ${accent.toggleHover}`}
          >
            {isSignUp ? 'SIGN IN' : 'SIGN UP'}
          </button>
        </div>

      </div>
    </div>
  )
}