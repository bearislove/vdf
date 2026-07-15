# StoryForge — AI Video Production App
## Master Plan (for AI coding agent)

---

## 1. OVERVIEW

StoryForge là web app giúp người dùng tạo phim từ cốt chuyện văn bản, sử dụng AI để:
1. Phân tích và mở rộng cốt chuyện
2. Chia thành các cảnh quay (scenes)
3. Gọi ComfyUI để sinh ảnh tham chiếu và video cho từng cảnh
4. Ghép các cảnh thành tập phim, ghép các tập thành bộ phim hoàn chỉnh

**Mục tiêu UX:** Dễ dùng cho người không biết công nghệ và làm phim.

---

## 2. TECH STACK

| Thành phần | Công nghệ |
|---|---|
| Framework | Next.js 14 App Router (fullstack) |
| Database | PostgreSQL + Prisma ORM |
| Canvas editor | React Flow |
| State management | Zustand |
| Styling | Tailwind CSS + CSS Variables |
| File processing | fluent-ffmpeg (Node.js) |
| Realtime | ComfyUI WebSocket → Server-Sent Events |
| Container | Docker Compose |
| i18n | next-intl (VI / EN / ZH) |

---

## 3. DOCKER COMPOSE

```yaml
services:
  app:
    container_name: vdf_app
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [db]
    volumes:
      - ./storage:/app/storage
      - ${COMFYUI_OUTPUT_PATH}:/comfyui-output:ro

  db:
    container_name: vdf_db
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: storyforge
      POSTGRES_USER: storyforge
      POSTGRES_PASSWORD: storyforge
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 4. ENVIRONMENT VARIABLES (.env)

```env
# Database
DATABASE_URL=postgresql://storyforge:storyforge@db:5432/storyforge

# ComfyUI
COMFYUI_URL=http://localhost:8188
COMFYUI_WS_URL=ws://localhost:8188/ws
COMFYUI_OUTPUT_PATH=/path/to/ComfyUI/output
COMFYUI_TIMEOUT=300

# AI Provider (OpenAI-compatible)
AI_PROVIDER=openai            # openai | ollama
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_PATH=./storage
DEFAULT_IMAGE_MODEL=flux2-dev.safetensors
DEFAULT_VIDEO_MODEL=ltx-video-2b-v2.3-dev.safetensors
DEFAULT_LORA_DISTILLED=ltx_ic_lora_distilled.safetensors
```

---

## 5. INFORMATION ARCHITECTURE

### Hierarchy
```
Bộ phim (Film)
  └── Tập (Episode)
        └── Cảnh (Scene)
              └── Video Variant (nhiều bản video per scene)
```

### Navigation flow
```
Dashboard (Bộ phim) → Danh sách tập → Canvas Editor → Settings
```

---

## 6. DATABASE SCHEMA (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Film {
  id          String    @id @default(cuid())
  title       String
  description String    @default("")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  episodes    Episode[]
  @@map("films")
}

model Episode {
  id              String    @id @default(cuid())
  filmId          String    @map("film_id")
  order           Int       @default(0)
  title           String
  storyRaw        String    @default("") @map("story_raw")
  storyEnriched   String    @default("") @map("story_enriched")
  canvasState     String    @default("{}") @map("canvas_state") // React Flow JSON
  imageModel      String    @default("") @map("image_model")   // override per episode
  videoModel      String    @default("") @map("video_model")
  status          String    @default("draft") // draft|enriching|ready|generating|done
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  film            Film      @relation(fields: [filmId], references: [id], onDelete: Cascade)
  scenes          Scene[]
  storyObjects    StoryObject[]
  @@map("episodes")
}

model StoryObject {
  id                  String    @id @default(cuid())
  episodeId           String    @map("episode_id")
  type                String    // character | prop | environment
  name                String
  descriptionOriginal String    @default("") @map("description_original")
  descriptionEn       String    @default("") @map("description_en")
  refImages           String    @default("[]") @map("ref_images") // JSON: [{path, isMain, label}]
  audioRefPath        String?   @map("audio_ref_path")
  loraPath            String?   @map("lora_path")
  flux2Params         String    @default("{}") @map("flux2_params") // JSON
  canvasX             Float     @default(0) @map("canvas_x")
  canvasY             Float     @default(0) @map("canvas_y")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  episode             Episode   @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  sceneLinks          SceneObjectLink[]
  generationJobs      GenerationJob[]
  @@map("story_objects")
}

model Scene {
  id                  String    @id @default(cuid())
  episodeId           String    @map("episode_id")
  order               Int       @default(0)
  title               String    @default("")
  descriptionOriginal String    @default("") @map("description_original")
  promptEn            String    @default("") @map("prompt_en")
  promptEnOverride    String?   @map("prompt_en_override")
  cameraDirection     String    @default("") @map("camera_direction")
  shotType            String    @default("medium") @map("shot_type") // wide|medium|close|aerial|pov
  mood                String    @default("")
  lightingNote        String    @default("") @map("lighting_note")
  transitionsTo       String    @default("[]") @map("transitions_to") // JSON: scene ID array
  compositeImagePath  String?   @map("composite_image_path")
  selectedVideoId     String?   @map("selected_video_id")
  videoModel          String    @default("") @map("video_model") // override per scene
  videoParams         String    @default("{}") @map("video_params") // JSON
  canvasX             Float     @default(0) @map("canvas_x")
  canvasY             Float     @default(0) @map("canvas_y")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  episode             Episode   @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  objectLinks         SceneObjectLink[]
  videoVariants       VideoVariant[]
  generationJobs      GenerationJob[]
  @@map("scenes")
}

model SceneObjectLink {
  id           String      @id @default(cuid())
  sceneId      String      @map("scene_id")
  objectId     String      @map("object_id")
  role         String      @default("present") // main | present | mentioned
  strengthHint Float       @default(1.0) @map("strength_hint")
  scene        Scene       @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  object       StoryObject @relation(fields: [objectId], references: [id], onDelete: Cascade)
  @@unique([sceneId, objectId])
  @@map("scene_object_links")
}

model VideoVariant {
  id                 String    @id @default(cuid())
  sceneId            String    @map("scene_id")
  paramsSnapshot     String    @map("params_snapshot")        // JSON — full params used
  workflowSnapshot   String    @default("") @map("workflow_snapshot") // ComfyUI workflow JSON
  comfyPromptId      String?   @map("comfy_prompt_id")
  comfyClientId      String?   @map("comfy_client_id")
  status             String    @default("queued")
  // queued | generating_image | generating_video | done | failed
  statusMessage      String    @default("") @map("status_message")
  errorDetail        String?   @map("error_detail")
  currentNode        String?   @map("current_node")
  progressStep       Int       @default(0) @map("progress_step")
  progressTotal      Int       @default(0) @map("progress_total")
  compositeImagePath String?   @map("composite_image_path")
  videoPath          String?   @map("video_path")
  lastFramePath      String?   @map("last_frame_path")
  thumbnailPath      String?   @map("thumbnail_path")
  durationSeconds    Float?    @map("duration_seconds")
  modelUsed          String    @default("") @map("model_used")
  strategy           String    @default("") // t2v | i2v_single | i2v_composite | ic_lora
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  completedAt        DateTime? @map("completed_at")
  scene              Scene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  @@map("video_variants")
}

model GenerationJob {
  id             String    @id @default(cuid())
  sceneId        String?   @map("scene_id")
  objectId       String?   @map("object_id")
  variantId      String?   @map("variant_id")
  jobType        String    @map("job_type")
  // flux2_ref_image | flux2_composite | ltx_video | wan_video | extract_last_frame
  comfyPromptId  String?   @map("comfy_prompt_id")
  comfyClientId  String?   @map("comfy_client_id")
  comfyServerUrl String    @map("comfy_server_url")
  status         String    @default("queued")
  // queued | running | done | failed | cancelled
  currentNode    String?   @map("current_node")
  progressStep   Int       @default(0) @map("progress_step")
  progressTotal  Int       @default(0) @map("progress_total")
  statusMessage  String    @default("") @map("status_message")
  errorDetail    String?   @map("error_detail")
  inputSnapshot  String    @default("{}") @map("input_snapshot")
  outputPath     String?   @map("output_path")
  queuedAt       DateTime  @default(now()) @map("queued_at")
  startedAt      DateTime? @map("started_at")
  completedAt    DateTime? @map("completed_at")
  scene          Scene?        @relation(fields: [sceneId], references: [id])
  object         StoryObject?  @relation(fields: [objectId], references: [id])
  @@map("generation_jobs")
}

model AppConfig {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("app_config")
}
```

---

## 7. FILE STRUCTURE

```
storyforge/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout, ThemeProvider, i18n
│   │   ├── page.tsx                      # Redirect → /films
│   │   ├── films/
│   │   │   ├── page.tsx                  # Screen 1: Bộ phim dashboard
│   │   │   └── new/page.tsx              # Tạo bộ phim mới
│   │   ├── films/[filmId]/
│   │   │   ├── page.tsx                  # Screen 2: Danh sách tập
│   │   │   └── episodes/[episodeId]/
│   │   │       └── page.tsx              # Screen 3-5: Canvas Editor
│   │   ├── settings/
│   │   │   └── page.tsx                  # Screen 6: Settings
│   │   └── api/
│   │       ├── films/
│   │       │   ├── route.ts              # GET list, POST create
│   │       │   └── [filmId]/route.ts     # GET, PUT, DELETE
│   │       ├── episodes/
│   │       │   ├── route.ts
│   │       │   ├── [episodeId]/route.ts
│   │       │   └── [episodeId]/enrich/route.ts  # POST: AI enrichment
│   │       ├── scenes/
│   │       │   ├── route.ts
│   │       │   └── [sceneId]/route.ts
│   │       ├── objects/
│   │       │   ├── route.ts
│   │       │   └── [objectId]/route.ts
│   │       ├── videos/
│   │       │   ├── route.ts              # POST: trigger generation
│   │       │   └── [variantId]/route.ts
│   │       ├── jobs/
│   │       │   └── [jobId]/stream/route.ts  # GET: SSE progress stream
│   │       ├── comfyui/
│   │       │   ├── models/route.ts       # GET: list models from ComfyUI
│   │       │   ├── status/route.ts       # GET: ComfyUI connection status
│   │       │   └── upload/route.ts       # POST: upload image to ComfyUI
│   │       ├── merge/route.ts            # POST: merge episodes/scenes (FFmpeg)
│   │       └── files/[...path]/route.ts  # GET: serve storage files
│   ├── components/
│   │   ├── ui/                           # Reusable primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Slider.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── UploadZone.tsx
│   │   │   ├── PhotoGrid.tsx             # Ảnh gallery với chọn ảnh chính
│   │   │   └── LanguageSelect.tsx
│   │   ├── layout/
│   │   │   ├── Topbar.tsx                # Header chung
│   │   │   ├── Breadcrumb.tsx
│   │   │   ├── ModeToggle.tsx            # Simple / Pro toggle
│   │   │   └── ThemeToggle.tsx
│   │   ├── films/
│   │   │   ├── FilmCard.tsx
│   │   │   ├── FilmGrid.tsx
│   │   │   └── MergeStrip.tsx            # Ghép tập UI
│   │   ├── episodes/
│   │   │   ├── EpisodeCard.tsx
│   │   │   └── EpisodeGrid.tsx
│   │   ├── canvas/
│   │   │   ├── CanvasEditor.tsx          # React Flow wrapper
│   │   │   ├── SceneNode.tsx             # Custom React Flow node
│   │   │   ├── SceneEdge.tsx             # Custom edge
│   │   │   ├── ObjectPanel.tsx           # Sidebar trái
│   │   │   ├── ObjectCard.tsx            # 1 object trong panel trái
│   │   │   ├── RightPanel.tsx            # Context-sensitive sidebar phải
│   │   │   ├── SceneDetailPanel.tsx      # Nội dung khi click scene
│   │   │   ├── ObjectDetailPanel.tsx     # Nội dung khi click object
│   │   │   ├── EmptyPanel.tsx            # Trạng thái chưa chọn gì
│   │   │   ├── VariantList.tsx           # Danh sách video variants
│   │   │   ├── ParamsSimple.tsx          # Simple mode params
│   │   │   └── ParamsPro.tsx             # Pro mode params
│   │   └── settings/
│   │       ├── SettingsNav.tsx
│   │       ├── ComfyUISettings.tsx
│   │       ├── ModelsSettings.tsx
│   │       ├── AIProviderSettings.tsx
│   │       └── StorageSettings.tsx
│   ├── lib/
│   │   ├── prisma.ts                     # Prisma client singleton
│   │   ├── storage.ts                    # File path helpers, copy files
│   │   ├── ffmpeg.ts                     # extract last frame, concat, thumbnail
│   │   ├── ai/
│   │   │   ├── provider.ts               # Abstract AI provider (OpenAI / Ollama)
│   │   │   ├── enrichment.ts             # 3-call pipeline: translate → scenes → objects
│   │   │   └── prompts.ts                # Prompt templates
│   │   └── comfyui/
│   │       ├── client.ts                 # ComfyUI REST + WebSocket client
│   │       ├── workflow-builder.ts       # Build ComfyUI workflow JSON dynamically
│   │       ├── workflows/
│   │       │   ├── flux2-ref-image.ts    # FLUX2 → sinh ảnh object reference
│   │       │   ├── flux2-composite.ts    # FLUX2 → ghép 2+ nhân vật vào 1 ảnh
│   │       │   ├── ltx-i2v.ts            # LTX-2.3 Image-to-Video
│   │       │   ├── ltx-t2v.ts            # LTX-2.3 Text-to-Video
│   │       │   └── wan-video.ts          # Wan2.2 Video
│   │       └── strategy.ts              # Chọn strategy dựa trên số nhân vật
│   ├── hooks/
│   │   ├── useTranslation.ts             # i18n hook
│   │   ├── useMode.ts                    # Simple/Pro mode
│   │   ├── useComfyUIStatus.ts           # Polling ComfyUI connection
│   │   ├── useJobProgress.ts             # SSE hook for job progress
│   │   └── useModels.ts                  # Fetch available models from ComfyUI
│   ├── types/
│   │   ├── index.ts                      # Re-export all types
│   │   ├── film.ts
│   │   ├── episode.ts
│   │   ├── scene.ts
│   │   ├── object.ts
│   │   ├── video.ts
│   │   ├── job.ts
│   │   └── comfyui.ts                    # ComfyUI API types
│   ├── store/
│   │   ├── useAppStore.ts                # Zustand: global app state
│   │   ├── useCanvasStore.ts             # Zustand: canvas editor state
│   │   └── useSettingsStore.ts           # Zustand: settings
│   └── i18n/
│       ├── config.ts                     # next-intl config
│       └── locales/
│           ├── vi.json                   # Tiếng Việt
│           ├── en.json                   # English
│           └── zh.json                   # 中文
├── prisma/
│   └── schema.prisma
├── public/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── tailwind.config.ts
└── next.config.ts
```

---

## 8. UI DESIGN SYSTEM

### Theme (Dark default)
```css
/* CSS Variables — dark theme */
--bg0: #0F0F0F;       /* deepest bg */
--bg1: #1A1A1A;       /* surface */
--bg2: #242424;       /* elevated */
--bg3: #2E2E2E;       /* hover */
--border: #333333;    /* default border */
--border2: #444444;   /* emphasized border */
--text1: #F0EEEA;     /* primary text */
--text2: #A09E98;     /* secondary text */
--text3: #666460;     /* muted text */
--accent: #FF9C2A;    /* brand color */
--accent-dim: #2A1E0A; /* accent bg tint */
--green: #2ECC71;     /* success */
--green-dim: #0D2B1A;
--red: #E24B4A;       /* error */
--blue: #5B9CF6;      /* info */
```

### Component naming convention
- Atomic: `Button`, `Badge`, `Input`, `Slider`
- Composite: `PhotoGrid`, `ProgressBar`, `UploadZone`
- Feature: `SceneNode`, `ObjectCard`, `VariantList`
- Page sections: `FilmGrid`, `EpisodeGrid`, `CanvasEditor`

### UI Modes
- **Simple mode** (default): Ẩn technical params. Chỉ hiện prompt, aspect ratio, quality preset, seed
- **Pro mode**: Hiện full params — CFG, steps, sampler, scheduler, LoRA stack, ControlNet, reference weights

Toggle nằm trên Topbar, persist vào localStorage.

---

## 9. I18N STRUCTURE

```json
// vi.json (mẫu, EN và ZH tương tự)
{
  "common": {
    "save": "Lưu",
    "cancel": "Hủy",
    "delete": "Xóa",
    "create": "Tạo",
    "edit": "Chỉnh sửa",
    "loading": "Đang tải...",
    "error": "Đã xảy ra lỗi",
    "success": "Thành công"
  },
  "nav": {
    "films": "Bộ phim",
    "settings": "Cài đặt",
    "backTo": "Quay lại"
  },
  "film": {
    "title": "Bộ phim của bạn",
    "new": "Bộ phim mới",
    "episodes": "tập",
    "scenes": "cảnh",
    "merge": "Ghép tập thành phim hoàn chỉnh",
    "mergeAction": "Ghép {count} tập đã chọn",
    "status": {
      "draft": "Bản nháp",
      "inProgress": "Đang thực hiện",
      "done": "Hoàn thành"
    }
  },
  "episode": {
    "title": "Các tập phim",
    "new": "Thêm tập",
    "episode": "Tập"
  },
  "canvas": {
    "objects": "Đối tượng — kéo vào scene",
    "addObject": "Thêm đối tượng",
    "noSelection": "Click vào scene để chỉnh sửa cảnh",
    "dragHint": "Kéo đối tượng từ panel trái vào scene",
    "scene": "Cảnh",
    "generate": "Tạo video",
    "addVariant": "Tạo thêm bản mới",
    "variants": "Các bản video",
    "selectMain": "Chọn làm chính",
    "mode": {
      "simple": "Simple",
      "pro": "Pro"
    }
  },
  "object": {
    "types": {
      "character": "Nhân vật",
      "prop": "Prop",
      "environment": "Môi trường"
    },
    "refImages": "Ảnh tham chiếu",
    "mainImage": "Ảnh chính",
    "setMain": "Đặt làm chính",
    "uploadImages": "Kéo ảnh vào đây",
    "generateImage": "Generate ảnh từ mô tả",
    "voiceRef": "Giọng tham chiếu",
    "appearsIn": "Xuất hiện trong",
    "noImages": "Chưa có ảnh nào",
    "imageHint": "Nên có ảnh mặt trước, bên cạnh, 3/4"
  },
  "params": {
    "description": "Mô tả cảnh",
    "duration": "Thời lượng",
    "quality": "Chất lượng",
    "qualityOptions": {
      "fast": "Nhanh (draft)",
      "balanced": "Cân bằng",
      "high": "Chất lượng cao"
    },
    "seed": "Seed",
    "cfgScale": "CFG scale",
    "steps": "Steps",
    "sampler": "Sampler",
    "scheduler": "Scheduler",
    "denoise": "Denoise",
    "guidance": "Flux guidance",
    "resolution": "Resolution",
    "batchSize": "Batch size",
    "lora": "LoRA",
    "controlnet": "ControlNet",
    "precision": "Precision"
  },
  "settings": {
    "title": "Cài đặt",
    "sections": {
      "comfyui": "ComfyUI",
      "models": "Models",
      "ai": "AI Provider",
      "storage": "Storage",
      "about": "Về app"
    },
    "comfyui": {
      "url": "Server URL",
      "timeout": "Timeout (giây)",
      "test": "Kiểm tra",
      "connected": "Đang chạy",
      "disconnected": "Không kết nối được"
    },
    "models": {
      "imageModel": "Image model",
      "videoModel": "Video model",
      "vae": "VAE",
      "distilledLora": "Distilled LoRA",
      "reload": "Reload từ ComfyUI"
    },
    "ai": {
      "provider": "Provider",
      "apiUrl": "API URL",
      "apiKey": "API Key",
      "model": "Model"
    }
  },
  "generation": {
    "strategy": {
      "t2v": "Text-to-Video",
      "i2v_single": "Image-to-Video (1 nhân vật)",
      "i2v_composite": "FLUX2 composite + I2V (2+ nhân vật)",
      "ic_lora": "IC-LoRA"
    },
    "warnings": {
      "twoCharacters": "2 nhân vật → FLUX2 composite + LTX I2V",
      "threeCharacters": "3+ nhân vật → khuyên dùng Wan2.2",
      "closeUp": "Close-up cảm xúc → kết quả tốt hơn với Wan2.2",
      "longScene": "Cảnh dài hơn 4s → có thể bị flickering"
    }
  }
}
```

---

## 10. AI ENRICHMENT PIPELINE

Khi user upload cốt chuyện, gọi AI **3 lần tuần tự**:

### Call 1 — Translate + Expand
```
System: You are a professional screenwriter and film director.
User: Translate the following story to English and expand it with cinematic details,
      character emotions, lighting, atmosphere. Keep the core plot intact.
      Output ONLY the expanded English story text.

Input: [raw story text]
```

### Call 2 — Parse Scenes
```
System: You are a film production assistant.
User: Break this story into scenes for video generation.
      Return ONLY valid JSON, no markdown, no explanation.
      
      Schema:
      {
        "scenes": [{
          "id": "scene_1",
          "order": 1,
          "title": "short title",
          "description_original": "...", // in original language
          "prompt_en": "detailed English prompt optimized for video generation",
          "camera_direction": "slow tracking left",
          "shot_type": "medium", // wide|medium|close|aerial|pov
          "mood": "tense",
          "lighting_note": "golden hour",
          "transitions_to": ["scene_2"]
        }]
      }

Input: [expanded story]
```

### Call 3 — Extract Objects + Links
```
System: You are a film production assistant.
User: Extract all story objects (characters, props, environments) and link them to scenes.
      Return ONLY valid JSON.
      
      Schema:
      {
        "objects": [{
          "id": "obj_1",
          "type": "character", // character|prop|environment
          "name": "...",
          "description_original": "...",
          "description_en": "detailed English description for image generation"
        }],
        "links": [{
          "scene_id": "scene_1",
          "object_ids": ["obj_1", "obj_2"],
          "roles": {"obj_1": "main", "obj_2": "present"}
        }]
      }

Input: [scenes JSON] + [expanded story]
```

---

## 11. COMFYUI INTEGRATION

### REST Endpoints used
```
GET  /models/{type}     → list checkpoints, loras, vae, controlnet, diffusion_models
GET  /object_info       → list all available nodes and their params
POST /prompt            → submit workflow → returns {prompt_id}
GET  /history/{id}      → get result after completion
POST /upload/image      → upload reference image
GET  /view?filename=... → download output file
```

### WebSocket Events
```
ws://localhost:8188/ws?clientId={uuid}

Events received:
- status          → queue state changed
- execution_start → prompt started
- executing       → {node: "NodeName"} — currently running node
- progress        → {value: 11, max: 25} — sampler step progress
- executed        → node finished, has output
- executing(null) → entire workflow complete
```

### SSE relay (Next.js API → Frontend)
```
GET /api/jobs/{jobId}/stream

Emits:
data: {"type":"progress","step":11,"total":25,"node":"LTXSampler","pct":44}
data: {"type":"status","message":"Đang tạo composite image..."}
data: {"type":"done","videoPath":"/storage/...","thumbnailPath":"..."}
data: {"type":"error","message":"...","detail":"..."}
```

---

## 12. GENERATION STRATEGY

App tự chọn strategy dựa vào số nhân vật được gắn vào scene:

```typescript
// lib/comfyui/strategy.ts

function chooseStrategy(scene: Scene, objects: StoryObject[]) {
  const characters = objects.filter(o => o.type === 'character')
  
  if (characters.length === 0) {
    return 't2v'                    // Text-to-Video thuần
  }
  
  if (characters.length === 1) {
    const hasLora = !!characters[0].loraPath
    return hasLora ? 'ic_lora' : 'i2v_single'  // IC-LoRA nếu có, không thì I2V
  }
  
  if (characters.length === 2) {
    return 'i2v_composite'          // FLUX2 composite → LTX I2V
  }
  
  // 3+ characters → warn user, suggest Wan2.2
  return 'i2v_composite'
}
```

### Workflow per strategy

**t2v:** `LTX T2V workflow` — prompt only

**i2v_single:**
1. FLUX2 ref image workflow → generate/reuse ref image
2. LTX I2V workflow với ref image làm first frame

**i2v_composite:**
1. FLUX2 composite workflow với 2+ ref images → composite.png
2. LTX I2V workflow với composite.png làm first frame

**ic_lora:**
1. Load IC-LoRA weights
2. LTX I2V với `LTXICLoRALoaderModelOnly` + `LTXAddVideoICLoRAGuide`

### Last-frame chaining
Mỗi scene generate xong → FFmpeg extract last frame → lưu vào `video_variant.last_frame_path`
→ Scene tiếp theo dùng last frame này làm end-frame guide (`LTXVAddGuideAdvanced`)

---

## 13. COMFYUI PARAMS

### Image generation (FLUX2)

| Param | Node | Range | Default | Mode |
|---|---|---|---|---|
| positive_prompt | CLIPTextEncode | text | — | Simple |
| negative_prompt | CLIPTextEncode | text | blurry, deformed... | Simple |
| width | EmptyLatentImage | 64–2048 (×64) | 1024 | Simple (via ratio preset) |
| height | EmptyLatentImage | 64–2048 (×64) | 1024 | Simple (via ratio preset) |
| seed | RandomNoise | -1–2^63 | -1 | Simple |
| steps | SamplerCustomAdvanced | 4–60 | 25 | Simple (via quality preset) |
| flux_guidance | FluxGuidance | 1.0–10.0 | 3.5 | Pro |
| cfg_scale | KSampler | 1.0–15.0 | 1.0 | Pro |
| sampler_name | KSamplerSelect | euler, euler_ancestral, dpmpp_2m, heun... | euler | Pro |
| scheduler | BasicScheduler | normal, karras, beta, sgm_uniform... | normal | Pro |
| denoise | KSampler | 0.0–1.0 | 1.0 | Pro |
| batch_size | EmptyLatentImage | 1–4 | 1 | Pro |
| lora_name | LoraLoader | .safetensors filename | — | Pro |
| lora_strength | LoraLoader | 0.0–2.0 | 1.0 | Pro |
| controlnet_type | ControlNetLoader | pose, depth, canny, lineart | — | Pro |
| controlnet_strength | ControlNetApply | 0.0–1.0 | 0.8 | Pro |
| ref_images | Flux2ImageNode | up to 6 images | — | Pro |
| ref_weight | Flux2ImageNode | 0.0–1.0 per image | 1.0 | Pro |
| precision | UNETLoader | bf16, fp8, fp16 | bf16 | Pro |

**Note:** FLUX2 dùng `FluxGuidance` thay CFG. Negative prompt chỉ có tác dụng với KSampler + CFG > 1.

### Quality presets (Simple mode)
```
Fast:    steps=15, flux_guidance=3.0
Balanced: steps=25, flux_guidance=3.5
High:    steps=40, flux_guidance=3.5
```

### Aspect ratio presets
```
1:1  → 1024×1024  (portrait headshot)
2:3  → 768×1152   (portrait full body)
3:2  → 1152×768   (landscape)
16:9 → 1280×720   (widescreen)
9:16 → 720×1280   (vertical video)
```

### Video generation (LTX-2.3)

| Param | Node | Range | Default | Mode |
|---|---|---|---|---|
| prompt_en | LTXVConditioning | text | — | Simple |
| num_frames | EmptyLTXVLatentVideo | 25–257 | 97 (~4s@24fps) | Simple (via duration) |
| seed | RandomNoise | -1–2^63 | -1 | Simple |
| first_frame_strength | LTXVAddGuideAdvanced | 0.0–1.0 | 0.95 | Simple |
| last_frame_strength | LTXVAddGuideAdvanced | 0.0–1.0 | 0.70 | Simple |
| steps | SamplerCustomAdvanced | 10–50 | 25 | Pro |
| cfg | CFGGuider | 1.0–7.0 | 3.0 | Pro |
| cross_modal_sync | LTXMultimodalGuider | 0.0–1.0 | 0.3 | Pro |
| width | EmptyLTXVLatentVideo | 512–2560 | 1280 | Pro |
| height | EmptyLTXVLatentVideo | 512–1440 | 720 | Pro |
| fps | EmptyLTXVLatentVideo | 8–50 | 24 | Pro |
| ic_lora_strength | LTXAddVideoICLoRAGuide | 0.0–1.0 | 1.0 | Pro |
| audio_ref | LTXVReferenceAudio | audio file | — | Pro |

### Duration presets
```
2s → 49 frames
4s → 97 frames   (default, sweet spot cho LTX-2.3)
6s → 145 frames
8s → 193 frames  (warn: may flicker)
```

---

## 14. STORAGE STRUCTURE

```
/storage/
├── films/{filmId}/
│   └── episodes/{episodeId}/
│       ├── objects/{objectId}/
│       │   ├── ref_images/
│       │   │   ├── 001_front.png
│       │   │   ├── 002_side.png
│       │   │   └── 003_34view.png
│       │   └── audio_ref.wav
│       └── scenes/{sceneId}/
│           ├── composite.png
│           ├── last_frame.png
│           └── variants/{variantId}/
│               ├── video.mp4
│               ├── thumbnail.jpg
│               └── last_frame.png
└── exports/
    └── {filmId}_{timestamp}_merged.mp4
```

---

## 15. BUILD PHASES

### Phase 1 — Foundation
- [ ] `docker-compose.yml` + `Dockerfile`
- [ ] `.env.example`
- [ ] `prisma/schema.prisma` (full schema above)
- [ ] Next.js 14 project setup + Tailwind + Shadcn
- [ ] CSS variables dark theme + `#FF9C2A` accent
- [ ] `lib/prisma.ts` singleton
- [ ] `lib/storage.ts` path helpers
- [ ] Basic i18n setup (vi/en/zh JSON files + next-intl config)

### Phase 2 — AI Enrichment
- [ ] `lib/ai/provider.ts` — OpenAI/Ollama abstraction
- [ ] `lib/ai/prompts.ts` — 3 prompt templates
- [ ] `lib/ai/enrichment.ts` — 3-call pipeline
- [ ] `POST /api/episodes/[id]/enrich` — streaming SSE response
- [ ] Upload UI (drag & drop .md/.txt, paste text)
- [ ] Enrichment progress UI

### Phase 3 — Canvas Editor
- [ ] React Flow canvas setup
- [ ] `SceneNode` custom component
- [ ] `ObjectPanel` sidebar trái
- [ ] `ObjectCard` with photo thumbnail
- [ ] `RightPanel` context-sensitive
- [ ] `SceneDetailPanel`
- [ ] `ObjectDetailPanel` with `PhotoGrid`
- [ ] `EmptyPanel`
- [ ] `ModeToggle` Simple/Pro
- [ ] Drag object → scene (React Flow + DnD)
- [ ] Auto-layout scenes after enrichment
- [ ] Save canvas state to DB on change

### Phase 4 — ComfyUI Integration
- [ ] `lib/comfyui/client.ts` — REST + WS client
- [ ] `GET /api/comfyui/models` — proxy model list
- [ ] `GET /api/comfyui/status` — connection check
- [ ] `lib/comfyui/workflows/flux2-ref-image.ts`
- [ ] `lib/comfyui/workflows/flux2-composite.ts`
- [ ] `lib/comfyui/workflows/ltx-i2v.ts`
- [ ] `lib/comfyui/workflows/ltx-t2v.ts`
- [ ] `lib/comfyui/workflows/wan-video.ts`
- [ ] `lib/comfyui/strategy.ts`
- [ ] `lib/comfyui/workflow-builder.ts` — assembles full workflow
- [ ] `POST /api/videos` — trigger generation job
- [ ] WS → SSE relay server
- [ ] `GET /api/jobs/[id]/stream` — SSE progress
- [ ] `useJobProgress` hook
- [ ] Progress UI trong SceneNode

### Phase 5 — Review + Chaining
- [ ] `VariantList` component
- [ ] Video player inline trong panel phải
- [ ] Chọn video chính per scene
- [ ] `lib/ffmpeg.ts` — extract last frame, thumbnail, concat
- [ ] Last-frame auto-attach khi generate scene tiếp
- [ ] `POST /api/merge` — merge episodes/scenes
- [ ] `MergeStrip` UI

### Phase 6 — Polish
- [ ] Settings page (6 tabs)
- [ ] Smart warnings (2+ nhân vật, close-up, scene > 4s)
- [ ] Style preset gallery
- [ ] AI prompt rewriter
- [ ] Storyboard view
- [ ] Export button
- [ ] Light theme (optional toggle)
- [ ] Error handling toasts
- [ ] Loading skeletons

---

## 16. KEY IMPLEMENTATION NOTES

### Tái sử dụng code
- Tất cả utility functions đặt trong `lib/utils/`
- Các hàm format (date, duration, filesize) → `lib/utils/format.ts`
- Các hàm validate → `lib/utils/validate.ts`
- API fetch helpers → `lib/utils/api.ts`
- ComfyUI param defaults → `lib/comfyui/defaults.ts`

### Component patterns
- Mọi component nhận `className` prop để extend styling
- Props drilling tối đa 2 cấp — dùng Zustand nếu cần sâu hơn
- Loading/error state xử lý trong mỗi component
- Tất cả text user-facing đi qua `useTranslation` hook

### Error handling
- ComfyUI down → hiện warning banner, disable generate buttons
- Job failed → hiện error message rõ ràng + retry button
- AI call failed → cho phép retry với model khác
- File not found → placeholder image/video

### Performance
- Canvas state debounce save (500ms) để không gọi DB liên tục
- Model list cache 5 phút, manual refresh available
- Video thumbnails lazy load
- SSE connection auto-reconnect nếu bị ngắt

---

## 17. SMART WARNINGS

App tự động phát hiện và hiển thị warning:

| Điều kiện | Warning | Action gợi ý |
|---|---|---|
| 2 nhân vật trong scene | "2 nhân vật → FLUX2 composite + LTX I2V" | Info only |
| 3+ nhân vật trong scene | "3+ nhân vật giảm chất lượng LTX" | Suggest Wan2.2 |
| shot_type = close | "Close-up cảm xúc → kết quả tốt hơn với Wan2.2" | Suggest Wan2.2 |
| duration > 4s | "Cảnh dài hơn 4s có thể bị flickering" | Suggest chia scene |
| Object chưa có ảnh | "Thêm ảnh để tăng độ nhất quán" | Button add image |
| ComfyUI offline | "ComfyUI không kết nối được" | Check settings |

---

## 18. NOTES FOR AI CODING AGENT

1. **Bắt đầu từ Phase 1** — không skip, mỗi phase depend vào phase trước
2. **Prisma schema là source of truth** — generate types từ schema, không tự viết type
3. **Mọi ComfyUI workflow JSON** phải test được bằng cách paste vào ComfyUI UI trước
4. **i18n bắt buộc** — không hardcode string trong component, luôn dùng `t('key')`
5. **Dark theme mặc định** — CSS variables approach, không hardcode màu trong component
6. **Accent color là `#FF9C2A`** — dùng cho buttons primary, active borders, progress bars, badges accent
7. **Component tách nhỏ** — mỗi file không quá 200 lines, tách logic ra hooks
8. **Không có auth** — single user app, không cần login
9. **File serve** — Next.js route `/api/files/[...path]` serve từ `/storage`, không expose path trực tiếp
10. **SSE thay WebSocket ở client** — ComfyUI WS chỉ ở server-side, client dùng SSE từ Next.js API

---

## 19. DESIGN SYSTEM — TOKENS

### Colors
```css
/* === DARK THEME (default) === */
--bg0: #0F0F0F;        /* page background — deepest */
--bg1: #1A1A1A;        /* surface: cards, panels, topbar */
--bg2: #242424;        /* elevated: inputs, obj-rows, node body */
--bg3: #2E2E2E;        /* hover state */
--border: #333333;     /* default border — 0.5px */
--border2: #444444;    /* emphasized border — hover, focus */
--text1: #F0EEEA;      /* primary text */
--text2: #A09E98;      /* secondary text, labels */
--text3: #666460;      /* muted: placeholders, counters */
--accent: #FF9C2A;     /* brand — buttons, active, progress */
--accent-dim: #2A1E0A; /* accent tinted background */
--green: #2ECC71;      /* success, done status */
--green-dim: #0D2B1A;  /* success bg tint */
--red: #E24B4A;        /* error */
--red-dim: #2B0F0F;    /* error bg tint */
--blue: #5B9CF6;       /* info, links */
--blue-dim: #0F1F3A;   /* info bg tint */

/* === LIGHT THEME (toggle) === */
--bg0: #F5F4F0;
--bg1: #FFFFFF;
--bg2: #F0EEE8;
--bg3: #E8E6E0;
--border: #DEDBD4;
--border2: #C8C5BC;
--text1: #1A1916;
--text2: #6B6860;
--text3: #A09E98;
/* accent, green, red, blue same as dark */
```

### Typography
```css
font-family: 'Inter', system-ui, sans-serif;

/* Scale */
--text-xs:   10px / line-height: 1.4
--text-sm:   11px / line-height: 1.5
--text-base: 13px / line-height: 1.6
--text-md:   14px / line-height: 1.5  (section titles)
--text-lg:   16px / line-height: 1.4
--text-xl:   20px / line-height: 1.3  (page titles)

/* Weights: 400 (regular), 500 (medium/bold) only */
```

### Spacing
```
4px  — gap between inline elements, icon margin
6px  — small gap: badge padding, tight rows
8px  — default padding inside compact components
12px — panel body padding, card internal gap
14px — default panel padding
16px — section padding
20px — page content padding
```

### Border radius
```
4px  — pills, badges, small chips
5px  — inputs, selects, small buttons
6px  — photo cells, medium elements
8px  — buttons default
9-10px — scene nodes, cards
12px — main cards, panels
```

### Shadows
None — dark theme uses borders only. No box-shadow anywhere.

### Borders
Always `0.5px solid var(--border)` — never 1px except:
- Selected state: `1.5px solid var(--accent)`
- Active/focused input: `0.5px solid var(--accent)`

---

## 20. DESIGN SPEC — TOPBAR

**Height:** 44px  
**Background:** `var(--bg1)`  
**Border-bottom:** `0.5px solid var(--border)`  
**Padding:** `0 16px`  
**Layout:** `flex, align-items: center, gap: 10px`

**Elements (left to right):**
1. Logo mark — 26×26px, bg `var(--accent)`, border-radius 6px, icon `ti-movie` 12px, color `#000`
2. App name "StoryForge" — 14px/500, color `var(--text1)` — only on top-level pages (films, settings)
   OR Breadcrumb — on deeper pages (see Breadcrumb spec below)
3. [Gap fills with flex]
4. Right actions: language select → icon buttons → primary button

**Breadcrumb:**
- Font: 12px/400
- Separator: `/` color `var(--text3)`
- Links: `var(--text2)`, hover `var(--text1)`, cursor pointer
- Current page: `var(--text1)`, font-weight 500, not clickable

**Mode toggle (Simple/Pro):**
- Container: bg `var(--bg0)`, border-radius 5px, padding 2px, gap 2px
- Button: 10px, padding `3px 9px`, border-radius 3px
- Active: bg `var(--bg2)`, color `var(--text1)`, border `0.5px solid var(--border2)`
- Inactive: bg transparent, color `var(--text2)`

**Language select:**
- `<select>` element: 10px, padding `3px 7px`, border-radius 4px
- Border: `0.5px solid var(--border2)`, bg `var(--bg2)`, color `var(--text2)`
- Options: VI / EN / 中文

---

## 21. DESIGN SPEC — SCREEN 1: BỘ PHIM (Film Dashboard)

**URL:** `/films`  
**Page padding:** 20px

### Film Grid
- Layout: `grid, 3 columns, gap: 10px`
- Last cell: "Tạo bộ phim mới" card — dashed border, centered content

### FilmCard component
```
Width: auto (grid cell)
Background: var(--bg1)
Border: 0.5px solid var(--border)
Border-radius: 10px
Overflow: hidden
Cursor: pointer
Hover: border-color → var(--border2)

Structure:
┌─────────────────────────────┐
│  THUMB (height: 88px)       │  ← dark gradient bg, 3 mini episode bars
│  3 colored mini bars        │    bars: flex, align-items: flex-end, gap 4px, padding 8px
├─────────────────────────────┤
│  BODY (padding: 10px 12px)  │
│  Title — 12px/500           │
│  Meta — 10px, var(--text2)  │  "3 tập · 19 cảnh · 2 ngày trước"
│  Status pill                │
└─────────────────────────────┘
```

### Status pills
```
Đang thực hiện: bg var(--accent-dim), color var(--accent)
Hoàn thành:     bg var(--green-dim), color var(--green)
Bản nháp:       bg var(--bg3), color var(--text2)
```

### MergeStrip component
```
Background: var(--bg1)
Border: 0.5px solid var(--border)
Border-radius: 10px
Padding: 14px 16px

Structure:
Title row: icon ti-git-merge (13px, text2) + "Ghép tập thành phim hoàn chỉnh" (12px/500)
Sub: "Chọn và sắp xếp thứ tự..." (10px, text2)
Chips row: flex, gap 6px, flex-wrap
Action button: btn-primary

Merge chip (selected): bg var(--accent-dim), border var(--accent), color var(--accent)
Merge chip (default):  bg var(--bg2), border var(--border2), color var(--text2)
Arrow between chips: "→" color var(--text3), font-size 11px
```

---

## 22. DESIGN SPEC — SCREEN 2: DANH SÁCH TẬP (Episode List)

**URL:** `/films/[filmId]`

### EpisodeCard component
```
Background: var(--bg1)
Border: 0.5px solid var(--border)
Border-radius: 8px
Padding: 12px 14px
Cursor: pointer
Hover: border-color → var(--border2)

Structure:
Episode number — 9px, var(--text3), margin-bottom 3px   "Tập 1"
Title          — 12px/500, var(--text1), mb 3px
Meta           — 10px, var(--text2), mb 6px              "8 cảnh · 3 nhân vật · LTX-2.3"
Progress bar   — height 3px, bg var(--bg3), border-radius 2px
  └─ Fill: bg var(--accent), same border-radius

Empty/new card: dashed border, flex center, icon + text
```

---

## 23. DESIGN SPEC — SCREEN 3-5: CANVAS EDITOR

**URL:** `/films/[filmId]/episodes/[episodeId]`  
**Layout:** `flex, height: 100vh - topbar(44px)`

### Three-panel layout
```
┌──────────────┬──────────────────────────────┬──────────────────┐
│ LEFT PANEL   │       CANVAS                 │   RIGHT PANEL    │
│ 186px fixed  │       flex: 1                │   226px fixed    │
│ bg: var(bg1) │       bg: var(bg0)           │   bg: var(bg1)   │
│ border-right │       dot grid pattern       │   border-left    │
└──────────────┴──────────────────────────────┴──────────────────┘
```

### Canvas dot grid
```css
background-image: radial-gradient(#2a2a2a 1px, transparent 1px);
background-size: 20px 20px;
```

### LEFT PANEL — Object Panel

**Section title:**
- Font: 9px/500, uppercase, letter-spacing 0.06em
- Color: `var(--text3)`
- Padding: `10px 10px 7px`
- Border-bottom: `0.5px solid var(--border)`

**ObjectCard (in panel):**
```
Layout: flex, align-items center, gap 7px
Padding: 6px 7px
Border-radius: 7px
Border: 0.5px solid var(--border)
Background: var(--bg2)
Margin-bottom: 5px
Cursor: grab

Selected state: border-color var(--accent), bg var(--accent-dim)
Hover: border-color var(--border2)

Photo area: 32×32px, border-radius 6px, flex center
  └─ Character: tinted bg matching character color + ti-user icon
  └─ Environment/Prop: var(--bg3) bg + relevant tabler icon

Info area (flex: 1, overflow hidden):
  └─ Name: 11px/500, var(--text1), nowrap + ellipsis
  └─ Type: 9px, var(--text2)
  └─ Image count: 9px, var(--text3), flex row with ti-photo icon

Drag handle: ti-grip-vertical, 11px, var(--text3), margin-left auto
```

**Add object button:**
- Full width, height 32px
- Border: `0.5px solid var(--border2)`, dashed not solid
- BG transparent, color `var(--text2)`, font 10px
- Hover: border-color `var(--accent)`, color `var(--accent)`
- Located at bottom of panel, border-top `0.5px solid var(--border)`

### SCENE NODE (React Flow custom node)

```
Width: 150px
Background: var(--bg1)
Border: 0.5px solid var(--border)
Border-radius: 9px
Overflow: hidden
Cursor: pointer

States:
  Default:  border 0.5px var(--border)
  Hover:    border-color var(--border2)
  Selected: border 1.5px var(--accent)
  Generating: border-color var(--accent), pulsing

Structure:
┌─────────────────────────┐
│ HEAD (5px 8px padding)  │
│ "Cảnh N"  9px text3  ●  │  ← status dot 5×5px
├─────────────────────────┤
│ THUMB (height 54px)     │  ← bg var(--bg2)
│  - Done: green check    │     bg #0D2B1A, icon ti-check green 18px
│  - Generating: spinner  │     icon ti-loader accent 18px
│                + PROG   │     progress bar absolute bottom
│  - Draft: photo icon    │     icon ti-photo text3 18px
├─────────────────────────┤
│ BODY (5px 8px)          │
│ Title 10px/500 text1    │  nowrap + ellipsis
│ Avatar row              │  17×17px rounded, stacked -4px margin
└─────────────────────────┘

Progress bar (inside thumb, absolute bottom):
  Padding: 3px 7px
  BG: rgba(42,30,10, 0.95)
  Border-top: 0.5px solid var(--accent)
  Font: 9px, color var(--accent)
  Layout: flex space-between
  Text: "LTXSampler · 11/25"  |  "45%"

Status dot colors:
  Done:       var(--green)
  Generating: var(--accent)
  Draft:      var(--border2)

Avatar (character mini icon in node body):
  Size: 17×17px
  Border-radius: 3px
  Background: character's tinted bg
  Icon: ti-user 8px in character color
  Overlap: margin-left -4px for stacking effect
  Border: 1.5px solid var(--bg1) to create separation
```

### Canvas edges (React Flow)
```
Stroke: #444444
Stroke-width: 1px
Marker: arrowhead, fill none, stroke #444, stroke-width 1.5
Type: default (bezier)
```

### RIGHT PANEL — Context sensitive

**Header area (border-bottom):**
```
Padding: 12px 14px
Badge: 9px, pill shape, color + bg matching context type
  - Scene selected: bg var(--green-dim), color var(--green)
  - Object selected: bg var(--accent-dim), color var(--accent)
Title: 13px/500, var(--text1)
Subtitle: 11px, var(--text2)
Close button (X): only when object selected, 22×22px icon-btn top-right
```

**Body area:**
```
Flex: 1, overflow-y: auto
Padding: 12px 14px
```

**Warning box:**
```
Background: var(--accent-dim)
Border-left: 2px solid var(--accent)
Border-radius: 0 5px 5px 0
Padding: 6px 9px
Font: 10px, color var(--accent)
Line-height: 1.5
```

**Form fields:**
```
Label: 10px/500, var(--text2), letter-spacing 0.04em, mb 5px
Textarea/Input/Select:
  Font: 11px
  Border: 0.5px solid var(--border)
  Border-radius: 5px
  Padding: 5px 7px
  BG: var(--bg2)
  Color: var(--text1)
  Focus: border-color var(--accent), outline none

Slider row: flex, align-items center, gap 7px
  Slider: accent-color var(--accent), flex 1
  Value label: 11px, var(--text1), min-width 32px, text-align right
```

**Divider:** `border-top: 0.5px solid var(--border)`, margin 10px 0

**rp-btn (panel button):**
```
Width: 100%
Padding: 6px
Border-radius: 5px
Font: 11px
Flex center, gap 4px
Margin-bottom: 5px

Default: border 0.5px var(--border2), bg var(--bg2), color var(--text1)
  Hover: bg var(--bg3)
Primary (.p): bg var(--accent), border var(--accent), color #000, font-weight 500
  Hover: bg #e8891f
```

**Video variants grid:**
```
Grid: 2 columns, gap 5px

VariantCard:
  Border: 0.5px solid var(--border)
  Border-radius: 5px
  Overflow: hidden
  Cursor: pointer
  Hover: border-color var(--border2)

  Selected: border 1.5px var(--accent)

  Thumbnail: height 40px, bg var(--bg2), flex center
    Selected: bg var(--accent-dim)
    Icon: ti-player-play, 14px
      Selected: color var(--accent)
      Default: color var(--text3)

  Footer: padding 3px 6px, flex space-between, font 9px
    Default: color var(--text2), border-top 0.5px var(--border)
    Selected: color var(--accent), border-top color var(--accent-dim)
    Left: "seed XXXX"
    Right default: "Chọn" (blue link)
    Right selected: "✓"
```

**Photo grid (object panel):**
```
Grid: 3 columns, gap 4px
Margin-bottom: 7px

PhotoCell:
  Aspect-ratio: 1
  Border-radius: 5px
  Border: 1.5px solid var(--border)
  Cursor: pointer
  BG: var(--bg2)
  Overflow: hidden
  Display: flex center

  Main image: border 2px solid var(--accent)
    Badge "Chính": absolute bottom-left, 7px, bg var(--accent), color #000
    Padding: 1px 4px, border-radius 2px

  Hover overlay (non-main):
    BG overlay rgba(0,0,0,0.5)
    Shows 2 buttons: "Đặt làm chính" + "Xoá" (10px red)

  Add cell (Upload / Generate):
    Border: dashed
    BG: transparent
    Font: 10px, var(--text3)
    Icon + text stacked
    Hover: border-color var(--accent), color var(--accent)

Upload zone (below grid):
  Border: 1px dashed var(--border2)
  Border-radius: 6px
  Padding: 8px
  Text-align: center
  Font: 10px, var(--text2)
  Cursor: pointer
  Hover: border-color var(--accent), bg rgba(255,156,42,0.05)
  Content: ti-cloud-upload icon + "Kéo ảnh vào đây · JPG PNG WEBP"
```

**Empty panel state:**
```
Display: flex column, align center, justify center, height 100%
Gap: 8px
Padding: 20px

Icon: ti-hand-click, 28px, var(--text3)
Text: 11px, var(--text2), text-align center, line-height 1.8
  "Click vào scene để chỉnh sửa cảnh"
  "Click vào đối tượng để quản lý nhân vật"
Hint: 10px, var(--text3)
  "Kéo đối tượng từ panel trái vào scene"
```

---

## 24. DESIGN SPEC — SCREEN 6: SETTINGS

**URL:** `/settings`

### Layout
```
Two-column: sidebar nav (150px) + content panel (flex 1)
Gap: 12px

Sidebar nav:
  BG: var(--bg1)
  Border: 0.5px solid var(--border)
  Border-radius: 8px
  Overflow: hidden

Nav item:
  Padding: 8px 11px
  Font: 11px
  Color: var(--text2)
  Border-bottom: 0.5px solid var(--border)
  Display: flex, align-items center, gap 6px
  Cursor: pointer
  Icon: 12px tabler

  Active: bg var(--accent-dim), color var(--accent)
  Hover (non-active): bg var(--bg2), color var(--text1)

Content panel:
  BG: var(--bg1)
  Border: 0.5px solid var(--border)
  Border-radius: 8px
  Padding: 16px

Section title: 11px/500, var(--text1), pb 6px, border-bottom 0.5px var(--border), mb 9px

Form row (.sf):
  Display: flex, align-items center, gap 8px
  Margin-bottom: 7px
  Label: 11px, var(--text2), width 110px, flex-shrink 0
  Input/Select: flex 1, same as panel form fields

Status badge (connected):
  Font: 10px, color var(--green), bg var(--green-dim), padding 2px 7px, border-radius 3px
  Text: "Đang chạy"

Test button:
  Font: 10px, padding 4px 8px, border-radius 4px
  Border: 0.5px var(--border2), bg transparent, color var(--text1)

Save button row:
  Border-top: 0.5px var(--border), padding-top 10px, margin-top 8px
  Align: flex-end
  Button: btn-primary style
```

---

## 25. DESIGN SPEC — INTERACTION BEHAVIORS

### Drag object → scene node
```
1. User mousedown on ObjectCard → set dragging state, show ghost
2. Scene nodes show drop target state:
   - Border: 1.5px dashed var(--accent)
   - Overlay text inside thumb: "+ Thêm vào cảnh này" (10px, var(--accent))
   - BG overlay: rgba(42,30,10,0.3)
3. Drop on scene → link created:
   - Scene node body: avatar row updated immediately (optimistic)
   - Right panel: if that scene is selected, shows updated character list
4. Drop rejected (same object already in scene) → shake animation on node
```

### Click scene node → right panel
```
1. Scene node border → 1.5px solid var(--accent)
2. Right panel: fade in SceneDetailPanel content
   - Badge: green "Cảnh đang chọn"
   - Title, subtitle
   - Warning box (if applicable)
   - Description textarea
   - Characters list with X buttons
   - Duration slider + Quality select
   - Divider
   - Generate button (primary)
   - Add variant button
   - Divider
   - Video variants grid
```

### Click object card → right panel
```
1. ObjectCard border → var(--accent)
2. Canvas: all scene nodes containing this object get accent border highlight
3. Right panel: fade in ObjectDetailPanel
   - Badge: accent "Nhân vật/Prop/Môi trường"
   - Title, subtitle (name + type + image count)
   - Close X button top-right
   - Description textarea
   - Photo grid with all ref images
   - Upload zone
   - Generate button
   - Voice ref section (characters only)
   - "Xuất hiện trong" list with scene dots
4. Click X on right panel → deselect, show EmptyPanel
5. Deselect on canvas (click empty area) → same as X
```

### Generate video flow
```
1. Click "Tạo video":
   - Button disabled, shows spinner
   - Scene node status dot → var(--accent)
   - Scene node thumb shows ti-loader spinning

2. During generation:
   - Progress bar appears at bottom of node thumb
   - Text: "LTXSampler · {step}/{total}" | "{pct}%"
   - Right panel: variant added with "đang tạo..." state

3. On complete:
   - Node thumb: shows video thumbnail or ti-check
   - Status dot → var(--green)
   - Progress bar disappears
   - Variant card updated with thumbnail + seed info

4. On error:
   - Status dot → var(--red)
   - Toast notification: error message
   - Retry button appears in right panel
```

### Simple / Pro mode toggle
```
Simple (default):
  Show: positive prompt, negative prompt, aspect ratio preset chips,
        quality select (Fast/Balanced/High), seed field
  Hide: CFG, steps, sampler, scheduler, denoise,
        LoRA stack, ControlNet, reference weights, precision

Pro mode:
  Show everything above + all technical params
  Params appear with smooth height animation (CSS transition)

Toggle persists to localStorage key "storyforge_ui_mode"
```

### Language switching
```
Select element in topbar
Options: VI (Tiếng Việt) | EN (English) | 中文
On change: next-intl switches locale, page re-renders
Persists to localStorage key "storyforge_locale"
Default: VI
```

---

## 26. DESIGN SPEC — BUTTONS REFERENCE

```
Primary button (.btn-p):
  BG: var(--accent) #FF9C2A
  Border: var(--accent)
  Color: #000000
  Font: 11px/500
  Padding: 5px 12px
  Border-radius: 5px
  Hover: BG #e8891f (darken 10%)
  Active: scale(0.98)
  Icon: 12px, gap 4px

Default button (.btn):
  BG: var(--bg2)
  Border: 0.5px solid var(--border2)
  Color: var(--text1)
  Font: 11px
  Padding: 5px 12px
  Border-radius: 5px
  Hover: BG var(--bg3)

Small button (.btn-sm):
  Same as .btn but padding 4px 8px, font 10px

Icon button (.icon-btn):
  Size: 28×28px
  BG: transparent
  Border: 0.5px solid var(--border)
  Border-radius: 5px
  Color: var(--text2)
  Font-size: 13px (icon size)
  Hover: BG var(--bg3), color var(--text1)

Danger button:
  BG: var(--red-dim)
  Border: var(--red)
  Color: var(--red)

Full-width panel button (.rp-btn):
  Width: 100%
  Padding: 6px
  Border-radius: 5px
  Font: 11px
  Gap: 4px (icon + text)
  Default: BG var(--bg2), border var(--border2), color var(--text1)
  Primary: BG var(--accent), border var(--accent), color #000
```

---

## 27. DESIGN SPEC — STATUS INDICATORS

```
ComfyUI connection dot (in settings):
  Connected: 7×7px circle, bg var(--green), text "Đang chạy" green
  Disconnected: bg var(--red), text "Không kết nối" red

Scene generation progress (in node):
  Queued: no indicator
  Running: spinner icon + amber progress bar at bottom of thumb
  Done: green check icon, green status dot
  Failed: red X icon, red status dot

Job progress (right panel during generation):
  Text: "{currentNode} · {step}/{total}"
  Percentage: "{pct}%"
  No separate progress bar — the node thumb progress bar is enough

Episode progress bar:
  Height: 3px
  BG: var(--bg3)
  Fill: var(--accent)
  Border-radius: 2px
  No label

Toast notifications:
  Position: bottom-right
  BG: var(--bg2)
  Border: 0.5px solid var(--border2)
  Border-radius: 8px
  Padding: 10px 14px
  Font: 12px
  Success: left border 3px var(--green)
  Error: left border 3px var(--red)
  Info: left border 3px var(--accent)
  Auto-dismiss: 4 seconds
```

---

## 28. COMPONENT REUSE MAP

These components are used in multiple places — build them generically:

| Component | Used in |
|---|---|
| `PhotoGrid` | ObjectDetailPanel, ObjectDetailPage |
| `UploadZone` | PhotoGrid, AudioRef section |
| `ProgressBar` | EpisodeCard, SceneNode thumb |
| `StatusPill` | FilmCard, EpisodeCard |
| `MergeStrip` | Films page, Episodes page |
| `VariantList` | SceneDetailPanel |
| `ParamsSimple` | SceneDetailPanel (Simple mode) |
| `ParamsPro` | SceneDetailPanel (Pro mode) |
| `ModelSelect` | Settings → Models, Scene override (Pro) |
| `WarningBox` | SceneDetailPanel (conditional) |
| `Breadcrumb` | Topbar (all deep pages) |
| `ModeToggle` | Topbar (canvas pages) |
| `LanguageSelect` | Topbar (all pages) |
| `IconButton` | Topbar, RightPanel close, ObjectCard actions |
| `SeedField` | ParamsSimple, ParamsPro |
| `SliderField` | ParamsSimple, ParamsPro |


---

## 29. ARCHITECTURE DECISIONS (bổ sung sau review)

Phần này ghi lại các quyết định kiến trúc dứt khoát trước khi code, dựa trên review kỹ thuật.

### AD-1: Deployment mode
**Quyết định:** Local only, single user, không có auth.
**Hệ quả:** Không cần login, session, CSRF. Tuy nhiên file serving vẫn cần hardening chống path traversal.

### AD-2: ComfyUI connectivity
**Quyết định:** ComfyUI chạy native trên Windows host. App chạy trong Docker.
**Hệ quả:** Dùng `host.docker.internal:8188` thay vì `localhost:8188`.

```env
COMFYUI_URL=http://host.docker.internal:8188
COMFYUI_WS_URL=ws://host.docker.internal:8188/ws
```

Docker Compose không include ComfyUI service. App chỉ kết nối ra ngoài qua `extra_hosts`:

```yaml
services:
  app:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### AD-3: Job execution model
**Quyết định:** In-process, không có worker riêng, không có Redis/BullMQ.
**Hệ quả:** API route xử lý job trực tiếp — kết nối ComfyUI WebSocket, update DB, stream SSE về client. Nếu app restart khi đang generate thì job mất, user generate lại thủ công.

**Job lifecycle:**
```
POST /api/videos
  → Tạo VideoVariant record (status: QUEUED) trong DB
  → Gọi ComfyUI POST /prompt → nhận comfyPromptId
  → Update DB: status GENERATING, lưu comfyPromptId
  → Kết nối ComfyUI WebSocket, lắng nghe events
  → Mỗi event → update DB (progress, currentNode)
  → Done → copy file về /storage, update DB status DONE
  → Error → update DB status FAILED, lưu errorDetail

GET /api/jobs/[jobId]/stream (SSE)
  → Poll DB mỗi 1s, stream progress về client
  → Client reconnect → đọc trạng thái hiện tại từ DB → tiếp tục nhận update
```

**Khi app restart:**
- Jobs đang `GENERATING` sẽ bị stuck — status không tự về `FAILED`
- Startup hook: khi app khởi động, tìm jobs có status `RUNNING` hoặc `GENERATING` → query ComfyUI `/history/{comfyPromptId}` để check
  - Nếu ComfyUI đã xong → copy file, update DB `DONE`
  - Nếu ComfyUI không có history → update DB `FAILED`, user retry thủ công
- Đây là best-effort recovery, không đảm bảo 100%

### AD-4: Database type rules
**Quyết định:** Dùng Prisma `Json` cho JSON fields, Prisma enum cho status/type.

```prisma
// Enum definitions
enum EpisodeStatus {
  DRAFT
  ENRICHING
  READY
  GENERATING
  DONE
}

enum ObjectType {
  CHARACTER
  PROP
  ENVIRONMENT
}

enum ShotType {
  WIDE
  MEDIUM
  CLOSE
  AERIAL
  POV
}

enum VideoStatus {
  QUEUED
  GENERATING_IMAGE
  GENERATING_VIDEO
  DONE
  FAILED
}

enum JobType {
  FLUX2_REF_IMAGE
  FLUX2_COMPOSITE
  LTX_VIDEO
  WAN_VIDEO
  EXTRACT_LAST_FRAME
}

enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
  CANCELLED
}

enum GenerationStrategy {
  T2V
  I2V_SINGLE
  I2V_COMPOSITE
  IC_LORA
}
```

**Fields đổi sang Json:**
```prisma
canvasState    Json   @default("{}")
refImages      Json   @default("[]")  // [{path, isMain, label}]
flux2Params    Json   @default("{}")
transitionsTo  Json   @default("[]")  // string[]
videoParams    Json   @default("{}")
paramsSnapshot Json
inputSnapshot  Json   @default("{}")
```

### AD-5: Schema corrections

**Fix selectedVideoId — proper FK:**
```prisma
model Scene {
  selectedVideoId  String?       @map("selected_video_id")
  selectedVideo    VideoVariant? @relation("SelectedVideo", fields: [selectedVideoId], references: [id], onDelete: SetNull)
}
```

**Fix GenerationJob — proper FK + onDelete:**
```prisma
model GenerationJob {
  sceneId    String?  @map("scene_id")
  objectId   String?  @map("object_id")
  variantId  String?  @map("variant_id")

  scene    Scene?        @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  object   StoryObject?  @relation(fields: [objectId], references: [id], onDelete: SetNull)
  variant  VideoVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
}
```

**Quyết định về GenerationJob:** Là **audit log lâu dài**, không cascade xóa. Job giữ lại `inputSnapshot` đủ để có nghĩa ngay cả khi scene/object bị xóa.

**Unique order constraint:**
```prisma
model Episode {
  @@unique([filmId, order])
}
model Scene {
  @@unique([episodeId, order])
}
```

Reorder dùng transaction để swap order values, tránh conflict.

### AD-6: Bỏ description_original
**Quyết định:** Bỏ field `description_original` khỏi `Scene` và `StoryObject`.
**Lý do:** AI enrichment dịch toàn bộ sang tiếng Anh ngay Call 1. Bản gốc tiếng Việt chỉ lưu ở `episode.story_raw`. Các field còn lại đều là `description_en`.

### AD-7: AI structured output + validation
**Quyết định:** Dùng JSON Schema + Zod validation + retry tối đa 3 lần.

```typescript
// lib/ai/enrichment.ts

// Zod schema cho Call 2 output
const ScenesSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    order: z.number().int().positive(),
    title: z.string(),
    prompt_en: z.string().min(10),
    camera_direction: z.string(),
    shot_type: z.enum(['wide','medium','close','aerial','pov']),
    mood: z.string(),
    lighting_note: z.string(),
    transitions_to: z.array(z.string()),
  }))
})

// Retry wrapper
async function callWithRetry<T>(
  fn: () => Promise<string>,
  schema: z.ZodSchema<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const raw = await fn()
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const result = schema.safeParse(parsed)
    if (result.success) return result.data
    // retry với error feedback cho model
  }
  throw new Error('AI output validation failed after retries')
}
```

**Ollama:** Dùng `format: "json"` option nếu model hỗ trợ, fallback về prompt-based JSON nếu không.

### AD-8: File serving hardening
**Quyết định:** Route `/api/files/[...path]` phải:

```typescript
import path from 'path'
import fs from 'fs'

const STORAGE_ROOT = path.resolve(process.env.STORAGE_PATH ?? './storage')

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const requested = path.join(STORAGE_ROOT, ...params.path)
  const resolved = path.resolve(requested)

  // 1. Path traversal check
  if (!resolved.startsWith(STORAGE_ROOT)) {
    return new Response('Forbidden', { status: 403 })
  }

  // 2. File exists check
  if (!fs.existsSync(resolved)) {
    return new Response('Not Found', { status: 404 })
  }

  // 3. MIME whitelist
  const ext = path.extname(resolved).toLowerCase()
  const ALLOWED_MIME: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.wav': 'audio/wav',
  }
  const mime = ALLOWED_MIME[ext]
  if (!mime) return new Response('Forbidden', { status: 403 })

  // 4. HTTP Range support cho video seek
  const stat = fs.statSync(resolved)
  const range = req.headers.get('range')

  if (range && mime.startsWith('video/')) {
    // parse range, return 206 Partial Content
    const [start, end] = parseRange(range, stat.size)
    const stream = fs.createReadStream(resolved, { start, end })
    return new Response(stream as any, {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
      }
    })
  }

  const stream = fs.createReadStream(resolved)
  return new Response(stream as any, {
    headers: { 'Content-Type': mime, 'Content-Length': String(stat.size) }
  })
}
```

### AD-9: Docker Compose final

```yaml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./storage:/app/storage

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: storyforge
      POSTGRES_USER: storyforge
      POSTGRES_PASSWORD: storyforge
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U storyforge"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

### AD-10: FFmpeg trong Docker

```dockerfile
# Dockerfile
FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

**Video normalization trước merge:**
```typescript
// lib/ffmpeg.ts
// Trước khi concat, normalize tất cả videos về cùng:
// - codec: libx264
// - fps: 24
// - resolution: 1280x720
// - pixel format: yuv420p
// - audio: aac 44100Hz stereo (nếu có)

async function normalizeVideo(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec('libx264')
      .fps(24)
      .size('1280x720')
      .outputOptions(['-pix_fmt yuv420p', '-preset fast', '-crf 23'])
      .on('end', resolve)
      .on('error', reject)
      .save(output)
  })
}
```

### AD-11: AppConfig và API key storage
**Quyết định:** API key chỉ lưu trong `.env`, không lưu vào DB qua Settings UI.
**Lý do:** Local single-user app, `.env` là đủ an toàn. Settings UI chỉ read `.env` values, không write vào DB.
**Hệ quả:** `AppConfig` table chỉ dùng cho non-sensitive config (default model, UI preferences). API key không bao giờ exposed qua API response.

### AD-12: Workflow versioning
**Quyết định:** Workflow templates lưu dưới dạng TypeScript files có version constant.

```typescript
// lib/comfyui/workflows/ltx-i2v.ts
export const WORKFLOW_VERSION = '1.0.0'
export const REQUIRED_NODES = [
  'LTXVConditioning',
  'LTXVAddGuideAdvanced',
  'LTXMultimodalGuider',
  'LTXSampler',
]
```

Khi submit workflow, app gọi `/object_info` để check node availability. Nếu thiếu node → hiện lỗi rõ ràng: "Thiếu custom node: LTXVConditioning. Vui lòng cài LTX Video nodes trong ComfyUI."

### AD-13: Last frame chaining — opt-out per scene
**Quyết định:** Last frame chaining **mặc định bật** cho mọi scene có scene trước. User có thể tắt per-scene trong Pro mode.

```prisma
model Scene {
  useLastFrameChaining Boolean @default(true) @map("use_last_frame_chaining")
}
```

UI: Pro mode hiện toggle "Giữ liên tục từ cảnh trước" (default ON). Khi tắt → scene generate độc lập, không dùng last frame.

### AD-14: Generation strategy — user override
**Quyết định:** Auto-detect strategy nhưng user có thể override trong Pro mode.

```prisma
model Scene {
  strategyOverride GenerationStrategy? @map("strategy_override")
}
```

UI: Pro mode hiện select "Strategy" với options. Khi chọn manual → app dùng strategy đó, không auto-detect.

### AD-15: Design direction
**Quyết định:** Admin dashboard style — functional, rộng rãi, không bóng bẩy.

Rules:
- Không dùng `box-shadow` anywhere
- Không dùng gradient trên UI elements (chỉ dùng trên decorative thumbs)
- Spacing rộng hơn: padding panel 16-20px thay vì 12px
- Borders thay shadows hoàn toàn
- Loading state bắt buộc trên mọi button gọi API:
  - Button disabled + spinner icon trong khi pending
  - Text đổi thành "Đang xử lý..." trong lúc loading
  - Error state hiện inline dưới button, không chỉ toast
- Tables/lists dùng full width, row hover highlight `var(--bg3)`
- Không animation phức tạp — chỉ opacity transition 150ms và color transition 150ms

### AD-16: P2 Backlog (không làm trong MVP)
Các tính năng chuyển sang backlog sau khi core hoàn chỉnh:
- Light theme toggle
- Storyboard view / PDF export
- AI prompt rewriter
- Style preset gallery
- Full Pro mode params (chỉ làm Simple + basic Pro trước)
- Settings 6 tabs đầy đủ (Phase 1 chỉ cần ComfyUI + AI Provider)

### AD-17: Phase acceptance criteria

**Phase 1 done khi:**
- `docker-compose up` chạy được không lỗi
- Prisma migrate tạo được tất cả tables
- `/api/comfyui/status` trả về connected/disconnected đúng
- Storage folder tự tạo nếu chưa có
- i18n load được 3 ngôn ngữ

**Phase 2 done khi:**
- Upload .md/.txt → AI trả về scenes[] và objects[] hợp lệ (Zod pass)
- Retry đúng khi AI trả JSON sai
- Data lưu vào DB đúng schema

**Phase 3 done khi:**
- Canvas hiện scenes từ DB dưới dạng nodes
- Kéo object vào scene → link được lưu vào DB
- Click scene → right panel hiện đúng data
- Click object → right panel hiện đúng data

**Phase 4 done khi:**
- Submit 1 generation job → ComfyUI nhận được workflow
- SSE stream tiến độ về client đúng (progress %, node name)
- Sau khi xong → video file xuất hiện trong `/storage`
- App restart → startup hook check jobs stuck → tự resolve từ ComfyUI history

**Phase 5 done khi:**
- Last frame extract được bằng FFmpeg
- Scene tiếp theo nhận last frame đúng
- Merge 2 scene → 1 file MP4 output

**Phase 6 done khi:**
- Settings lưu và load đúng
- Warnings hiện đúng theo điều kiện
- Tất cả text qua i18n (không còn hardcode string)
