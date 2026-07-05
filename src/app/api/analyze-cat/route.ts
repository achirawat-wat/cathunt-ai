import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY
const JINA_API_KEY = process.env.JINA_API_KEY
const HF_BASE_URL = "https://router.huggingface.co/hf-inference/models"

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลรูปภาพ' }, { status: 400 })

    // ถอด Prefix (data:image/jpeg;base64,) ออก เพื่อส่งให้ AI
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // ==========================================
    // 1. ด่านแรก: เช็คว่าเป็นแมวไหม (ใช้ Hugging Face ViT - ยังฟรีอยู่)
    // ==========================================
    const detectRes = await fetch(`${HF_BASE_URL}/google/vit-base-patch16-224`, {
      headers: { 
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/octet-stream"
      },
      method: "POST",
      body: imageBuffer,
    })
    
    if (!detectRes.ok) throw new Error(`AI Detect error: ${detectRes.status}`)
    const detectData = await detectRes.json()

    const isCat = Array.isArray(detectData) && detectData.some((r: any) => {
      const label = r.label.toLowerCase()
      return (label.includes('cat') || label.includes('kitten') || label.includes('feline') || label.includes('tabby')) && r.score > 0.05
    })

    if (!isCat) {
      return NextResponse.json({ success: false, error: 'AI มองไม่เห็นแมวในรูปนี้' }, { status: 400 })
    }

    // ==========================================
    // 2. ด่านสอง: สกัด DNA แมว (ใช้ Jina AI CLIP - 512 มิติ)
    // ==========================================
    if (!JINA_API_KEY) {
      throw new Error("ระบบขาด JINA_API_KEY โปรดตั้งค่าใน Environment Variables")
    }

    const embedRes = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${JINA_API_KEY}`
      },
      body: JSON.stringify({
        model: "jina-clip-v1",
        // ลบ dimensions: 512 ทิ้งไปเลย เพราะมันส่ง 768 มาให้อยู่แล้ว
        input: [
          { image: imageBase64 }
        ]
      })
    })

    if (!embedRes.ok) {
      const errText = await embedRes.text()
      console.error("🚨 Jina Embed Error:", errText)
      throw new Error(`Jina Embedding error: ${embedRes.status} - ${errText}`)
    }
    
    const embedData = await embedRes.json()
    
    // ดึง Vector ออกมาจาก Response ของ Jina
    const catVector = embedData?.data?.[0]?.embedding

    // กันเหนียว: เช็คว่าได้ 512 มิติจริงไหม
    if (!Array.isArray(catVector) || catVector.length !== 768) {
        throw new Error(`Vector Mismatch: ได้ ${catVector?.length || 0} มิติแทนที่จะเป็น 512`);
    }

    // ==========================================
    // 3. ค้นหาแมวใน Database (Vector Search)
    // ==========================================
    const { data: matchedCats, error } = await supabase.rpc('match_cats', {
      query_embedding: catVector,
      match_threshold: 0.85, // ปรับลด/เพิ่ม ความแม่นยำได้ตรงนี้
      match_count: 1
    })

    if (error) {
      console.error("🚨 Supabase RPC Error:", error)
      throw error
    }

    return NextResponse.json({ 
      success: true, 
      matchType: matchedCats && matchedCats.length > 0 ? 'known' : 'new', 
      cat: matchedCats?.[0] || null,
      vector: catVector 
    })

  } catch (error: any) {
    console.error('Analyze API Fatal Error:', error)
    return NextResponse.json({ success: false, error: 'ระบบวิเคราะห์ขัดข้องชั่วคราว โปรดลองใหม่อีกครั้ง' }, { status: 503 })
  }
}