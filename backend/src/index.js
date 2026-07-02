const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5174',
  credentials: true
}));
app.use(express.json());

// Import routes
const paymentRoutes = require('./routes/payments');

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'StableStudy API is running!',
    version: '1.0.0',
    network: 'Arc Testnet'
  });
});

// Payment routes
app.use('/api/payments', paymentRoutes);

// Get all courses
app.get('/api/courses', async (req, res) => {
  const courses = [
    { id: 1, title: 'Web3 Development', tutor: '0x348a...6462', price: 1, students: 45, rating: 4.9 },
    { id: 2, title: 'DeFi Strategies', tutor: '0x348a...6462', price: 1.5, students: 32, rating: 4.8 },
    { id: 3, title: 'Smart Contracts', tutor: '0x348a...6462', price: 2, students: 28, rating: 4.9 },
    { id: 4, title: 'Arc Integration', tutor: '0x348a...6462', price: 1.5, students: 19, rating: 4.7 },
  ];
  res.json(courses);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 StableStudy server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💳 Payments: http://localhost:${PORT}/api/payments/create-payment`);
  console.log(`🏦 Contract: ${process.env.VAULT_CONTRACT_ADDRESS || '0x348acf8ff6F8F878718d72a0662099916734642'}`);
});
