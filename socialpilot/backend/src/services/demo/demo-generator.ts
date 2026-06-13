// ──────────────────────────────────────────────
// MetaPilot AI — Demo Data Generator
// Generates realistic demo data for "Elite Dental Clinic"
// ──────────────────────────────────────────────

/**
 * Generates a full set of demo data for a given userId.
 * Designed to be called once when a demo account is created.
 */

interface DemoDataInput {
  userId: string;
  prisma: any;
}

export async function generateDemoData({ userId, prisma }: DemoDataInput) {
  // Clear any existing data for this user first
  await Promise.all([
    prisma.socialComment.deleteMany({ where: { userId } }),
    prisma.dMMessage.deleteMany({ where: { conversation: { userId } } }),
    prisma.dMConversation.deleteMany({ where: { userId } }),
    prisma.lead.deleteMany({ where: { userId } }),
    prisma.cRMDeal.deleteMany({ where: { userId } }),
    prisma.cRMActivity.deleteMany({ where: { deal: { userId } } }),
    prisma.knowledgeDocument.deleteMany({ where: { userId } }),
    prisma.cTAConfig.deleteMany({ where: { userId } }),
    prisma.inboxItem.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.insight.deleteMany({ where: { userId } }),
    prisma.escalationTicket.deleteMany({ where: { userId } }),
    prisma.missedOpportunity.deleteMany({ where: { userId } }),
    prisma.approvalRequest.deleteMany({ where: { userId } }),
    prisma.brandSettings.deleteMany({ where: { userId } }),
    prisma.subscription.deleteMany({ where: { userId } }),
    prisma.usageRecord.deleteMany({ where: { userId } }),
  ]);

  await prisma.metaConnection.deleteMany({ where: { userId } });
  await prisma.metaWebhook.deleteMany({ where: { userId } });

  // ── Brand Settings ──
  await prisma.brandSettings.create({
    data: {
      userId,
      businessName: 'Elite Dental Clinic',
      industry: 'healthcare',
      website: 'https://elitedentalclinic.com',
      toneInstructions: 'Professional, warm, and reassuring. Highlight patient care, modern technology, and comfortable experience.',
      defaultPersonality: 'professional',
      automationEnabled: true,
      approvalModeType: 'hybrid',
      timezone: 'Asia/Kolkata',
      customInstructions: 'We specialize in cosmetic dentistry, root canals, teeth whitening, and dental implants. Promote our new-patient special: Free consultation + X-ray (₹499 value).',
    },
  });

  // ── Subscription (Professional plan) ──
  await prisma.subscription.create({
    data: {
      userId,
      plan: 'professional',
      status: 'active',
      features: ['ai_responses', 'crm', 'analytics', 'team', 'revenue'],
      maxConnections: 5,
      maxLeads: 5000,
      maxCrmDeals: 1000,
      maxTeamMembers: 5,
      aiResponseLimit: 5000,
      currentPeriodStart: new Date('2025-05-01'),
      currentPeriodEnd: new Date('2025-06-01'),
    },
  });

  // ── Meta Connection ──
  const metaConn = await prisma.metaConnection.create({
    data: {
      userId,
      facebookPageId: 'elite_dental_fb',
      facebookPageName: 'Elite Dental Clinic',
      instagramAccountId: 'elite_dental_ig',
      instagramUsername: 'elitedentalclinic',
      accessToken: 'demo_token_fb_ig',
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: 'active',
    },
  });

  await prisma.metaWebhook.create({
    data: {
      userId,
      connectionId: metaConn.id,
      eventType: 'comments',
      rawPayload: { demo: true },
      processed: true,
      processedAt: new Date(),
    },
  });

  // ── CTA Configs ──
  await prisma.cTAConfig.createMany({
    data: [
      { userId, type: 'whatsapp', label: 'Book Appointment', url: 'https://wa.me/919876543210', isDefault: true },
      { userId, type: 'website', label: 'Visit Our Clinic', url: 'https://elitedentalclinic.com', isDefault: false },
      { userId, type: 'calendly', label: 'Free Consultation', url: 'https://calendly.com/elite-dental/consultation', isDefault: false },
    ],
  });

  // ── Knowledge Documents ──
  const faqs = [
    {
      title: 'Dental Services & Pricing',
      type: 'pricing',
      content: 'Elite Dental Clinic offers a range of services:\n- Teeth Whitening: Starting ₹4,999\n- Root Canal Treatment: ₹5,000 – ₹8,000\n- Dental Implants: ₹15,000 – ₹25,000 per tooth\n- Dental Crowns: ₹3,000 – ₹8,000\n- Braces (Metal): ₹15,000 – ₹30,000\n- Invisalign: ₹50,000 – ₹1,20,000\n- Professional Cleaning: ₹1,000 – ₹2,500\n- Child Dental Checkup: ₹500\n\nNew Patient Special: Free first consultation + X-ray (worth ₹499).',
    },
    {
      title: 'Common Dental FAQs',
      type: 'faq',
      content: 'Q: Do you accept insurance?\nA: Yes, we accept all major health insurance plans. We also offer easy EMI options through our partner banks.\n\nQ: How long does a root canal take?\nA: Most root canal treatments are completed in 1-2 visits. Each visit lasts about 60-90 minutes.\n\nQ: Is teeth whitening safe?\nA: Absolutely! We use professional-grade whitening agents that are safe for enamel. Our dentist will assess your teeth first.\n\nQ: Do you have emergency appointments?\nA: Yes! We keep slots open daily for dental emergencies. Call us immediately.\n\nQ: What is the clinic timing?\nA: Monday-Saturday: 9:00 AM – 8:00 PM. Sunday: 10:00 AM – 2:00 PM.',
    },
    {
      title: 'Payment & Insurance Policy',
      type: 'policy',
      content: 'Payment Options:\n- Cash, UPI, Credit/Debit Cards accepted\n- EMI available through Bajaj Finserv and HDFC Bank\n- 0% interest EMI on treatments above ₹10,000\n\nInsurance:\nWe are empanelled with all major insurance providers. Our team will handle the paperwork for you.\n\nCancellation Policy:\n- Free cancellation up to 24 hours before appointment\n- 50% charge for same-day cancellation\n- No-show without notice: Full consultation fee applicable\n\nFollow-up visits are complimentary for 7 days after treatment.',
    },
    {
      title: 'About Elite Dental Clinic',
      type: 'faq',
      content: 'Welcome to Elite Dental Clinic — your trusted partner for complete dental care in Bangalore.\n\nOur team of 6 experienced dentists, led by Dr. Priya Sharma (MDS, 15+ years experience), specializes in:\n- Cosmetic Dentistry\n- Root Canal Treatments\n- Dental Implants\n- Orthodontics (Braces & Invisalign)\n- Pediatric Dentistry\n- Geriatric Dental Care\n\nWe use state-of-the-art technology including 3D digital X-rays, laser dentistry, and CAD/CAM for same-day crowns.\n\nPatient Testimonials:\n★★★★★ "Best dental clinic in Bangalore! Dr. Sharma made my root canal completely painless." – Rahul M.\n★★★★★ "Amazing transformation with Invisalign. Highly recommend!" – Priya K.\n★★★★★ "My kids actually enjoy coming here. The child-friendly approach is wonderful." – Ananya S.',
    },
  ];

  for (const doc of faqs) {
    await prisma.knowledgeDocument.create({ data: { userId, ...doc } });
  }

  // ── Leads ──
  const leads = [
    { name: 'Rahul Mehta', socialHandle: '@rahul_m', platform: 'instagram', category: 'hot', leadScore: 88, source: 'dm', requirement: 'Looking for Invisalign treatment cost and duration', phone: '+919876543210', email: 'rahul.m@email.com', sentiment: 0.8, tags: ['invisalign', 'hot_lead'] },
    { name: 'Priya Kapoor', socialHandle: '@priya_k', platform: 'instagram', category: 'hot', leadScore: 82, source: 'comment', requirement: 'Wants teeth whitening for wedding in 2 weeks', phone: '+919812345678', email: 'priya.k@email.com', sentiment: 0.7, tags: ['wedding', 'teeth_whitening', 'hot_lead'] },
    { name: 'Amit Singh', socialHandle: '@amit_s', platform: 'facebook', category: 'warm', leadScore: 65, source: 'dm', requirement: 'Inquiring about dental implants for mother', company: 'TechSolutions', sentiment: 0.5, tags: ['implants', 'senior_care'] },
    { name: 'Neha Gupta', socialHandle: '@neha_g', platform: 'instagram', category: 'warm', leadScore: 58, source: 'comment', requirement: 'Asked about teeth sensitivity treatment', sentiment: 0.4, tags: ['sensitivity'] },
    { name: 'Vikram Patel', socialHandle: '@vikram_p', platform: 'facebook', category: 'hot', leadScore: 75, source: 'dm', requirement: 'Needs emergency root canal, in pain', phone: '+919988776655', sentiment: 0.2, tags: ['emergency', 'root_canal'] },
    { name: 'Sneha Reddy', socialHandle: '@sneha_r', platform: 'instagram', category: 'vip', leadScore: 95, source: 'dm', requirement: 'Wants complete smile makeover (veneers + whitening)', email: 'sneha.r@premium.com', sentiment: 0.9, tags: ['vip', 'smile_makeover', 'cosmetic'] },
    { name: 'Arun Kumar', socialHandle: '@arun_k', platform: 'facebook', category: 'cold', leadScore: 25, source: 'comment', requirement: 'Just asked about clinic timings', sentiment: 0.3, tags: ['general'] },
    { name: 'Deepa Iyer', socialHandle: '@deepa_i', platform: 'instagram', category: 'warm', leadScore: 52, source: 'comment', requirement: 'Interested in child dental checkup for 6-year-old', email: 'deepa.i@email.com', sentiment: 0.6, tags: ['pediatric', 'child_care'] },
    { name: 'Karan Joshi', socialHandle: '@karan_j', platform: 'instagram', category: 'hot', leadScore: 79, source: 'dm', requirement: 'Looking for affordable braces options for teenager', phone: '+919900112233', sentiment: 0.6, tags: ['braces', 'teen'] },
    { name: 'Ananya Sharma', socialHandle: '@ananya_s', platform: 'facebook', category: 'cold', leadScore: 18, source: 'comment', requirement: 'Liked a post about teeth whitening', sentiment: 0.5, tags: [] },
    { name: 'Rohit Verma', socialHandle: '@rohit_v', platform: 'instagram', category: 'warm', leadScore: 45, source: 'comment', requirement: 'Asked about gum treatment cost', sentiment: 0.4, tags: ['gum_treatment'] },
    { name: 'Meera Nair', socialHandle: '@meera_n', platform: 'instagram', category: 'vip', leadScore: 92, source: 'dm', requirement: 'Wants full mouth rehabilitation with implants', email: 'meera.n@business.com', company: 'Nair Enterprises', sentiment: 0.85, tags: ['vip', 'implants', 'full_mouth'] },
  ];

  for (const lead of leads) {
    await prisma.lead.create({ data: { userId, ...lead } });
  }

  // ── CRM Deals ──
  const allLeads = await prisma.lead.findMany({
    where: { userId, category: { in: ['hot', 'vip', 'warm'] } },
    orderBy: { leadScore: 'desc' },
  });

  const dealsData = [
    { leadIdx: 0, stage: 'demo_scheduled', value: 80000, title: 'Invisalign Treatment — Rahul M.' },
    { leadIdx: 1, stage: 'negotiation', value: 12000, title: 'Teeth Whitening Package — Priya K.' },
    { leadIdx: 2, stage: 'qualified', value: 45000, title: 'Dental Implants (Mother) — Amit S.' },
    { leadIdx: 5, stage: 'proposal', value: 150000, title: 'Smile Makeover — Sneha R.' },
    { leadIdx: 4, stage: 'contacted', value: 8000, title: 'Emergency Root Canal — Vikram P.' },
    { leadIdx: 8, stage: 'qualified', value: 35000, title: 'Braces for Teen — Karan J.' },
    { leadIdx: 11, stage: 'proposal', value: 350000, title: 'Full Mouth Rehab — Meera N.' },
  ];

  for (const deal of dealsData) {
    const lead = allLeads[deal.leadIdx];
    if (lead) {
      await prisma.cRMDeal.create({
        data: {
          userId,
          leadId: lead.id,
          title: deal.title,
          value: deal.value,
          stage: deal.stage,
          dealStatus: deal.stage === 'won' ? 'won' : 'open',
          leadScore: lead.leadScore,
          sentiment: lead.sentiment,
        },
      });
    }
  }

  // ── Social Comments ──
  const comments = [
    { platform: 'instagram', postId: 'demo_post_1', authorId: 'demo_user_1', authorName: 'Priya Kapoor', content: 'Your teeth whitening results look amazing! I need this before my wedding next month 🎉', category: 'sales_inquiry', sentiment: 0.8, leadScore: 82, urgencyScore: 70, replyStatus: 'replied', replyContent: 'Congratulations on your upcoming wedding! 🎊 Our professional whitening gives dramatic results in just one session. We offer a special bridal package at ₹7,999. Would you like to book a free consultation?' },
    { platform: 'instagram', postId: 'demo_post_1', authorName: 'Arun Kumar', content: 'What are your clinic timings on Sundays?', category: 'general', sentiment: 0.3, leadScore: 10, urgencyScore: 10, replyStatus: 'replied', replyContent: 'We\'re open Sundays from 10 AM to 2 PM! Would you like to book an appointment?' },
    { platform: 'facebook', postId: 'demo_post_2', authorName: 'Amit Singh', content: 'Does your clinic handle dental implants for elderly patients? My mother needs them.', category: 'product_question', sentiment: 0.5, leadScore: 65, urgencyScore: 40, replyStatus: 'replied', replyContent: 'Absolutely! We specialize in geriatric dental care and have successfully done many implant procedures for senior patients. We use minimally invasive techniques and offer sedation options for comfort. Would you like to schedule a consultation?' },
    { platform: 'instagram', postId: 'demo_post_3', authorName: 'Deepa Iyer', content: 'Do you have a pediatric dentist? My 6-year-old is scared of dental visits 😟', category: 'product_question', sentiment: 0.4, leadScore: 52, urgencyScore: 30, replyStatus: 'pending' },
    { platform: 'facebook', postId: 'demo_post_2', authorName: 'Neha Gupta', content: 'I have sensitive teeth. What treatments do you recommend?', category: 'product_question', sentiment: 0.4, leadScore: 45, urgencyScore: 35, replyStatus: 'pending' },
    { platform: 'instagram', postId: 'demo_post_1', authorName: 'Ananya Sharma', content: 'Love the before-after photos! 🔥', category: 'general', sentiment: 0.9, leadScore: 5, urgencyScore: 5, replyStatus: 'queued' },
  ];

  for (const comment of comments) {
    await prisma.socialComment.create({ data: { userId, ...comment } });
  }

  // ── DM Conversations ──
  const dmConvs = [
    { customerId: 'dm_user_1', platform: 'instagram', status: 'active', intent: 'sales_inquiry', leadScore: 88, purchaseProbability: 0.7, urgencyScore: 50, messages: [
      { senderId: 'dm_user_1', content: 'Hi! I saw your Invisalign results on Instagram. Can you tell me about the cost and how long it takes?', role: 'user' },
      { senderId: userId, content: 'Thanks for reaching out, Rahul! Invisalign treatment typically costs between ₹50,000 to ₹1,20,000 depending on the complexity. Treatment duration is usually 6-18 months. We offer a free 3D scan to show you the expected results. Would you like to book that?', role: 'assistant' },
      { senderId: 'dm_user_1', content: 'That sounds good. Do you have EMI options?', role: 'user' },
      { senderId: userId, content: 'Yes! We offer 0% EMI through HDFC and Bajaj Finserv. You can pay in 6, 9, or 12 monthly installments. Also, your first consultation is free this month!', role: 'assistant' },
    ]},
    { customerId: 'dm_user_2', platform: 'facebook', status: 'urgent', intent: 'support_request', leadScore: 75, purchaseProbability: 0.8, urgencyScore: 95, messages: [
      { senderId: 'dm_user_2', content: 'I\'m in severe tooth pain since last night. Can I get an emergency appointment today?', role: 'user' },
      { senderId: userId, content: 'I\'m sorry to hear you\'re in pain, Vikram. Yes, we have emergency slots available today. Please come to our clinic immediately — we\'re open until 8 PM. Our address is 42, MG Road, Indiranagar, Bangalore. Would you like me to book you in?', role: 'assistant' },
      { senderId: 'dm_user_2', content: 'Thank you! I\'ll come in by 5 PM. Please save a slot.', role: 'user' },
    ]},
    { customerId: 'dm_user_3', platform: 'instagram', status: 'active', intent: 'sales_inquiry', leadScore: 95, purchaseProbability: 0.9, urgencyScore: 60, messages: [
      { senderId: 'dm_user_3', content: 'Hi! I\'m looking to get a complete smile makeover. I want porcelain veneers and professional whitening. Can you help?', role: 'user' },
      { senderId: userId, content: 'Hello Sneha! Absolutely — a smile makeover is our specialty. We offer high-quality porcelain veneers starting at ₹8,000 per tooth, combined with professional whitening. Our cosmetic dentist, Dr. Priya Sharma, can create your perfect smile. Would you like to schedule a consultation? We can show you a digital preview of your new smile!', role: 'assistant' },
    ]},
  ];

  for (const conv of dmConvs) {
    const dmConv = await prisma.dMConversation.create({
      data: {
        userId,
        customerId: conv.customerId,
        platform: conv.platform,
        status: conv.status,
        intent: conv.intent,
        leadScore: conv.leadScore,
        purchaseProbability: conv.purchaseProbability,
        urgencyScore: conv.urgencyScore,
      },
    });

    for (const msg of conv.messages) {
      await prisma.dMMessage.create({
        data: { conversationId: dmConv.id, ...msg },
      });
    }
  }

  // ── Missed Opportunities ──
  await prisma.missedOpportunity.createMany({
    data: [
      { userId, type: 'pricing_question', description: 'Customer asked about teeth whitening pricing but never received a follow-up', customerHandle: '@john_d', customerName: 'John Dsouza', platform: 'instagram', message: 'How much does your whitening cost?', potentialValue: 5000, recommendedAction: 'Send pricing + special offer', status: 'open' },
      { userId, type: 'stalled_dm', description: 'DM conversation about dental implants stalled after initial inquiry', customerHandle: '@fatima_k', customerName: 'Fatima Khan', platform: 'facebook', message: 'Interested in implants for my husband...', potentialValue: 45000, recommendedAction: 'Send follow-up message with testimonial', status: 'open' },
      { userId, type: 'hot_lead_stale', description: 'Hot lead (score 82) has not been contacted in 5 days', customerHandle: '@priya_k', customerName: 'Priya Kapoor', platform: 'instagram', message: 'Wants teeth whitening for wedding in 2 weeks', potentialValue: 12000, recommendedAction: 'Call immediately — time-sensitive', status: 'open' },
      { userId, type: 'pricing_question', description: 'Customer asked about braces cost for teenager on Facebook', customerHandle: '@karan_j', customerName: 'Karan Joshi', platform: 'facebook', message: 'How much do braces cost for teens?', potentialValue: 35000, recommendedAction: 'Send braces pricing + EMI options', status: 'open' },
    ],
  });

  // ── Escalation Tickets ──
  await prisma.escalationTicket.createMany({
    data: [
      { userId, customerId: 'esc_cust_1', reason: 'negative_review_threat', severity: 'high', context: 'Patient unhappy with crown fitting, threatening negative Google review', status: 'open', aiPaused: true, reputationAlert: true, alertReason: 'Patient posting on Instagram about bad experience' },
      { userId, customerId: 'esc_cust_2', reason: 'billing_dispute', severity: 'medium', context: 'Insurance claim denied, patient refuses to pay outstanding balance of ₹12,000', status: 'open', aiPaused: false },
    ],
  });

  // ── Inbox Items ──
  await prisma.inboxItem.createMany({
    data: [
      { userId, platform: 'instagram', type: 'comment', customerHandle: '@deepa_i', customerName: 'Deepa Iyer', content: 'Do you have a pediatric dentist? My 6-year-old is scared of dental visits 😟', status: 'unread', priority: 'high' },
      { userId, platform: 'facebook', type: 'comment', customerHandle: '@neha_g', customerName: 'Neha Gupta', content: 'I have sensitive teeth. What treatments do you recommend?', status: 'unread', priority: 'normal' },
      { userId, platform: 'instagram', type: 'dm', customerHandle: '@sneha_r', customerName: 'Sneha Reddy', content: 'I want a complete smile makeover with veneers and whitening!', status: 'unread', priority: 'urgent' },
      { userId, platform: 'instagram', type: 'dm', customerHandle: '@rahul_m', customerName: 'Rahul Mehta', content: 'Invisalign cost and EMI options?', status: 'read', priority: 'high' },
      { userId, platform: 'instagram', type: 'comment', customerHandle: '@priya_k', customerName: 'Priya Kapoor', content: 'Wedding teeth whitening inquiry 💍', status: 'replied', priority: 'high' },
    ],
  });

  // ── Notifications ──
  await prisma.notification.createMany({
    data: [
      { userId, type: 'new_lead', title: '🔥 Hot Lead: Sneha Reddy', body: 'VIP lead interested in complete smile makeover (₹1.5L potential)', link: '/leads' },
      { userId, type: 'escalation', title: '⚠️ Reputation Alert', body: 'Patient threatening negative review on Instagram', link: '/inbox' },
      { userId, type: 'missed_opportunity', title: '💰 ₹97K in missed revenue', body: '4 missed opportunities detected — take action now', link: '/missed-opportunities' },
      { userId, type: 'insight_ready', title: '📊 Weekly Performance', body: 'AI handled 23 conversations this week, generated 5 new leads', link: '/insights' },
      { userId, type: 'approval_needed', title: '✏️ 2 replies need approval', body: 'AI generated replies awaiting your review', link: '/approvals' },
    ],
  });

  // ── Approval Requests ──
  await prisma.approvalRequest.createMany({
    data: [
      { userId, customerId: 'cust_approve_1', customerName: 'Deepa Iyer', customerHandle: '@deepa_i', platform: 'instagram', draftContent: 'Hi Deepa! We completely understand — many children feel anxious at first. Our pediatric dentist Dr. Ananya specializes in making kids feel comfortable. We have a fun, child-friendly clinic with toys and a play area. Would you like to schedule a gentle first visit? We recommend starting with just a fun ride in the dental chair! 😊', originalMessage: 'Do you have a pediatric dentist?', confidenceScore: 0.85, status: 'pending' },
      { userId, customerId: 'cust_approve_2', customerName: 'Neha Gupta', customerHandle: '@neha_g', platform: 'facebook', draftContent: 'Hi Neha! Sensitive teeth can be uncomfortable, but we have several effective treatments. We recommend starting with a sensitivity assessment and desensitizing treatment. Many of our patients find relief with our fluoride varnish application and specialized toothpaste recommendations. Would you like to book a quick check-up?', originalMessage: 'I have sensitive teeth', confidenceScore: 0.78, status: 'pending' },
    ],
  });

  // ── Insights ──
  await prisma.insight.createMany({
    data: [
      { userId, category: 'lead_generation', title: 'Leads Generated This Week', description: 'AI conversations generated 5 new leads this week', value: 5, trend: 'up', period: 'weekly' },
      { userId, category: 'response_time', title: 'Average Response Time', description: 'AI responds to inquiries in under 30 seconds', value: 95, trend: 'stable', period: 'weekly' },
      { userId, category: 'revenue', title: 'Revenue Influenced', description: 'AI-assisted conversations generated ₹48,000 in estimated revenue', value: 48000, trend: 'up', period: 'weekly' },
      { userId, category: 'common_questions', title: 'Most Asked: Pricing', description: '60% of inquiries are about treatment costs and insurance', value: 60, trend: 'stable', period: 'weekly' },
      { userId, category: 'top_service', title: 'Most Requested: Teeth Whitening', description: 'Teeth whitening was the most inquired service this month', value: 35, trend: 'up', period: 'monthly' },
    ],
  });

  // ── Usage Records ──
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const threeDaysAgo = new Date(today); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  await prisma.usageRecord.createMany({
    data: [
      { userId, metric: 'ai_responses', count: 47, date: today },
      { userId, metric: 'ai_responses', count: 52, date: threeDaysAgo },
      { userId, metric: 'leads_captured', count: 5, date: today },
      { userId, metric: 'leads_captured', count: 3, date: threeDaysAgo },
      { userId, metric: 'meta_connections', count: 1, date: today },
    ],
  });

  return { success: true };
}
