import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Hotspot } from './models.js';

dotenv.config();

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/parking_db';

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    const hotspot = await Hotspot.findOne();
    if (!hotspot) {
      console.log('No hotspot documents found.');
    } else {
      console.log('Sample hotspot document (JSON):');
      console.log(JSON.stringify(hotspot.toObject ? hotspot.toObject() : hotspot, null, 2));
    }
  } catch (err) {
    console.error('Error connecting or querying MongoDB:', err);
  } finally {
    await mongoose.disconnect();
  }
})();
