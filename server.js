const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3003;

// CORS ve JSON middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Atlas Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hasankaganakts:Hasan.94@cluster0.1acuq.mongodb.net/makerx_atolye?retryWrites=true&w=majority';

// Workshop Şeması
const workshopSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  duration: { type: Number, required: true },
  maxParticipants: { type: Number, required: true },
  price: { type: Number, required: true },
  imageUrl: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Reservation Şeması
const reservationSchema = new mongoose.Schema({
  workshopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  participants: { type: Number, required: true },
  notes: String,
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Model tanımlamaları
const Workshop = mongoose.model('Workshop', workshopSchema);
const Reservation = mongoose.model('Reservation', reservationSchema);

let isConnectedToDB = false;

// MongoDB Bağlantısı
async function connectToMongoDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB zaten bağlı');
      isConnectedToDB = true;
      return;
    }

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      keepAlive: true,
      keepAliveInitialDelay: 300000
    });
    
    console.log('MongoDB Atlas bağlantısı başarılı');
    isConnectedToDB = true;
  } catch (err) {
    console.error('MongoDB Atlas bağlantı hatası:', err);
    isConnectedToDB = false;
    setTimeout(connectToMongoDB, 5000);
  }
}

// İlk bağlantıyı başlat
connectToMongoDB();

mongoose.connection.on('error', err => {
  console.error('MongoDB bağlantı hatası:', err);
  isConnectedToDB = false;
  setTimeout(connectToMongoDB, 5000);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB bağlantısı koptu');
  isConnectedToDB = false;
  setTimeout(connectToMongoDB, 5000);
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB bağlantısı yeniden sağlandı');
  isConnectedToDB = true;
});

// API Routes
app.get('/api/stats', async (req, res) => {
  try {
    if (!isConnectedToDB) {
      await connectToMongoDB();
    }

    const [totalWorkshops, totalReservations, reservationsByStatus] = await Promise.all([
      Workshop.countDocuments().exec(),
      Reservation.countDocuments().exec(),
      Reservation.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]).exec()
    ]);

    res.json({
      totalWorkshops,
      totalReservations,
      reservationsByStatus: reservationsByStatus.map(item => ({
        status: item._id,
        count: item.count
      }))
    });
  } catch (error) {
    console.error('Stats getirme hatası:', error);
    res.status(500).json({
      error: 'İstatistikler alınırken bir hata oluştu',
      details: error.message,
      totalWorkshops: 0,
      totalReservations: 0,
      reservationsByStatus: []
    });
  }
});

app.get('/api/workshops', async (req, res) => {
  try {
    if (!isConnectedToDB) {
      await connectToMongoDB();
    }

    const workshops = await Workshop.find()
      .lean()
      .sort({ date: 1 })
      .select('-__v')
      .exec();

    res.json(workshops || []);
  } catch (error) {
    console.error('Atölyeleri getirme hatası:', error);
    res.status(500).json({
      error: 'Atölyeler alınırken bir hata oluştu',
      details: error.message,
      workshops: []
    });
  }
});

app.get('/api/reservations', async (req, res) => {
  try {
    if (!isConnectedToDB) {
      await connectToMongoDB();
    }

    const reservations = await Reservation.find()
      .populate('workshopId', 'title')
      .lean()
      .sort({ createdAt: -1 })
      .exec();

    res.json(reservations || []);
  } catch (error) {
    console.error('Rezervasyonları getirme hatası:', error);
    res.status(500).json({
      error: 'Rezervasyonlar alınırken bir hata oluştu',
      details: error.message,
      reservations: []
    });
  }
});

app.post('/api/workshops', async (req, res) => {
  try {
    if (!isConnectedToDB) {
      await connectToMongoDB();
    }

    const workshop = new Workshop(req.body);
    await workshop.save();
    res.status(201).json({ message: 'Atölye başarıyla oluşturuldu', workshop });
  } catch (error) {
    console.error('Atölye oluşturma hatası:', error);
    res.status(500).json({ 
      error: 'Atölye oluşturulurken bir hata oluştu',
      details: error.message
    });
  }
});

app.post('/api/reservations', async (req, res) => {
  try {
    if (!isConnectedToDB) {
      await connectToMongoDB();
    }

    const { workshopId, fullName, email, phone, participants, notes } = req.body;
    
    // Workshop'u kontrol et
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }

    // Yeni rezervasyon oluştur
    const reservation = new Reservation({
      workshopId,
      fullName,
      email,
      phone,
      participants,
      notes
    });

    await reservation.save();
    res.status(201).json({ 
      message: 'Rezervasyon başarıyla oluşturuldu', 
      reservation 
    });
  } catch (error) {
    console.error('Rezervasyon oluşturma hatası:', error);
    res.status(500).json({ 
      error: 'Rezervasyon oluşturulurken bir hata oluştu',
      details: error.message
    });
  }
});

// Ana route'lar
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index-3.html'));
});

app.get('/index', (req, res) => {
  res.sendFile(path.join(__dirname, 'index-3.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index-3.html'));
});

app.get('/yonetim', (req, res) => {
  res.sendFile(path.join(__dirname, 'yonetim.html'));
});

// Statik dosyaları servis et
app.use(express.static(__dirname));

// Sunucuyu başlat
app.listen(port, () => {
  console.log(`Sunucu ${port} portunda çalışıyor`);
});
