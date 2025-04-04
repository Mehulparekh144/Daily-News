import { initializeApp } from 'firebase/app';
import { collection, getFirestore, getDocs, query, where, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,

  authDomain: process.env.FIREBASE_AUTH_DOMAIN,

  projectId: process.env.FIREBASE_PROJECT_ID,

  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,

  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,

  appId: process.env.FIREBASE_APP_ID,

  measurementId: process.env.FIREBASE_MEASUREMENT_ID

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const newsCollection = collection(db, 'news');

const getNewsForDate = async (date) => {
  try {
    const newsRef = doc(db, 'news', date);
    const newsDoc = await getDoc(newsRef);

    if (newsDoc.exists()) {
      return newsDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching news:', error);
    return null;
  }
}

const addNews = async (newsData) => {
  try {
    console.log(newsData)
    // Use the date as the document ID
    const newsRef = doc(db, 'news', newsData.date);
    await setDoc(newsRef, {
      audioUrl: newsData.audioUrl,
      filename: newsData.filename,
      date: newsData.date,
      newsLinks: newsData.newsLinks,
      createdAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error adding news:', error);
    throw error;
  }
}

export { getNewsForDate, addNews };


