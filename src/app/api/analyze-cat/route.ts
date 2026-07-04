// src/app/api/analyze-cat/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

// ใช้ API Key ฟรีจาก Hugging Face
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json()
    
    // แปลงรูป Base64 กลับเป็น Binary (Buffer) เพื่อส่งให้ AI
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // ==========================================
    // 🧠 ด่านที่ 1: ตรวจว่าเป็นแมวไหม? (Image Classification)
    // ใช้โมเดล ViT ของ Google (แม่นยำและเบา)
    // ==========================================
    const detectRes = await fetch(
      "https://api-inference.huggingface.co/models/google/vit-base-patch16-224",
      {
        headers: { Authorization: `Bearer ${HF_API_KEY}` },
        method: "POST",
        body: imageBuffer,
      }
    )
    
    const detectData = await detectRes.json()

    // เช็คว่ามีคำว่า "cat" (เช่น tabby cat, tiger cat, Egyptian cat) ติดอันดับความน่าจะเป็นสูงๆ ไหม
    const isCat = detectData.some((result: any) => 
      result.label.toLowerCase().includes('cat') && result.score > 0.2
    )

    if (!isCat) {
      return NextResponse.json({ success: false, error: 'AI มองไม่เห็นแมวในรูปนี้ ลองถ่ายใหม่ให้ชัดขึ้นนะ 😿' }, { status: 400 })
    }

    // ==========================================
    // 🧬 ด่านที่ 2: สกัด DNA แมว (Feature Extraction)
    // ใช้โมเดล CLIP ของ OpenAI เพื่อแปลงรูปเป็น Vector (512 มิติ)
    // ==========================================
    const embedRes = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32",
      {
        headers: { Authorization: `Bearer ${HF_API_KEY}` },
        method: "POST",
        body: imageBuffer,
      }
    )

    const embedData = await embedRes.json()
    
    // API นี้จะคืนค่ากลับมาเป็น Array ตัวเลข 512 ตัว
    const catVector = embedData

    if (!Array.isArray(catVector) || catVector.length !== 512) {
      throw new Error('AI สกัด Vector ล้มเหลว')
    }

    // ==========================================
    // 🔍 ด่านที่ 3: ค้นหาใน Database (Vector Search)
    // ==========================================
    const { data: matchedCats, error } = await supabase.rpc('match_cats', {
      query_embedding: catVector,
      match_threshold: 0.85, // เหมือนกัน 85% ขึ้นไป (ปรับลดได้ถ้า AI หาไม่ค่อยเจอ)
      match_count: 1
    })

    if (error) throw error

    // ==========================================
    // 🎯 ด่านที่ 4: สรุปผลลัพธ์ส่งกลับหน้าบ้าน
    // ==========================================
    if (matchedCats && matchedCats.length > 0) {
      // 🟢 เจอแมวหน้าคล้ายในระบบ!
      return NextResponse.json({ 
        success: true, 
        matchType: 'known', 
        cat: matchedCats[0],
        vector: catVector // ส่ง DNA กลับไปเผื่อใช้อัปเดต
      })
    } else {
      // 🟠 แมวหน้าใหม่ ยังไม่มีในระบบ!
      return NextResponse.json({ 
        success: true, 
        matchType: 'new',
        vector: catVector // เอา DNA ไปบันทึกตอนสร้างแมวใหม่
      })
    }

  } catch (error: any) {
    console.error('Analyze API Error:', error)
    return NextResponse.json({ success: false, error: 'ระบบ AI ขัดข้อง หรือกำลังตื่นนอน (ลองกดใหม่อีกครั้ง)' }, { status: 500 })
  }
}