const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Platform fee (10%)
const PLATFORM_FEE_PERCENTAGE = 10;

// Create a payment intent for course enrollment
router.post('/create-payment', async (req, res) => {
  try {
    const { studentId, courseId, amount } = req.body;
    
    // Validate amount (1-2 USDC)
    if (amount < 1 || amount > 2) {
      return res.status(400).json({ 
        error: 'Amount must be between 1 and 2 USDC' 
      });
    }

    // Calculate platform fee
    const platformFee = (amount * PLATFORM_FEE_PERCENTAGE) / 100;
    const tutorAmount = amount - platformFee;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: studentId,
        amount: amount,
        type: 'LESSON_PAYMENT',
        status: 'PENDING',
        description: `Course enrollment - ${courseId}`,
        metadata: {
          courseId,
          platformFee,
          tutorAmount,
          platformFeePercentage: PLATFORM_FEE_PERCENTAGE
        }
      }
    });

    res.json({
      success: true,
      paymentId: payment.id,
      amount: amount,
      tutorAmount: tutorAmount,
      platformFee: platformFee,
      contractAddress: process.env.VAULT_CONTRACT_ADDRESS || '0x348acf8ff6F8F878718d72a0662099916734642',
      message: `Pay ${amount} USDC (${platformFee} USDC fee, ${tutorAmount} USDC to tutor)`
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Payment creation failed' });
  }
});

// Confirm payment after blockchain transaction
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentId, transactionHash } = req.body;
    
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        transactionHash: transactionHash
      }
    });

    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: payment.userId,
        courseId: payment.metadata.courseId,
        status: 'ACTIVE',
        amountPaid: payment.amount,
        paymentId: payment.id
      }
    });

    res.json({
      success: true,
      payment: payment,
      enrollment: enrollment
    });

  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

// Tutor withdrawal request
router.post('/withdraw', async (req, res) => {
  try {
    const { tutorId, amount, walletAddress } = req.body;
    
    // Check if tutor has enough balance
    const tutor = await prisma.tutorProfile.findUnique({
      where: { userId: tutorId }
    });

    if (!tutor || tutor.totalEarned < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create withdrawal record
    const withdrawal = await prisma.payment.create({
      data: {
        userId: tutorId,
        amount: amount,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        description: `Tutor withdrawal to ${walletAddress}`,
        metadata: { walletAddress }
      }
    });

    // Update tutor earnings
    await prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: {
        totalEarned: {
          decrement: amount
        }
      }
    });

    res.json({
      success: true,
      withdrawal: withdrawal,
      remainingBalance: tutor.totalEarned - amount
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});

// Get tutor balance
router.get('/balance/:tutorId', async (req, res) => {
  try {
    const { tutorId } = req.params;
    
    const tutor = await prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
      include: {
        user: true,
        courses: {
          include: {
            enrollments: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      }
    });

    if (!tutor) {
      return res.status(404).json({ error: 'Tutor not found' });
    }

    // Calculate total earned from enrollments
    const totalEarned = tutor.courses.reduce((sum, course) => {
      return sum + (course.enrollments.length * course.price);
    }, 0);

    // Calculate platform fees
    const platformFees = tutor.courses.reduce((sum, course) => {
      const fee = (course.price * 10) / 100; // 10% fee
      return sum + (course.enrollments.length * fee);
    }, 0);

    res.json({
      tutorId: tutorId,
      totalEarned: totalEarned,
      platformFees: platformFees,
      availableBalance: totalEarned - platformFees,
      totalStudents: tutor.totalStudents,
      totalCourses: tutor.courses.length
    });

  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

module.exports = router;
