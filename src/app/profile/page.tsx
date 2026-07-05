// src/app/profile/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LogOut, Compass, Heart, Camera, Loader2, Cat, MessageSquarePlus, X, Check } from 'lucide-react'

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

// 💬 Quick-select presets for the feedback title
const FEEDBACK_PRESETS = [
  { emoji: '🐛', label: 'Bug report' },
  { emoji: '💡', label: 'Feature request' },
  { emoji: '🎨', label: 'UI/UX issue' },
  { emoji: '⚡', label: 'App is slow/stuck' },
  { emoji: '🙏', label: 'Other' },
]

export default function ProfilePage() {
  // 🚀 setProfile from Zustand, used to update state in real time after avatar upload
  const { user, profile: globalProfile, loading: authLoading, setProfile } = useAuthStore()
  
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites'>('posts')
  const [myPosts, setMyPosts] = useState<any[]>([])
  const [stats, setStats] = useState({ discovered: 0, total: 0 })
  const [isFetchingPosts, setIsFetchingPosts] = useState(true)

  // ❤️ Liked posts (ไม่จำกัดว่าต้องเป็นรูปที่เราถ่ายเอง) — โหลดแบบ lazy ตอนกดแท็บครั้งแรก
  const [likedPosts, setLikedPosts] = useState<any[]>([])
  const [isFetchingLikes, setIsFetchingLikes] = useState(false)
  const [likesLoaded, setLikesLoaded] = useState(false)
  
  const [avatarError, setAvatarError] = useState(false)
  // 📸 State and ref for the avatar upload flow
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 💬 State for the Feedback modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackTitle, setFeedbackTitle] = useState('')
  const [feedbackDescription, setFeedbackDescription] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')

  useEffect(() => {
    if (authLoading || !user) return;
    fetchUserPosts(user.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  // ❤️ โหลด liked posts เมื่อกดแท็บ "Likes" ครั้งแรกเท่านั้น
  useEffect(() => {
    if (activeTab === 'favorites' && !likesLoaded && user) {
      fetchLikedPosts(user.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user])

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
        .eq('is_training', false)
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

  // ❤️ ดึงโพสต์ (encounter) ทั้งหมดที่ผู้ใช้เคยกดไลก์ไว้ ไม่จำกัดว่าใครเป็นคนถ่าย
  const fetchLikedPosts = async (userId: string) => {
    try {
      setIsFetchingLikes(true)
      const { data, error } = await supabase
        .from('likes')
        .select(`
          created_at,
          encounters (
            id,
            image_url,
            created_at,
            likes_count,
            is_training,
            cats ( id, name )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        const formattedLikes = data
          .map((row: any) => {
            const enc = Array.isArray(row.encounters) ? row.encounters[0] : row.encounters
            if (!enc || enc.is_training) return null // กันโพสต์ training data หลุดมา

            const catInfo = Array.isArray(enc.cats) ? enc.cats[0] : enc.cats
            return {
              id: enc.id,
              title: catInfo?.name || 'Unknown Cat',
              catId: catInfo?.id,
              time: timeAgo(enc.created_at),
              img: enc.image_url,
              likes: enc.likes_count || 0
            }
          })
          .filter(Boolean)

        setLikedPosts(formattedLikes as any[])
      }
    } catch (err) {
      console.error('Error fetching liked posts:', err)
    } finally {
      setIsFetchingLikes(false)
      setLikesLoaded(true)
    }
  }

  // 🚀 Handles profile avatar upload
const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0 || !user) return

      setIsUploadingAvatar(true)
      setAvatarError(false)

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      // 1. Get the old filename ready to delete (if avatar_url exists)
      const oldAvatarUrl = globalProfile?.avatar_url
      let oldFilePath = null
      
      if (oldAvatarUrl) {
        // Extract filename from URL (assumes URL is in the form .../avatars/filename)
        const parts = oldAvatarUrl.split('/')
        oldFilePath = parts[parts.length - 1]
      }

      // 2. Upload the new image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // 3. Get the public URL of the new image
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // 4. Update the database to point to the new image
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      // 5. If there's an old image and it's not the default, delete it
      if (oldFilePath && oldFilePath !== 'placeholder.png') {
        // Check it's a file we uploaded (name starts with user.id)
        if (oldFilePath.startsWith(user.id)) {
           await supabase.storage.from('avatars').remove([oldFilePath])
        }
      }

      // 6. Update the store
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

  // 💬 Open the Feedback modal (reset state each time it opens)
  const openFeedbackModal = () => {
    setFeedbackTitle('')
    setFeedbackDescription('')
    setFeedbackError('')
    setFeedbackSubmitted(false)
    setShowFeedbackModal(true)
  }

  const closeFeedbackModal = () => {
    if (isSubmittingFeedback) return
    setShowFeedbackModal(false)
  }

  // 💬 Submit feedback to Supabase
  const handleSubmitFeedback = async () => {
    if (!user || !feedbackTitle.trim()) {
      setFeedbackError('Please choose or enter a title before submitting')
      return
    }

    try {
      setIsSubmittingFeedback(true)
      setFeedbackError('')

      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        title: feedbackTitle.trim(),
        description: feedbackDescription.trim() || null,
      })

      if (error) throw error

      setFeedbackSubmitted(true)
      setTimeout(() => {
        setShowFeedbackModal(false)
      }, 1200)
    } catch (error: any) {
      console.error('Error submitting feedback:', error.message)
      setFeedbackError('Failed to submit. Please try again.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const catsFoundCount = globalProfile?.cats_found || 0
  const currentLevel = Math.floor(catsFoundCount / 5) + 1
  
  const displayProfile = {
    name: globalProfile?.username || user?.email?.split('@')[0] || 'Unknown',
    avatar: globalProfile?.avatar_url || null,
    level: `Explorer Level ${currentLevel}`
  }

  // ❤️ ใช้ likedPosts ตรงๆ แทนการ filter จาก myPosts
  const displayPosts = activeTab === 'posts' ? myPosts : likedPosts

  const isPageLoading = authLoading || isFetchingPosts
  const isTabLoading = activeTab === 'posts' ? isPageLoading : (isPageLoading || isFetchingLikes)
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
          
          <button
            onClick={openFeedbackModal}
            className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
          >
            <MessageSquarePlus className="h-4 w-4" />
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

            {/* Hidden input for file upload */}
            <input 
              type="file" 
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleAvatarUpload}
            />

            {/* 📸 Profile avatar frame, click to change */}
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

          {isTabLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 pt-2">
              {activeTab === 'posts' && (
                <Link href="/hunt" className="bg-zinc-50 rounded-[1.5rem] overflow-hidden border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center aspect-[4/5] cursor-pointer active:scale-95 transition-all hover:bg-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                  <Camera className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">New Post</p>
                </Link>
              )}

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
                <div className={`flex flex-col items-center justify-center aspect-[4/5] text-center px-4 ${activeTab === 'posts' ? '' : 'col-span-2'}`}>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {activeTab === 'posts' ? 'No posts here yet.' : 'No liked cats yet. Go find some! 🐾'}
                  </p>
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

      {/* 💬 Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeFeedbackModal}
          />

          {/* Panel */}
          <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90vh] overflow-y-auto">
            
            {feedbackSubmitted ? (
              /* Success State */
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-14 w-14 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mb-4">
                  <Check className="h-7 w-7 text-green-500" />
                </div>
                <p className="font-black text-zinc-900 dark:text-white uppercase tracking-wide">
                  Thanks for your feedback!
                </p>
                <p className="text-xs text-zinc-400 mt-1">We'll use it to make the app better</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase">
                    Feedback<span className="text-orange-500">.</span>
                  </h3>
                  <button
                    onClick={closeFeedbackModal}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:scale-95 transition-transform hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick-select presets */}
                <p className="text-[10px] font-black tracking-widest uppercase text-zinc-400 mb-2">
                  Title
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {FEEDBACK_PRESETS.map((preset) => {
                    const presetLabel = `${preset.emoji} ${preset.label}`
                    const isActive = feedbackTitle === presetLabel
                    return (
                      <button
                        key={preset.label}
                        onClick={() => setFeedbackTitle(presetLabel)}
                        className={`px-3 py-2 rounded-[1rem] text-[11px] font-bold flex items-center space-x-1.5 active:scale-95 transition-all border ${
                          isActive
                            ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-100 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <span>{preset.emoji}</span>
                        <span>{preset.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Title input (editable, quick-select fills this in) */}
                <input
                  type="text"
                  value={feedbackTitle}
                  onChange={(e) => setFeedbackTitle(e.target.value)}
                  placeholder="Type your own title, or pick one above"
                  maxLength={100}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-[1rem] px-4 py-3 text-sm font-bold text-zinc-900 dark:text-white placeholder:text-zinc-400 placeholder:font-medium mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />

                {/* Description */}
                <p className="text-[10px] font-black tracking-widest uppercase text-zinc-400 mb-2">
                  Description (optional)
                </p>
                <textarea
                  value={feedbackDescription}
                  onChange={(e) => setFeedbackDescription(e.target.value)}
                  placeholder="Add more detail, e.g. what happened or what you'd like to see..."
                  rows={4}
                  maxLength={1000}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-[1rem] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />

                {feedbackError && (
                  <p className="text-[11px] font-bold text-red-500 mb-2">{feedbackError}</p>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmittingFeedback || !feedbackTitle.trim()}
                  className="w-full mt-3 bg-orange-500 text-white rounded-[1rem] py-3.5 font-black text-[11px] tracking-widest uppercase flex items-center justify-center space-x-2 active:scale-95 transition-transform hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-orange-500 disabled:active:scale-100"
                >
                  {isSubmittingFeedback ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Send Feedback</span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}