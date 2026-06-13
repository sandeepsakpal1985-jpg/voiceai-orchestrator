import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding MetaPilot database...');

  // ── Clear previous seed data (in order of dependencies) ──
  await prisma.auditLogEntry.deleteMany();
  await prisma.insight.deleteMany();
  await prisma.inboxItem.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.escalationTicket.deleteMany();
  await prisma.dMMessage.deleteMany();
  await prisma.dMConversation.deleteMany();
  await prisma.socialComment.deleteMany();
  await prisma.cRMDeal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.cTAConfig.deleteMany();
  await prisma.metaConnection.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.brandSettings.deleteMany();
  await prisma.user.deleteMany();
  console.log('  ✓ Cleared previous seed data\n');

  // ── Demo User ──
  const passwordHash = await bcrypt.hash('demo1234', 12);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@socialpilot.ai' },
    update: {},
    create: {
      email: 'demo@socialpilot.ai',
      name: 'Demo Business',
      passwordHash,
      role: 'owner',
      onboardingStep: 'turn_on_automation',
      onboardingDone: true,
    },
  });
  console.log(`  ✓ Demo user: ${demoUser.email} (password: demo1234)`);

  // ── Brand Settings ──
  await prisma.brandSettings.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      businessName: 'Demo Business Co.',
      industry: 'ecommerce',
      website: 'https://demobusiness.com',
      toneInstructions: 'Friendly and helpful, with a touch of personality',
      defaultPersonality: 'friendly',
      automationEnabled: true,
      timezone: 'America/New_York',
    },
  });
  console.log('  ✓ Brand settings created');

  // ── Subscription ──
  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      plan: 'professional',
      status: 'active',
      features: ['ai_responses', 'crm', 'analytics', 'team'],
      maxConnections: 2,
      maxLeads: 1000,
      maxCrmDeals: 500,
      maxTeamMembers: 5,
      aiResponseLimit: 5000,
    },
  });
  console.log('  ✓ Subscription created');

  // ── Meta Connection (simulated) ──
  await prisma.metaConnection.create({
    data: {
      userId: demoUser.id,
      facebookPageId: 'fb_page_123456',
      facebookPageName: 'Demo Business Page',
      instagramAccountId: 'ig_789012',
      instagramUsername: 'demobusiness',
      accessToken: 'simulated_access_token',
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      status: 'active',
    },
  });
  console.log('  ✓ Meta connection created');

  // ── CTA Configs ──
  await prisma.cTAConfig.createMany({
    data: [
      {
        userId: demoUser.id,
        type: 'website',
        label: 'Visit our store',
        url: 'https://demobusiness.com/shop',
        isDefault: true,
      },
      {
        userId: demoUser.id,
        type: 'whatsapp',
        label: 'Chat with us',
        url: 'https://wa.me/1234567890',
        isDefault: false,
      },
      {
        userId: demoUser.id,
        type: 'calendly',
        label: 'Book a demo',
        url: 'https://calendly.com/demobusiness/demo',
        isDefault: false,
      },
    ],
    skipDuplicates: true,
  });
  console.log('  ✓ CTA configs created');

  // ── Leads ──
  const sampleLeads = [
    { name: 'Sarah Johnson', socialHandle: '@sarah_j', platform: 'instagram', category: 'hot', leadScore: 85, source: 'comment', requirement: 'Looking for bulk pricing on your premium plan', email: 'sarah@example.com', tags: ['bulk_buyer', 'hot_lead'] },
    { name: 'Mike Chen', socialHandle: '@mike_chen', platform: 'instagram', category: 'hot', leadScore: 78, source: 'dm', requirement: 'Interested in enterprise demo', company: 'TechCorp', tags: ['demo_request', 'hot_lead'] },
    { name: 'Emily Davis', socialHandle: '@emily_d', platform: 'facebook', category: 'warm', leadScore: 55, source: 'comment', requirement: 'Asked about pricing for small team', tags: ['pricing_inquiry'] },
    { name: 'James Wilson', socialHandle: '@james_w', platform: 'instagram', category: 'warm', leadScore: 42, source: 'dm', requirement: 'Wants to know about integrations', company: 'StartupInc', tags: ['warm_lead'] },
    { name: 'Lisa Park', socialHandle: '@lisa_park', platform: 'facebook', category: 'cold', leadScore: 22, source: 'comment', requirement: 'General product question', tags: [] },
    { name: 'David Brown', socialHandle: '@david_b', platform: 'instagram', category: 'vip', leadScore: 92, source: 'dm', requirement: 'Wants white-label solution for agency', company: 'Brown Agency', email: 'david@brownagency.com', tags: ['vip_customer', 'bulk_buyer'] },
    { name: 'Ana Martinez', socialHandle: '@ana_m', platform: 'instagram', category: 'hot', leadScore: 72, source: 'dm', requirement: 'Ready to purchase annual plan', phone: '+15551234567', tags: ['hot_lead', 'demo_request'] },
    { name: 'Tom Harris', socialHandle: '@tom_h', platform: 'facebook', category: 'cold', leadScore: 15, source: 'comment', requirement: 'Just browsing', tags: [] },
  ];

  for (const lead of sampleLeads) {
    await prisma.lead.create({
      data: {
        userId: demoUser.id,
        ...lead,
        sentiment: lead.leadScore > 70 ? 0.8 : lead.leadScore > 40 ? 0.3 : 0,
      },
    });
  }
  console.log(`  ✓ ${sampleLeads.length} leads created`);

  // ── CRM Deals ──
  const hotLeads = await prisma.lead.findMany({
    where: { userId: demoUser.id, category: { in: ['hot', 'vip'] } },
  });

  for (let i = 0; i < Math.min(hotLeads.length, 3); i++) {
    const lead = hotLeads[i];
    const stages = ['contacted', 'qualified', 'demo_scheduled'];
    await prisma.cRMDeal.create({
      data: {
        userId: demoUser.id,
        leadId: lead.id,
        title: `Deal with ${lead.name || lead.socialHandle}`,
        value: i === 0 ? 12000 : i === 1 ? 5000 : 2500,
        stage: stages[i],
        leadScore: lead.leadScore,
        sentiment: lead.sentiment,
      },
    });
  }
  console.log('  ✓ CRM deals created');

  // ── Social Comments ──
  const sampleComments = [
    { platform: 'instagram', postId: 'post_001', authorId: 'ig_user_1', authorName: 'Sarah Johnson', content: 'How much does your premium plan cost? Looking for a team of 10.', category: 'sales_inquiry', sentiment: 0.5, leadScore: 85, urgencyScore: 60, replyStatus: 'replied', replyContent: 'Hi Sarah! Our premium plan is $99/mo for teams up to 10. Would you like a personalized demo?' },
    { platform: 'instagram', postId: 'post_001', authorId: 'ig_user_2', authorName: 'Mike Chen', content: 'Does this integrate with Shopify?', category: 'product_question', sentiment: 0.3, leadScore: 45, urgencyScore: 30, replyStatus: 'replied', replyContent: 'Yes! We have a native Shopify integration. It syncs orders, products, and customer data automatically.' },
    { platform: 'facebook', postId: 'fb_post_001', authorId: 'fb_user_1', authorName: 'Emily Davis', content: 'I love your product but the mobile app crashes sometimes', category: 'complaint', sentiment: -0.2, leadScore: 30, urgencyScore: 70, escalationScore: 40, replyStatus: 'pending' },
    { platform: 'instagram', postId: 'post_002', authorId: 'ig_user_3', authorName: 'Tom Harris', content: 'Great content! 🔥', category: 'general', sentiment: 0.9, leadScore: 5, urgencyScore: 5, replyStatus: 'queued' },
  ];

  for (const comment of sampleComments) {
    await prisma.socialComment.create({
      data: {
        userId: demoUser.id,
        ...comment,
      },
    });
  }
  console.log('  ✓ Sample comments created');

  // ── DM Conversations ──
  const dmConversation = await prisma.dMConversation.create({
    data: {
      userId: demoUser.id,
      customerId: 'ig_user_dm_1',
      platform: 'instagram',
      status: 'active',
      intent: 'sales_inquiry',
      leadScore: 78,
      purchaseProbability: 0.65,
      urgencyScore: 40,
    },
  });

  const dmMessages = [
    { senderId: 'ig_user_dm_1', content: 'Hi! I saw your ad and I\'m interested in your service for my business', role: 'user' },
    { senderId: demoUser.id, content: 'Thanks for reaching out! We\'d love to help. Could you tell me a bit about your business and what you\'re looking for?', role: 'assistant' },
    { senderId: 'ig_user_dm_1', content: 'I run a small online clothing store with about 5 employees. We need help managing customer inquiries on Instagram.', role: 'user' },
    { senderId: demoUser.id, content: 'Perfect! Our platform is designed exactly for ecommerce businesses like yours. We can automate responses to common questions, capture leads, and even handle sales conversations. Would you like to book a quick demo?', role: 'assistant' },
  ];

  for (const msg of dmMessages) {
    await prisma.dMMessage.create({
      data: {
        conversationId: dmConversation.id,
        ...msg,
      },
    });
  }
  console.log('  ✓ DM conversation with messages created');

  // ── Knowledge Documents ──
  const knowledgeDocs = [
    { title: 'Pricing & Plans', type: 'pricing', content: 'Our plans start at $49/mo for Starter (up to 500 responses), $99/mo for Professional (unlimited responses + CRM), and $249/mo for Enterprise (white-label + dedicated support). All plans include a 14-day free trial.' },
    { title: 'Shipping Policy', type: 'policy', content: 'We offer free shipping on orders over $50. Standard shipping takes 5-7 business days. Express shipping (2-3 business days) is available for $12.99. International shipping varies by destination.' },
    { title: 'Common FAQs', type: 'faq', content: 'Q: Do you offer refunds? A: Yes, 30-day money-back guarantee. Q: Can I change my plan? A: Yes, upgrade or downgrade anytime. Q: Is there a mobile app? A: Yes, available on iOS and Android.' },
  ];

  for (const doc of knowledgeDocs) {
    await prisma.knowledgeDocument.create({
      data: {
        userId: demoUser.id,
        ...doc,
      },
    });
  }
  console.log('  ✓ Knowledge documents created');

  // ── Escalation Tickets (sample) ──
  await prisma.escalationTicket.create({
    data: {
      userId: demoUser.id,
      customerId: 'customer_escalated_1',
      reason: 'legal_threat',
      severity: 'high',
      context: 'Customer threatening to file a complaint about delayed order',
      status: 'open',
      aiPaused: true,
    },
  });
  console.log('  ✓ Escalation ticket created');

  // ── Notifications ──
  const notifications = [
    { type: 'new_lead', title: 'Hot Lead Captured', body: 'Sarah Johnson is interested in bulk pricing', link: '/leads' },
    { type: 'escalation', title: 'Escalation Needed', body: 'Customer escalation requires human review', link: '/inbox' },
    { type: 'insight_ready', title: 'Weekly Insight Ready', body: 'Your weekly AI performance report is ready', link: '/insights' },
  ];

  for (const notif of notifications) {
    await prisma.notification.create({
      data: {
        userId: demoUser.id,
        ...notif,
      },
    });
  }
  console.log('  ✓ Notifications created');

  // ── Inbox Items ──
  const inboxItems = [
    { platform: 'instagram', type: 'comment', customerHandle: '@sarah_j', customerName: 'Sarah Johnson', content: 'How much does your premium plan cost?', status: 'replied', priority: 'high' },
    { platform: 'facebook', type: 'comment', customerHandle: '@emily_d', customerName: 'Emily Davis', content: 'I love your product but the mobile app crashes sometimes', status: 'unread', priority: 'urgent' },
    { platform: 'instagram', type: 'dm', customerHandle: '@mike_chen', customerName: 'Mike Chen', content: 'Hi! I saw your ad and I\'m interested...', status: 'read', priority: 'high' },
  ];

  for (const item of inboxItems) {
    await prisma.inboxItem.create({
      data: {
        userId: demoUser.id,
        ...item,
      },
    });
  }
  console.log('  ✓ Inbox items created');

  // ── Audit Log Entry ──
  await prisma.auditLogEntry.create({
    data: {
      userId: demoUser.id,
      actorId: demoUser.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: demoUser.id,
      details: { method: 'seed_script' },
    },
  });
  console.log('  ✓ Audit log entry created');

  // ── Initial Insight ──
  await prisma.insight.create({
    data: {
      userId: demoUser.id,
      category: 'common_questions',
      title: 'Welcome to MetaPilot AI',
      description: 'Your AI sales agent is ready. Start engaging with customers to generate insights.',
      value: 0,
      trend: 'stable',
      period: 'weekly',
    },
  });
  console.log('  ✓ Initial insight created');

  console.log('\n✅ Seeding complete!');
  console.log('   Login with: demo@socialpilot.ai / demo1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
