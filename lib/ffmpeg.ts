import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

// PIL-based frame extraction for animated WebP (ffmpeg can't seek ANMF chunks)
function extractWebPFrame(videoPath: string, outputPath: string, which: "first" | "last"): Promise<void> {
  const script =
    which === "last"
      ? `
from PIL import Image
img = Image.open(${JSON.stringify(videoPath)})
n = 0
try:
    while True:
        n += 1
        img.seek(n)
except EOFError:
    pass
img.seek(n - 1)
img.convert('RGB').save(${JSON.stringify(outputPath)})
`
      : `
from PIL import Image
img = Image.open(${JSON.stringify(videoPath)})
img.convert('RGB').save(${JSON.stringify(outputPath)})
`;
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["-c", script]);
    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`python3 exited ${code}: ${stderr}`));
    });
    proc.on("error", reject);
  });
}

// Extract first frame (used as thumbnail)
export async function extractFirstFrame(videoPath: string, outputPath: string): Promise<void> {
  if (videoPath.toLowerCase().endsWith(".webp")) {
    return extractWebPFrame(videoPath, outputPath, "first");
  }
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(["-vframes 1", "-q:v 2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

// Extract last frame (used as chain anchor + video node cover)
export async function extractLastFrame(videoPath: string, outputPath: string): Promise<void> {
  if (videoPath.toLowerCase().endsWith(".webp")) {
    return extractWebPFrame(videoPath, outputPath, "last");
  }
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions(["-sseof -0.5"])
      .outputOptions(["-vframes 1", "-q:v 2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

export async function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(["-vframes 1", "-ss 00:00:01", "-q:v 3", "-vf scale=320:-2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

export async function normalizeVideo(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec("libx264")
      .fps(24)
      .size("1280x720")
      .outputOptions(["-pix_fmt yuv420p", "-preset fast", "-crf 23"])
      .on("end", () => resolve())
      .on("error", reject)
      .save(output);
  });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, data) => {
      if (err) return reject(err);
      const dur = data.format.duration;
      const parsed = typeof dur === "number" ? dur : parseFloat(String(dur));
      if (!isFinite(parsed)) return reject(new Error(`Invalid duration: ${dur}`));
      resolve(parsed);
    });
  });
}

export async function concatVideos(
  inputPaths: string[],
  outputPath: string
): Promise<void> {
  if (inputPaths.length === 0) throw new Error("No videos to concat");
  if (inputPaths.length === 1) {
    fs.copyFileSync(inputPaths[0], outputPath);
    return;
  }

  // Write concat list file
  const tmpDir = path.dirname(outputPath);
  const listFile = path.join(tmpDir, "_concat_list.txt");
  const list = inputPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listFile, list);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .videoCodec("copy")
      .audioCodec("copy")
      .output(outputPath)
      .on("end", () => {
        fs.unlinkSync(listFile);
        resolve();
      })
      .on("error", (e) => {
        fs.unlinkSync(listFile);
        reject(e);
      })
      .run();
  });
}
