// src/app/cats/[id]/page.tsx
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Share, MapPin, Heart, Calendar, Clock, Image as ImageIcon, Send, MessageSquare, Loader2, Check, Plus, Cat as CatIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// 🐱 Avatar component: โชว์รูปจริงถ้ามี ไม่งั้น fallback เป็น cat icon
function Avatar({
  src,
  alt,
  size = 'w-10 h-10',
  rounded = 'rounded-[1rem]',
  iconSize = 'h-4 w-4',
}: {
  src?: string | null
  alt: string
  size?: string
  rounded?: string
  iconSize?: string
}) {
  const [avatarError, setAvatarError] = useState(false)

  const showRealAvatar =
    !!src && !avatarError && !src.includes('unsplash.com/photo-1599566')

  return (
    <div
      className={`${size} ${rounded} bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center`}
    >
      {showRealAvatar ? (
        <img
          src={src as string}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setAvatarError(true)}
        />
      ) : (
        <CatIcon className={`${iconSize} text-zinc-400 dark:text-zinc-500`} />
      )}
    </div>
  )
}

export default function CatProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const catId = resolvedParams.id
  const router = useRouter()
  const { user, profile } = useAuthStore()

  const [cat, setCat] = useState<any>(null)
  const [encounters, setEncounters] = useState<any[]>([])

  // 🎲 รูป Cover ของ Hero Section (สุ่มจาก encounters ตอนโหลดข้อมูล)
  const [coverImage, setCoverImage] = useState<string | null>(null)

  // States สำหรับระบบ Follow
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // States สำหรับระบบ Notes (สมุดเยี่ยมแมว)
  const [notes, setNotes] = useState<any[]>([])
  const [noteText, setNoteText] = useState('')
  const [isSendingNote, setIsSendingNote] = useState(false)

  const [isLoading, setIsLoading] = useState(true)

  // 🖼️ Gallery modal + Lightbox states
  const [showGallery, setShowGallery] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // 👥 Followers List states
  const [showFollowersList, setShowFollowersList] = useState(false)
  const [followersList, setFollowersList] = useState<any[]>([])
  const [isLoadingFollowers, setIsLoadingFollowers] = useState(false)

  useEffect(() => {
    fetchCatDetails()
    fetchNotes()
  }, [catId])

  useEffect(() => {
    if (!user) return
    const checkFollow = async () => {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('cat_id', catId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setIsFollowing(true)
    }
    checkFollow()
  }, [catId, user])

  // 🐈 โหลดข้อมูลแมวและแกลเลอรี
  const fetchCatDetails = async () => {
    setIsLoading(true)
    try {
      const { data: catData, error: catError } = await supabase
        .from('cats')
        .select('*')
        .eq('id', catId)
        .maybeSingle()

      if (catError) throw catError
      setCat(catData)

      const { data: encData, error: encError } = await supabase
        .from('encounters')
        .select('image_url, created_at, profiles(username, avatar_url), description')
        .eq('cat_id', catId)
        //เพิ่ม.eq('is_training', false) ตรงนี้ถูกมั้ย
        .eq('is_training', false)
        .order('created_at', { ascending: false })

      if (encError) throw encError
      const list = encData || []
      setEncounters(list)

      // 🎲 สุ่มรูป cover จาก encounters ทั้งหมด (is_training ถูกกรองออกไปแล้วจาก query ด้านบน)
      if (list.length > 0) {
        const randomIndex = Math.floor(Math.random() * list.length)
        setCoverImage(list[randomIndex].image_url)
      } else {
        setCoverImage(null)
      }
    } catch (error) {
      console.error('Error fetching cat profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 📝 โหลด Notes ของแมวตัวนี้
  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('cat_notes')
      .select('id, text, created_at, profiles(username, avatar_url)')
      .eq('cat_id', catId)
      .order('created_at', { ascending: false }) // เรียงจากใหม่ไปเก่า (เพื่อให้คนพิมล่าสุดอยู่บนสุด)

    if (!error && data) {
      setNotes(data)
    }
  }

  // 👥 โหลดรายชื่อคน Follow
  const fetchFollowersList = async () => {
    setIsLoadingFollowers(true)
    const { data, error } = await supabase
      .from('follows')
      .select('created_at, profiles(username, avatar_url)')
      .eq('cat_id', catId)
      .order('created_at', { ascending: true })

    if (data && !error) {
      setFollowersList(data)
    }
    setIsLoadingFollowers(false)
  }

  const handleOpenFollowersList = () => {
    setShowFollowersList(true)
    fetchFollowersList()
  }

  // 🐾 ฟังก์ชัน Follow
  const handleFollow = async () => {
    if (!user) return
    setIsSubmitting(true)
    const currentlyFollowing = isFollowing
    setIsFollowing(!currentlyFollowing) // Optimistic UI
    setCat((prev: any) => ({
      ...prev,
      followers_count: Math.max(0, (prev.followers_count || 0) + (currentlyFollowing ? -1 : 1))
    }))

    try {
      if (currentlyFollowing) {
        await supabase.from('follows').delete().eq('cat_id', catId).eq('user_id', user.id)
        await supabase.rpc('decrement_followers', { cat_id: catId })
      } else {
        await supabase.from('follows').insert({ cat_id: catId, user_id: user.id })
        await supabase.rpc('increment_followers', { cat_id: catId })
      }
    } catch (err) {
      console.error('Follow error:', err)
      setIsFollowing(currentlyFollowing)
      setCat((prev: any) => ({
        ...prev,
        followers_count: Math.max(0, (prev.followers_count || 0) + (currentlyFollowing ? 1 : -1))
      }))
    } finally {
      setIsSubmitting(false)
    }
  }

  // 📨 ฟังก์ชันส่ง Note
  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteText.trim() || !user) return

    setIsSendingNote(true)
    const textToSubmit = noteText.trim()
    setNoteText('') // Clear input immediately

    // Optimistic UI for Note (แสดงให้เห็นก่อนเซฟเสร็จ)
    const tempNote = {
      id: Date.now().toString(),
      text: textToSubmit,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username || 'You',
        avatar_url: profile?.avatar_url || null
      }
    }
    setNotes(prev => [tempNote, ...prev])

    try {
      const { error } = await supabase.from('cat_notes').insert({
        cat_id: catId,
        user_id: user.id,
        text: textToSubmit
      })
      if (error) throw error
    } catch (err) {
      console.error('Error saving note:', err)
      // ถ้าพัง โหลดข้อมูลใหม่เพื่อลบอันจำลองออก
      fetchNotes()
    } finally {
      setIsSendingNote(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 flex-col space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!cat) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Cat not found</p>
      </div>
    )
  }

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">

      {/* 🌟 Floating Top App Bar */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-4 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
          <button onClick={() => router.back()} className="w-10 h-10 rounded-[1rem] flex items-center justify-center text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-100 dark:text-white dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-black text-lg tracking-wide text-zinc-900 dark:text-white uppercase">
            Cat Profile<span className="text-orange-500">.</span>
          </span>
          <button onClick={() => navigator.share?.({ title: cat.name, url: window.location.href })} className="w-10 h-10 rounded-[1rem] flex items-center justify-center text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-100 dark:text-white dark:hover:bg-zinc-800">
            <Share className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 📱 Scrollable Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-[104px] pb-32 px-6 flex flex-col space-y-6">

        {/* 1. Hero Section */}
        <section className="relative w-full h-[400px] shrink-0 rounded-[2rem] overflow-hidden shadow-sm border border-zinc-100 dark:border-zinc-800 group">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url('${coverImage || 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=800'}')` }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

          {/* 🔧 แก้ overflow: เพิ่ม gap, min-w-0 + truncate ที่ชื่อ, shrink-0 + whitespace-nowrap ที่ปุ่ม */}
          <div className="absolute bottom-0 left-0 w-full p-6 flex items-end justify-between gap-3 pb-8">
            <div className="flex flex-col z-10 min-w-0 flex-1">
              <h1 className="text-3xl sm:text-4xl font-black text-white drop-shadow-lg leading-tight truncate">
                {cat.name}
              </h1>
              <div className="flex items-center space-x-1.5 mt-2 text-orange-400 min-w-0">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-sm font-bold tracking-wide text-white/90 truncate">
                  {cat.area ? cat.area.split(',')[0] : 'Unknown Location'}
                </span>
              </div>
            </div>

            <button
              onClick={handleFollow}
              disabled={isSubmitting}
              className={`flex items-center space-x-1.5 shrink-0 whitespace-nowrap px-4 py-2.5 sm:px-5 sm:py-3 rounded-[1.2rem] font-black text-[10px] sm:text-[11px] tracking-widest uppercase transition-all shadow-xl active:scale-95 z-10 disabled:opacity-50 ${isFollowing ? 'bg-zinc-900 text-white shadow-zinc-900/20' : 'bg-orange-500 text-white shadow-orange-500/30'}`}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isFollowing ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  <span>{isFollowing ? 'Following' : 'Follow'}</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* 2. Cat Stats */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800">
          <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mb-4">Cat Stats</h2>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-orange-50 p-4 rounded-[1.5rem] flex flex-col items-center justify-center dark:bg-orange-500/10">
              <span className="text-3xl font-black text-orange-500 leading-none">{encounters.length}</span>
              <span className="text-[10px] font-bold tracking-widest text-orange-600/70 uppercase mt-2 dark:text-orange-400/70">Sightings</span>
            </div>
            <button onClick={handleOpenFollowersList} className="bg-zinc-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center dark:bg-zinc-800 active:scale-95 transition-transform hover:bg-zinc-200 dark:hover:bg-zinc-700">
              <span className="text-3xl font-black text-zinc-900 dark:text-white leading-none">{cat.followers_count || 0}</span>
              <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mt-2">Followers</span>
            </button>
          </div>
          <div className="flex flex-col space-y-4 text-sm font-bold">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center space-x-2 text-zinc-400">
                <Calendar className="h-5 w-5" />
                <span>FIRST SEEN</span>
              </div>
              <span className="text-zinc-900 dark:text-white">
                {cat.first_seen ? new Date(cat.first_seen).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }) : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2 text-zinc-400">
                <Clock className="h-5 w-5" />
                <span>LAST SEEN</span>
              </div>
              <span className="text-orange-500">
                {cat.last_seen ? new Date(cat.last_seen).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
              </span>
            </div>
          </div>
        </section>

        {/* 3. Community Gallery */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <ImageIcon className="h-5 w-5 text-zinc-900 dark:text-white" />
              <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase">Gallery</h2>
            </div>
            {encounters.length > 0 && (
              <button
                onClick={() => setShowGallery(true)}
                className="text-[10px] font-bold tracking-widest text-orange-500 uppercase"
              >
                View all
              </button>
            )}
          </div>
          {encounters.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 h-64">
              <div
                onClick={() => { setLightboxIndex(0); setShowGallery(true) }}
                className="col-span-2 row-span-2 rounded-[1.2rem] overflow-hidden relative group bg-zinc-100 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <img src={encounters[0].image_url} className="w-full h-full object-cover" alt="Gallery 1" />
              </div>
              {encounters[1] && (
                <div
                  onClick={() => { setLightboxIndex(1); setShowGallery(true) }}
                  className="rounded-[1.2rem] overflow-hidden bg-zinc-100 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <img src={encounters[1].image_url} className="w-full h-full object-cover" alt="Gallery 2" />
                </div>
              )}
              {encounters.length > 2 && (
                <div
                  onClick={() => setShowGallery(true)}
                  className="rounded-[1.2rem] overflow-hidden bg-zinc-100 flex items-center justify-center flex-col cursor-pointer active:scale-95 transition-transform dark:bg-zinc-800"
                >
                  <span className="text-xl font-black text-zinc-900 dark:text-white">+{encounters.length - 2}</span>
                  <span className="text-[9px] font-bold tracking-widest text-zinc-400 uppercase">MORE</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center bg-zinc-50 rounded-[1.2rem] dark:bg-zinc-800">
              <span className="text-sm font-bold text-zinc-400">ยังไม่มีรูปถ่าย</span>
            </div>
          )}
        </section>

        {/* 4. Real-time Cat Notes */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 mb-8">
          <div className="flex items-center space-x-2 mb-6">
            <MessageSquare className="h-5 w-5 text-zinc-900 dark:text-white" />
            <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase">Cat Notes</h2>
          </div>

          {/* ช่องกรอก Note */}
          <form onSubmit={handleSendNote} className="flex space-x-3 mb-6">
            <Avatar src={profile?.avatar_url} alt="Me" />
            <div className="flex-1 relative">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Leave a note about this cat..."
                className="w-full bg-zinc-50 border-none rounded-[1.2rem] py-3 pl-4 pr-12 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-orange-500/50 dark:bg-zinc-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={!noteText.trim() || isSendingNote}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 disabled:scale-90 dark:bg-white dark:text-zinc-900"
              >
                {isSendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-[-2px] mb-[-2px]" />}
              </button>
            </div>
          </form>

          {/* รายการ Note จาก Database */}
          <div className="flex flex-col space-y-4 max-h-[300px] overflow-y-auto no-scrollbar">
            {notes.length === 0 ? (
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase text-center py-4">Be the first to leave a note!</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="flex space-x-3 animate-in fade-in slide-in-from-top-2">
                  <Avatar src={note.profiles?.avatar_url} alt="Avatar" />
                  <div className="bg-zinc-50 rounded-[1.5rem] rounded-tl-none p-4 flex-1 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-xs text-zinc-900 dark:text-white">
                        {note.profiles?.username || 'Hunter'}
                      </span>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                        {new Date(note.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed dark:text-zinc-300">
                      {note.text}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>

      {/* 🖼️ Gallery Modal: Grid ของรูปทั้งหมด */}
      {showGallery && lightboxIndex === null && (
        <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-end animate-in fade-in duration-200">
          <div className="w-full max-h-[85vh] bg-white dark:bg-zinc-900 rounded-t-[2rem] p-6 flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="font-black text-xl text-zinc-900 dark:text-white">
                All Sightings <span className="text-orange-500">({encounters.length})</span>
              </h3>
              <button
                onClick={() => setShowGallery(false)}
                className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center active:scale-95"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto no-scrollbar pb-8">
              {encounters.map((enc, i) => (
                <div
                  key={i}
                  onClick={() => setLightboxIndex(i)}
                  className="aspect-square rounded-[1rem] overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer active:scale-95 transition-transform"
                >
                  <img src={enc.image_url} className="w-full h-full object-cover" alt={`Sighting ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🔍 Lightbox: ดูรูปเต็มจอ เลื่อนซ้าย-ขวาได้ */}
      {showGallery && lightboxIndex !== null && (
        <div className="absolute inset-0 z-[2100] bg-black flex flex-col animate-in fade-in duration-150">
          <div className="flex justify-between items-center p-6 shrink-0">
            <span className="text-white/70 text-xs font-bold tracking-widest uppercase">
              {lightboxIndex + 1} / {encounters.length}
            </span>
            <button
              onClick={() => setLightboxIndex(null)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center px-4">
            <img
              src={encounters[lightboxIndex].image_url}
              alt={`Sighting ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-xl"
            />

            {lightboxIndex > 0 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
            )}
            {lightboxIndex < encounters.length - 1 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            )}
          </div>

          {/* คำบรรยาย + วันที่ ถ้ามี */}
          {(encounters[lightboxIndex].description || encounters[lightboxIndex].created_at) && (
            <div className="p-6 pt-2 shrink-0 text-center">
              {encounters[lightboxIndex].description && (
                <p className="text-white text-sm font-medium mb-1">{encounters[lightboxIndex].description}</p>
              )}
              <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase">
                {new Date(encounters[lightboxIndex].created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 👥 Followers Slide-over */}
      {showFollowersList && (
        <div className="absolute inset-0 z-[2000] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in slide-in-from-right-full duration-300 pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-5 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 shadow-sm">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-wide">Followers</h2>
            <button onClick={() => setShowFollowersList(false)} className="w-10 h-10 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center active:scale-95 transition-colors">
              <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4">
            {isLoadingFollowers ? (
              <div className="text-center py-20 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : followersList.length === 0 ? (
              <div className="text-center py-20 text-zinc-400 font-medium flex flex-col items-center">
                <Heart className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-700" />
                <p>No followers yet.</p>
              </div>
            ) : (
              followersList.map((f, i) => {
                const isDiscoverer = encounters.length > 0 && encounters[encounters.length - 1]?.profiles?.username === f.profiles?.username

                return (
                  <div key={i} className="flex items-center space-x-4 p-4 rounded-[1.5rem] bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800">
                    <Avatar src={f.profiles?.avatar_url} alt="avatar" size="w-12 h-12" rounded="rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-black text-zinc-900 dark:text-white truncate">
                          {f.profiles?.username || 'Anonymous'}
                        </p>
                        {isDiscoverer && (
                          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[9px] font-black uppercase tracking-widest rounded-full shrink-0">
                            Discoverer
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </main>
  )
}