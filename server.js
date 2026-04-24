const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Enable CORS with explicit options
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Data file path
const dataFile = path.join(__dirname, 'data.json');
const videosDir = path.join(__dirname, 'videos');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, videosDir);
  },
  filename: function (req, file, cb) {
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ storage: storage });

if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir);
}

function initDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ thoughts: [], quizzes: [] }, null, 2));
  }
}

function readData() {
  initDataFile();
  const data = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(data);
}

function writeData(json) {
  fs.writeFileSync(dataFile, JSON.stringify(json, null, 2));
}

// Get all thoughts
app.get('/api/thoughts', (req, res) => {
  try {
    const json = readData();
    res.json(json.thoughts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read thoughts' });
  }
});

// Save a new thought
app.post('/api/thoughts', (req, res) => {
  try {
    const { text, ownerId } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Thought cannot be empty' });
    }
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const json = readData();
    json.thoughts.push({
      id: Date.now(),
      text: text,
      timestamp: new Date().toISOString(),
      ownerId: ownerId
    });
    writeData(json);
    res.json({ success: true, message: 'Thought saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save thought' });
  }
});

// Delete a thought
app.delete('/api/thoughts/:id', (req, res) => {
  try {
    const thoughtId = Number(req.params.id);
    const { ownerId } = req.body;
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const json = readData();
    const thoughtIndex = json.thoughts.findIndex((item) => item.id === thoughtId);
    if (thoughtIndex === -1) {
      return res.status(404).json({ error: 'Thought not found' });
    }
    if (json.thoughts[thoughtIndex].ownerId !== ownerId) {
      return res.status(403).json({ error: 'You are not allowed to delete this thought' });
    }

    json.thoughts.splice(thoughtIndex, 1);
    writeData(json);
    res.json({ success: true, message: 'Thought deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete thought' });
  }
});

// Get all quizzes (summary)
app.get('/api/quizzes', (req, res) => {
  try {
    const json = readData();
    const quizzes = json.quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      timestamp: quiz.timestamp,
      ownerId: quiz.ownerId
    }));
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read quizzes' });
  }
});

// Get quiz details without answers
app.get('/api/quizzes/:id', (req, res) => {
  try {
    const quizId = Number(req.params.id);
    const json = readData();
    const quiz = json.quizzes.find((item) => item.id === quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json({
      id: quiz.id,
      title: quiz.title,
      questions: quiz.questions.map((q) => ({
        question: q.question,
        options: q.options
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read quiz' });
  }
});

// Create a new quiz
app.post('/api/quizzes', (req, res) => {
  try {
    const { title, questions, ownerId } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Quiz title is required' });
    }
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required' });
    }

    const normalized = questions.map((question, index) => {
      if (!question.question || !question.question.trim()) {
        throw new Error(`Question ${index + 1} text is required`);
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`Question ${index + 1} needs at least two options`);
      }
      if (typeof question.answerIndex !== 'number' || question.answerIndex < 0 || question.answerIndex >= question.options.length) {
        throw new Error(`Question ${index + 1} needs a valid correct answer selection`);
      }
      return {
        question: question.question.trim(),
        options: question.options.map((opt) => opt.trim()),
        answerIndex: question.answerIndex
      };
    });

    const json = readData();
    const quiz = {
      id: Date.now(),
      title: title.trim(),
      questions: normalized,
      timestamp: new Date().toISOString(),
      ownerId: ownerId
    };
    json.quizzes.push(quiz);
    writeData(json);
    res.json({ success: true, message: 'Quiz saved successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to save quiz' });
  }
});

// Delete a quiz
app.delete('/api/quizzes/:id', (req, res) => {
  try {
    const quizId = Number(req.params.id);
    const { ownerId } = req.body;
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const json = readData();
    const quizIndex = json.quizzes.findIndex((item) => item.id === quizId);
    if (quizIndex === -1) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    if (json.quizzes[quizIndex].ownerId !== ownerId) {
      return res.status(403).json({ error: 'You are not allowed to delete this quiz' });
    }

    json.quizzes.splice(quizIndex, 1);
    writeData(json);
    res.json({ success: true, message: 'Quiz deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});
// Submit quiz attempt and return score
app.post('/api/quizzes/:id/attempt', (req, res) => {
  try {
    const quizId = Number(req.params.id);
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'Answers must be an array' });
    }

    const json = readData();
    const quiz = json.quizzes.find((item) => item.id === quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    let correctCount = 0;
    quiz.questions.forEach((question, index) => {
      if (answers[index] === question.answerIndex) {
        correctCount += 1;
      }
    });
    res.json({
      success: true,
      correct: correctCount,
      total: quiz.questions.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to grade quiz' });
  }
});

// Get all videos
app.get('/api/videos', (req, res) => {
  try {
    const json = readData();
    res.json(json.videos || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read videos' });
  }
});

// Upload a video
app.post('/api/videos', upload.single('videoFile'), (req, res) => {
  try {
    const { title, description, ownerId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Video title is required' });
    }
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const json = readData();
    const video = {
      id: Date.now(),
      title: title.trim(),
      description: description ? description.trim() : '',
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      timestamp: new Date().toISOString(),
      ownerId: ownerId
    };
    json.videos = json.videos || [];
    json.videos.push(video);
    writeData(json);
    res.json({ success: true, message: 'Video uploaded successfully' });
  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Delete a video
app.delete('/api/videos/:id', (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const { ownerId } = req.body;
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const json = readData();
    const videoIndex = json.videos.findIndex((item) => item.id === videoId);
    if (videoIndex === -1) {
      return res.status(404).json({ error: 'Video not found' });
    }
    if (json.videos[videoIndex].ownerId !== ownerId) {
      return res.status(403).json({ error: 'You are not allowed to delete this video' });
    }

    const videoFile = json.videos[videoIndex].filename;
    const filePath = path.join(videosDir, videoFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    json.videos.splice(videoIndex, 1);
    writeData(json);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
