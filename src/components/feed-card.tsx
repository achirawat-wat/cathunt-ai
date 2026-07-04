// src/components/feed-card.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Heart, MessageCircle, MoreHorizontal, Check, Plus, MapPin, Send, Share2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// 🕒 ฟังก์ชันแปลงเวลา
function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

interface FeedCardProps {
  feed: {
    id: string
    time: string
    image: string
    content: string
    likes: number
    user: { name: string; avatar: string }
    cat: { id: string; name: string; area: string }
  }
}

export default function FeedCard({ feed }: FeedCardProps) {
  const { user, profile: globalProfile } = useAuthStore()

  // 🎯 States
  const [isLiked, setIsLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(feed.likes || 0)
  
  const [isFollowing, setIsFollowing] = useState(false)
  const [showHeartOverlay, setShowHeartOverlay] = useState(false)
  
  // 📝 Comments State
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [totalComments, setTotalComments] = useState(0)

  const lastTapRef = useRef<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔍 1. เช็คสถานะตอนโหลดการ์ดขึ้นมา (ว่าเคยไลก์หรือยัง)
  useEffect(() => {
    if (!user) return

    const fetchInitialData = async () => {
      // เช็ค Like
      const { data: likeData } = await supabase
        .from('likes')
        .select('id')
        .eq('encounter_id', feed.id)
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (likeData) setIsLiked(true)

      // เช็คจำนวนคอมเมนต์คร่าวๆ
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('encounter_id', feed.id)
      
      setTotalComments(count || 0)
    }

    fetchInitialData()
  }, [feed.id, user])

  // 💬 2. ดึงข้อมูลคอมเมนต์ทั้งหมด "เมื่อกดเปิดดู" เท่านั้น (ประหยัดเน็ต)
  useEffect(() => {
    if (!showComments) return

    const fetchComments = async () => {
      setIsLoadingComments(true)
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id, 
          text, 
          created_at, 
          profiles (username, avatar_url)
        `)
        .eq('encounter_id', feed.id)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setComments(data)
      }
      setIsLoadingComments(false)
    }

    fetchComments()
  }, [showComments, feed.id])
  
  // 💖 ฟังก์ชันกดไลก์ (ทำงานจริงกับ DB)
  const handleLike = async () => {
    if (!user) return

    const currentlyLiked = isLiked
    
    // อัปเดต UI ทันทีให้ดูลื่นไหล (Optimistic UI)
    setIsLiked(!currentlyLiked)
    setLikesCount(prev => currentlyLiked ? prev - 1 : prev + 1)
    if (!currentlyLiked) triggerHeartAnimation()

    try {
      if (currentlyLiked) {
        // กรณี "เลิกไลก์"
        await supabase.from('likes').delete().eq('encounter_id', feed.id).eq('user_id', user.id)
        await supabase.from('encounters').update({ likes_count: likesCount - 1 }).eq('id', feed.id)
      } else {
        // กรณี "กดไลก์ใหม่"
        await supabase.from('likes').insert({ encounter_id: feed.id, user_id: user.id })
        await supabase.from('encounters').update({ likes_count: likesCount + 1 }).eq('id', feed.id)
      }
    } catch (err) {
      console.error('Error toggling like:', err)
      // ถ้าพัง ให้ Rollback UI กลับ
      setIsLiked(currentlyLiked)
      setLikesCount(prev => currentlyLiked ? prev + 1 : prev - 1)
    }
  }
  useEffect(() => {
  if (!user) return

  const checkFollowStatus = async () => {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('cat_id', feed.cat.id)
      .eq('user_id', user.id)
      .single()
    
    if (data) setIsFollowing(true)
  }
  checkFollowStatus()
}, [feed.cat.id, user])

  const handleFollow = async () => {
  if (!user) return
  setIsSubmitting(true);
  const currentlyFollowing = isFollowing
  setIsFollowing(!currentlyFollowing) // Optimistic UI

  try {
    if (currentlyFollowing) {
      // Unfollow
      await supabase.from('follows').delete().eq('cat_id', feed.cat.id).eq('user_id', user.id)
      await supabase.from('cats').update({ followers_count: Math.max(0, (feed.likes || 0) - 1) }).eq('id', feed.cat.id) // สมมติว่าแมวมี followers_count
    } else {
      // Follow
      await supabase.from('follows').insert({ cat_id: feed.cat.id, user_id: user.id })
      await supabase.from('cats').update({ followers_count: (feed.likes || 0) + 1 }).eq('id', feed.cat.id)
    }
  } catch (err) {
    console.error('Follow error:', err);
    setIsFollowing(currentlyFollowing);
  } finally {
    setIsSubmitting(false); // 👈 ปิดสถานะ
  }
}
  // 💥 ฟังก์ชัน Double Tap บนรูป
  const handleImageTap = () => {
    const now = Date.now()
    const DOUBLE_PRESS_DELAY = 300
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      if (!isLiked) handleLike()
      else triggerHeartAnimation()
    }
    lastTapRef.current = now
  }

  const triggerHeartAnimation = () => {
    setShowHeartOverlay(true)
    setTimeout(() => setShowHeartOverlay(false), 800)
  }

  // 💬 ฟังก์ชันส่งคอมเมนต์ (เซฟลง DB จริง)
  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim() || !user) return

    const textToSubmit = commentText.trim()
    setCommentText('') // เคลียร์ช่องพิมพ์ทันที

    // สร้างคอมเมนต์หลอกๆ โชว์บน UI ไปก่อน (ไม่ต้องรอเน็ต)
    const tempComment = {
      id: Date.now().toString(),
      text: textToSubmit,
      created_at: new Date().toISOString(),
      profiles: {
        username: globalProfile?.username || 'You',
        avatar_url: globalProfile?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'
      }
    }
    setComments(prev => [...prev, tempComment])
    setTotalComments(prev => prev + 1)

    // ยิงเข้า DB
    try {
      await supabase.from('comments').insert({
        encounter_id: feed.id,
        user_id: user.id,
        text: textToSubmit
      })
    } catch (error) {
      console.error('Error posting comment:', error)
    }
  }

  // 📲 ฟังก์ชัน Share
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `CatHunt - ${feed.cat.name}`,
          text: `Check out ${feed.cat.name} spotted at ${feed.cat.area} by ${feed.user.name}! 🐱`,
          url: window.location.href,
        })
      } catch (error) {
        console.log('Share canceled')
      }
    }
  }

  return (
    <article className="bg-white rounded-[2rem] shadow-sm border border-zinc-100 overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 transition-all hover:shadow-md mb-6">
      
      {/* 👤 Card Header */}
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <img 
              src={feed.user.avatar} 
              alt={feed.user.name} 
              className="w-11 h-11 rounded-[1.2rem] object-cover bg-zinc-100 dark:bg-zinc-800 shadow-sm border border-zinc-100 dark:border-zinc-700"
            />
          </div>
          <div>
            <p className="text-[13px] text-zinc-900 dark:text-zinc-100 leading-tight">
              <span className="font-black text-sm tracking-tight">{feed.user.name}</span>
              <span className="text-zinc-400 mx-1 font-medium">found</span>
              <span className="font-black text-orange-500">{feed.cat.name}</span>
            </p>
            <div className="flex items-center text-[10px] font-bold tracking-widest text-zinc-400 mt-1 uppercase">
              <span>{feed.time}</span>
              <span className="mx-1.5">•</span>
              <MapPin className="h-3 w-3 mr-0.5 text-orange-400" />
              <span className="truncate max-w-[120px]">{feed.cat.area}</span>
            </div>
          </div>
        </div>
        
        <button onClick={handleShare} className="text-zinc-400 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 transition-all active:scale-95 p-2.5 rounded-full dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-100">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* 🖼️ Card Image */}
      <div 
        className="w-full aspect-square md:aspect-[4/3] bg-zinc-100 relative overflow-hidden dark:bg-zinc-800 cursor-pointer select-none group"
        onClick={handleImageTap}
      >
        <img src={feed.image} alt={`${feed.cat.name}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
        {showHeartOverlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-black/10">
            <Heart className="h-28 w-28 text-white fill-white animate-in zoom-in-50 fade-in duration-300 drop-shadow-2xl" />
          </div>
        )}
      </div>

      {/* ⚡ Card Actions */}
      <div className="p-4 flex justify-between items-center">
        <div className="flex space-x-1">
          <button onClick={handleLike} className="flex items-center space-x-2 active:scale-90 transition-transform group hover:bg-zinc-50 dark:hover:bg-zinc-800 p-2 rounded-[1rem]">
            <Heart className={`h-6 w-6 transition-colors ${isLiked ? 'fill-red-500 text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`} />
            <span className={`font-black text-sm ${isLiked ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`}>{likesCount}</span>
          </button>
          
          <button onClick={() => setShowComments(!showComments)} className={`flex items-center space-x-2 active:scale-90 transition-transform p-2 rounded-[1rem] ${showComments ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
            <MessageCircle className="h-6 w-6 text-zinc-700 dark:text-zinc-300" />
            <span className="font-black text-sm text-zinc-700 dark:text-zinc-300">{totalComments}</span>
          </button>
        </div>

        {/* Follow Button (UI Mockup) */}
<button 
  onClick={handleFollow}
  disabled={isSubmitting} // 👈 เพิ่มสถานะปิดการกดตอนกำลังบันทึก
  className={`flex items-center space-x-1 px-4 py-2.5 rounded-[1rem] active:scale-95 transition-all font-black text-[10px] tracking-widest uppercase shadow-sm ${
    isFollowing 
      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-zinc-900/20' 
      : 'bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-500'
  } ${isSubmitting ? 'opacity-50 cursor-wait' : ''}`}
>
  {isFollowing ? (
    <Check className="h-3 w-3 mr-1" />
  ) : (
    <Plus className="h-3 w-3 mr-1" />
  )}
  <span>{isFollowing ? 'Following' : 'Follow'}</span>
</button>
      </div>

      {/* 📝 Caption */}
      {feed.content && (
        <div className="px-5 pb-3">
           <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">
             <span className="font-black text-zinc-900 dark:text-white mr-2">{feed.user.name}</span>
             {feed.content}
           </p>
        </div>
      )}

      {/* 💬 Pro Comment Section */}
      {showComments && (
        <div className="px-5 pb-5 pt-2 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mb-4 space-y-4 max-h-[250px] overflow-y-auto no-scrollbar">
            
            {isLoadingComments ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase text-center py-4">Be the first to comment!</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="flex space-x-3 items-start animate-in fade-in slide-in-from-bottom-2">
                  <img 
                    src={comment.profiles?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'} 
                    alt="avatar" 
                    className="w-7 h-7 rounded-full object-cover bg-zinc-100 mt-0.5"
                  />
                  <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-black text-xs text-zinc-900 dark:text-white">{comment.profiles?.username}</span>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{timeAgo(comment.created_at)}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">{comment.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* ✏️ Comment Input box with Avatar */}
          <form onSubmit={submitComment} className="flex items-center space-x-3 mt-2">
            <img 
              src={globalProfile?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'} 
              alt="You" 
              className="w-8 h-8 rounded-full object-cover bg-zinc-200"
            />
            <div className="relative flex-1">
              <input 
                type="text" 
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-full h-11 pl-4 pr-12 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
              />
              <button 
                type="submit" 
                disabled={!commentText.trim()}
                className="absolute right-1 top-1 w-9 h-9 flex items-center justify-center bg-orange-500 text-white rounded-full active:scale-90 transition-transform disabled:opacity-0 disabled:scale-50"
              >
                <Send className="h-4 w-4 ml-0.5" />
              </button>
            </div>
          </form>
        </div>
      )}
      
    </article>
  )
}