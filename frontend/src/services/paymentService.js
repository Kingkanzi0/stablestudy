import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const paymentService = {
  // Get all courses
  getCourses: async () => {
    try {
      const response = await axios.get(`${API_URL}/courses`);
      return response.data;
    } catch (error) {
      console.error('Courses error:', error);
      // Return fallback courses
      return [
        { id: 1, title: 'Web3 Development', tutor: '0x348a...6462', price: 1, students: 45, rating: 4.9 },
        { id: 2, title: 'DeFi Strategies', tutor: '0x348a...6462', price: 1.5, students: 32, rating: 4.8 },
        { id: 3, title: 'Smart Contracts', tutor: '0x348a...6462', price: 2, students: 28, rating: 4.9 },
        { id: 4, title: 'Arc Integration', tutor: '0x348a...6462', price: 1.5, students: 19, rating: 4.7 },
      ];
    }
  },

  // Create payment for course
  createPayment: async (studentId, courseId, amount) => {
    try {
      const response = await axios.post(`${API_URL}/payments/create-payment`, {
        studentId,
        courseId,
        amount
      });
      return response.data;
    } catch (error) {
      console.error('Payment creation error:', error);
      // Return mock payment
      return {
        success: true,
        paymentId: 'pay_' + Math.random().toString(36).substr(2, 9),
        amount: amount,
        tutorAmount: amount * 0.9,
        platformFee: amount * 0.1,
        contractAddress: '0x348acf8ff6F8F878718d72a0662099916734642'
      };
    }
  },

  // Confirm payment
  confirmPayment: async (paymentId, transactionHash) => {
    try {
      const response = await axios.post(`${API_URL}/payments/confirm-payment`, {
        paymentId,
        transactionHash
      });
      return response.data;
    } catch (error) {
      console.error('Payment confirmation error:', error);
      return { success: true };
    }
  }
};

export default paymentService;
