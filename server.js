const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3003;

// Express middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL bağlantısı
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/makerx_atolye', {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

// Model tanımlamaları
const Workshop = sequelize.define('Workshop', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  time: {
    type: DataTypes.STRING,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  maxParticipants: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

const Reservation = sequelize.define('Reservation', {
  fullName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  participants: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
    defaultValue: 'pending'
  }
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// İlişkileri tanımla
Workshop.hasMany(Reservation);
Reservation.belongsTo(Workshop);

// API Routes
app.get('/api/stats', async (req, res) => {
  try {
    const [totalWorkshops, totalReservations, reservationsByStatus] = await Promise.all([
      Workshop.count(),
      Reservation.count(),
      Reservation.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('status')), 'count']
        ],
        group: ['status']
      })
    ]);

    res.json({
      totalWorkshops,
      totalReservations,
      reservationsByStatus: reservationsByStatus.map(item => ({
        status: item.status,
        count: parseInt(item.getDataValue('count'))
      }))
    });
  } catch (error) {
    console.error('Stats getirme hatası:', error);
    res.status(500).json({
      error: 'İstatistikler alınırken bir hata oluştu',
      details: error.message
    });
  }
});

app.get('/api/workshops', async (req, res) => {
  try {
    const workshops = await Workshop.findAll({
      order: [['date', 'ASC']],
      attributes: { exclude: ['updatedAt'] }
    });

    res.json(workshops);
  } catch (error) {
    console.error('Atölyeleri getirme hatası:', error);
    res.status(500).json({
      error: 'Atölyeler alınırken bir hata oluştu',
      details: error.message
    });
  }
});

app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await Reservation.findAll({
      include: [{
        model: Workshop,
        attributes: ['title']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(reservations);
  } catch (error) {
    console.error('Rezervasyonları getirme hatası:', error);
    res.status(500).json({
      error: 'Rezervasyonlar alınırken bir hata oluştu',
      details: error.message
    });
  }
});

app.post('/api/workshops', async (req, res) => {
  try {
    const workshop = await Workshop.create(req.body);
    res.status(201).json({
      message: 'Atölye başarıyla oluşturuldu',
      workshop
    });
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
    const workshop = await Workshop.findByPk(workshopId);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }

    // Mevcut rezervasyonları kontrol et
    const existingReservations = await Reservation.sum('participants', {
      where: { WorkshopId: workshopId }
    }) || 0;

    // Yeni rezervasyon için yer var mı kontrol et
    if (existingReservations + participants > workshop.maxParticipants) {
      return res.status(400).json({ 
        error: 'Üzgünüz, atölyede yeterli kontenjan kalmadı' 
      });
    }

    // Rezervasyonu oluştur
    const reservation = await Reservation.create({
      WorkshopId: workshopId,
      fullName,
      email,
      phone,
      participants,
      notes,
      status: 'pending'
    });

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

// Tüm atölyeleri getir (workshops.html için)
app.get('/api/workshops/all', async (req, res) => {
  try {
    const workshops = await Workshop.findAll({
      order: [['date', 'ASC']],
      where: {
        isActive: true
      }
    });
    res.json(workshops);
  } catch (error) {
    console.error('Atölye listesi getirme hatası:', error);
    res.status(500).json({ 
      error: 'Atölyeler getirilemedi', 
      details: error.message 
    });
  }
});

// Tek bir atölyeyi getir
app.get('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }
    res.json(workshop);
  } catch (error) {
    console.error('Atölye getirme hatası:', error);
    res.status(500).json({ 
      error: 'Atölye bilgileri alınırken bir hata oluştu',
      details: error.message 
    });
  }
});

// Atölye güncelleme endpoint'i
app.put('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }

    await workshop.update(req.body);
    res.json({
      message: 'Atölye başarıyla güncellendi',
      workshop
    });
  } catch (error) {
    console.error('Atölye güncelleme hatası:', error);
    res.status(500).json({
      error: 'Atölye güncellenirken bir hata oluştu',
      details: error.message
    });
  }
});

// Atölye silme endpoint'i
app.delete('/api/workshops/:id', async (req, res) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ error: 'Atölye bulunamadı' });
    }

    await workshop.destroy();
    res.json({ message: 'Atölye başarıyla silindi' });
  } catch (error) {
    console.error('Atölye silme hatası:', error);
    res.status(500).json({
      error: 'Atölye silinirken bir hata oluştu',
      details: error.message
    });
  }
});

// Rezervasyon durum güncelleme endpoint'i
app.put('/api/reservations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz durum değeri' });
    }

    const reservation = await Reservation.findByPk(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
    }

    await reservation.update({ status });
    res.json({
      message: 'Rezervasyon durumu güncellendi',
      reservation
    });
  } catch (error) {
    console.error('Rezervasyon durum güncelleme hatası:', error);
    res.status(500).json({
      error: 'Rezervasyon durumu güncellenirken bir hata oluştu',
      details: error.message
    });
  }
});

// Rezervasyon silme endpoint'i
app.delete('/api/reservations/:id', async (req, res) => {
  try {
    const reservation = await Reservation.findByPk(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
    }

    await reservation.destroy();
    res.json({ message: 'Rezervasyon başarıyla silindi' });
  } catch (error) {
    console.error('Rezervasyon silme hatası:', error);
    res.status(500).json({
      error: 'Rezervasyon silinirken bir hata oluştu',
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

// Veritabanı senkronizasyonu ve sunucuyu başlatma
async function startServer() {
  try {
    // Veritabanına bağlan
    await sequelize.authenticate();
    console.log('PostgreSQL bağlantısı başarılı');

    // Tabloları senkronize et
    await sequelize.sync();
    console.log('Veritabanı tabloları senkronize edildi');

    // Sunucuyu başlat
    app.listen(port, () => {
      console.log(`Sunucu ${port} portunda çalışıyor`);
    });
  } catch (error) {
    console.error('Sunucu başlatma hatası:', error);
    process.exit(1);
  }
}

startServer();
