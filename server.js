const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// folders create
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("outputs")) fs.mkdirSync("outputs");

const upload = multer({ dest: "uploads/" });

// 🟢 Health check
app.get("/", (req, res) => {
  res.send("FFmpeg Server Running 🚀");
});

// 🟢 Convert video
app.post("/convert", upload.single("video"), (req, res) => {
  const input = req.file.path;
  const output = `outputs/output_${Date.now()}.mp4`;

  ffmpeg(input)
    .output(output)
    .on("end", () => {
      res.download(output, () => {
        fs.unlinkSync(input);
        fs.unlinkSync(output);
      });
    })
    .on("error", (err) => {
      console.log(err);
      res.status(500).send("Error processing video");
    })
    .run();
});

// 🎧 Extract audio
app.post("/audio", upload.single("video"), (req, res) => {
  const input = req.file.path;
  const output = `outputs/audio_${Date.now()}.mp3`;

  ffmpeg(input)
    .noVideo()
    .audioCodec("libmp3lame")
    .save(output)
    .on("end", () => {
      res.download(output, () => {
        fs.unlinkSync(input);
        fs.unlinkSync(output);
      });
    });
});

// 🎬 Merge voice + video (DUBBING CORE)
app.post("/merge", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audio", maxCount: 1 }
]), (req, res) => {

  const video = req.files.video[0].path;
  const audio = req.files.audio[0].path;

  const output = `outputs/dub_${Date.now()}.mp4`;

  ffmpeg(video)
    .addInput(audio)
    .outputOptions("-c:v copy")
    .outputOptions("-map 0:v:0")
    .outputOptions("-map 1:a:0")
    .save(output)
    .on("end", () => {
      res.download(output, () => {
        fs.unlinkSync(video);
        fs.unlinkSync(audio);
        fs.unlinkSync(output);
      });
    });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
