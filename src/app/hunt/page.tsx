// src/app/hunt/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Check, MapPin, Plus, Navigation } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export default function HuntPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const [hasCameraError, setHasCameraError] = useState(false)
  const [isCameraReady, setIsCameraReady] = useState(false)
  
  // 📸 State สำหรับแคปภาพและ GPS
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  
  // 🎯 State ระบบ AI
  const [status, setStatus] = useState<'idle' | 'scanning' | 'result'>('idle')
  const [matchType, setMatchType] = useState<'known' | 'new' | null>(null)
  const [matchedCat, setMatchedCat] = useState<any>(null)
  const [catEmbedding, setCatEmbedding] = useState<number[] | null>(null) // เก็บ DNA แมว
  
  // 📝 State สำหรับฟอร์ม
  const [newCatName, setNewCatName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/')
      return
    }

    let stream: MediaStream | null = null
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setIsCameraReady(true)
        }
      } catch (err) {
        console.error('Error accessing camera:', err)
        setHasCameraError(true)
      }
    }

    startCamera()
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop())
    }
  }, [user, router])

  // 🌍 Reverse Geocoding
  const fetchLocationName = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`)
      const data = await res.json()
      return data.address?.suburb || data.address?.city_district || data.address?.town || data.address?.city || 'Unknown Area'
    } catch (error) {
      console.warn('Failed to fetch location name', error)
      return 'Unknown Area'
    }
  }

  // 📸 กดถ่ายภาพและส่งให้ AI วิเคราะห์
  const handleCapture = async () => {
    if (navigator.vibrate) navigator.vibrate(50)
    setStatus('scanning')

    // 1. ดึงตำแหน่ง GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          const areaName = await fetchLocationName(lat, lng)
          setLocation({ lat, lng, name: areaName })
        },
        (error) => console.warn('GPS Error:', error),
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }

    // 2. แคปภาพและประมวลผล (อัปเดต Center Crop)
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        // หาความยาวของด้านที่สั้นที่สุด เพื่อทำเป็น "กรอบสี่เหลี่ยมจัตุรัส"
        const size = Math.min(video.videoWidth, video.videoHeight)
        
        // คำนวณหาจุดกึ่งกลาง (ตัดขอบซ้าย-ขวา หรือ บน-ล่าง ที่เกินมาทิ้งไป)
        const startX = (video.videoWidth - size) / 2
        const startY = (video.videoHeight - size) / 2

        // ตั้งขนาดรูปที่จะส่งให้ AI (512x512)
        canvas.width = 512
        canvas.height = 512
        
        // วาดเฉพาะ "พื้นที่กึ่งกลาง" ลงใน Canvas
        ctx.drawImage(video, startX, startY, size, size, 0, 0, 512, 512)
        
        // แปลงภาพเป็น Base64
        const base64Image = canvas.toDataURL('image/jpeg', 0.8)
        setCapturedUrl(base64Image)
        
        // สร้าง Blob สำหรับอัปโหลดขึ้น Storage
        canvas.toBlob((blob) => {
          if (blob) setCapturedBlob(blob)
        }, 'image/jpeg', 0.8)

        // 🚀 3. ส่งรูประดับ Base64 ไปให้ API วิเคราะห์ (AI)
        try {
          const res = await fetch('/api/analyze-cat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Image })
          })
          
          const result = await res.json()

          // ถ้าไม่ใช่แมว หรือเกิด Error
          if (!res.ok || !result.success) {
            alert(result.error || 'ไม่ใช่รูปแมว หรือภาพไม่ชัดเจน โปรดลองถ่ายใหม่ 😿')
            resetCamera()
            return
          }

          // เก็บ Vector ไว้บันทึกลง Database
          if (result.vector) setCatEmbedding(result.vector)

          // สรุปผล
          if (result.matchType === 'known') {
            setMatchedCat(result.cat)
            setMatchType('known')
          } else {
            setMatchType('new')
          }
          setStatus('result')

        } catch (error) {
          console.error('API Error:', error)
          alert('ระบบวิเคราะห์ขัดข้อง โปรดลองใหม่')
          resetCamera()
        }
      }
    }
  }

  // 🚀 บันทึกข้อมูล
  const submitEncounter = async () => {
    if (!user || !capturedBlob) return
    setIsSubmitting(true)

    try {
      const fileName = `${user.id}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('encounters')
        .upload(fileName, capturedBlob)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('encounters')
        .getPublicUrl(fileName)

      let finalCatId = matchedCat?.id

      if (matchType === 'new') {
        if (!newCatName) {
          alert('Please provide a name for this cat.')
          setIsSubmitting(false)
          return
        }
        
        // 🗺️ บันทึกแมวใหม่ พร้อม Vector (DNA)
        const { data: newCat, error: catError } = await supabase
          .from('cats')
          .insert({
            name: newCatName,
            area: location?.name || 'Unknown Area',
            image_embedding: catEmbedding, // 👈 เก็บ Vector 512 มิติ ลง Database
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString()
          })
          .select()
          .single()

        if (catError) throw catError
        finalCatId = newCat.id
      } else {
        // อัปเดตเวลาเจอล่าสุด
        await supabase.from('cats').update({ 
          last_seen: new Date().toISOString(),
        }).eq('id', finalCatId)
      }

      const finalDescription = description.trim() !== '' 
        ? description.trim() 
        : (matchType === 'new' ? `New discovery: ${newCatName}` : `Spotted ${matchedCat.name}`)

      const { error: encError } = await supabase
        .from('encounters')
        .insert({
          cat_id: finalCatId,
          user_id: user.id,
          image_url: publicUrl,
          description: finalDescription,
          lat: location?.lat || null,
          lng: location?.lng || null
        })

      if (encError) throw encError

      const { data: profile } = await supabase.from('profiles').select('cats_found').eq('id', user.id).single()
      await supabase.from('profiles').update({ cats_found: (profile?.cats_found || 0) + 1 }).eq('id', user.id)

      router.push('/feed')

    } catch (error: any) {
      console.error('Submit error:', error.message)
      alert('Failed to post encounter.')
      setIsSubmitting(false)
    }
  }

  const resetCamera = () => {
    setCapturedUrl(null)
    setCapturedBlob(null)
    setMatchedCat(null)
    setCatEmbedding(null)
    setNewCatName('')
    setDescription('')
    setLocation(null)
    setStatus('idle')
  }

  return (
    <main className="relative flex h-full w-full flex-col bg-black text-white overflow-hidden">
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {hasCameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 px-6 text-center">
          <p className="text-zinc-400 font-medium text-sm mb-6">Camera access required</p>
          <button onClick={() => router.push('/feed')} className="px-6 py-3 bg-white text-zinc-900 font-bold rounded-full text-xs uppercase tracking-widest active:scale-95 transition-transform">Return</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isCameraReady && !capturedUrl ? 'opacity-100' : 'opacity-0'}`} />
          {capturedUrl && <img src={capturedUrl} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
        </>
      )}

      <div className="relative z-10 flex justify-between items-center p-6 pointer-events-none">
        <button onClick={() => router.back()} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-95 transition-transform pointer-events-auto">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center pointer-events-none">
        {status === 'idle' && isCameraReady && (
          <div className="relative w-64 h-64 opacity-50">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-xl"></div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl px-6 py-4 rounded-2xl animate-in zoom-in-95 duration-300">
            <Loader2 className="h-6 w-6 text-white animate-spin mb-3" />
            <span className="font-bold tracking-widest text-[10px] uppercase text-white">Analyzing AI...</span>
          </div>
        )}
      </div>

      <div className="relative z-10 w-full mt-auto pb-[120px]">
        {status === 'idle' && isCameraReady && (
          <div className="flex justify-center pb-4">
            <button onClick={handleCapture} className="w-20 h-20 rounded-full border-[3px] border-white/50 flex items-center justify-center active:scale-95 transition-all p-1.5 group">
              <div className="w-full h-full rounded-full bg-white group-active:bg-zinc-200 transition-colors"></div>
            </button>
          </div>
        )}

        {status === 'result' && (
          <div className="px-4">
            <div className="w-full bg-white rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300 text-zinc-900 relative">
              
              <div className="absolute top-6 right-6">
                {location ? (
                  <div className="flex items-center space-x-1 text-green-500">
                    <Navigation className="h-3 w-3 fill-green-500" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">GPS Active</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-zinc-400">
                    <Navigation className="h-3 w-3" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Loading GPS...</span>
                  </div>
                )}
              </div>

              {matchType === 'known' ? (
                <>
                  <div className="flex items-center space-x-2 text-zinc-400 mb-5">
                    <Check className="h-4 w-4" />
                    <span className="font-bold text-[10px] uppercase tracking-widest">Match Found</span>
                  </div>
                  
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 rounded-[1.2rem] bg-zinc-100 overflow-hidden">
                      <img src={capturedUrl || ''} alt="Cat" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="font-black text-2xl tracking-tight text-zinc-900">{matchedCat?.name}</h3>
                      <p className="text-xs font-medium text-zinc-500 mt-0.5 flex items-center">
                        <MapPin className="h-3 w-3 mr-1" /> {location?.name ? `Near ${location.name}` : 'Auto-detected location'}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <input 
                      type="text" 
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What is the cat doing? (Optional)" 
                      className="w-full bg-zinc-50 border-none rounded-[1.2rem] h-14 px-5 text-zinc-900 text-base font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder:text-zinc-400 placeholder:font-medium"
                    />
                  </div>

                  <div className="flex flex-col space-y-3">
                    <button onClick={submitEncounter} disabled={isSubmitting} className="w-full bg-zinc-900 text-white h-14 rounded-[1.2rem] font-bold tracking-wide text-sm active:scale-[0.98] transition-transform disabled:opacity-70 flex justify-center items-center">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm Sighting'}
                    </button>
                    <button onClick={resetCamera} disabled={isSubmitting} className="w-full bg-zinc-100 text-zinc-600 h-14 rounded-[1.2rem] font-bold tracking-wide text-sm active:scale-[0.98] transition-transform hover:bg-zinc-200 disabled:opacity-50">
                      Not This Cat
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-2 text-orange-500 mb-5">
                    <Plus className="h-4 w-4" />
                    <span className="font-bold text-[10px] uppercase tracking-widest">New Discovery</span>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <input 
                      type="text" 
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="Name this cat" 
                      className="w-full bg-zinc-50 border-none rounded-[1.2rem] h-14 px-5 text-zinc-900 text-base font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder:text-zinc-400 placeholder:font-medium"
                    />
                    <input 
                      type="text" 
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What is the cat doing? (Optional)" 
                      className="w-full bg-zinc-50 border-none rounded-[1.2rem] h-14 px-5 text-zinc-900 text-base font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder:text-zinc-400 placeholder:font-medium"
                    />
                    <div className="flex items-center space-x-2 px-1 text-zinc-500">
                       <MapPin className="h-4 w-4 text-orange-500" />
                       <span className="text-xs font-medium">
                         {location?.name ? `Location attached: ${location.name}` : 'Location attached via GPS'}
                       </span>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-3">
                    <button onClick={submitEncounter} disabled={isSubmitting || !newCatName} className="w-full bg-orange-500 text-white h-14 rounded-[1.2rem] font-bold tracking-wide text-sm active:scale-[0.98] transition-transform disabled:opacity-50 flex justify-center items-center">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add to Database'}
                    </button>
                    <button onClick={resetCamera} disabled={isSubmitting} className="w-full bg-white text-zinc-400 h-12 rounded-[1.2rem] font-bold tracking-wide text-sm active:scale-[0.98] transition-transform hover:text-zinc-600 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}