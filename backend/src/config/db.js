import mongoose from 'mongoose';
export async function connectDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
}
