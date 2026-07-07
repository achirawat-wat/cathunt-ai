// src/app/hunt/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Check, MapPin, Plus, Navigation, Search, Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function HuntPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [hasCameraError, setHasCameraError] = useState(false)
  const [isCameraReady, setIsCameraReady] = useState(false)

  // 📸 State for captured images (Index 0 = cover shot, Index 1-3 = AI training angles)
  const [capturedImages, setCapturedImages] = useState<{ url: string, blob: Blob, vector: number[] }[]>([])
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)

  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)

  const [status, setStatus] = useState<'idle' | 'scanning' | 'result' | 'training'>('idle')
  const [errorPopup, setErrorPopup] = useState<string | null>(null)
  const [matchType, setMatchType] = useState<'known' | 'new' | null>(null)
  const [matchedCat, setMatchedCat] = useState<any>(null)

  const [newCatName, setNewCatName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showCatList, setShowCatList] = useState(false)
  const [allCats, setAllCats] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // 🎯 เก็บ % ความเหมือน (similarity) ของแมวแต่ละตัว key = cat.id, value = similarity (0-1)
  const [catSimilarities, setCatSimilarities] = useState<Record<string, number>>({})

  // ลำดับมุมที่ต้องการให้ถ่าย (หลังจากถ่ายหน้าปกแล้ว)
  const trainingAngles = ["Front", "Left side", "Right side"]

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

    const fetchCatsAndEncounters = async () => {
      const { data: catsData } = await supabase.from('cats').select('id, name, area')

      const { data: encountersData } = await supabase
        .from('encounters')
        .select('cat_id, user_id, lat, lng')
        .order('created_at', { ascending: false })

      if (catsData) {
        const catInfo = catsData.map(cat => {
          const catEncounters = encountersData?.filter(e => e.cat_id === cat.id) || []
          const userInteracted = catEncounters.some(e => e.user_id === user.id)
          const latestLoc = catEncounters.find(e => e.lat && e.lng)

          return {
            ...cat,
            hasInteracted: userInteracted,
            lat: latestLoc?.lat || null,
            lng: latestLoc?.lng || null
          }
        })
        setAllCats(catInfo)
      }
    }
    fetchCatsAndEncounters()

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop())
    }
  }, [user, router])

  const fetchLocationName = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`)
      const data = await res.json()
      console.log('nominatim address:', data.address) // เอาไว้ debug ดูว่าจริงๆ field ไหนมา
      return (
        data.address?.suburb ||
        data.address?.neighbourhood ||
        data.address?.quarter ||
        data.address?.city_district ||
        data.address?.town ||
        data.address?.city ||
        data.address?.state_district ||
        data.address?.county ||
        'Unknown Area'
      )
    } catch (error) {
      return 'Unknown Area'
    }
  }

  const handleCapture = async (isTrainingStep = false) => {
    if (navigator.vibrate) navigator.vibrate(50)

    if (!isTrainingStep && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          setLocation({ lat, lng, name: await fetchLocationName(lat, lng) })
        },
        () => { }, { enableHighAccuracy: true, timeout: 5000 }
      )
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (ctx) {
        const size = Math.min(video.videoWidth, video.videoHeight)
        const startX = (video.videoWidth - size) / 2
        const startY = (video.videoHeight - size) / 2

        canvas.width = 512
        canvas.height = 512

        ctx.drawImage(video, startX, startY, size, size, 0, 0, 512, 512)

        const base64Image = canvas.toDataURL('image/jpeg', 0.8)

        setTempImageUrl(base64Image)
        setStatus('scanning')

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8)
        })

        try {
          const res = await fetch('/api/analyze-cat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Image })
          })

          const result = await res.json()
          setTempImageUrl(null)

          if (!res.ok || !result.success) {
            setErrorPopup(result.error || 'Analysis failed. Try a different angle 😿')
            setStatus(isTrainingStep ? 'training' : 'idle')
            return
          }

          // 🎯 เก็บ similarity ของทุกตัวที่ backend เทียบมาให้ (ใช้โชว์ % ในลิสต์ "Select a cat")
          if (Array.isArray(result.matches)) {
            const simMap: Record<string, number> = {}
            result.matches.forEach((m: any) => {
              const catId = m?.id || m?.cat_id
              if (catId != null && typeof m.similarity === 'number') {
                // เลือกค่าที่ % สูงที่สุดเท่านั้น (ป้องกัน encounter เก่าๆ ที่ % ต่ำกว่ามาทับ)
                if (simMap[catId] === undefined || m.similarity > simMap[catId]) {
                  simMap[catId] = m.similarity
                }
              }
            })
            setCatSimilarities(simMap)
          }

          const newCapture = { url: base64Image, blob, vector: result.vector }
          const updatedCaptures = [...capturedImages, newCapture]
          setCapturedImages(updatedCaptures)

          // 🌟 เช็คเงื่อนไขจำนวนรูปที่เปลี่ยนไป (ต้องครบ 4 รูปสำหรับแมวใหม่)
          if (!isTrainingStep) {
            if (result.matchType === 'known') {
              setMatchedCat(result.cat)
              setMatchType('known')
              setStatus('result')
            } else {
              setMatchType('new')
              setStatus('training')
            }
          } else {
            // ถ้าโหมดเทรน ถ่ายรูปครบ 4 รูปแล้ว (ปก 1 + สอน 3) ถึงจะไปหน้าถัดไป
            if (updatedCaptures.length >= 4) {
              setStatus('result')
            } else {
              setStatus('training')
            }
          }

        } catch (error) {
          setTempImageUrl(null)
          setErrorPopup('Something went wrong. Please try again.')
          setStatus(isTrainingStep ? 'training' : 'idle')
        }
      }
    }
  }

  const submitEncounter = async () => {
    if (!user || capturedImages.length === 0) return
    setIsSubmitting(true)

    try {
      // 1. อัปโหลดเฉพาะ "รูปแรกสุด" (รูปหน้าปก) ไปเก็บที่ Storage แค่รูปเดียว!
      const mainImage = capturedImages[0]
      const fileName = `${user.id}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from('encounters').upload(fileName, mainImage.blob)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('encounters').getPublicUrl(fileName)

      let finalCatId = matchedCat?.id

      if (matchType === 'new') {
        if (!newCatName) {
          alert('Please give this cat a name.')
          setIsSubmitting(false)
          return
        }

        const { data: newCat, error: catError } = await supabase
          .from('cats')
          .insert({
            name: newCatName,
            area: location?.name || 'Unknown Area',
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString()
          })
          .select().single()

        if (catError) throw catError
        finalCatId = newCat.id
      } else {
        await supabase.from('cats').update({
          last_seen: new Date().toISOString(),
          area: location?.name || matchedCat.area // ถ้า GPS หาไม่เจอรอบนี้ ใช้ของเดิมไว้ก่อน ไม่ทับด้วย Unknown
        }).eq('id', finalCatId)
      }

      const finalDescription = description.trim() !== ''
        ? description.trim()
        : (matchType === 'new' ? `New discovery: ${newCatName}` : `Spotted ${matchedCat?.name}`)

      // 🌟 2. บันทึกโพสต์หลัก (ตัวนี้แหละที่จะไปโชว์บนฟีด)
      const { error: mainEncError } = await supabase
        .from('encounters')
        .insert({
          cat_id: finalCatId,
          user_id: user.id,
          image_url: publicUrl,
          description: finalDescription,
          lat: location?.lat || null,
          lng: location?.lng || null,
          location_name: location?.name || null, // 👈 เพิ่มบรรทัดนี้
          image_embedding: `[${capturedImages[0].vector.join(',')}]`,
          is_training: false
        })
      if (mainEncError) throw mainEncError

      // 🌟 3. บันทึกรูปที่ 2, 3, 4 เป็นแค่ Data แอบฝังไว้สอน AI (ไม่โชว์บนฟีด)
      if (capturedImages.length > 1) {
        const trainingRecords = capturedImages.slice(1).map(capture => ({
          cat_id: finalCatId,
          user_id: user.id,
          image_url: publicUrl, // แปะ URL รูปหลักไว้เฉยๆ ไม่ต้องอัปโหลดรูปซ้ำ
          description: 'AI Training Data',
          lat: location?.lat || null,
          lng: location?.lng || null,
          image_embedding: `[${capture.vector.join(',')}]`,
          is_training: true // 👈 แฟล็กบอกว่าเป็นแค่ Data ลับ!
        }))

        // Insert รวดเดียว 3 แถว
        const { error: trainError } = await supabase.from('encounters').insert(trainingRecords)
        if (trainError) throw trainError
      }

      // 4. อัปเดตสถิติโปรไฟล์
      const { data: profile } = await supabase.from('profiles').select('cats_found').eq('id', user.id).maybeSingle()
      await supabase.from('profiles').update({ cats_found: (profile?.cats_found || 0) + 1 }).eq('id', user.id)

      router.push('/feed')

    } catch (error: any) {
      alert('Failed to save. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleSelectCatManually = (cat: any) => {
    setMatchedCat(cat)
    setMatchType('known')
    setShowCatList(false)
    setStatus('result')
  }

  const handleDeclareAsNew = () => {
    setShowCatList(false)
    setMatchType('new')
    // เปลี่ยนเป้าหมายเป็น 4 รูป
    if (capturedImages.length < 4) {
      setStatus('training')
    } else {
      setStatus('result')
    }
  }

  const resetCamera = () => {
    setCapturedImages([])
    setTempImageUrl(null)
    setMatchedCat(null)
    setNewCatName('')
    setDescription('')
    setLocation(null)
    setShowCatList(false)
    setStatus('idle')
    setErrorPopup(null)
  }

  const filteredCats = allCats
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(c => ({
      ...c,
      distance: location ? getDistance(location.lat, location.lng, c.lat, c.lng) : Infinity,
      similarity: catSimilarities[c.id] ?? null // 🎯 แนบ % ความเหมือนเข้าไปในแต่ละตัว
    }))
    .sort((a, b) => {
      const isMatchA = matchedCat && a.id === matchedCat.id
      const isMatchB = matchedCat && b.id === matchedCat.id
      if (isMatchA && !isMatchB) return -1
      if (!isMatchA && isMatchB) return 1

      // 🎯 เรียงตาม similarity ก่อน ถ้ามีข้อมูลทั้งคู่
      if (a.similarity !== null && b.similarity !== null && a.similarity !== b.similarity) {
        return b.similarity - a.similarity
      }

      if (a.hasInteracted && !b.hasInteracted) return -1
      if (!a.hasInteracted && b.hasInteracted) return 1

      return a.distance - b.distance
    })

  return (
    <main className="relative flex h-full w-full flex-col bg-black text-white overflow-hidden">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Camera View & Frozen Images */}
      {hasCameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 px-6 text-center">
          <p className="text-zinc-400 font-medium text-sm mb-6">Camera access required</p>
          <button onClick={() => router.push('/feed')} className="px-6 py-3 bg-white text-zinc-900 font-bold rounded-full text-xs uppercase tracking-widest">Return</button>
        </div>
      ) : (
        <>
          {/* พื้นหลังดำเต็มจอ - จะเห็นเป็นแถบบน-ล่างรอบกรอบสี่เหลี่ยมจัตุรัส */}
          <div className="absolute inset-0 bg-black" />

          {/* กรอบสี่เหลี่ยมจัตุรัสตรงกลางจอ = พื้นที่จริงที่ระบบจะ crop ไปวิเคราะห์และบันทึก */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full aspect-square max-h-full overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isCameraReady && !tempImageUrl && status !== 'result' ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* ภาพฟรีซชั่วคราว */}
              {tempImageUrl && (
                <img src={tempImageUrl} alt="Scanning" className="absolute inset-0 w-full h-full object-cover" />
              )}

              {/* ภาพหน้าปกตอนเสร็จ (จะโชว์เสมอในหน้า Result) */}
              {capturedImages.length > 0 && status === 'result' && !tempImageUrl && (
                <img src={capturedImages[0].url} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
              )}

              <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>

              {/* กรอบเล็งแบบ Minimal ติดกับขอบสี่เหลี่ยมจัตุรัสจริง (หายไปตอนฟรีซภาพ) */}
              {(status === 'idle' || status === 'training') && isCameraReady && !tempImageUrl && (
                <div className="absolute inset-3 pointer-events-none opacity-70">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-[1.5px] border-l-[1.5px] border-white rounded-tl-2xl"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-[1.5px] border-r-[1.5px] border-white rounded-tr-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[1.5px] border-l-[1.5px] border-white rounded-bl-2xl"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[1.5px] border-r-[1.5px] border-white rounded-br-2xl"></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Error Popup Overlay */}
      {errorPopup && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white border border-zinc-100 p-8 rounded-[2rem] w-full max-w-sm flex flex-col items-center text-center animate-in zoom-in-95 fade-in duration-300 shadow-2xl pointer-events-auto">
            <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-6">
              <Search className="h-8 w-8 text-orange-500" />
            </div>
            <h3 className="text-zinc-900 font-black text-xl mb-3">No Cat Found!</h3>
            <p className="text-zinc-500 text-sm mb-8 leading-relaxed font-medium">
              {errorPopup}
            </p>
            <button
              onClick={() => {
                setErrorPopup(null)
                if (videoRef.current) {
                  videoRef.current.play().catch(console.error)
                }
              }}
              className="w-full h-14 bg-orange-500 text-white rounded-[1.2rem] font-bold active:scale-95 transition-transform shadow-md shadow-orange-500/20"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center p-6 pointer-events-none">
        <button onClick={() => router.back()} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-95 pointer-events-auto">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center pointer-events-none">
        {status === 'scanning' && (
          <div className="flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl px-6 py-4 rounded-2xl animate-in zoom-in-95">
            <Loader2 className="h-6 w-6 text-white animate-spin mb-3" />
            <span className="font-bold tracking-widest text-[10px] uppercase text-white">Analyzing Cat...</span>
          </div>
        )}
      </div>

      {/* แถบเมนูด้านล่าง */}
      <div className="relative z-10 w-full mt-auto pb-[120px]">

        {(status === 'idle' || status === 'training') && isCameraReady && (
          <div className="flex flex-col items-center justify-center pb-4 space-y-4">

            {status === 'training' && !tempImageUrl && (
              <div className="flex flex-col items-center space-y-2 px-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="bg-black/40 backdrop-blur-md px-5 py-2 rounded-full text-white font-bold text-xs tracking-wider">
                  📸 Capture angle: {trainingAngles[capturedImages.length - 1]} ({capturedImages.length}/3)
                </div>
                <p className="text-white/70 text-[11px] font-medium leading-snug max-w-[260px]">
                  Extra angles help our AI recognize this cat more accurately next time 🧠🐾
                </p>
              </div>
            )}

            {status === 'training' && (
              <div className="flex space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors ${i < capturedImages.length ? 'border-white' : 'border-white/20'}`}>
                    {i < capturedImages.length ? (
                      <img src={capturedImages[i].url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-black/50 flex items-center justify-center"><Camera className="w-4 h-4 text-white/30" /></div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ✅ ปุ่มถ่ายรูปเดียว ไม่ซ้ำ */}
            <button onClick={() => handleCapture(status === 'training')} className="w-20 h-20 rounded-full border-[3px] border-white/50 flex items-center justify-center active:scale-95 p-1.5 group mt-2">
              <div className="w-full h-full rounded-full bg-white group-active:bg-zinc-200"></div>
            </button>

            {status === 'training' && (
              <div className="flex flex-col items-center space-y-2 pt-2">
                {capturedImages.length < 4 && (
                  <button
                    onClick={() => setStatus('result')}
                    className="text-sm font-bold text-white underline underline-offset-4 shadow-sm drop-shadow-md"
                  >
                    {capturedImages.length > 1
                      ? `Cat ran off? Submit with ${capturedImages.length} photos`
                      : 'Cat ran off? Submit now'}
                  </button>
                )}
                <button onClick={() => setShowCatList(true)} className="text-xs font-medium text-white/60 underline underline-offset-4">
                  I already know this cat (skip training)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Modal: เลือกแมวเอง */}
        {showCatList && (
          <div className="absolute bottom-0 left-0 w-full h-[75vh] bg-white rounded-t-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom z-50 text-zinc-900 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl">Select a cat</h3>
              <button onClick={() => setShowCatList(false)}><X className="w-6 h-6 text-zinc-400" /></button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cat name..."
                className="w-full bg-zinc-100 rounded-xl h-12 pl-10 pr-4 outline-none font-bold text-zinc-700 focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pb-10">
              <button onClick={handleDeclareAsNew} className="w-full text-left p-4 bg-orange-50 hover:bg-orange-100 rounded-xl flex justify-between items-center mb-4 border border-orange-200 transition-colors">
                <div className="flex items-center space-x-2 text-orange-600">
                  <Plus className="w-5 h-5" />
                  <span className="font-bold">Add as a new cat (New Discovery)</span>
                </div>
              </button>

              {filteredCats.map(cat => {
                const isAIMatch = matchedCat && cat.id === matchedCat.id
                return (
                  <button key={cat.id} onClick={() => handleSelectCatManually(cat)} className={`w-full text-left p-4 rounded-xl flex justify-between items-center transition-colors ${isAIMatch ? 'bg-blue-50 border border-blue-200 hover:bg-blue-100' : 'bg-zinc-50 hover:bg-zinc-100'}`}>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-bold text-zinc-900">{cat.name}</span>
                        {isAIMatch && (
                          <span className="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                            🎯 AI suggested
                          </span>
                        )}
                        {cat.hasInteracted && !isAIMatch && (
                          <span className="text-[9px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">
                            ⭐ Seen before
                          </span>
                        )}
                        {typeof cat.similarity === 'number' && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${cat.similarity >= 0.85
                            ? 'bg-blue-100 text-blue-600'
                            : cat.similarity >= 0.6
                              ? 'bg-yellow-100 text-yellow-600'
                              : 'bg-zinc-100 text-zinc-400'
                            }`}>
                            {Math.round(cat.similarity * 100)}% match
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400 flex items-center mt-1">
                        {cat.area}
                        {cat.distance !== Infinity && ` • ${cat.distance < 1 ? (cat.distance * 1000).toFixed(0) + ' m' : cat.distance.toFixed(1) + ' km'} away`}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* หน้าจอสรุปผล */}
        {status === 'result' && !showCatList && (
          <div className="px-4">
            <div className="w-full bg-white rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-10 text-zinc-900 relative">

              <div className="absolute top-6 right-6">
                <div className="flex items-center space-x-1 text-green-500">
                  <Navigation className="h-3 w-3 fill-green-500" />
                  <span className="text-[9px] font-bold uppercase">GPS Active</span>
                </div>
              </div>

              {matchType === 'known' ? (
                <>
                  <div className="flex items-center space-x-2 text-zinc-400 mb-5">
                    <Check className="h-4 w-4" />
                    <span className="font-bold text-[10px] uppercase">Match Found</span>
                    {typeof matchedCat?.similarity === 'number' && (
                      <span className="ml-1 text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {Math.round(matchedCat.similarity * 100)}% match
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 rounded-[1.2rem] bg-zinc-100 overflow-hidden">
                      <img src={capturedImages[0].url} alt="Cat" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="font-black text-2xl tracking-tight text-zinc-900">{matchedCat?.name}</h3>
                      <p className="text-xs font-medium text-zinc-500 flex items-center">
                        <MapPin className="h-3 w-3 mr-1" /> {location?.name ? `Near ${location.name}` : 'Auto-detected'}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's the cat doing? (Optional)" className="w-full bg-zinc-50 rounded-[1.2rem] h-14 px-5 text-base font-bold outline-none" />
                  </div>

                  <div className="flex flex-col space-y-3">
                    <button onClick={submitEncounter} disabled={isSubmitting} className="w-full bg-zinc-900 text-white h-14 rounded-[1.2rem] font-bold flex justify-center items-center">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm Sighting'}
                    </button>
                    <button onClick={() => setShowCatList(true)} disabled={isSubmitting} className="w-full bg-zinc-100 text-zinc-600 h-14 rounded-[1.2rem] font-bold">
                      Not this cat (choose manually / new cat)
                    </button>
                    <button onClick={resetCamera} disabled={isSubmitting} className="w-full text-zinc-400 h-10 font-bold underline">
                      Retake
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-2 text-orange-500 mb-5">
                    <Plus className="h-4 w-4" />
                    <span className="font-bold text-[10px] uppercase">New Discovery</span>
                  </div>

                  <div className="space-y-4 mb-6">
                    <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Name this new cat" className="w-full bg-zinc-50 rounded-[1.2rem] h-14 px-5 font-bold outline-none border-2 border-orange-100 focus:border-orange-500" />
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (Optional)" className="w-full bg-zinc-50 rounded-[1.2rem] h-14 px-5 font-bold outline-none" />
                  </div>

                  <div className="flex flex-col space-y-3">
                    <button onClick={submitEncounter} disabled={isSubmitting || !newCatName} className="w-full bg-orange-500 text-white h-14 rounded-[1.2rem] font-bold flex justify-center items-center disabled:opacity-50">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Register new cat'}
                    </button>
                    <button onClick={() => setShowCatList(true)} disabled={isSubmitting} className="w-full bg-zinc-100 text-zinc-600 h-14 rounded-[1.2rem] font-bold">
                      I already know this cat
                    </button>
                    <button onClick={resetCamera} disabled={isSubmitting} className="w-full text-zinc-400 h-10 font-bold underline">
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