import express from 'express';
import { generatePodcast } from './service.js';
import dotenv from 'dotenv';
import cors from 'cors';
import { getNewsForDate, addNews } from './firebase.js';
dotenv.config();


const app = express();
app.use(express.json());
app.use(cors())

app.get('/news', async (req, res) => {
  try {

    const date = new Date().toISOString().split('T')[0];
    const news = await getNewsForDate(date);

    if (!news) {
      console.log("Fetching as no news found for today")
      const result = await generatePodcast();
      await addNews(result);
      return res.json(result);
    }
    console.log("Returning news for today")
    return res.json(news);
  } catch (error) {
    console.error('Error in generate-podcast route:', error);
    res.status(500).json({ error: 'Failed to generate podcast' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});