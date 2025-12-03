const admin = require("firebase-admin");

// 1. Setup Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const NOTIFY_TOPIC = "black-iris-secure-09"; 

async function checkAndNotify() {
  const now = new Date();
  // Server is UTC. Morocco is UTC+1. Add 1 hour.
  const moroccoNow = new Date(now.getTime() + (3600 * 1000));
  const currentHour = moroccoNow.getHours();
  const todayStr = moroccoNow.toISOString().split('T')[0];

  // Logic: Morning Report at 9 AM (includes 48h lookahead for tasks)
  const isMorningReport = (currentHour === 9); 

  console.log(`Time: ${moroccoNow.toISOString().slice(0,16).replace('T', ' ')} (Hour: ${currentHour})`);
  
  let messages = [];

  try {
    // ==========================================
    // 1. CHECK BOOKINGS
    // ==========================================
    const bookingsSnap = await db.collection('admin_bookings').where('returned', '==', false).get();
    
    bookingsSnap.forEach(doc => {
      const b = doc.data();
      if (!b.start || !b.end) return;

      const startTime = new Date(b.start);
      const endTime = new Date(b.end);
      const startDay = b.start.split('T')[0];
      const endDay = b.end.split('T')[0];

      // Minutes calculation for Hourly Alert
      const minsUntilStart = (startTime - moroccoNow) / 60000;
      const minsUntilEnd = (endTime - moroccoNow) / 60000;
      
      const timeStart = b.start.split('T')[1].slice(0,5);
      const timeEnd = b.end.split('T')[1].slice(0,5);

      // --- MORNING REPORT (Today Only for Cars) ---
      if (isMorningReport) {
        if (startDay === todayStr) {
            messages.push(`📅 TODAY DEPARTURE: ${b.carName} at ${timeStart}`);
        }
        if (endDay === todayStr) {
            messages.push(`📅 TODAY RETURN: ${b.carName} at ${timeEnd}`);
        }
      }

      // --- HOURLY ALERT (Next 90 mins) ---
      if (minsUntilStart > 0 && minsUntilStart <= 90) {
        messages.push(`🚀 GOING OUT SOON: ${b.carName} at ${timeStart}`);
      }
      if (minsUntilEnd > 0 && minsUntilEnd <= 90) {
        messages.push(`🏁 DUE BACK SOON: ${b.carName} at ${timeEnd}`);
      }
    });

    // ==========================================
    // 2. CHECK TASKS (Maintenance)
    // ==========================================
    const servicesSnap = await db.collection('service_memos').where('status', '!=', 'done').get();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000; // 48 Hours
    
    servicesSnap.forEach(doc => {
      const s = doc.data();
      if (!s.dueDate) return;

      const dueTime = new Date(s.dueDate);
      const diff = dueTime - moroccoNow;
      const timeStr = s.dueDate.split('T')[1].slice(0,5);
      const dateStr = s.dueDate.split('T')[0];

      // --- MORNING REPORT (48 Hours Lookahead) ---
      // This matches your Admin Panel logic exactly.
      // If due anytime in the next 48 hours, list it in the morning report.
      if (isMorningReport && diff > 0 && diff <= twoDaysInMs) {
         messages.push(`🛠️ MAINTENANCE DUE (${dateStr}): ${s.description}`);
      }

      // --- HOURLY ALERT (Next 90 mins) ---
      // If the specific time is approaching (e.g. you set it for 14:00)
      const minsUntilDue = diff / 60000;
      if (minsUntilDue > 0 && minsUntilDue <= 90) {
         messages.push(`⚠️ TASK DUE SOON: ${s.description} at ${timeStr}`);
      }
    });

    // ==========================================
    // 3. SEND NOTIFICATIONS
    // ==========================================
    const uniqueMessages = [...new Set(messages)];

    if (uniqueMessages.length > 0) {
      console.log(`Sending ${uniqueMessages.length} alerts.`);
      for (const msg of uniqueMessages) {
        await fetch(`https://ntfy.sh/${NOTIFY_TOPIC}`, {
          method: 'POST',
          body: msg,
          headers: { 'Title': isMorningReport ? 'Black Iris Morning Report' : 'Black Iris Alert', 'Priority': 'high', 'Tags': 'car' }
        });
      }
    } else {
      console.log("No alerts.");
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkAndNotify();