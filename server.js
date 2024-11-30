require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

// CORS ayarları
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug için log middleware'i
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Route tanımlamaları
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

app.get('/reservation', (req, res) => {
  res.sendFile(path.join(__dirname, 'reservation.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

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
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB Atlas bağlantısı başarılı');
    isConnectedToDB = true;
  } catch (err) {
    console.error('MongoDB Atlas bağlantı hatası:', err);
    isConnectedToDB = false;
    // 5 saniye sonra tekrar bağlanmayı dene
    setTimeout(connectToMongoDB, 5000);
  }
}

// İlk bağlantıyı başlat
connectToMongoDB();

mongoose.connection.on('error', err => {
  console.error('MongoDB bağlantı hatası:', err);
  isConnectedToDB = false;
  // Hata durumunda tekrar bağlanmayı dene
  setTimeout(connectToMongoDB, 5000);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB bağlantısı koptu');
  isConnectedToDB = false;
  // Bağlantı koptuğunda tekrar bağlanmayı dene
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
      throw new Error('Veritabanı bağlantısı yok');
    }

    const [totalWorkshops, totalReservations, reservationsByStatus] = await Promise.all([
      Workshop.countDocuments(),
      Reservation.countDocuments(),
      Reservation.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ])
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
      throw new Error('Veritabanı bağlantısı yok');
    }

    const workshops = await Workshop.find()
      .lean()
      .sort({ date: 1 })
      .select('-__v');

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
      throw new Error('Veritabanı bağlantısı yok');
    }

    const reservations = await Reservation.find()
      .populate('workshopId', 'title')
      .lean()
      .sort({ createdAt: -1 });

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
      throw new Error('Veritabanı bağlantısı yok');
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
    const { workshopId, fullName, email, phone, participants, notes } = req.body;

    // Workshop'u kontrol et
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }

    // Mevcut rezervasyonları kontrol et
    const existingReservations = await Reservation.find({ 
      workshopId: workshopId,
      status: { $ne: 'cancelled' } // İptal edilmemiş rezervasyonlar
    });

    // Toplam katılımcı sayısını hesapla
    const totalParticipants = existingReservations.reduce((sum, res) => sum + res.participants, 0);

    // Yeni rezervasyon için yer var mı kontrol et
    if (totalParticipants + participants > workshop.maxParticipants) {
      return res.status(400).json({ 
        error: 'Bu atölye için yeteri kontenjan bulunmamaktadır' 
      });
    }

    // Yeni rezervasyon oluştur
    const reservation = new Reservation({
      workshopId,
      fullName,
      email,
      phone,
      participants,
      notes,
      status: 'pending'
    });

    await reservation.save();
    res.status(201).json({ 
      message: 'Rezervasyon başarıyla oluşturuldu',
      reservation 
    });

  } catch (error) {
    console.error('Rezervasyon oluşturma hatası:', error);
    res.status(500).json({ error: 'Rezervasyon oluşturulurken bir hata oluştu' });
  }
});

app.get('/api/workshops/all', async (req, res) => {
  try {
    const workshops = await Workshop.find()
      .sort({ date: 1 });
    res.json(workshops);
  } catch (err) {
    console.error('Atölye listesi getirme hatası:', err);
    res.status(500).json({ error: 'Atölyeler getirilemedi', details: err.message });
  }
});

app.get('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }
    res.json(workshop);
  } catch (error) {
    console.error('Atölye getirme hatası:', error);
    res.status(500).json({ error: 'Atölye bilgileri alınırken bir hata oluştu' });
  }
});

app.put('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }
    res.json({ message: 'Atölye başarıyla güncellendi', workshop });
  } catch (error) {
    console.error('Atölye güncelleme hatası:', error);
    res.status(500).json({ error: 'Atölye güncellenirken bir hata oluştu' });
  }
});

app.delete('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findByIdAndDelete(req.params.id);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }
    res.json({ message: 'Atölye başarıyla silindi', workshop });
  } catch (error) {
    console.error('Atölye silme hatası:', error);
    res.status(500).json({ error: 'Atölye silinirken bir hata oluştu' });
  }
});

app.put('/api/reservations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz rezervasyon durumu' });
    }

    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!reservation) {
      return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
    }

    res.json({ message: 'Rezervasyon durumu güncellendi', reservation });
  } catch (error) {
    console.error('Rezervasyon güncelleme hatası:', error);
    res.status(500).json({ error: 'Rezervasyon güncellenirken bir hata oluştu' });
  }
});

app.delete('/api/reservations/:id', async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndDelete(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
    }
    res.json({ message: 'Rezervasyon başarıyla silindi', reservation });
  } catch (error) {
    console.error('Rezervasyon silme hatası:', error);
    res.status(500).json({ error: 'Rezervasyon silinirken bir hata oluştu' });
  }
});

// Statik dosyaları servis et (route tanımlamalarından sonra)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor - ${new Date().toISOString()}`);
});
