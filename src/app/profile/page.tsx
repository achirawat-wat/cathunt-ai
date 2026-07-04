// src/app/profile/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Settings, LogOut, Compass, Heart, Camera, Loader2, Cat } from 'lucide-react'

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export default function ProfilePage() {
  // 🚀 เพิ่ม setProfile มาจาก Zustand เพื่ออัปเดตข้อมูลแบบ Real-time เมื่ออัปรูปเสร็จ
  const { user, profile: globalProfile, loading: authLoading, setProfile } = useAuthStore()
  
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites'>('posts')
  const [myPosts, setMyPosts] = useState<any[]>([])
  const [stats, setStats] = useState({ discovered: 0, total: 0 })
  const [isFetchingPosts, setIsFetchingPosts] = useState(true)
  
  const [avatarError, setAvatarError] = useState(false)
  // 📸 State และ Ref สำหรับระบบอัปโหลดรูป
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authLoading || !user) return;
    fetchUserPosts(user.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  const fetchUserPosts = async (userId: string) => {
    try {
      setIsFetchingPosts(true)
      const { data, error } = await supabase
        .from('encounters')
        .select(`
          id,
          image_url,
          created_at,
          likes_count,
          cats ( id, name )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        const formattedPosts = data.map((post: any) => {
          const catInfo = Array.isArray(post.cats) ? post.cats[0] : post.cats;
          return {
            id: post.id,
            title: catInfo?.name || 'Unknown Cat',
            catId: catInfo?.id,
            time: timeAgo(post.created_at),
            img: post.image_url,
            likes: post.likes_count || 0
          }
        })
        
        setMyPosts(formattedPosts)
        
        const catsFoundCount = globalProfile?.cats_found || 0
        setStats({
          discovered: catsFoundCount || new Set(formattedPosts.map(p => p.catId).filter(Boolean)).size,
          total: formattedPosts.length
        })
      }
    } catch (err) {
      console.error('Error fetching posts:', err)
    } finally {
      setIsFetchingPosts(false)
    }
  }

  // 🚀 ฟังก์ชันจัดการการอัปโหลดรูป Profile
const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0 || !user) return

      setIsUploadingAvatar(true)
      setAvatarError(false)

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      // 1. ดึงชื่อไฟล์เก่าออกมาเตรียมลบ (ถ้ามี avatar_url)
      const oldAvatarUrl = globalProfile?.avatar_url
      let oldFilePath = null
      
      if (oldAvatarUrl) {
        // ดึงชื่อไฟล์จาก URL (สมมติ URL อยู่ในรูปแบบ .../avatars/filename)
        const parts = oldAvatarUrl.split('/')
        oldFilePath = parts[parts.length - 1]
      }

      // 2. อัปโหลดรูปใหม่
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // 3. ดึง Public URL ของรูปใหม่
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // 4. อัปเดต Database ให้ชี้ไปที่รูปใหม่
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      // 5. ถ้ามีรูปเก่าและไม่ใช่รูปเริ่มต้น ให้ลบทิ้ง
      if (oldFilePath && oldFilePath !== 'placeholder.png') {
        // เช็คก่อนว่าเป็นไฟล์ที่เราอัปเองไหม (ดูจากชื่อที่ขึ้นต้นด้วย user.id)
        if (oldFilePath.startsWith(user.id)) {
           await supabase.storage.from('avatars').remove([oldFilePath])
        }
      }

      // 6. อัปเดต Store
      if (setProfile) {
        setProfile({ ...globalProfile, avatar_url: publicUrl })
      }

    } catch (error: any) {
      console.error('Error updating avatar:', error.message)
      alert('Failed to update profile picture.')
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  const catsFoundCount = globalProfile?.cats_found || 0
  const currentLevel = Math.floor(catsFoundCount / 5) + 1
  
  const displayProfile = {
    name: globalProfile?.username || user?.email?.split('@')[0] || 'Unknown',
    avatar: globalProfile?.avatar_url || null,
    level: `Explorer Level ${currentLevel}`
  }

  const displayPosts = activeTab === 'posts' 
    ? myPosts 
    : myPosts.filter(post => post.likes > 0)
    
  const isPageLoading = authLoading || isFetchingPosts
  const showRealAvatar = displayProfile.avatar && !avatarError && !displayProfile.avatar.includes('unsplash.com/photo-1599566')

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
              Profile<span className="text-orange-500">.</span>
            </h1>
          </div>
          
          <button className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pt-[104px] pb-32 px-6 flex flex-col space-y-6">
        
        {/* 1. Profile Header Bento */}
        <section className="grid grid-cols-1 gap-4">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 flex flex-col items-center justify-center text-center dark:bg-zinc-900 dark:border-zinc-800 relative">
            
            {authLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-[2rem] backdrop-blur-sm dark:bg-zinc-900/80">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            )}

            {/* Input ซ่อนไว้สำหรับอัปโหลดไฟล์ */}
            <input 
              type="file" 
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleAvatarUpload}
            />

            {/* 📸 กรอบรูป Profile ที่คลิกเพื่อเปลี่ยนรูปได้ */}
            <div 
              onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-[1.5rem] overflow-hidden mb-4 shadow-sm border-[3px] border-orange-50 dark:border-orange-500/20 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group cursor-pointer transition-transform active:scale-95"
            >
              {showRealAvatar ? (
                <img 
                  src={displayProfile.avatar}
                  alt={displayProfile.name} 
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)} 
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
                  <Cat className="h-10 w-10 opacity-80" />
                </div>
              )}
              
              {/* Hover & Uploading State */}
              <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity ${isUploadingAvatar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {isUploadingAvatar ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </div>

            <h2 className="text-2xl font-black text-zinc-900 dark:text-white">@{displayProfile.name}</h2>
            <div className="flex items-center space-x-1.5 bg-orange-50 px-3 py-1.5 rounded-full mt-2 dark:bg-orange-500/10">
              <Compass className="h-3 w-3 text-orange-500" />
              <span className="text-[10px] font-black tracking-widest uppercase text-orange-600 dark:text-orange-500">
                {displayProfile.level}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 text-white rounded-[1.5rem] p-5 flex flex-col justify-between shadow-lg shadow-zinc-900/10 dark:bg-white dark:text-zinc-900">
              <Compass className="h-7 w-7 mb-3 text-orange-500" />
              <div>
                <p className="text-3xl font-black leading-none">
                  {isPageLoading ? <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mt-2 mb-1" /> : stats.discovered}
                </p>
                <p className="text-[10px] font-bold tracking-widest uppercase opacity-70 mt-1">Cats Discovered</p>
              </div>
            </div>
            
            <div className="bg-orange-50 text-orange-600 rounded-[1.5rem] p-5 flex flex-col justify-between shadow-sm border border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-500">
              <Camera className="h-7 w-7 mb-3" />
              <div>
                <p className="text-3xl font-black leading-none">
                  {isPageLoading ? <Loader2 className="h-6 w-6 animate-spin text-orange-300 mt-2 mb-1" /> : stats.total}
                </p>
                <p className="text-[10px] font-bold tracking-widest uppercase opacity-80 mt-1">Total Sightings</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Tabs & Grid Area */}
        <section className="flex flex-col space-y-4 pt-4">
          <div className="flex space-x-4 border-b border-zinc-100 dark:border-zinc-800">
            <button 
              onClick={() => setActiveTab('posts')}
              className={`pb-3 font-black tracking-wide uppercase transition-colors text-sm ${
                activeTab === 'posts' ? 'text-zinc-900 border-b-2 border-zinc-900 dark:text-white dark:border-white' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              My Posts
            </button>
            <button 
              onClick={() => setActiveTab('favorites')}
              className={`pb-3 font-black tracking-wide uppercase transition-colors text-sm flex items-center space-x-1 ${
                activeTab === 'favorites' ? 'text-zinc-900 border-b-2 border-zinc-900 dark:text-white dark:border-white' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <span>Likes</span>
              {activeTab === 'favorites' && <Heart className="h-3 w-3 fill-zinc-900 text-zinc-900 dark:fill-white dark:text-white ml-1" />}
            </button>
          </div>

          {isPageLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <Link href="/hunt" className="bg-zinc-50 rounded-[1.5rem] overflow-hidden border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center aspect-[4/5] cursor-pointer active:scale-95 transition-all hover:bg-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                <Camera className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-2" />
                <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">New Post</p>
              </Link>

              {displayPosts.map((post) => (
                <Link href={`/cats/${post.catId}`} key={post.id} className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-zinc-100 group cursor-pointer active:scale-95 transition-all block dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="aspect-square relative overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    <img 
                      src={post.img} 
                      alt={post.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {post.likes > 0 && (
                      <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-2 py-1 rounded-full shadow-sm flex items-center space-x-1 dark:bg-zinc-900/90">
                        <Heart className="h-2.5 w-2.5 fill-red-500 text-red-500" />
                        <span className="text-[9px] font-black text-zinc-900 dark:text-white">{post.likes}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-black tracking-wide text-zinc-900 truncate dark:text-white uppercase">{post.title}</p>
                    <p className="text-[9px] font-bold tracking-widest text-zinc-400 mt-1 uppercase">{post.time}</p>
                  </div>
                </Link>
              ))}

              {displayPosts.length === 0 && (
                <div className="flex flex-col items-center justify-center aspect-[4/5] text-center px-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">No posts here yet.</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Log Out Button */}
        <div className="pt-6 pb-2 flex justify-center">
          <button 
            onClick={handleLogout}
            className="bg-red-50 text-red-600 px-6 py-3 rounded-[1rem] font-black text-[10px] tracking-widest uppercase flex items-center justify-center space-x-2 active:scale-95 transition-transform hover:bg-red-100 dark:bg-red-500/10 dark:text-red-500 dark:hover:bg-red-500/20"
          >
            <LogOut className="h-4 w-4" />
            <span>Log Out</span>
          </button>
        </div>

      </div>
    </main>
  )
}