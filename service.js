import Parser from 'rss-parser'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

dotenv.config()

const API = process.env.GOOGLE_API_KEY
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY
const AWS_REGION = process.env.AWS_REGION
const S3_BUCKET = process.env.S3_BUCKET

const pollyClient = new PollyClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY
  }
})

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY
  }
})

const genAi = new GoogleGenerativeAI(API);
const model = genAi.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: 'You are a helpful assistant that summarizes tech news articles into 2-minute podcast scripts.'
});

const config = {
  frequency: 1, // Once in a day,
  newsCount: 10,
  source: "https://dev.to/feed/"

}

const fetchNews = async () => {
  console.log("Fetching news...")
  const parser = new Parser()
  const feed = await parser.parseURL(config.source)
  const news = feed.items.slice(0, config.newsCount).map(item => ({
    title: item.title,
    link: item.link,
    content: item["content:encoded"],
    date: item.pubDate
  }))
  console.log("News fetched successfully")
  return news
}

const summarizeNews = async (news) => {
  // First combine all news content with their titles
  console.log("Summarizing news...")
  const combinedContent = news.map(item => `
    Title: ${item.title}
    Date: ${item.date}
    Content: ${item.content}
    Link: ${item.link}
    ---
  `).join('\n')

  // Create a single broadcast from all combined content
  const broadcastPrompt = `
  Create a concise 2-minute tech news podcast broadcast that effectively summarizes these tech news stories. Write it as if you're a news anchor delivering a focused daily tech news roundup. Structure the content to fill approximately 2 minutes of speaking time (about 300-350 words). Make it flow naturally and maintain a professional yet engaging tone. Include:

  1. A 15-second introduction welcoming listeners and setting the context for today's tech news
  2. Brief coverage of each story (about 20-25 seconds per story), including:
     - Main point and key development
     - Quick technical explanation
     - Brief impact note
  3. Quick transitions between stories
  4. A 15-second conclusion highlighting key takeaways

  Keep the language clear and engaging, suitable for text-to-speech conversion. Write in plain text without any special characters, line breaks, or formatting. Use simple punctuation and natural pauses. Make it sound conversational and easy to read aloud. Focus on the most important aspects of each story while maintaining listener engagement.

  News Stories:
  ${combinedContent}

  Important: Respond with plain text only. No line breaks, no special characters, no formatting. Write it as a single flowing paragraph that can be read naturally in about 2 minutes. Use simple punctuation and natural pauses to create flow. Make it sound like natural speech. Ensure the content is concise yet informative, fitting within the 2-minute duration while keeping listeners engaged.
  `


  const result = await model.generateContent(broadcastPrompt)
  if (!result.response) {
    throw new Error('No response from model')
  }

  // Clean the response text to ensure no special characters
  const cleanText = result.response.text().replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
  console.log("News summarized successfully")
  return {
    title: "Daily Tech News Broadcast",
    podcastSummary: cleanText,
    news
  }
}

const uploadToPolly = async (text, news) => {
  try {
    console.log("Uploading to Polly...")
    // Generate today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    // Create filename with date
    const filename = `daily-news-${today}.mp3`

    // Synthesize speech using Polly
    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: "standard",
      OutputFormat: "mp3",
      Text: text,
      VoiceId: "Matthew", // You can change this to any Polly voice
      TextType: "text"
    })

    const pollyResponse = await pollyClient.send(pollyCommand)
    console.log("Polly response received successfully")
    // Convert audio stream to buffer
    const audioBuffer = await streamToBuffer(pollyResponse.AudioStream)

    console.log("Uploading to S3...")
    // Upload to S3
    const s3Command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
      Body: audioBuffer,
      ContentType: 'audio/mpeg'
    })

    await s3Client.send(s3Command)

    // Generate public URL instead of signed URL
    const publicUrl = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${filename}`

    // Extract links and authors from news
    const newsLinks = news.map(item => ({
      title: item.title,
      link: item.link,
      date: item.date
    }))

    return {
      audioUrl: publicUrl,
      filename,
      date: today,
      newsLinks
    }
  } catch (error) {
    console.error('Error in Polly upload:', error)
    throw error
  }
}

// Helper function to convert stream to buffer
const streamToBuffer = async (stream) => {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export const generatePodcast = async () => {
  try {
    const news = await fetchNews()
    const summarized = await summarizeNews(news)
    const result = await uploadToPolly(summarized.podcastSummary, summarized.news)
    return result
  } catch (error) {
    console.error('Error in generatePodcast:', error)
    throw error
  }
}

